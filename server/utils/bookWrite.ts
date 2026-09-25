/**
 * Library — book create/update payload handling shared by the POST/PUT routes.
 *
 * Keeps the "resolve or create by name" logic for series/publishers and the
 * author-pivot sync out of the route handlers.
 */
import { eq } from 'drizzle-orm'
import { db } from '../../../../server/database'
import * as lib from '../database/schema'
import { normalizeSortTitle } from './parse'
import { syncBookAuthors } from './books'

export interface BookWriteInput {
  title?: string
  subtitle?: string | null
  authors?: string[]
  description?: string | null
  cover?: string | null
  tags?: string[]
  categoryId?: number | null
  seriesId?: number | null
  seriesName?: string | null
  seriesIndex?: number | null
  publisherId?: number | null
  publisherName?: string | null
  pubdate?: string | null
  isbn?: string | null
  language?: string | null
  pages?: number | null
  words?: number | null
  rating?: number | null
  isPublic?: boolean
}

export interface BookWriter {
  userId: number | null
}

function toId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}

function toDate(value: unknown): Date | null {
  const s = toText(value)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function toTags(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(v => String(v).trim()).filter(Boolean))]
  if (typeof value === 'string') return [...new Set(value.split(/[,，;]/).map(s => s.trim()).filter(Boolean))]
  return []
}

function toAuthors(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[,，;、/]/).map(s => s.trim()).filter(Boolean)
  return []
}

async function findOrCreateSeries(name: string): Promise<number | null> {
  const existing = await db.select({ id: lib.libSeries.id }).from(lib.libSeries)
    .where(eq(lib.libSeries.name, name)).limit(1)
  if (existing[0]) return existing[0].id
  const inserted = await db.insert(lib.libSeries).values({ name })
    .onConflictDoNothing({ target: lib.libSeries.name })
    .returning({ id: lib.libSeries.id })
  if (inserted[0]) return inserted[0].id
  const raced = await db.select({ id: lib.libSeries.id }).from(lib.libSeries)
    .where(eq(lib.libSeries.name, name)).limit(1)
  return raced[0]?.id ?? null
}

async function findOrCreatePublisher(name: string): Promise<number | null> {
  const existing = await db.select({ id: lib.libPublishers.id }).from(lib.libPublishers)
    .where(eq(lib.libPublishers.name, name)).limit(1)
  if (existing[0]) return existing[0].id
  const inserted = await db.insert(lib.libPublishers).values({ name })
    .onConflictDoNothing({ target: lib.libPublishers.name })
    .returning({ id: lib.libPublishers.id })
  if (inserted[0]) return inserted[0].id
  const raced = await db.select({ id: lib.libPublishers.id }).from(lib.libPublishers)
    .where(eq(lib.libPublishers.name, name)).limit(1)
  return raced[0]?.id ?? null
}

/** Resolve series id from an explicit id or a (new) name. */
async function resolveSeries(input: BookWriteInput): Promise<number | null> {
  const id = toId(input.seriesId)
  if (id != null) return id
  const name = toText(input.seriesName)
  return name ? findOrCreateSeries(name) : null
}

async function resolvePublisher(input: BookWriteInput): Promise<number | null> {
  const id = toId(input.publisherId)
  if (id != null) return id
  const name = toText(input.publisherName)
  return name ? findOrCreatePublisher(name) : null
}

/** Create a book from a write payload; returns the new book id. */
export async function createBook(input: BookWriteInput, writer: BookWriter): Promise<number> {
  const title = toText(input.title)
  if (!title) throw createError({ statusCode: 400, statusMessage: 'title is required' })

  const [seriesId, publisherId] = await Promise.all([resolveSeries(input), resolvePublisher(input)])

  const [row] = await db.insert(lib.libBooks).values({
    title,
    sortTitle: normalizeSortTitle(title),
    subtitle: toText(input.subtitle),
    description: toText(input.description),
    cover: toText(input.cover),
    tags: toTags(input.tags),
    categoryId: toId(input.categoryId),
    seriesId,
    seriesIndex: toNumber(input.seriesIndex),
    publisherId,
    pubdate: toDate(input.pubdate),
    isbn: toText(input.isbn),
    language: toText(input.language),
    pages: toNumber(input.pages),
    words: toNumber(input.words),
    rating: toNumber(input.rating),
    isPublic: input.isPublic === undefined ? true : Boolean(input.isPublic),
    userId: writer.userId
  }).returning({ id: lib.libBooks.id })

  if (!row) throw createError({ statusCode: 500, statusMessage: 'Failed to create book' })

  const authors = toAuthors(input.authors)
  if (authors.length) await syncBookAuthors(row.id, authors)
  return row.id
}

/**
 * Apply a partial update to an existing book. Only the keys present in the
 * payload are written, so PATCH-style updates never wipe unrelated columns.
 */
export async function updateBook(id: number, input: BookWriteInput): Promise<void> {
  const sets: Partial<typeof lib.libBooks.$inferInsert> = {}

  if ('title' in input) {
    const title = toText(input.title)
    if (!title) throw createError({ statusCode: 400, statusMessage: 'title cannot be empty' })
    sets.title = title
    sets.sortTitle = normalizeSortTitle(title)
  }
  if ('subtitle' in input) sets.subtitle = toText(input.subtitle)
  if ('description' in input) sets.description = toText(input.description)
  if ('cover' in input) sets.cover = toText(input.cover)
  if ('tags' in input) sets.tags = toTags(input.tags)
  if ('categoryId' in input) sets.categoryId = toId(input.categoryId)
  if ('seriesId' in input || 'seriesName' in input) sets.seriesId = await resolveSeries(input)
  if ('seriesIndex' in input) sets.seriesIndex = toNumber(input.seriesIndex)
  if ('publisherId' in input || 'publisherName' in input) sets.publisherId = await resolvePublisher(input)
  if ('pubdate' in input) sets.pubdate = toDate(input.pubdate)
  if ('isbn' in input) sets.isbn = toText(input.isbn)
  if ('language' in input) sets.language = toText(input.language)
  if ('pages' in input) sets.pages = toNumber(input.pages)
  if ('words' in input) sets.words = toNumber(input.words)
  if ('rating' in input) sets.rating = toNumber(input.rating)
  if ('isPublic' in input) sets.isPublic = Boolean(input.isPublic)

  if (Object.keys(sets).length) {
    sets.updatedAt = new Date()
    await db.update(lib.libBooks).set(sets).where(eq(lib.libBooks.id, id))
  }

  if ('authors' in input) await syncBookAuthors(id, toAuthors(input.authors))
}

export { toId, toNumber, toText, toDate, toTags, toAuthors }
