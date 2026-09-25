/**
 * Library — catalogue statistics for the dashboard / home page.
 *
 * Every number respects the viewer's book visibility.
 */
import { and, desc, sql } from 'drizzle-orm'
import { db } from '../../../../../server/database'
import * as lib from '../../database/schema'
import { getViewer, hydrateBooks, visibilityConditions } from '../../utils/books'

export default defineEventHandler(async (event) => {
  const viewer = await getViewer(event)
  const vis = () => sql.join(visibilityConditions(viewer), sql` and `)

  const aggregate = await db.execute(sql`
    select
      (select count(*) from lib_books where ${vis()})::int as books,
      (select count(distinct ba.author_id) from lib_book_authors ba join lib_books on lib_books.id = ba.book_id where ${vis()})::int as authors,
      (select count(distinct series_id) from lib_books where series_id is not null and ${vis()})::int as series,
      (select count(distinct publisher_id) from lib_books where publisher_id is not null and ${vis()})::int as publishers,
      (select count(distinct category_id) from lib_books where category_id is not null and ${vis()})::int as categories,
      (select count(distinct t.tag) from lib_books, jsonb_array_elements_text(lib_books.tags) as t(tag) where ${vis()})::int as tags,
      (select count(*) from lib_book_files f join lib_books on lib_books.id = f.book_id where f.deleted_at is null and ${vis()})::int as files,
      (select coalesce(sum(f.size), 0) from lib_book_files f join lib_books on lib_books.id = f.book_id where f.deleted_at is null and ${vis()})::bigint as totalSize
  `)

  const totals = rowsOf<Record<string, unknown>>(aggregate)[0] ?? {}

  let personal: { reading: number, finished: number, favorites: number } | null = null
  if (viewer.userId) {
    const personalResult = await db.execute(sql`
      select
        (select count(*) from lib_reading_progress where user_id = ${viewer.userId} and status = 'reading')::int as reading,
        (select count(*) from lib_reading_progress where user_id = ${viewer.userId} and status = 'finished')::int as finished,
        (select count(*) from lib_favorites where user_id = ${viewer.userId})::int as favorites
    `)
    const row = rowsOf<Record<string, number>>(personalResult)[0]
    if (row) {
      personal = { reading: Number(row.reading) || 0, finished: Number(row.finished) || 0, favorites: Number(row.favorites) || 0 }
    }
  }

  const recentRows = await db
    .select()
    .from(lib.libBooks)
    .where(and(...visibilityConditions(viewer)))
    .orderBy(desc(lib.libBooks.createdAt))
    .limit(8)

  return {
    totals: {
      books: Number(totals.books) || 0,
      authors: Number(totals.authors) || 0,
      series: Number(totals.series) || 0,
      publishers: Number(totals.publishers) || 0,
      categories: Number(totals.categories) || 0,
      tags: Number(totals.tags) || 0,
      files: Number(totals.files) || 0,
      totalSize: Number(totals.totalSize) || 0
    },
    personal,
    recent: await hydrateBooks(recentRows, viewer)
  }
})

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown })?.rows
  return Array.isArray(rows) ? rows as T[] : []
}
