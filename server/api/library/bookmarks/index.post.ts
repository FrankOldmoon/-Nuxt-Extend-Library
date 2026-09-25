/**
 * Library — create a bookmark / highlight / note.
 *
 * A highlight additionally carries the character range it covers inside the
 * chapter's plain text (`startOffset`/`endOffset`), which is what lets the reader
 * re-paint it on every open. `style`/`color` are validated against the shared
 * annotation vocabulary rather than trusted as free-form CSS.
 */
import { eq } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { requireUser } from '../../../../../../server/utils/auth'
import * as lib from '../../../database/schema'
import { canView, getViewer } from '../../../utils/books'
import { isAnnotationColor, isAnnotationStyle } from '../../../../app/utils/annotations'

const TYPES = ['bookmark', 'highlight', 'note']

/** Positive integer, or null when the client sent nothing usable. */
function toOffset(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : null
}

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const body = await readBody<{
    bookId?: number
    type?: string
    location?: string
    chapterIndex?: number
    text?: string
    note?: string
    color?: string
    style?: string
    startOffset?: number
    endOffset?: number
    percent?: number
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

  const rawStart = toOffset(body?.startOffset)
  const rawEnd = toOffset(body?.endOffset)
  // A range is all-or-nothing, and it has to run forwards.
  if ((rawStart == null) !== (rawEnd == null)) {
    throw createError({ statusCode: 400, statusMessage: 'startOffset and endOffset must be sent together' })
  }
  if (rawStart != null && rawEnd != null && rawEnd <= rawStart) {
    throw createError({ statusCode: 400, statusMessage: 'endOffset must be greater than startOffset' })
  }
  const startOffset = rawStart != null && rawEnd != null ? rawStart : null
  const endOffset = rawStart != null && rawEnd != null ? rawEnd : null

  const type = TYPES.includes(String(body?.type)) ? String(body?.type) : 'bookmark'
  const [row] = await db
    .insert(lib.libBookmarks)
    .values({
      bookId,
      userId: ctx.user.id,
      type,
      location: body?.location ?? null,
      chapterIndex: Math.max(0, Number(body?.chapterIndex ?? 0) || 0),
      text: body?.text ?? null,
      note: body?.note ?? null,
      color: isAnnotationColor(body?.color) ? body.color! : null,
      style: isAnnotationStyle(body?.style) ? body.style! : null,
      startOffset,
      endOffset,
      percent: Math.min(100, Math.max(0, Number(body?.percent ?? 0) || 0))
    })
    .returning()

  return { bookmark: row }
})
