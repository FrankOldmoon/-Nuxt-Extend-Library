/**
 * Library — faceted browse data.
 *
 * Returns every browse dimension (categories, authors, series, publishers,
 * tags, formats) with the number of *visible* books in each, so the sidebar can
 * render counts without N queries from the client.
 */
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../../../../../server/database'
import * as lib from '../../database/schema'
import { getViewer, visibilityConditions } from '../../utils/books'

interface FacetRow {
  id: number
  name: string
  slug?: string | null
  icon?: string | null
  count: number
}

export default defineEventHandler(async (event) => {
  const viewer = await getViewer(event)
  const vis = visibilityConditions(viewer)

  const [categories, authors, series, publishers, tags, formats] = await Promise.all([
    db.select({
      id: lib.libCategories.id,
      name: lib.libCategories.name,
      slug: lib.libCategories.slug,
      icon: lib.libCategories.icon,
      count: sql<number>`count(${lib.libBooks.id})::int`
    })
      .from(lib.libCategories)
      .leftJoin(lib.libBooks, and(eq(lib.libBooks.categoryId, lib.libCategories.id), ...vis))
      .where(and(isNull(lib.libCategories.deletedAt), eq(lib.libCategories.isActive, true)))
      .groupBy(lib.libCategories.id)
      .orderBy(asc(lib.libCategories.sortOrder), asc(lib.libCategories.name)),

    db.select({
      id: lib.libAuthors.id,
      name: lib.libAuthors.name,
      count: sql<number>`count(${lib.libBooks.id})::int`
    })
      .from(lib.libAuthors)
      .leftJoin(lib.libBookAuthors, eq(lib.libBookAuthors.authorId, lib.libAuthors.id))
      .leftJoin(lib.libBooks, and(eq(lib.libBooks.id, lib.libBookAuthors.bookId), ...vis))
      .where(isNull(lib.libAuthors.deletedAt))
      .groupBy(lib.libAuthors.id)
      .orderBy(desc(sql`count(${lib.libBooks.id})`), asc(lib.libAuthors.name)),

    db.select({
      id: lib.libSeries.id,
      name: lib.libSeries.name,
      count: sql<number>`count(${lib.libBooks.id})::int`
    })
      .from(lib.libSeries)
      .leftJoin(lib.libBooks, and(eq(lib.libBooks.seriesId, lib.libSeries.id), ...vis))
      .where(isNull(lib.libSeries.deletedAt))
      .groupBy(lib.libSeries.id)
      .orderBy(asc(lib.libSeries.name)),

    db.select({
      id: lib.libPublishers.id,
      name: lib.libPublishers.name,
      count: sql<number>`count(${lib.libBooks.id})::int`
    })
      .from(lib.libPublishers)
      .leftJoin(lib.libBooks, and(eq(lib.libBooks.publisherId, lib.libPublishers.id), ...vis))
      .where(isNull(lib.libPublishers.deletedAt))
      .groupBy(lib.libPublishers.id)
      .orderBy(asc(lib.libPublishers.name)),

    tagFacets(vis),
    formatFacets(vis)
  ])

  const withBooks = (rows: FacetRow[]) => rows.filter(r => r.count > 0)
  return {
    categories: withBooks(categories),
    authors: withBooks(authors).slice(0, 300),
    series: withBooks(series),
    publishers: withBooks(publishers),
    tags,
    formats
  }
})

type VisConditions = ReturnType<typeof visibilityConditions>

/** Distinct tags across the visible catalogue, most-used first. */
async function tagFacets(vis: VisConditions): Promise<Array<{ tag: string, count: number }>> {
  const visSql = sql.join(vis, sql` and `)
  const result = await db.execute(sql`
    select t.tag as tag, count(*)::int as count
    from lib_books, jsonb_array_elements_text(lib_books.tags) as t(tag)
    where ${visSql}
    group by t.tag
    order by count desc, t.tag asc
    limit 300
  `)
  return rowsOf(result)
}

/** Distinct file formats across the visible catalogue. */
async function formatFacets(vis: VisConditions): Promise<Array<{ format: string, count: number }>> {
  const visSql = sql.join(vis, sql` and `)
  const result = await db.execute(sql`
    select f.format as format, count(distinct f.book_id)::int as count
    from lib_book_files f
    join lib_books on lib_books.id = f.book_id
    where f.deleted_at is null and ${visSql}
    group by f.format
    order by count desc, f.format asc
  `)
  return rowsOf(result)
}

/** Normalise a drizzle `db.execute` result into a plain row array. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown })?.rows
  return Array.isArray(rows) ? rows as T[] : []
}
