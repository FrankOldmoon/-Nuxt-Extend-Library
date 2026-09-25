/**
 * Library — full-text search over book contents.
 *
 * Scope is the whole visible library, or a single book when `bookId` is given
 * (the reader's in-book search). Matching is a case-insensitive substring scan
 * (`position()`), which behaves identically for CJK and Latin text — Postgres
 * FTS would need a Chinese parser that cannot be assumed to be installed.
 * Each hit carries a snippet so the client can show context.
 *
 * Requires a signed-in viewer: search results expose book text.
 */
import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../../../../server/database'
import * as lib from '../../database/schema'
import { canView, getViewer, visibilityConditions } from '../../utils/books'
import { ensureBookTextIndex } from '../../utils/indexer'
import { buildSnippet } from '../../utils/text'

const MAX_QUERY_LENGTH = 120
const DEFAULT_LIMIT = 40
const MAX_LIMIT = 200

export default defineEventHandler(async (event) => {
  const viewer = await getViewer(event)
  if (viewer.userId == null) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to search book contents' })
  }

  const params = getQuery(event)
  const query = String(params.q ?? '').trim()
  if (!query || query.length > MAX_QUERY_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `q must be 1-${MAX_QUERY_LENGTH} characters` })
  }
  const bookId = Number(params.bookId) || null
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.limit) || DEFAULT_LIMIT))

  if (bookId) {
    const [book] = await db
      .select()
      .from(lib.libBooks)
      .where(and(eq(lib.libBooks.id, bookId), isNull(lib.libBooks.deletedAt)))
      .limit(1)
    if (!book || !canView(viewer, book)) {
      throw createError({ statusCode: 404, statusMessage: 'Book not found' })
    }
    // Books uploaded before this feature (or just converted) get indexed lazily.
    await ensureBookTextIndex(bookId)
  }

  const match = sql`position(lower(${query}) in lower(${lib.libBookChapters.text})) > 0`
  const where = bookId
    ? and(eq(lib.libBookChapters.bookId, bookId), match)
    : and(
        inArray(
          lib.libBookChapters.bookId,
          db.select({ id: lib.libBooks.id }).from(lib.libBooks).where(and(...visibilityConditions(viewer)))
        ),
        match
      )

  const [totals] = await db.select({ value: count() }).from(lib.libBookChapters).where(where)

  const rows = await db
    .select({
      bookId: lib.libBookChapters.bookId,
      bookTitle: lib.libBooks.title,
      chapterIndex: lib.libBookChapters.chapterIndex,
      chapterTitle: lib.libBookChapters.title,
      text: lib.libBookChapters.text
    })
    .from(lib.libBookChapters)
    .innerJoin(lib.libBooks, eq(lib.libBooks.id, lib.libBookChapters.bookId))
    .where(where)
    .orderBy(asc(lib.libBookChapters.bookId), asc(lib.libBookChapters.chapterIndex))
    .limit(limit)

  return {
    query,
    total: Number(totals?.value ?? 0),
    hits: rows.map((row) => {
      const snippet = buildSnippet(row.text, query)
      return {
        bookId: row.bookId,
        bookTitle: row.bookTitle,
        chapterIndex: row.chapterIndex,
        chapterTitle: row.chapterTitle,
        snippet: snippet.snippet,
        offset: snippet.offset
      }
    })
  }
})
