/**
 * Library module — Drizzle schema.
 *
 * A private, talebook-style book library. All tables use the `lib_` prefix and
 * live *only* inside this module. They are registered with the host project's
 * generic dashboard CRUD from `server/plugins/library.ts` via
 * `registerSchema + registerDashboardTable`.
 *
 * Tables:
 *   - lib_categories        Flat, one-level book categories (shelf groups).
 *   - lib_authors           Book authors (browsable).
 *   - lib_series            Book series (browsable, books carry an index).
 *   - lib_publishers        Publishers (browsable).
 *   - lib_books             The central metadata record for a book.
 *   - lib_book_authors      book ↔ author many-to-many pivot.
 *   - lib_book_files        One physical ebook file (epub/pdf/mobi/…) per row.
 *   - lib_reading_progress  Per-user reading state for a book.
 *   - lib_bookmarks         Per-user bookmarks / highlights / notes.
 *   - lib_collections       User-curated book lists (书单).
 *   - lib_collection_books  collection ↔ book many-to-many pivot.
 *   - lib_favorites         Per-user favourites (我的书架).
 *
 * `tags` are stored denormalised as a jsonb array on `lib_books` — talebook
 * derives the tag cloud from book metadata, so a separate table is unnecessary.
 */
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core'

export const libCategories = pgTable('lib_categories',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    description: text('description'),
    // Iconify icon class shown as the category header (e.g. i-lucide-book).
    icon: varchar('icon', { length: 64 }),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  t => [
    index('lib_categories_slug_idx').on(t.slug),
    index('lib_categories_active_idx').on(t.isActive)
  ]
)

export const libAuthors = pgTable('lib_authors',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    // Sortable name (e.g. "Asimov, Isaac"); falls back to `name` when empty.
    sortName: varchar('sort_name', { length: 255 }),
    description: text('description'),
    avatar: varchar('avatar', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  t => [
    uniqueIndex('lib_authors_name_idx').on(t.name)
  ]
)

export const libSeries = pgTable('lib_series',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  t => [
    uniqueIndex('lib_series_name_idx').on(t.name)
  ]
)

export const libPublishers = pgTable('lib_publishers',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  t => [
    uniqueIndex('lib_publishers_name_idx').on(t.name)
  ]
)

export const libBooks = pgTable('lib_books',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 500 }).notNull(),
    subtitle: varchar('subtitle', { length: 500 }),
    // Normalised title used for stable alphabetical / "sort by title" ordering.
    sortTitle: varchar('sort_title', { length: 500 }),
    seriesId: integer('series_id').references(() => libSeries.id, { onDelete: 'set null' }),
    // Position inside the series (supports 1.5 style novellas).
    seriesIndex: doublePrecision('series_index'),
    publisherId: integer('publisher_id').references(() => libPublishers.id, { onDelete: 'set null' }),
    categoryId: integer('category_id').references(() => libCategories.id, { onDelete: 'set null' }),
    pubdate: timestamp('pubdate', { withTimezone: true }),
    isbn: varchar('isbn', { length: 32 }),
    language: varchar('language', { length: 16 }),
    pages: integer('pages'),
    words: integer('words'),
    // Rating on a 0–10 scale (talebook / Douban convention), NULL = unrated.
    rating: doublePrecision('rating'),
    description: text('description'),
    cover: varchar('cover', { length: 500 }),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    // Aggregated counters — maintained by the module's own API handlers.
    fileCount: integer('file_count').notNull().default(0),
    fileSize: integer('file_size').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    readCount: integer('read_count').notNull().default(0),
    downloadCount: integer('download_count').notNull().default(0),
    favoriteCount: integer('favorite_count').notNull().default(0),
    // Visibility: private books are only visible to their uploader and admins.
    isPublic: boolean('is_public').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    // User who added the book (NULL for imported / system books).
    userId: integer('user_id'),
    // When the full-text index (`lib_book_chapters`) was last built; NULL = never.
    textIndexedAt: timestamp('text_indexed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  t => [
    index('lib_books_title_idx').on(t.title),
    index('lib_books_series_idx').on(t.seriesId),
    index('lib_books_publisher_idx').on(t.publisherId),
    index('lib_books_category_idx').on(t.categoryId),
    index('lib_books_active_idx').on(t.isActive),
    index('lib_books_created_idx').on(t.createdAt)
  ]
)

/**
 * book ↔ author pivot. Kept to exactly the id + two FK columns so the host's
 * generic M2M machinery treats it as a clean pivot.
 */
export const libBookAuthors = pgTable('lib_book_authors',
  {
    id: serial('id').primaryKey(),
    bookId: integer('book_id').notNull().references(() => libBooks.id, { onDelete: 'cascade' }),
    authorId: integer('author_id').notNull().references(() => libAuthors.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    uniqueIndex('lib_book_authors_pair_idx').on(t.bookId, t.authorId),
    index('lib_book_authors_author_idx').on(t.authorId)
  ]
)

/**
 * One physical ebook file attached to a book. A book can carry several formats
 * (epub + pdf + mobi…) so this is a 1-N child of `lib_books`.
 */
export const libBookFiles = pgTable('lib_book_files',
  {
    id: serial('id').primaryKey(),
    bookId: integer('book_id').notNull().references(() => libBooks.id, { onDelete: 'cascade' }),
    // Lower-case format token: epub / pdf / mobi / azw3 / txt / fb2 / djvu…
    format: varchar('format', { length: 16 }).notNull(),
    // Relative path inside the host storage directory (served via /api/files/serve).
    path: varchar('path', { length: 500 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }),
    size: integer('size').notNull().default(0),
    hash: varchar('hash', { length: 64 }),
    // Host `files.id` when the upload went through the host file pipeline.
    fileId: integer('file_id'),
    isPrimary: boolean('is_primary').notNull().default(false),
    userId: integer('user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  t => [
    index('lib_book_files_book_idx').on(t.bookId),
    index('lib_book_files_format_idx').on(t.format)
  ]
)

export const libReadingProgress = pgTable('lib_reading_progress',
  {
    id: serial('id').primaryKey(),
    bookId: integer('book_id').notNull().references(() => libBooks.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull(),
    // unread | reading | finished
    status: varchar('status', { length: 20 }).notNull().default('unread'),
    // 0–100 completion percentage.
    percent: doublePrecision('percent').notNull().default(0),
    // Reader position token (e.g. "chapterIndex:scrollOffset" or an EPUB CFI).
    location: text('location'),
    chapterIndex: integer('chapter_index').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    uniqueIndex('lib_reading_progress_book_user_idx').on(t.bookId, t.userId),
    index('lib_reading_progress_user_idx').on(t.userId)
  ]
)

export const libBookmarks = pgTable('lib_bookmarks',
  {
    id: serial('id').primaryKey(),
    bookId: integer('book_id').notNull().references(() => libBooks.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull(),
    // bookmark | highlight | note
    type: varchar('type', { length: 20 }).notNull().default('bookmark'),
    location: text('location'),
    chapterIndex: integer('chapter_index').notNull().default(0),
    // Selected text for highlights, or a short excerpt for bookmarks.
    text: text('text'),
    note: text('note'),
    color: varchar('color', { length: 24 }),
    // How a highlight is drawn: highlight | underline | double | dotted | dashed | wavy.
    style: varchar('style', { length: 24 }),
    // Character offsets of the annotated range inside the chapter's plain text.
    startOffset: integer('start_offset'),
    endOffset: integer('end_offset'),
    percent: doublePrecision('percent').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  t => [
    index('lib_bookmarks_book_user_idx').on(t.bookId, t.userId)
  ]
)

export const libCollections = pgTable('lib_collections',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 220 }).notNull().unique(),
    description: text('description'),
    cover: varchar('cover', { length: 500 }),
    userId: integer('user_id'),
    isPublic: boolean('is_public').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  t => [
    index('lib_collections_slug_idx').on(t.slug),
    index('lib_collections_user_idx').on(t.userId)
  ]
)

export const libCollectionBooks = pgTable('lib_collection_books',
  {
    id: serial('id').primaryKey(),
    collectionId: integer('collection_id').notNull().references(() => libCollections.id, { onDelete: 'cascade' }),
    bookId: integer('book_id').notNull().references(() => libBooks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    uniqueIndex('lib_collection_books_pair_idx').on(t.collectionId, t.bookId),
    index('lib_collection_books_book_idx').on(t.bookId)
  ]
)

export const libFavorites = pgTable('lib_favorites',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    bookId: integer('book_id').notNull().references(() => libBooks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    uniqueIndex('lib_favorites_pair_idx').on(t.userId, t.bookId),
    index('lib_favorites_book_idx').on(t.bookId)
  ]
)

/**
 * Derived full-text index: one row per EPUB spine chapter, holding the chapter
 * as plain text. Rebuilt automatically (on upload / on demand), so it is not
 * registered in the dashboard CRUD — it is data, not catalogue.
 */
export const libBookChapters = pgTable('lib_book_chapters',
  {
    id: serial('id').primaryKey(),
    bookId: integer('book_id').notNull().references(() => libBooks.id, { onDelete: 'cascade' }),
    chapterIndex: integer('chapter_index').notNull(),
    title: varchar('title', { length: 512 }),
    href: varchar('href', { length: 1024 }),
    text: text('text').notNull(),
    charCount: integer('char_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    index('lib_book_chapters_book_idx').on(t.bookId, t.chapterIndex)
  ]
)

export type LibCategory = typeof libCategories.$inferSelect
export type NewLibCategory = typeof libCategories.$inferInsert
export type LibAuthor = typeof libAuthors.$inferSelect
export type NewLibAuthor = typeof libAuthors.$inferInsert
export type LibSeries = typeof libSeries.$inferSelect
export type NewLibSeries = typeof libSeries.$inferInsert
export type LibPublisher = typeof libPublishers.$inferSelect
export type NewLibPublisher = typeof libPublishers.$inferInsert
export type LibBook = typeof libBooks.$inferSelect
export type NewLibBook = typeof libBooks.$inferInsert
export type LibBookAuthor = typeof libBookAuthors.$inferSelect
export type NewLibBookAuthor = typeof libBookAuthors.$inferInsert
export type LibBookFile = typeof libBookFiles.$inferSelect
export type NewLibBookFile = typeof libBookFiles.$inferInsert
export type LibReadingProgress = typeof libReadingProgress.$inferSelect
export type NewLibReadingProgress = typeof libReadingProgress.$inferInsert
export type LibBookmark = typeof libBookmarks.$inferSelect
export type NewLibBookmark = typeof libBookmarks.$inferInsert
export type LibCollection = typeof libCollections.$inferSelect
export type NewLibCollection = typeof libCollections.$inferInsert
export type LibCollectionBook = typeof libCollectionBooks.$inferSelect
export type NewLibCollectionBook = typeof libCollectionBooks.$inferInsert
export type LibFavorite = typeof libFavorites.$inferSelect
export type NewLibFavorite = typeof libFavorites.$inferInsert
