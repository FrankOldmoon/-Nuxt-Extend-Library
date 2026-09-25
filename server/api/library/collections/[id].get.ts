/**
 * Library — collection (书单) detail with its books.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import * as lib from '../../../database/schema'
import { getViewer, hydrateBooks, visibilityConditions } from '../../../utils/books'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid collection id' })
  }

  const viewer = await getViewer(event)
  const [collection] = await db.select().from(lib.libCollections)
    .where(and(eq(lib.libCollections.id, id), isNull(lib.libCollections.deletedAt))).limit(1)
  if (!collection) throw createError({ statusCode: 404, statusMessage: 'Collection not found' })

  const canEdit = viewer.admin || (viewer.userId != null && collection.userId === viewer.userId)
  if (!canEdit && !collection.isPublic) {
    throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  }

  const links = await db
    .select({ bookId: lib.libCollectionBooks.bookId })
    .from(lib.libCollectionBooks)
    .where(eq(lib.libCollectionBooks.collectionId, id))

  const bookIds = links.map(l => l.bookId)
  const rows = bookIds.length
    ? await db.select().from(lib.libBooks)
        .where(and(inArray(lib.libBooks.id, bookIds), ...visibilityConditions(viewer)))
    : []
  const hydrated = await hydrateBooks(rows, viewer)
  const byId = new Map(hydrated.map(b => [b.id, b]))
  const books = bookIds.map(bid => byId.get(bid)).filter((b): b is NonNullable<typeof b> => Boolean(b))

  return { collection: { ...collection, canEdit }, books }
})
