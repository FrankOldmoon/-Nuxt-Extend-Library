/**
 * Library — the recycle bin: books that have been soft deleted.
 *
 * Regular users see their own trashed books; admins see every trashed book.
 * Entries can be restored (or permanently removed) through
 * `POST /api/library/books/batch`.
 */
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import * as lib from '../../../database/schema'
import { getViewer, hydrateBooks } from '../../../utils/books'

export default defineEventHandler(async (event) => {
  const viewer = await getViewer(event)

  const conditions = [isNotNull(lib.libBooks.deletedAt)]
  if (!viewer.admin) {
    if (viewer.userId == null) return { items: [], total: 0 }
    conditions.push(eq(lib.libBooks.userId, viewer.userId))
  }

  const rows = await db
    .select()
    .from(lib.libBooks)
    .where(and(...conditions))
    .orderBy(desc(lib.libBooks.deletedAt))
    .limit(200)

  return { items: await hydrateBooks(rows, viewer), total: rows.length }
})
