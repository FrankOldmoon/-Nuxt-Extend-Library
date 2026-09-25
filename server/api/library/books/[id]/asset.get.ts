/**
 * Library — serve an asset (image / font) from inside a book's EPUB.
 *
 * `?path=` is an archive-internal entry name produced by the reader content
 * endpoint. Only entries of the book's own EPUB are reachable, and the caller
 * must be allowed to see the book.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../../server/database'
import * as lib from '../../../../database/schema'
import { canView, getViewer } from '../../../../utils/books'
import { mimeForPath, readEpubAsset } from '../../../../utils/ebook'
import { getReadableFile, readStorageBuffer } from '../../../../utils/reader'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const path = String(getQuery(event).path ?? '')
  if (!Number.isInteger(id) || id <= 0 || !path) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request' })
  }

  const viewer = await getViewer(event)
  const [book] = await db.select().from(lib.libBooks)
    .where(and(eq(lib.libBooks.id, id), isNull(lib.libBooks.deletedAt))).limit(1)
  if (!book || !canView(viewer, book)) {
    throw createError({ statusCode: 404, statusMessage: 'Book not found' })
  }

  const file = await getReadableFile(id)
  if (!file || file.format !== 'epub') {
    throw createError({ statusCode: 404, statusMessage: 'No EPUB attached' })
  }

  let buffer: Buffer
  try {
    buffer = await readStorageBuffer(file.path)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Ebook file is missing from storage' })
  }

  const asset = readEpubAsset(buffer, path)
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Asset not found in EPUB' })

  setResponseHeader(event, 'Content-Type', mimeForPath(path))
  setResponseHeader(event, 'Cache-Control', 'private, max-age=86400')
  return asset
})
