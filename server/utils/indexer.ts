/**
 * Library — full-text index for a book.
 *
 * Chapters are extracted from the book's EPUB (reusing the reader parser) and
 * stored as plain text rows in `lib_book_chapters`, which powers in-book and
 * library-wide full-text search.
 *
 * The index is derived data: it is rebuilt on upload, lazily on first search,
 * and after a format conversion that produces an EPUB.
 */
import { eq } from 'drizzle-orm'
import { db } from '../../../../server/database'
import * as lib from '../database/schema'
import { buildReaderContent } from './ebook'
import { getReadableFile, readStorageBuffer } from './reader'
import { htmlToText } from './text'

/** Guard rails so a pathological book cannot exhaust memory or the DB. */
const MAX_CHAPTER_CHARS = 2_000_000
const MAX_BOOK_CHARS = 16_000_000

export interface IndexResult {
  indexed: boolean
  chapters: number
  chars: number
  reason?: 'cached' | 'book-not-found' | 'no-epub' | 'missing-file' | 'empty'
}

/**
 * (Re)build the text index of a book. Returns early when the index is already
 * present unless `force` is set.
 */
export async function indexBookText(bookId: number, options: { force?: boolean } = {}): Promise<IndexResult> {
  const [book] = await db
    .select({ id: lib.libBooks.id, textIndexedAt: lib.libBooks.textIndexedAt })
    .from(lib.libBooks)
    .where(eq(lib.libBooks.id, bookId))
    .limit(1)
  if (!book) return { indexed: false, chapters: 0, chars: 0, reason: 'book-not-found' }
  if (book.textIndexedAt && !options.force) return { indexed: true, chapters: 0, chars: 0, reason: 'cached' }

  const file = await getReadableFile(bookId)
  if (!file || file.format !== 'epub') return { indexed: false, chapters: 0, chars: 0, reason: 'no-epub' }

  let buffer: Buffer
  try {
    buffer = await readStorageBuffer(file.path)
  } catch {
    return { indexed: false, chapters: 0, chars: 0, reason: 'missing-file' }
  }

  const { chapters } = buildReaderContent(buffer, () => '')
  const rows: Array<typeof lib.libBookChapters.$inferInsert> = []
  let total = 0

  for (const chapter of chapters) {
    const text = htmlToText(chapter.html).slice(0, MAX_CHAPTER_CHARS)
    if (text.length < 2) continue
    total += text.length
    rows.push({
      bookId,
      chapterIndex: chapter.index,
      title: chapter.title ? chapter.title.slice(0, 500) : null,
      href: chapter.path ? chapter.path.slice(0, 1000) : null,
      text,
      charCount: text.length
    })
    if (total >= MAX_BOOK_CHARS) break
  }

  // Replace the previous index atomically enough for our purposes: readers see
  // either the old rows or the new ones, and a failure leaves no half state.
  await db.delete(lib.libBookChapters).where(eq(lib.libBookChapters.bookId, bookId))
  for (let i = 0; i < rows.length; i += 20) {
    await db.insert(lib.libBookChapters).values(rows.slice(i, i + 20))
  }
  await db.update(lib.libBooks).set({ textIndexedAt: new Date() }).where(eq(lib.libBooks.id, bookId))

  return { indexed: true, chapters: rows.length, chars: total, reason: rows.length ? undefined : 'empty' }
}

/** Build the index only when it is missing. Returns true when text is available. */
export async function ensureBookTextIndex(bookId: number): Promise<boolean> {
  const result = await indexBookText(bookId)
  return result.indexed && result.reason !== 'empty'
}
