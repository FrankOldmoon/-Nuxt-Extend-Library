/**
 * Library — add or remove a book in a collection (书单). Owner or admin.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../../server/database'
import { requireUser } from '../../../../../../../server/utils/auth'
import * as lib from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid collection id' })
  }

  const body = await readBody<{ bookId?: number, action?: 'add' | 'remove' }>(event)
  const bookId = Number(body?.bookId)
  const action = body?.action === 'remove' ? 'remove' : 'add'
  if (!Number.isInteger(bookId) || bookId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'bookId is required' })
  }

  const [collection] = await db.select().from(lib.libCollections)
    .where(and(eq(lib.libCollections.id, id), isNull(lib.libCollections.deletedAt))).limit(1)
  if (!collection) throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  if (collection.userId !== ctx.user.id && ctx.role?.name !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'You cannot edit this collection' })
  }

  const [book] = await db.select({ id: lib.libBooks.id }).from(lib.libBooks)
    .where(and(eq(lib.libBooks.id, bookId), isNull(lib.libBooks.deletedAt))).limit(1)
  if (!book) throw createError({ statusCode: 404, statusMessage: 'Book not found' })

  if (action === 'remove') {
    await db.delete(lib.libCollectionBooks)
      .where(and(eq(lib.libCollectionBooks.collectionId, id), eq(lib.libCollectionBooks.bookId, bookId)))
  } else {
    await db.insert(lib.libCollectionBooks)
      .values({ collectionId: id, bookId })
      .onConflictDoNothing()
  }

  return { ok: true, action }
})
