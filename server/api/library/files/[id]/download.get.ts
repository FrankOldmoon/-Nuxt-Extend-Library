/**
 * Library — download (or inline-preview) an attached ebook file.
 *
 * Authenticated + visibility checked; private books' files never leak. The
 * book's download counter is incremented.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../../server/database'
import * as lib from '../../../../database/schema'
import {
  createStorageStream,
  formatContentDisposition
} from '../../../../../../../server/utils/fileStorage'
import { bumpBookCounter, canView, getViewer } from '../../../../utils/books'
import { getBookFileById } from '../../../../utils/reader'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid file id' })
  }

  const viewer = await getViewer(event)
  const file = await getBookFileById(id)
  if (!file) throw createError({ statusCode: 404, statusMessage: 'File not found' })

  const [book] = await db.select().from(lib.libBooks)
    .where(and(eq(lib.libBooks.id, file.bookId), isNull(lib.libBooks.deletedAt))).limit(1)
  if (!book || !canView(viewer, book)) {
    throw createError({ statusCode: 404, statusMessage: 'File not found' })
  }

  const inline = String(getQuery(event).inline ?? '') === '1'
  const mime = file.mimeType || 'application/octet-stream'

  setResponseHeader(event, 'Content-Type', mime)
  setResponseHeader(event, 'Content-Disposition', formatContentDisposition(inline ? 'inline' : 'attachment', file.originalName))
  setResponseHeader(event, 'Content-Length', file.size)

  if (!inline) void bumpBookCounter(book.id, 'downloadCount')

  try {
    return sendStream(event, createStorageStream(file.path))
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Ebook file is missing from storage' })
  }
})
