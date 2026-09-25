/**
 * Library — toggle a book favourite for the current user.
 * Omitting `favorited` flips the current state.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '../../../../../server/database'
import { requireUser } from '../../../../../server/utils/auth'
import * as lib from '../../database/schema'
import { canView, getViewer, recalcFavoriteCount } from '../../utils/books'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const body = await readBody<{ bookId?: number, favorited?: boolean }>(event)
  const bookId = Number(body?.bookId)
  if (!Number.isInteger(bookId) || bookId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'bookId is required' })
  }

  const viewer = await getViewer(event)
  const [book] = await db.select().from(lib.libBooks).where(eq(lib.libBooks.id, bookId)).limit(1)
  if (!book || !canView(viewer, book)) {
    throw createError({ statusCode: 404, statusMessage: 'Book not found' })
  }

  const [existing] = await db
    .select({ id: lib.libFavorites.id })
    .from(lib.libFavorites)
    .where(and(eq(lib.libFavorites.userId, ctx.user.id), eq(lib.libFavorites.bookId, bookId)))
    .limit(1)

  const want = body?.favorited === undefined ? !existing : Boolean(body.favorited)
  if (want && !existing) {
    await db.insert(lib.libFavorites).values({ userId: ctx.user.id, bookId }).onConflictDoNothing()
  } else if (!want && existing) {
    await db.delete(lib.libFavorites).where(eq(lib.libFavorites.id, existing.id))
  }

  await recalcFavoriteCount(bookId)
  const [updated] = await db.select({ value: lib.libBooks.favoriteCount }).from(lib.libBooks).where(eq(lib.libBooks.id, bookId)).limit(1)
  return { favorited: want, favoriteCount: updated?.value ?? 0 }
})
