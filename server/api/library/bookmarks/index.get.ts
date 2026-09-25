/**
 * Library — the viewer's bookmarks / highlights / notes for a book.
 */
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import * as lib from '../../../database/schema'
import { getViewer } from '../../../utils/books'

export default defineEventHandler(async (event) => {
  const viewer = await getViewer(event)
  if (!viewer.userId) return { items: [] }

  const bookId = Number(getQuery(event).bookId)
  if (!Number.isInteger(bookId) || bookId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'bookId is required' })
  }

  const items = await db
    .select()
    .from(lib.libBookmarks)
    .where(and(
      eq(lib.libBookmarks.userId, viewer.userId),
      eq(lib.libBookmarks.bookId, bookId),
      isNull(lib.libBookmarks.deletedAt)
    ))
    .orderBy(
      asc(lib.libBookmarks.chapterIndex),
      asc(lib.libBookmarks.startOffset),
      asc(lib.libBookmarks.id)
    )

  return { items }
})
