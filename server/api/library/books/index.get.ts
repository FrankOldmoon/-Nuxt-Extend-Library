/**
 * Library — list books.
 *
 * Public read endpoint (honours per-book visibility). Supports full-text
 * search, facet filters, reading-status / favourite filters, several sort
 * orders and pagination. Returns hydrated `BookListItem` rows.
 */
import { and, asc, count, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import * as lib from '../../../database/schema'
import { getViewer, hydrateBooks, visibilityConditions } from '../../../utils/books'

const PAGE_SIZE_MAX = 100

function orderByClause(sort: string, dir: 'asc' | 'desc'): SQL {
  const d = dir === 'asc' ? asc : desc
  switch (sort) {
    case 'title':
      return d(lib.libBooks.sortTitle) as SQL
    case 'rating':
      return d(lib.libBooks.rating) as SQL
    case 'downloads':
      return d(lib.libBooks.downloadCount) as SQL
    case 'pubdate':
      return d(lib.libBooks.pubdate) as SQL
    case 'author':
      return sql`(select min(a.name) from lib_book_authors ba join lib_authors a on a.id = ba.author_id where ba.book_id = ${lib.libBooks.id}) ${sql.raw(dir)}`
    default:
      return d(lib.libBooks.createdAt) as SQL
  }
}

export default defineEventHandler(async (event) => {
  const viewer = await getViewer(event)
  const query = getQuery(event)

  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(query.pageSize) || 24))
  const q = String(query.q ?? '').trim()
  const conditions: SQL[] = visibilityConditions(viewer)

  if (q) {
    const pattern = `%${q}%`
    const authorMatch = db
      .select({ id: lib.libBookAuthors.bookId })
      .from(lib.libBookAuthors)
      .innerJoin(lib.libAuthors, eq(lib.libBookAuthors.authorId, lib.libAuthors.id))
      .where(ilike(lib.libAuthors.name, pattern))
    conditions.push(or(
      ilike(lib.libBooks.title, pattern),
      ilike(lib.libBooks.subtitle, pattern),
      ilike(lib.libBooks.isbn, pattern),
      ilike(lib.libBooks.description, pattern),
      inArray(lib.libBooks.id, authorMatch)
    )!)
  }

  const categoryId = await resolveId('category', query.category)
  if (categoryId != null) conditions.push(eq(lib.libBooks.categoryId, categoryId))

  const seriesId = await resolveId('series', query.series)
  if (seriesId != null) conditions.push(eq(lib.libBooks.seriesId, seriesId))

  const publisherId = await resolveId('publisher', query.publisher)
  if (publisherId != null) conditions.push(eq(lib.libBooks.publisherId, publisherId))

  const authorId = await resolveId('author', query.author)
  if (authorId != null) {
    const byAuthor = db
      .select({ id: lib.libBookAuthors.bookId })
      .from(lib.libBookAuthors)
      .where(eq(lib.libBookAuthors.authorId, authorId))
    conditions.push(inArray(lib.libBooks.id, byAuthor))
  }

  const tag = String(query.tag ?? '').trim()
  if (tag) conditions.push(sql`${lib.libBooks.tags} @> ${JSON.stringify([tag])}::jsonb`)

  const format = String(query.format ?? '').trim().toLowerCase()
  if (format) {
    const byFormat = db
      .select({ id: lib.libBookFiles.bookId })
      .from(lib.libBookFiles)
      .where(and(eq(lib.libBookFiles.format, format), isNull(lib.libBookFiles.deletedAt)))
    conditions.push(inArray(lib.libBooks.id, byFormat))
  }

  const status = String(query.status ?? '').trim()
  if (viewer.userId && ['unread', 'reading', 'finished'].includes(status)) {
    const userProgress = db
      .select({ id: lib.libReadingProgress.bookId })
      .from(lib.libReadingProgress)
      .where(eq(lib.libReadingProgress.userId, viewer.userId))
    if (status === 'unread') {
      conditions.push(notInArray(lib.libBooks.id, userProgress))
    } else {
      conditions.push(sql`${lib.libBooks.id} in (select book_id from lib_reading_progress where user_id = ${viewer.userId} and status = ${status})`)
    }
  }

  if (viewer.userId && String(query.favorited ?? '') === 'true') {
    const favs = db
      .select({ id: lib.libFavorites.bookId })
      .from(lib.libFavorites)
      .where(eq(lib.libFavorites.userId, viewer.userId))
    conditions.push(inArray(lib.libBooks.id, favs))
  }

  const where = and(...conditions)
  const sort = String(query.sort ?? 'recent')
  const dir = String(query.order ?? 'desc') === 'asc' ? 'asc' : 'desc'
  const orderBy = orderByClause(sort, dir)

  const [rows, countRow] = await Promise.all([
    db.select().from(lib.libBooks).where(where).orderBy(orderBy, desc(lib.libBooks.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(lib.libBooks).where(where)
  ])

  const total = Number(countRow[0]?.value ?? 0)
  return {
    items: await hydrateBooks(rows, viewer),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  }
})

/**
 * Resolve a facet filter that may be either a numeric id or a slug/name.
 * Returns null when the filter is absent or cannot be resolved.
 */
async function resolveId(kind: 'category' | 'series' | 'publisher' | 'author', raw: unknown): Promise<number | null> {
  const value = String(raw ?? '').trim()
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value)

  if (kind === 'category') {
    const [row] = await db.select({ id: lib.libCategories.id }).from(lib.libCategories)
      .where(eq(lib.libCategories.slug, value)).limit(1)
    return row?.id ?? null
  }
  if (kind === 'series') {
    const [row] = await db.select({ id: lib.libSeries.id }).from(lib.libSeries)
      .where(eq(lib.libSeries.name, value)).limit(1)
    return row?.id ?? null
  }
  if (kind === 'publisher') {
    const [row] = await db.select({ id: lib.libPublishers.id }).from(lib.libPublishers)
      .where(eq(lib.libPublishers.name, value)).limit(1)
    return row?.id ?? null
  }
  const [row] = await db.select({ id: lib.libAuthors.id }).from(lib.libAuthors)
    .where(eq(lib.libAuthors.name, value)).limit(1)
  return row?.id ?? null
}
