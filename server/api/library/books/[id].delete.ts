/**
 * Library — soft-delete a book (owner or admin only). Its files are soft
 * deleted with it so the catalogue and storage accounting stay consistent.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { requireUser } from '../../../../../../server/utils/auth'
import * as lib from '../../../database/schema'
import { canEdit, getViewer } from '../../../utils/books'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid book id' })
  }

  const viewer = await getViewer(event)
  const [book] = await db.select().from(lib.libBooks)
    .where(and(eq(lib.libBooks.id, id), isNull(lib.libBooks.deletedAt))).limit(1)
  if (!book) throw createError({ statusCode: 404, statusMessage: 'Book not found' })
  if (!canEdit(viewer, book)) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot delete this book' })
  }

  const now = new Date()
  await db.update(lib.libBooks).set({ deletedAt: now, updatedAt: now }).where(eq(lib.libBooks.id, id))
  await db.update(lib.libBookFiles).set({ deletedAt: now, updatedAt: now }).where(eq(lib.libBookFiles.bookId, id))

  return { ok: true }
})
