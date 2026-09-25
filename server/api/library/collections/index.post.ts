/**
 * Library — create a collection (书单).
 */
import { db } from '../../../../../../server/database'
import { requireUser } from '../../../../../../server/utils/auth'
import * as lib from '../../../database/schema'
import { uniqueCollectionSlug } from '../../../utils/collections'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const body = await readBody<{
    name?: string
    description?: string
    cover?: string
    isPublic?: boolean
  }>(event)

  const name = String(body?.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const slug = await uniqueCollectionSlug(name)
  const [row] = await db
    .insert(lib.libCollections)
    .values({
      name,
      slug,
      description: body?.description?.trim() || null,
      cover: body?.cover?.trim() || null,
      userId: ctx.user.id,
      isPublic: body?.isPublic === undefined ? true : Boolean(body.isPublic)
    })
    .returning()

  return { collection: row }
})
