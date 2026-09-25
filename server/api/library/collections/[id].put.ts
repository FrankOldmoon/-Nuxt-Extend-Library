/**
 * Library — update a collection (书单). Owner or admin.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { requireUser } from '../../../../../../server/utils/auth'
import * as lib from '../../../database/schema'
import { uniqueCollectionSlug } from '../../../utils/collections'

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
    throw createError({ statusCode: 403, statusMessage: 'You cannot edit this collection' })
  }

  const body = await readBody<{
    name?: string
    description?: string | null
    cover?: string | null
    isPublic?: boolean
    sortOrder?: number
  }>(event)

  const sets: Partial<typeof lib.libCollections.$inferInsert> = { updatedAt: new Date() }
  if (body?.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'name cannot be empty' })
    sets.name = name
    if (name !== existing.name) sets.slug = await uniqueCollectionSlug(name, id)
  }
  if (body?.description !== undefined) sets.description = body.description?.trim() || null
  if (body?.cover !== undefined) sets.cover = body.cover?.trim() || null
  if (body?.isPublic !== undefined) sets.isPublic = Boolean(body.isPublic)
  if (body?.sortOrder !== undefined) sets.sortOrder = Number(body.sortOrder) || 0

  const [row] = await db.update(lib.libCollections).set(sets).where(eq(lib.libCollections.id, id)).returning()
  return { collection: row }
})
