/**
 * Library — update one of the current user's annotations (style / colour / note).
 *
 * Only the keys present in the payload are written, and the style/colour values
 * are checked against the shared annotation vocabulary, so a highlight can never
 * smuggle arbitrary CSS into the reader.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { requireUser } from '../../../../../../server/utils/auth'
import * as lib from '../../../database/schema'
import { isAnnotationColor, isAnnotationStyle } from '../../../../app/utils/annotations'

const MAX_NOTE_LENGTH = 20000

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid annotation id' })
  }

  const body = await readBody<{ style?: string, color?: string, note?: string | null }>(event)

  const [row] = await db
    .select()
    .from(lib.libBookmarks)
    .where(and(eq(lib.libBookmarks.id, id), isNull(lib.libBookmarks.deletedAt)))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Annotation not found' })
  if (row.userId !== ctx.user.id && ctx.role?.name !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Not your annotation' })
  }

  const sets: Partial<typeof lib.libBookmarks.$inferInsert> = {}
  if ('style' in body) {
    if (!isAnnotationStyle(body.style)) throw createError({ statusCode: 400, statusMessage: 'Unknown style' })
    sets.style = body.style
  }
  if ('color' in body) {
    if (!isAnnotationColor(body.color)) throw createError({ statusCode: 400, statusMessage: 'Unknown color' })
    sets.color = body.color
  }
  if ('note' in body) {
    const note = body.note == null ? '' : String(body.note)
    sets.note = note.trim() ? note.slice(0, MAX_NOTE_LENGTH) : null
  }
  if (!Object.keys(sets).length) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing to update' })
  }

  sets.updatedAt = new Date()
  const [updated] = await db
    .update(lib.libBookmarks)
    .set(sets)
    .where(eq(lib.libBookmarks.id, id))
    .returning()

  return { bookmark: updated }
})
