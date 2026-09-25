/**
 * Library — soft-delete one of the current user's bookmarks.
 */
import { eq } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { requireUser } from '../../../../../../server/utils/auth'
import * as lib from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid bookmark id' })
  }

  const [row] = await db.select().from(lib.libBookmarks).where(eq(lib.libBookmarks.id, id)).limit(1)
  if (!row || row.deletedAt) throw createError({ statusCode: 404, statusMessage: 'Bookmark not found' })
  if (row.userId !== ctx.user.id && ctx.role?.name !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not your bookmark' })
  }

  const now = new Date()
  await db.update(lib.libBookmarks).set({ deletedAt: now, updatedAt: now }).where(eq(lib.libBookmarks.id, id))
  return { ok: true }
})
