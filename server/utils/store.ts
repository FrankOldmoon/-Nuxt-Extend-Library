/**
 * Library module — storage helpers.
 *
 * Ebooks and cover images are stored in the host project's `storage/` directory
 * (the module never opens its own store):
 *   - ebook files are tracked only by `lib_book_files` and served through the
 *     module's own authenticated endpoints (they must NOT be reachable through
 *     the host's public `/api/files/serve` route — the library is private);
 *   - cover images are additionally registered in the host `files` table so the
 *     standard `/api/files/serve/<path>` route (used by the dashboard image
 *     field and the bookshelf) can render them.
 */
import { eq } from 'drizzle-orm'
import { db } from '../../../../server/database'
import { files as hostFiles } from '../../../../server/database/schema'
import {
  buildStoragePath,
  calculateHash,
  getAbsolutePath,
  saveToStorage
} from '../../../../server/utils/fileStorage'

const BOOK_MIME: Record<string, string> = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  mobi: 'application/x-mobipocket-ebook',
  azw: 'application/vnd.amazon.ebook',
  azw3: 'application/vnd.amazon.ebook',
  fb2: 'application/x-fictionbook+xml',
  txt: 'text/plain',
  md: 'text/markdown',
  djvu: 'image/vnd.djvu',
  cbz: 'application/vnd.comicbook+zip',
  cbr: 'application/vnd.comicbook-rar'
}

/** MIME type for an ebook file, by extension. */
export function bookMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return BOOK_MIME[ext] ?? 'application/octet-stream'
}

const COVER_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp'
}

/** Pick a cover image extension from its MIME type (defaults to `png`). */
export function coverExtension(mime: string): string {
  const found = Object.entries(COVER_MIME).find(([, m]) => m === mime)
  if (found) return found[0] === 'jpeg' ? 'jpg' : found[0]
  if (mime.includes('svg')) return 'svg'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('jpeg')) return 'jpg'
  return 'png'
}

export function isCoverMime(mime: string): boolean {
  return /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp)$/i.test(mime)
}

export interface SavedBookFile {
  path: string
  size: number
  hash: string
  originalName: string
  mimeType: string
}

/**
 * Persist an ebook to storage. The hash-based storage path makes repeated
 * uploads of identical content idempotent.
 */
export async function saveBookFile(
  buffer: Buffer,
  originalName: string,
  mimeType?: string
): Promise<SavedBookFile> {
  const hash = calculateHash(buffer)
  const path = await buildStoragePath(originalName, hash)
  await saveToStorage(buffer, path)
  return {
    path,
    size: buffer.length,
    hash,
    originalName,
    mimeType: mimeType || bookMimeType(originalName)
  }
}

/**
 * Persist a cover image and make it renderable through the host's public
 * `/api/files/serve/<path>` route (used by the dashboard image field and the
 * bookshelf). Returns the storage-relative path to store on `lib_books.cover`.
 *
 * Deduplicated by content hash across the whole `files` table (the unique
 * index is global), reusing an existing row's path when the same image was
 * uploaded before.
 */
export async function ensureCoverFile(
  userId: number,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const hash = calculateHash(buffer)
  const existing = await db
    .select({ path: hostFiles.path })
    .from(hostFiles)
    .where(eq(hostFiles.hash, hash))
    .limit(1)
  if (existing[0]) return existing[0].path

  const ext = coverExtension(mimeType)
  const path = await buildStoragePath(`cover.${ext}`, hash)
  await saveToStorage(buffer, path)
  try {
    await db.insert(hostFiles).values({
      userId,
      filename: path.split('/').pop() ?? `cover.${ext}`,
      originalName: `cover.${ext}`,
      hash,
      mimeType,
      size: buffer.length,
      path,
      storage: 'local'
    })
  } catch {
    // Unique-violation race (another request stored the same image first) —
    // the file is already on disk under the same content hash, so reuse it.
  }
  return path
}

/** Absolute path on disk for a storage-relative path (host guards traversal). */
export function absoluteStoragePath(relativePath: string): string {
  return getAbsolutePath(relativePath)
}
