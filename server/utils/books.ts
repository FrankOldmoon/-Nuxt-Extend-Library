/**
 * Library module — shared book query + hydration helpers.
 *
 * These functions are the single source of truth for "what a book looks like"
 * on the wire: they apply visibility rules (public books for anonymous users,
 * private books only for their owner / admins), join the author pivot and the
 * series / publisher / category lookups, and attach the viewer's reading
 * progress and favourite flag.
 */
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '../../../../server/database'
import { getSessionUser, isAdmin } from '../../../../server/utils/auth'
import type { H3Event } from 'h3'
import * as lib from '../database/schema'

export interface Viewer {
  userId: number | null
  admin: boolean
}

/** Resolve the current viewer (null userId = anonymous). */
export async function getViewer(event: H3Event): Promise<Viewer> {
  const ctx = await getSessionUser(event)
  return { userId: ctx?.user.id ?? null, admin: ctx ? isAdmin(ctx) : false }
}

/**
 * Row-level visibility conditions for `lib_books`:
 *   - admins see everything except hard-deleted rows;
 *   - authenticated users see public books plus their own private ones;
 *   - anonymous visitors only see public, active books.
 */
export function visibilityConditions(viewer: Viewer): SQL[] {
  const live = [isNull(lib.libBooks.deletedAt), eq(lib.libBooks.isActive, true)]
  if (viewer.admin) return [isNull(lib.libBooks.deletedAt)]
  if (viewer.userId != null) {
    return [...live, or(eq(lib.libBooks.isPublic, true), eq(lib.libBooks.userId, viewer.userId))!]
  }
  return [...live, eq(lib.libBooks.isPublic, true)]
}

export interface LookupRef {
  id: number
  name: string
  slug?: string
}

export interface BookListItem {
  id: number
  title: string
  subtitle: string | null
  sortTitle: string | null
  authors: LookupRef[]
  series: LookupRef | null
  seriesIndex: number | null
  publisher: LookupRef | null
  category: LookupRef | null
  pubdate: string | null
  isbn: string | null
  language: string | null
  pages: number | null
  words: number | null
  rating: number | null
  description: string | null
  cover: string | null
  tags: string[]
  fileCount: number
  fileSize: number
  viewCount: number
  readCount: number
  downloadCount: number
  favoriteCount: number
  isPublic: boolean
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
  formats: string[]
  primaryFileId: number | null
  progress: { status: string, percent: number, chapterIndex: number, location: string | null } | null
  favorited: boolean
}

/** Fetch author references grouped by book id. */
async function fetchBookAuthors(bookIds: number[]): Promise<Map<number, LookupRef[]>> {
  const map = new Map<number, LookupRef[]>()
  if (!bookIds.length) return map
  const rows = await db
    .select({ bookId: lib.libBookAuthors.bookId, id: lib.libAuthors.id, name: lib.libAuthors.name })
    .from(lib.libBookAuthors)
    .innerJoin(lib.libAuthors, eq(lib.libBookAuthors.authorId, lib.libAuthors.id))
    .where(inArray(lib.libBookAuthors.bookId, bookIds))
    .orderBy(lib.libAuthors.name)
  for (const row of rows) {
    const list = map.get(row.bookId) ?? []
    list.push({ id: row.id, name: row.name })
    map.set(row.bookId, list)
  }
  return map
}

/** Fetch the distinct formats + primary file id for each book. */
async function fetchBookFormats(bookIds: number[]): Promise<Map<number, { formats: string[], primaryFileId: number | null }>> {
  const map = new Map<number, { formats: string[], primaryFileId: number | null }>()
  if (!bookIds.length) return map
  const rows = await db
    .select({ bookId: lib.libBookFiles.bookId, id: lib.libBookFiles.id, format: lib.libBookFiles.format, isPrimary: lib.libBookFiles.isPrimary })
    .from(lib.libBookFiles)
    .where(and(inArray(lib.libBookFiles.bookId, bookIds), isNull(lib.libBookFiles.deletedAt)))
    .orderBy(lib.libBookFiles.isPrimary, lib.libBookFiles.id)
  for (const row of rows) {
    const entry = map.get(row.bookId) ?? { formats: [], primaryFileId: null }
    if (!entry.formats.includes(row.format)) entry.formats.push(row.format)
    if (!entry.primaryFileId || row.isPrimary) entry.primaryFileId = row.id
    map.set(row.bookId, entry)
  }
  return map
}

/** Fetch the viewer's progress + favourite flags for the given books. */
async function fetchViewerState(
  bookIds: number[],
  viewer: Viewer
): Promise<{ progress: Map<number, BookListItem['progress']>, favorites: Set<number> }> {
  const progress = new Map<number, BookListItem['progress']>()
  const favorites = new Set<number>()
  if (!viewer.userId || !bookIds.length) return { progress, favorites }

  const progressRows = await db
    .select({
      bookId: lib.libReadingProgress.bookId,
      status: lib.libReadingProgress.status,
      percent: lib.libReadingProgress.percent,
      chapterIndex: lib.libReadingProgress.chapterIndex,
      location: lib.libReadingProgress.location
    })
    .from(lib.libReadingProgress)
    .where(and(eq(lib.libReadingProgress.userId, viewer.userId), inArray(lib.libReadingProgress.bookId, bookIds)))
  for (const row of progressRows) {
    progress.set(row.bookId, {
      status: row.status,
      percent: row.percent,
      chapterIndex: row.chapterIndex,
      location: row.location
    })
  }

  const favRows = await db
    .select({ bookId: lib.libFavorites.bookId })
    .from(lib.libFavorites)
    .where(and(eq(lib.libFavorites.userId, viewer.userId), inArray(lib.libFavorites.bookId, bookIds)))
  for (const row of favRows) favorites.add(row.bookId)

  return { progress, favorites }
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

/**
 * Hydrate raw `lib_books` rows into the client-facing `BookListItem` shape,
 * batching the author / format / viewer-state lookups.
 */
export async function hydrateBooks(rows: lib.LibBook[], viewer: Viewer): Promise<BookListItem[]> {
  const ids = rows.map(r => r.id)
  const [authors, formats, state] = await Promise.all([
    fetchBookAuthors(ids),
    fetchBookFormats(ids),
    fetchViewerState(ids, viewer)
  ])

  // Resolve the series / publisher / category lookups in three batched queries.
  const seriesIds = [...new Set(rows.map(r => r.seriesId).filter((v): v is number => v != null))]
  const publisherIds = [...new Set(rows.map(r => r.publisherId).filter((v): v is number => v != null))]
  const categoryIds = [...new Set(rows.map(r => r.categoryId).filter((v): v is number => v != null))]

  const [seriesRows, publisherRows, categoryRows] = await Promise.all([
    seriesIds.length
      ? db.select({ id: lib.libSeries.id, name: lib.libSeries.name }).from(lib.libSeries).where(inArray(lib.libSeries.id, seriesIds))
      : Promise.resolve([] as LookupRef[]),
    publisherIds.length
      ? db.select({ id: lib.libPublishers.id, name: lib.libPublishers.name }).from(lib.libPublishers).where(inArray(lib.libPublishers.id, publisherIds))
      : Promise.resolve([] as LookupRef[]),
    categoryIds.length
      ? db.select({ id: lib.libCategories.id, name: lib.libCategories.name, slug: lib.libCategories.slug }).from(lib.libCategories).where(inArray(lib.libCategories.id, categoryIds))
      : Promise.resolve([] as LookupRef[])
  ])
  const seriesById = new Map(seriesRows.map(r => [r.id, r]))
  const publisherById = new Map(publisherRows.map(r => [r.id, r]))
  const categoryById = new Map(categoryRows.map(r => [r.id, r]))

  return rows.map((book) => {
    const fileMeta = formats.get(book.id) ?? { formats: [], primaryFileId: null }
    return {
      id: book.id,
      title: book.title,
      subtitle: book.subtitle,
      sortTitle: book.sortTitle,
      authors: authors.get(book.id) ?? [],
      series: book.seriesId != null ? seriesById.get(book.seriesId) ?? null : null,
      seriesIndex: book.seriesIndex,
      publisher: book.publisherId != null ? publisherById.get(book.publisherId) ?? null : null,
      category: book.categoryId != null ? categoryById.get(book.categoryId) ?? null : null,
      pubdate: iso(book.pubdate),
      isbn: book.isbn,
      language: book.language,
      pages: book.pages,
      words: book.words,
      rating: book.rating,
      description: book.description,
      cover: book.cover,
      tags: Array.isArray(book.tags) ? book.tags : [],
      fileCount: book.fileCount,
      fileSize: book.fileSize,
      viewCount: book.viewCount,
      readCount: book.readCount,
      downloadCount: book.downloadCount,
      favoriteCount: book.favoriteCount,
      isPublic: book.isPublic,
      isActive: book.isActive,
      createdAt: iso(book.createdAt),
      updatedAt: iso(book.updatedAt),
      formats: fileMeta.formats,
      primaryFileId: fileMeta.primaryFileId,
      progress: state.progress.get(book.id) ?? null,
      favorited: state.favorites.has(book.id)
    }
  })
}

/** Can this viewer see the given book row? Mirrors `visibilityConditions`. */
export function canView(viewer: Viewer, book: Pick<lib.LibBook, 'isPublic' | 'userId' | 'isActive' | 'deletedAt'>): boolean {
  if (book.deletedAt) return false
  if (viewer.admin) return true
  if (!book.isActive) return false
  if (book.isPublic) return true
  return viewer.userId != null && book.userId === viewer.userId
}

/** Can this viewer edit/delete the given book? Owner or admin only. */
export function canEdit(viewer: Viewer, book: Pick<lib.LibBook, 'userId' | 'deletedAt'>): boolean {
  if (book.deletedAt) return false
  if (viewer.admin) return true
  return viewer.userId != null && book.userId === viewer.userId
}

/**
 * Replace a book's authors with the given names, creating missing author
 * records on the fly and rewiring the `lib_book_authors` pivot.
 */
export async function syncBookAuthors(bookId: number, names: string[]): Promise<void> {
  const cleaned = [...new Set(names.map(n => n.trim()).filter(Boolean))]
  await db.delete(lib.libBookAuthors).where(eq(lib.libBookAuthors.bookId, bookId))
  if (!cleaned.length) return

  const authorIds: number[] = []
  for (const name of cleaned) {
    const existing = await db
      .select({ id: lib.libAuthors.id })
      .from(lib.libAuthors)
      .where(eq(lib.libAuthors.name, name))
      .limit(1)
    if (existing[0]) {
      authorIds.push(existing[0].id)
      continue
    }
    const inserted = await db
      .insert(lib.libAuthors)
      .values({ name })
      .onConflictDoNothing({ target: lib.libAuthors.name })
      .returning({ id: lib.libAuthors.id })
    if (inserted[0]) {
      authorIds.push(inserted[0].id)
    } else {
      const raced = await db
        .select({ id: lib.libAuthors.id })
        .from(lib.libAuthors)
        .where(eq(lib.libAuthors.name, name))
        .limit(1)
      if (raced[0]) authorIds.push(raced[0].id)
    }
  }

  if (authorIds.length) {
    await db
      .insert(lib.libBookAuthors)
      .values(authorIds.map(authorId => ({ bookId, authorId })))
      .onConflictDoNothing()
  }
}

/** Recompute the denormalised file count / size counters for a book. */
export async function recalcBookFileStats(bookId: number): Promise<void> {
  const [row] = await db
    .select({
      files: sql<number>`count(*)::int`,
      size: sql<number>`coalesce(sum(${lib.libBookFiles.size}), 0)::int`
    })
    .from(lib.libBookFiles)
    .where(and(eq(lib.libBookFiles.bookId, bookId), isNull(lib.libBookFiles.deletedAt)))
  await db
    .update(lib.libBooks)
    .set({ fileCount: row?.files ?? 0, fileSize: row?.size ?? 0, updatedAt: new Date() })
    .where(eq(lib.libBooks.id, bookId))
}

/** Recompute the denormalised favourite counter for a book. */
export async function recalcFavoriteCount(bookId: number): Promise<void> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(lib.libFavorites)
    .where(eq(lib.libFavorites.bookId, bookId))
  await db
    .update(lib.libBooks)
    .set({ favoriteCount: row?.value ?? 0, updatedAt: new Date() })
    .where(eq(lib.libBooks.id, bookId))
}

/** Increment a numeric counter column on a book (fire-and-forget friendly). */
export async function bumpBookCounter(
  bookId: number,
  column: 'viewCount' | 'readCount' | 'downloadCount'
): Promise<void> {
  try {
    await db
      .update(lib.libBooks)
      .set({ [column]: sql`${lib.libBooks[column]} + 1` })
      .where(eq(lib.libBooks.id, bookId))
  } catch {
    /* counters are best-effort */
  }
}
