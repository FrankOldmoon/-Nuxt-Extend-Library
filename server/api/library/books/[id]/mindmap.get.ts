/**
 * Library — one book's mindmap outline.
 *
 * Public read (honours per-book visibility). Returns the markmap-compatible
 * Markdown plus the statistics captured at generation time (节点/域/卡) and
 * the optional completeness note.
 */
import { and, eq, isNull } from 'drizzle-orm'
import * as lib from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid book id' })
  }

  const viewer = await getViewer(event)
  const [book] = await db
    .select()
    .from(lib.libBooks)
    .where(and(eq(lib.libBooks.id, id), isNull(lib.libBooks.deletedAt)))
    .limit(1)

  if (!book || !canView(viewer, book)) {
    throw createError({ statusCode: 404, statusMessage: 'Book not found' })
  }

  const [mindmap] = await db
    .select()
    .from(lib.libMindmaps)
    .where(eq(lib.libMindmaps.bookId, id))
    .limit(1)

  if (!mindmap) {
    throw createError({ statusCode: 404, statusMessage: 'Mindmap not found' })
  }

  return {
    id: mindmap.id,
    bookId: mindmap.bookId,
    bookTitle: book.title,
    content: mindmap.content,
    nodes: mindmap.nodes,
    domains: mindmap.domains,
    cards: mindmap.cards,
    note: mindmap.note
  }
})
