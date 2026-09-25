/**
 * Library — upload one or more ebook files.
 *
 * Multipart `files` parts. Without a `bookId` each file becomes a new book
 * (metadata taken from the EPUB, falling back to the file name). With a
 * `bookId` the files are attached to that existing book.
 *
 * Cover images embedded in an EPUB are extracted and registered as host files
 * so `/api/files/serve/<path>` can render them. Ebook files themselves are
 * kept private — downloadable only through the module's authenticated route.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { requireUser } from '../../../../../../server/utils/auth'
import { getConfigValue } from '../../../../../../server/utils/configs'
import * as lib from '../../../database/schema'
import { createBook } from '../../../utils/bookWrite'
import { canEdit, getViewer, hydrateBooks, recalcBookFileStats } from '../../../utils/books'
import { detectFormat, extractMetadata, type EbookMetadata } from '../../../utils/ebook'
import { indexBookText } from '../../../utils/indexer'
import { parseBookFilename } from '../../../utils/parse'
import { ensureCoverFile, isCoverMime, saveBookFile } from '../../../utils/store'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, statusMessage: 'No multipart body' })

  const fileParts = form.filter(p => p.name === 'files' && p.filename)
  if (!fileParts.length) {
    throw createError({ statusCode: 400, statusMessage: 'No files found in request' })
  }

  const field = (name: string): string => {
    const part = form.find(p => p.name === name && !p.filename)
    return part ? part.data.toString('utf8').trim() : ''
  }
  const targetBookId = Number(field('bookId')) || null
  const categoryId = Number(field('categoryId')) || null
  const isPublicRaw = field('isPublic')
  const isPublic = isPublicRaw === '' ? true : isPublicRaw === 'true' || isPublicRaw === '1'
  const titleOverride = field('title')
  const authorsOverride = field('authors')
  const tagsOverride = field('tags')

  const maxMB = await getConfigValue<number>('library.maxFileSizeMB', 200).catch(() => 200)
  const maxBytes = Math.max(0, Number(maxMB)) * 1024 * 1024

  const viewer = await getViewer(event)

  // When attaching to an existing book, verify permission up front.
  if (targetBookId) {
    const [existing] = await db.select().from(lib.libBooks)
      .where(and(eq(lib.libBooks.id, targetBookId), isNull(lib.libBooks.deletedAt))).limit(1)
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Book not found' })
    if (!canEdit(viewer, existing)) {
      throw createError({ statusCode: 403, statusMessage: 'You cannot modify this book' })
    }
  }

  const touched = new Set<number>()

  for (const part of fileParts) {
    const filename = part.filename!
    const buffer = part.data
    if (maxBytes > 0 && buffer.length > maxBytes) {
      throw createError({
        statusCode: 413,
        statusMessage: `File "${filename}" exceeds the max size of ${maxMB} MB`
      })
    }

    const format = detectFormat(filename)
    let meta: EbookMetadata = { authors: [], tags: [] }
    if (format === 'epub') {
      try {
        meta = extractMetadata(buffer)
      } catch {
        meta = { authors: [], tags: [] }
      }
    }
    const parsed = parseBookFilename(filename)

    let bookId = targetBookId
    if (!bookId) {
      let cover: string | null = null
      if (meta.cover && isCoverMime(meta.cover.mime)) {
        cover = await ensureCoverFile(ctx.user.id, meta.cover.data, meta.cover.mime)
      }
      const single = fileParts.length === 1
      bookId = await createBook({
        title: (single && titleOverride) || meta.title || parsed.title,
        authors: authorsOverride
          ? [authorsOverride]
          : (meta.authors.length ? meta.authors : parsed.authors),
        description: meta.description ?? null,
        tags: tagsOverride ? tagsOverride.split(/[,，;]/) : meta.tags,
        isbn: meta.isbn ?? null,
        language: meta.language ?? null,
        publisherName: meta.publisher ?? null,
        pubdate: meta.pubdate ?? null,
        seriesName: meta.series ?? parsed.series ?? null,
        seriesIndex: meta.seriesIndex ?? parsed.seriesIndex ?? null,
        cover,
        categoryId,
        isPublic
      }, { userId: ctx.user.id })
    } else {
      // Attaching a first EPUB to a cover-less book: pick up its cover.
      const [book] = await db.select({ cover: lib.libBooks.cover }).from(lib.libBooks)
        .where(eq(lib.libBooks.id, bookId)).limit(1)
      if (book && !book.cover && meta.cover && isCoverMime(meta.cover.mime)) {
        const cover = await ensureCoverFile(ctx.user.id, meta.cover.data, meta.cover.mime)
        await db.update(lib.libBooks).set({ cover, updatedAt: new Date() }).where(eq(lib.libBooks.id, bookId))
      }
    }

    const saved = await saveBookFile(buffer, filename)
    const [countRow] = await db
      .select({ value: lib.libBookFiles.id })
      .from(lib.libBookFiles)
      .where(and(eq(lib.libBookFiles.bookId, bookId), isNull(lib.libBookFiles.deletedAt)))
      .limit(1)

    await db.insert(lib.libBookFiles).values({
      bookId,
      format,
      path: saved.path,
      originalName: filename,
      mimeType: saved.mimeType,
      size: saved.size,
      hash: saved.hash,
      isPrimary: !countRow,
      userId: ctx.user.id
    })
    await recalcBookFileStats(bookId)
    touched.add(bookId)
  }

  const ids = [...touched]

  // Build the full-text index for books that now have an EPUB (no-op otherwise),
  // so search works immediately after an upload.
  for (const bookId of ids) {
    try {
      await indexBookText(bookId)
    } catch {
      /* indexing is best-effort — search rebuilds lazily */
    }
  }

  const bookRows = ids.length
    ? await db.select().from(lib.libBooks).where(inArray(lib.libBooks.id, ids))
    : []
  return { books: await hydrateBooks(bookRows, viewer), bookIds: ids }
})
