/**
 * Library — reader content for a book.
 *
 * Returns the sanitised chapter list + table of contents of the book's EPUB,
 * with images/CSS rewritten to the module's asset endpoint. Requires the viewer
 * to be allowed to see the book (private books stay private).
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../../server/database'
import * as lib from '../../../../database/schema'
import { bumpBookCounter, canView, getViewer } from '../../../../utils/books'
import { buildReaderContent } from '../../../../utils/ebook'
import { getReadableFile, readStorageBuffer } from '../../../../utils/reader'
import { highlightHtml } from '../../../../utils/text'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid book id' })
  }

  const viewer = await getViewer(event)
  const [book] = await db.select().from(lib.libBooks)
    .where(and(eq(lib.libBooks.id, id), isNull(lib.libBooks.deletedAt))).limit(1)
  if (!book || !canView(viewer, book)) {
    throw createError({ statusCode: 404, statusMessage: 'Book not found' })
  }

  const file = await getReadableFile(id)
  if (!file) throw createError({ statusCode: 409, statusMessage: 'This book has no ebook file' })
  if (file.format !== 'epub') {
    throw createError({
      statusCode: 415,
      statusMessage: `Inline reading is only available for EPUB (this book is ${file.format})`
    })
  }

  let buffer: Buffer
  try {
    buffer = await readStorageBuffer(file.path)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Ebook file is missing from storage' })
  }

  const assetUrl = (path: string) => `/api/library/books/${id}/asset?path=${encodeURIComponent(path)}`
  const { toc, chapters } = buildReaderContent(buffer, assetUrl)
  void bumpBookCounter(id, 'readCount')

  // Optional full-text highlight: wrap every occurrence of `highlight` so the
  // reader can jump straight to a search hit. `chapter=<index>` narrows the
  // response to that single chapter (cheap re-fetch when following a hit).
  const query = getQuery(event)
  const highlight = String(query.highlight ?? '').trim()
  const withHighlight = highlight.length > 0 && highlight.length <= 120

  let payload = chapters
  const chapterParam = Number(query.chapter)
  if (Number.isInteger(chapterParam) && chapters.some(chapter => chapter.index === chapterParam)) {
    payload = chapters.filter(chapter => chapter.index === chapterParam)
  }

  return {
    bookId: id,
    fileId: file.id,
    format: file.format,
    title: book.title,
    // Used by the reader to pick a text-to-speech voice.
    language: book.language,
    highlight: highlight || null,
    toc,
    chapters: withHighlight
      ? payload.map(chapter => ({ ...chapter, html: highlightHtml(chapter.html, highlight) }))
      : payload
  }
})
