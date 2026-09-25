/**
 * Library — convert one of a book's files into another format.
 *
 * Produces a **new attached file** (rather than streaming on the fly) so the
 * result can be read online, downloaded and searched like any other file.
 * Native conversions run in-process; anything else is delegated to Calibre when
 * an `ebook-convert` binary is available (`library.converter.*`).
 *
 * Only owners/admins may add files to a book.
 */
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../../server/database'
import { requireUser } from '../../../../../../../server/utils/auth'
import { getConfigValue } from '../../../../../../../server/utils/configs'
import * as lib from '../../../../database/schema'
import { canEdit, getViewer, recalcBookFileStats } from '../../../../utils/books'
import {
  canConvertNatively,
  convertNatively,
  convertWithCalibre,
  findCalibre,
  isConvertTarget,
  nativeTargets,
  type ConvertMeta,
  type ConvertOutput
} from '../../../../utils/convert'
import { indexBookText } from '../../../../utils/indexer'
import { readStorageBuffer } from '../../../../utils/reader'
import { saveBookFile } from '../../../../utils/store'

const MAX_SOURCE_BYTES = 200 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const viewer = await getViewer(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid book id' })
  }

  const body = await readBody<{ to?: string, fileId?: number }>(event)
  if (!isConvertTarget(body?.to)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported target format' })
  }
  const target = body!.to!

  const [book] = await db
    .select()
    .from(lib.libBooks)
    .where(and(eq(lib.libBooks.id, id), isNull(lib.libBooks.deletedAt)))
    .limit(1)
  if (!book) throw createError({ statusCode: 404, statusMessage: 'Book not found' })
  if (!canEdit(viewer, book)) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot modify this book' })
  }

  // Prefer the explicitly requested file, then an EPUB (richest source), then
  // the primary file.
  const fileRows = await db
    .select()
    .from(lib.libBookFiles)
    .where(and(eq(lib.libBookFiles.bookId, id), isNull(lib.libBookFiles.deletedAt)))
    .orderBy(desc(lib.libBookFiles.isPrimary), asc(lib.libBookFiles.id))
  const source = (body?.fileId ? fileRows.find(row => row.id === Number(body.fileId)) : null)
    ?? fileRows.find(row => row.format === 'epub')
    ?? fileRows[0]
  if (!source) throw createError({ statusCode: 409, statusMessage: 'This book has no file to convert' })
  if (source.format === target) {
    throw createError({ statusCode: 400, statusMessage: `The book already has a ${target} file` })
  }

  let input: Buffer
  try {
    input = await readStorageBuffer(source.path)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Source file is missing from storage' })
  }
  if (input.length > MAX_SOURCE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Source file is too large to convert' })
  }

  const authors = await db
    .select({ name: lib.libAuthors.name })
    .from(lib.libBookAuthors)
    .innerJoin(lib.libAuthors, eq(lib.libAuthors.id, lib.libBookAuthors.authorId))
    .where(eq(lib.libBookAuthors.bookId, id))
    .limit(4)
  const meta: ConvertMeta = {
    title: book.title,
    author: authors.map(row => row.name).join(', ') || null,
    language: book.language
  }

  let output: ConvertOutput
  let engine: 'native' | 'calibre' = 'native'

  if (canConvertNatively(source.format, target)) {
    try {
      output = convertNatively(input, source.format, target, meta)
    } catch (e) {
      throw createError({
        statusCode: 422,
        statusMessage: e instanceof Error ? e.message : 'Conversion failed'
      })
    }
  } else {
    const enabled = await getConfigValue<boolean>('library.converter.enabled', true).catch(() => true)
    const configured = enabled ? await getConfigValue<string>('library.converter.path', '').catch(() => '') : ''
    const binary = enabled ? await findCalibre(configured).catch(() => null) : null
    if (!binary) {
      const native = nativeTargets(source.format)
      const hint = native.length
        ? ` Built-in conversions from ${source.format}: ${native.join(', ')}.`
        : ''
      throw createError({
        statusCode: 422,
        statusMessage: `${source.format} → ${target} needs Calibre (ebook-convert); it was not found on this server.${hint}`
      })
    }
    const timeoutMs = Number(await getConfigValue<number>('library.converter.timeoutMs', 120000)) || 120000
    try {
      output = await convertWithCalibre(binary, input, source.format, target, timeoutMs)
      engine = 'calibre'
    } catch (e) {
      throw createError({
        statusCode: 502,
        statusMessage: e instanceof Error ? e.message : 'Conversion failed'
      })
    }
  }

  const baseName = (book.title || 'book').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80).trim() || 'book'
  const saved = await saveBookFile(output.buffer, `${baseName}.${output.format}`, output.mimeType)
  const [existing] = await db
    .select({ id: lib.libBookFiles.id })
    .from(lib.libBookFiles)
    .where(and(eq(lib.libBookFiles.bookId, id), isNull(lib.libBookFiles.deletedAt)))
    .limit(1)

  const [created] = await db
    .insert(lib.libBookFiles)
    .values({
      bookId: id,
      format: output.format,
      path: saved.path,
      originalName: saved.originalName,
      mimeType: saved.mimeType,
      size: saved.size,
      hash: saved.hash,
      isPrimary: !existing,
      userId: ctx.user.id
    })
    .returning()

  await recalcBookFileStats(id)
  // A freshly converted EPUB makes the book readable *and* searchable.
  void indexBookText(id, { force: true }).catch(() => {})

  return {
    ok: true,
    engine,
    source: { id: source.id, format: source.format },
    file: created,
    format: output.format,
    size: output.buffer.length
  }
})
