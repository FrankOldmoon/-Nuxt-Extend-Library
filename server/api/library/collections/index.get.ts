/**
 * Library — list collections (书单) visible to the viewer, with book counts.
 */
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import * as lib from '../../../database/schema'
import { getViewer, visibilityConditions } from '../../../utils/books'

export default defineEventHandler(async (event) => {
  const viewer = await getViewer(event)
  const conditions: SQL[] = [isNull(lib.libCollections.deletedAt)]
  if (!viewer.admin) {
    if (viewer.userId != null) {
      conditions.push(or(eq(lib.libCollections.isPublic, true), eq(lib.libCollections.userId, viewer.userId))!)
    } else {
      conditions.push(eq(lib.libCollections.isPublic, true))
    }
  }

  const rows = await db
    .select()
    .from(lib.libCollections)
    .where(and(...conditions))
    .orderBy(asc(lib.libCollections.sortOrder), asc(lib.libCollections.name))

  const countRows = await db
    .select({
      collectionId: lib.libCollectionBooks.collectionId,
      count: sql<number>`count(${lib.libBooks.id})::int`
    })
    .from(lib.libCollectionBooks)
    .innerJoin(lib.libBooks, and(eq(lib.libBooks.id, lib.libCollectionBooks.bookId), ...visibilityConditions(viewer)))
    .groupBy(lib.libCollectionBooks.collectionId)
  const counts = new Map(countRows.map(r => [r.collectionId, r.count]))

  return {
    items: rows.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      cover: c.cover,
      isPublic: c.isPublic,
      userId: c.userId,
      sortOrder: c.sortOrder,
      bookCount: counts.get(c.id) ?? 0,
      canEdit: viewer.admin || (viewer.userId != null && c.userId === viewer.userId)
    }))
  }
})
