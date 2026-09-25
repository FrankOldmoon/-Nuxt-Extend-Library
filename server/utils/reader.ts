/**
 * Library — ebook file access helpers.
 *
 * Resolves the physical file behind a book (preferring EPUB for reading) and
 * reads it straight off the host storage directory.
 */
import { and, asc, eq, isNull } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { db } from '../../../../server/database'
import * as lib from '../database/schema'
import { absoluteStoragePath } from './store'

/** Fetch one `lib_book_files` row by id (ignoring soft-deleted rows). */
export async function getBookFileById(id: number): Promise<lib.LibBookFile | null> {
  const [row] = await db
    .select()
    .from(lib.libBookFiles)
    .where(and(eq(lib.libBookFiles.id, id), isNull(lib.libBookFiles.deletedAt)))
    .limit(1)
  return row ?? null
}

/**
 * Pick the file to open in the reader: an EPUB if present, otherwise the
 * primary file, otherwise the first file.
 */
export async function getReadableFile(bookId: number): Promise<lib.LibBookFile | null> {
  const rows = await db
    .select()
    .from(lib.libBookFiles)
    .where(and(eq(lib.libBookFiles.bookId, bookId), isNull(lib.libBookFiles.deletedAt)))
    .orderBy(asc(lib.libBookFiles.id))
  if (!rows.length) return null
  return rows.find(r => r.format === 'epub') ?? rows.find(r => r.isPrimary) ?? rows[0]!
}

/** Read a stored file into a Buffer. */
export async function readStorageBuffer(relativePath: string): Promise<Buffer> {
  return readFile(absoluteStoragePath(relativePath))
}

/** Human-friendly format label list for a book (e.g. ['epub', 'pdf']). */
export function formatLabels(files: lib.LibBookFile[]): string[] {
  return [...new Set(files.map(f => f.format))]
}
