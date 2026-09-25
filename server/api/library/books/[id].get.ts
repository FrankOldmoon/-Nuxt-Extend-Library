/**
 * Library — book detail.
 *
 * Public (honours visibility). Returns the hydrated book plus its attached
 * files. Internal storage paths are never exposed — downloads go through
 * `/api/library/files/:id/download`.
 */
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { fileExists } from '../../../../../../server/utils/fileStorage'
import * as lib from '../../../database/schema'
import { bumpBookCounter, canView, getViewer, hydrateBooks } from '../../../utils/books'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid book id' })
  }

  const viewer = await getViewer(event)
  const [book] = await db
    .select()
    .from(lib.libBooks)
    .where(and(eq(lib.libBooks.id, id), isNull(lib.libBooks.deletedAt)))
    .limit(1)

  if (!book || !canView(viewer, book)) {
    throw createError({ statusCode: 404, statusMessage: 'Book not found' })
  }

  const fileRows = await db
    .select({
      id: lib.libBookFiles.id,
      format: lib.libBookFiles.format,
      originalName: lib.libBookFiles.originalName,
      mimeType: lib.libBookFiles.mimeType,
      size: lib.libBookFiles.size,
      isPrimary: lib.libBookFiles.isPrimary,
      createdAt: lib.libBookFiles.createdAt,
      path: lib.libBookFiles.path
    })
    .from(lib.libBookFiles)
    .where(and(eq(lib.libBookFiles.bookId, id), isNull(lib.libBookFiles.deletedAt)))
    .orderBy(asc(lib.libBookFiles.isPrimary), asc(lib.libBookFiles.id))

  // Flag rows whose bytes are no longer on disk, so the UI can disable reading
  // and downloading instead of failing with a 500.
  const files = await Promise.all(fileRows.map(async ({ path, ...file }) => ({
    ...file,
    available: await fileExists(path).catch(() => false)
  })))

  const [hydrated] = await hydrateBooks([book], viewer)
  void bumpBookCounter(id, 'viewCount')

  return {
    book: hydrated,
    files,
    canEdit: viewer.admin || (viewer.userId != null && book.userId === viewer.userId)
  }
})
