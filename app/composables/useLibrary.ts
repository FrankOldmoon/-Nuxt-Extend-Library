/**
 * Library module — client data access + formatting helpers.
 *
 * Mirrors the shapes returned by `server/api/library/*`. Requests go through
 * `useRequestFetch()` so SSR forwards the session cookie (the library is
 * private: visibility depends on the current user).
 */

export interface LookupRef {
  id: number
  name: string
  slug?: string | null
}

export interface BookProgress {
  status: string
  percent: number
  chapterIndex: number
  /** Opaque reader position token (JSON: chapter/page/scroll/mode). */
  location?: string | null
}

export interface LibraryBook {
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
  progress: BookProgress | null
  favorited: boolean
}

export interface BookListResult {
  items: LibraryBook[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface FacetItem {
  id: number
  name: string
  slug?: string | null
  icon?: string | null
  count: number
}

export interface LibraryFacets {
  categories: FacetItem[]
  authors: FacetItem[]
  series: FacetItem[]
  publishers: FacetItem[]
  tags: Array<{ tag: string, count: number }>
  formats: Array<{ format: string, count: number }>
}

export interface LibraryStats {
  totals: {
    books: number
    authors: number
    series: number
    publishers: number
    categories: number
    tags: number
    files: number
    totalSize: number
  }
  personal: { reading: number, finished: number, favorites: number } | null
  recent: LibraryBook[]
}

export interface BookFileInfo {
  id: number
  format: string
  originalName: string
  mimeType: string | null
  size: number
  isPrimary: boolean
  createdAt: string | null
  /** False when the row exists but the bytes are gone from storage. */
  available: boolean
}

export interface BookDetail {
  book: LibraryBook
  files: BookFileInfo[]
  canEdit: boolean
}

export interface ReaderTocItem {
  title: string
  href: string
  fragment?: string
  level: number
}

export interface ReaderChapter {
  index: number
  title: string
  path: string
  html: string
}

export interface ReaderContent {
  bookId: number
  fileId: number
  format: string
  title: string
  /** Book language (BCP-47-ish), used to pick a text-to-speech voice. */
  language?: string | null
  /** Echo of the `highlight` query parameter, when one was applied. */
  highlight?: string | null
  toc: ReaderTocItem[]
  chapters: ReaderChapter[]
}

export interface ShelfItem {
  book: LibraryBook
  progress: {
    id: number
    bookId: number
    status: string
    percent: number
    chapterIndex: number
    lastReadAt: string
  }
}

export interface LibraryCollection {
  id: number
  name: string
  slug: string
  description: string | null
  cover: string | null
  isPublic: boolean
  userId: number | null
  sortOrder: number
  bookCount: number
  canEdit: boolean
}

/** A search hit from an external metadata provider (Douban). */
export interface MetadataCandidate {
  source: string
  sourceId: string
  title: string
  subtitle?: string
  authors: string[]
  year?: string
  publisher?: string
  label?: string
  cover?: string
}

/** Full metadata for one provider subject. */
export interface FetchedMetadata extends MetadataCandidate {
  sourceUrl?: string
  pubdate?: string
  isbn?: string
  pages?: number
  language?: string
  description?: string
  tags: string[]
  rating?: number
  series?: string
}

/**
 * Formats a browser can render inline without a custom reader (the custom EPUB
 * reader handles `epub` separately).
 */
export const NATIVE_VIEW_FORMATS = ['pdf', 'txt', 'md', 'markdown', 'html', 'htm', 'xml', 'rtf', 'log', 'csv']

/** Whether a book file can be opened online (custom EPUB reader or native viewer). */
export function canReadInline(file: { format?: string | null, mimeType?: string | null }): boolean {
  const format = String(file.format ?? '').toLowerCase()
  const mime = String(file.mimeType ?? '')
  if (format === 'epub') return true
  if (NATIVE_VIEW_FORMATS.includes(format)) return true
  return mime === 'application/pdf' || mime.startsWith('text/')
}

/** Request fetch that forwards cookies during SSR. */
function useLibraryFetch() {
  return useRequestFetch()
}

/** Fetch a paginated, filtered book list (SSR-friendly). */
export function useLibraryBooks(params: Ref<Record<string, unknown>>) {
  const requestFetch = useLibraryFetch()
  return useAsyncData<BookListResult>(
    () => `library:books:${JSON.stringify(params.value)}`,
    () => requestFetch<BookListResult>('/api/library/books', { query: params.value }),
    {
      watch: [params],
      default: () => ({ items: [], page: 1, pageSize: 24, total: 0, totalPages: 1 })
    }
  )
}

/** Fetch the facet counts for the sidebar (SSR-friendly). */
export function useLibraryFacets() {
  const requestFetch = useLibraryFetch()
  return useAsyncData<LibraryFacets>('library:facets', () => requestFetch<LibraryFacets>('/api/library/facets'), {
    default: () => ({ categories: [], authors: [], series: [], publishers: [], tags: [], formats: [] })
  })
}

/** Fetch catalogue statistics (SSR-friendly). */
export function useLibraryStats() {
  const requestFetch = useLibraryFetch()
  return useAsyncData<LibraryStats>('library:stats', () => requestFetch<LibraryStats>('/api/library/stats'), {
    default: () => ({
      totals: { books: 0, authors: 0, series: 0, publishers: 0, categories: 0, tags: 0, files: 0, totalSize: 0 },
      personal: null,
      recent: []
    })
  })
}

/** Fetch one book's detail (SSR-friendly). */
export function useLibraryBook(id: number) {
  const requestFetch = useLibraryFetch()
  return useAsyncData<BookDetail>(`library:book:${id}`, () => requestFetch<BookDetail>(`/api/library/books/${id}`))
}

export interface LibraryReaderData {
  detail: BookDetail
  /** Sanitised chapters, or null when the book has no readable EPUB. */
  content: ReaderContent | null
  /** Populated when the EPUB is present but its content could not be produced. */
  contentError: { statusCode?: number, message: string } | null
}

/**
 * Single SSR-complete fetch for the reader page: the book detail first, then
 * (only when a readable EPUB is attached) its chapter content.
 *
 * Chaining both inside ONE `useAsyncData` matters: gating a second async data on
 * a value derived from the first would leave the reader empty during SSR.
 * A failing content request is captured rather than thrown, so the page can
 * still show the book title and its downloads.
 */
export function useLibraryReader(id: number) {
  const requestFetch = useLibraryFetch()
  return useAsyncData<LibraryReaderData | null>(`library:reader:${id}`, async () => {
    const detail = await requestFetch<BookDetail>(`/api/library/books/${id}`)
    const epub = detail.files.find(file => file.format === 'epub' && file.available !== false)
    let content: ReaderContent | null = null
    let contentError: LibraryReaderData['contentError'] = null
    if (epub) {
      try {
        content = await requestFetch<ReaderContent>(`/api/library/books/${id}/content`)
      } catch (error) {
        contentError = {
          statusCode: (error as { statusCode?: number })?.statusCode,
          message: extractErrorMessage(error, 'Failed to load the book content')
        }
      }
    }
    return { detail, content, contentError }
  })
}

/** Fetch the viewer's shelf (progress entries). */
export function useLibraryShelf(status: Ref<string>) {
  const requestFetch = useLibraryFetch()
  return useAsyncData<{ items: ShelfItem[] }>(
    () => `library:shelf:${status.value}`,
    () => requestFetch<{ items: ShelfItem[] }>('/api/library/progress', { query: { status: status.value || undefined } }),
    { watch: [status], default: () => ({ items: [] }) }
  )
}

/** Fetch the viewer's favourites. */
export function useLibraryFavorites() {
  const requestFetch = useLibraryFetch()
  return useAsyncData<{ items: LibraryBook[] }>('library:favorites', () => requestFetch<{ items: LibraryBook[] }>('/api/library/favorites'), {
    default: () => ({ items: [] })
  })
}

/** Fetch collections visible to the viewer. */
export function useLibraryCollections() {
  const requestFetch = useLibraryFetch()
  return useAsyncData<{ items: LibraryCollection[] }>('library:collections', () => requestFetch<{ items: LibraryCollection[] }>('/api/library/collections'), {
    default: () => ({ items: [] })
  })
}

/**
 * Resolve a stored cover value to a browser URL. Covers live in the host
 * storage directory, so they are served by the host's `/api/files/serve` route.
 */
export function resolveCover(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s) || s.startsWith('/') || s.startsWith('data:')) return s
  return `/api/files/serve/${s}`
}

/** Human-readable byte size (mirrors the server helper). */
export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = n
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/** Compact date, e.g. "Mar 5, 2026" (locale-aware). */
export function formatLibraryDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Comma-joined author names, or null when the book has none. */
export function bookAuthorsLabel(book: Pick<LibraryBook, 'authors'>): string | null {
  if (!book.authors?.length) return null
  return book.authors.map(a => a.name).join(', ')
}

/** Stable gradient pair derived from the title (cover fallback background). */
export function coverGradient(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0
  const palette = [
    ['#6366f1', '#8b5cf6'],
    ['#0ea5e9', '#22d3ee'],
    ['#ef4444', '#f97316'],
    ['#10b981', '#22c55e'],
    ['#f59e0b', '#eab308'],
    ['#ec4899', '#f43f5e'],
    ['#14b8a6', '#06b6d4'],
    ['#a855f7', '#6366f1']
  ]
  const pair = palette[Math.abs(hash) % palette.length]!
  return `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`
}

/** Two-character monogram for the cover fallback. */
export function coverInitials(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) return '?'
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 2)
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase()
}

export type { LibraryCollection as LibraryCollectionType }
