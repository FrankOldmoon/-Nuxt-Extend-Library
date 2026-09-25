/**
 * Library — the viewer's favourite books.
 */
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import * as lib from '../../../database/schema'
import { getViewer, hydrateBooks, visibilityConditions } from '../../../utils/books'

export default defineEventHandler(async (event) => {
  const viewer = await getViewer(event)
  if (!viewer.userId) return { items: [], total: 0 }

  const favRows = await db
    .select({ bookId: lib.libFavorites.bookId, createdAt: lib.libFavorites.createdAt })
    .from(lib.libFavorites)
    .where(eq(lib.libFavorites.userId, viewer.userId))
    .orderBy(desc(lib.libFavorites.createdAt))

  if (!favRows.length) return { items: [], total: 0 }

  const books = await db
    .select()
    .from(lib.libBooks)
    .where(and(inArray(lib.libBooks.id, favRows.map(r => r.bookId)), ...visibilityConditions(viewer)))
  const hydrated = await hydrateBooks(books, viewer)
  const byId = new Map(hydrated.map(b => [b.id, b]))

  const items = favRows.map(row => byId.get(row.bookId)).filter((b): b is NonNullable<typeof b> => Boolean(b))
  return { items, total: items.length }
})
