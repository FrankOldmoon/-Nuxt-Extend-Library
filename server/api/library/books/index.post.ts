/**
 * Library — create a book manually (no file). Authenticated users only.
 */
import { eq } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { requireUser } from '../../../../../../server/utils/auth'
import * as lib from '../../../database/schema'
import { createBook } from '../../../utils/bookWrite'
import { getViewer, hydrateBooks } from '../../../utils/books'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const body = await readBody<Record<string, unknown>>(event)
  const id = await createBook(body ?? {}, { userId: ctx.user.id })

  const [row] = await db.select().from(lib.libBooks).where(eq(lib.libBooks.id, id)).limit(1)
  const viewer = await getViewer(event)
  const [book] = row ? await hydrateBooks([row], viewer) : []
  return { book }
})
