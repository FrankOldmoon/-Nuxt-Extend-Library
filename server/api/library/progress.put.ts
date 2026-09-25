/**
 * Library — record reading progress for the current user.
 *
 * Upserts the (book, user) progress row. The reading status is derived from the
 * percentage unless the caller passes an explicit `status`.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '../../../../../server/database'
import { requireUser } from '../../../../../server/utils/auth'
import * as lib from '../../database/schema'
import { canView, getViewer } from '../../utils/books'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const body = await readBody<{
    bookId?: number
    status?: string
    percent?: number
    chapterIndex?: number
    location?: string
  }>(event)

  const bookId = Number(body?.bookId)
  if (!Number.isInteger(bookId) || bookId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'bookId is required' })
  }

  const viewer = await getViewer(event)
  const [book] = await db.select().from(lib.libBooks).where(eq(lib.libBooks.id, bookId)).limit(1)
  if (!book || !canView(viewer, book)) {
    throw createError({ statusCode: 404, statusMessage: 'Book not found' })
  }

  const percent = Math.min(100, Math.max(0, Number(body?.percent ?? 0) || 0))
  const chapterIndex = Math.max(0, Number(body?.chapterIndex ?? 0) || 0)

  let status = String(body?.status ?? '').trim()
  if (!['unread', 'reading', 'finished'].includes(status)) {
    status = percent >= 99.5 ? 'finished' : percent > 0 ? 'reading' : 'unread'
  }

  const now = new Date()
  const [existing] = await db
    .select()
    .from(lib.libReadingProgress)
    .where(and(eq(lib.libReadingProgress.bookId, bookId), eq(lib.libReadingProgress.userId, ctx.user.id)))
    .limit(1)

  const startedAt = existing?.startedAt ?? (status !== 'unread' ? now : null)
  const finishedAt = status === 'finished' ? (existing?.finishedAt ?? now) : null

  if (existing) {
    const [row] = await db
      .update(lib.libReadingProgress)
      .set({
        status,
        percent,
        chapterIndex,
        location: body?.location ?? existing.location,
        startedAt,
        finishedAt,
        lastReadAt: now,
        updatedAt: now
      })
      .where(eq(lib.libReadingProgress.id, existing.id))
      .returning()
    return { progress: row }
  }

  const [row] = await db
    .insert(lib.libReadingProgress)
    .values({
      bookId,
      userId: ctx.user.id,
      status,
      percent,
      chapterIndex,
      location: body?.location ?? null,
      startedAt,
      finishedAt,
      lastReadAt: now
    })
    .returning()
  return { progress: row }
})
