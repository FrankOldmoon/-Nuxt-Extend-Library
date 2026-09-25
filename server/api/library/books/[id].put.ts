/**
 * Library — update a book's metadata (owner or admin only).
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { requireUser } from '../../../../../../server/utils/auth'
import * as lib from '../../../database/schema'
import { updateBook } from '../../../utils/bookWrite'
import { canEdit, getViewer, hydrateBooks } from '../../../utils/books'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid book id' })
  }

  const viewer = await getViewer(event)
  const [existing] = await db.select().from(lib.libBooks)
    .where(and(eq(lib.libBooks.id, id), isNull(lib.libBooks.deletedAt))).limit(1)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Book not found' })
  if (!canEdit(viewer, existing)) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot edit this book' })
  }

  const body = await readBody<Record<string, unknown>>(event)
  await updateBook(id, body ?? {})

  const [row] = await db.select().from(lib.libBooks).where(eq(lib.libBooks.id, id)).limit(1)
  const [book] = row ? await hydrateBooks([row], viewer) : []
  return { book }
})
