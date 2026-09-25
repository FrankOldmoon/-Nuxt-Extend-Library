/**
 * Library — batch operations on books (soft delete / restore / permanent delete).
 *
 * The library UI runs on *ownership* rules rather than dashboard RBAC, so this
 * endpoint is the module's own batch API: every id is checked individually and
 * ids the caller may not touch are reported back in `skipped` instead of
 * failing the whole operation.
 *
 * `permanent-delete` is admin-only (it cannot be undone); `soft-delete` and
 * `restore` also move the attached files so a trashed book really disappears
 * from the catalogue — and comes back intact when restored.
 */
import { inArray } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { requireUser } from '../../../../../../server/utils/auth'
import * as lib from '../../../database/schema'
import { getViewer, type Viewer } from '../../../utils/books'

const ACTIONS = ['soft-delete', 'restore', 'permanent-delete'] as const

/** Ownership test that also covers trashed rows (needed for restore / purge). */
function ownsBook(viewer: Viewer, book: { userId: number | null }): boolean {
  if (viewer.admin) return true
  return viewer.userId != null && book.userId === viewer.userId
}

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const viewer = await getViewer(event)

  const body = await readBody<{ action?: string, ids?: unknown[] }>(event)
  const action = ACTIONS.find(candidate => candidate === body?.action)
  if (!action) {
    throw createError({ statusCode: 400, statusMessage: 'action must be soft-delete, restore or permanent-delete' })
  }
  const ids = (Array.isArray(body?.ids) ? body.ids : [])
    .map(Number)
    .filter(id => Number.isInteger(id) && id > 0)
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'ids is required' })

  if (action === 'permanent-delete' && !viewer.admin) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can permanently delete books' })
  }

  const rows = await db.select().from(lib.libBooks).where(inArray(lib.libBooks.id, ids))
  const byId = new Map(rows.map(row => [row.id, row]))
  const allowed: number[] = []
  const skipped: number[] = []

  for (const id of ids) {
    const book = byId.get(id)
    if (!book || !ownsBook(viewer, book)) {
      skipped.push(id)
      continue
    }
    // soft-delete only applies to live rows, restore only to trashed ones.
    if (action === 'soft-delete' && book.deletedAt) {
      skipped.push(id)
      continue
    }
    if (action === 'restore' && !book.deletedAt) {
      skipped.push(id)
      continue
    }
    allowed.push(id)
  }

  if (allowed.length) {
    const now = new Date()
    if (action === 'soft-delete') {
      await db.update(lib.libBooks)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(lib.libBooks.id, allowed))
      await db.update(lib.libBookFiles)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(lib.libBookFiles.bookId, allowed))
    } else if (action === 'restore') {
      await db.update(lib.libBooks)
        .set({ deletedAt: null, updatedAt: now })
        .where(inArray(lib.libBooks.id, allowed))
      await db.update(lib.libBookFiles)
        .set({ deletedAt: null, updatedAt: now })
        .where(inArray(lib.libBookFiles.bookId, allowed))
    } else {
      await db.delete(lib.libBooks).where(inArray(lib.libBooks.id, allowed))
    }
  }

  return { ok: true, action, affected: allowed.length, skipped }
})
