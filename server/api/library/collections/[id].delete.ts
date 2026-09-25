/**
 * Library — soft-delete a collection (书单). Owner or admin.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { requireUser } from '../../../../../../server/utils/auth'
import * as lib from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid collection id' })
  }

  const [existing] = await db.select().from(lib.libCollections)
    .where(and(eq(lib.libCollections.id, id), isNull(lib.libCollections.deletedAt))).limit(1)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Collection not found' })
  if (existing.userId !== ctx.user.id && ctx.role?.name !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'You cannot delete this collection' })
  }

  const now = new Date()
  await db.update(lib.libCollections).set({ deletedAt: now, updatedAt: now }).where(eq(lib.libCollections.id, id))
  return { ok: true }
})
