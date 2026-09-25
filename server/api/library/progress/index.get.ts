/**
 * Library — the viewer's shelf (reading progress entries with their books).
 */
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import * as lib from '../../../database/schema'
import { getViewer, hydrateBooks, visibilityConditions } from '../../../utils/books'

export default defineEventHandler(async (event) => {
  const viewer = await getViewer(event)
  if (!viewer.userId) return { items: [], total: 0 }

  const query = getQuery(event)
  const status = String(query.status ?? '').trim()
  const limit = Math.min(200, Math.max(1, Number(query.pageSize) || 60))

  const conditions = [eq(lib.libReadingProgress.userId, viewer.userId)]
  if (['unread', 'reading', 'finished'].includes(status)) {
    conditions.push(eq(lib.libReadingProgress.status, status))
  }

  const progressRows = await db
    .select()
    .from(lib.libReadingProgress)
    .where(and(...conditions))
    .orderBy(desc(lib.libReadingProgress.lastReadAt))
    .limit(limit)

  if (!progressRows.length) return { items: [], total: 0 }

  const bookIds = progressRows.map(r => r.bookId)
  const books = await db
    .select()
    .from(lib.libBooks)
    .where(and(inArray(lib.libBooks.id, bookIds), ...visibilityConditions(viewer)))
  const hydrated = await hydrateBooks(books, viewer)
  const byId = new Map(hydrated.map(b => [b.id, b]))

  const items = progressRows
    .map(row => ({ book: byId.get(row.bookId) ?? null, progress: row }))
    .filter(item => item.book)

  return { items, total: items.length }
})
