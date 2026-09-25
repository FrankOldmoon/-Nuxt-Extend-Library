/**
 * Library module — database migrations.
 *
 * Self-contained idempotent DDL against the shared host connection, mirroring
 * the nav / blog modules. Every statement is guarded with `IF NOT EXISTS` /
 * `ADD COLUMN IF NOT EXISTS`, so it can run on every boot as an upgrade path.
 *
 * The `pool` comes from the host project (imported via a path into the host's
 * server/ directory) — the module reuses the host connection, it never opens
 * its own.
 */
import { pool } from '../../../../server/database'

const DDL = `
CREATE TABLE IF NOT EXISTS lib_categories (
  id          serial PRIMARY KEY,
  name        varchar(120)  NOT NULL,
  slug        varchar(160)  NOT NULL UNIQUE,
  description text,
  icon        varchar(64),
  sort_order  integer       NOT NULL DEFAULT 0,
  is_active   boolean       NOT NULL DEFAULT true,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS lib_categories_slug_idx   ON lib_categories (slug);
CREATE INDEX IF NOT EXISTS lib_categories_active_idx ON lib_categories (is_active);

CREATE TABLE IF NOT EXISTS lib_authors (
  id          serial PRIMARY KEY,
  name        varchar(255) NOT NULL,
  sort_name   varchar(255),
  description text,
  avatar      varchar(500),
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS lib_authors_name_idx ON lib_authors (name);

CREATE TABLE IF NOT EXISTS lib_series (
  id          serial PRIMARY KEY,
  name        varchar(255) NOT NULL,
  description text,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS lib_series_name_idx ON lib_series (name);

CREATE TABLE IF NOT EXISTS lib_publishers (
  id          serial PRIMARY KEY,
  name        varchar(255) NOT NULL,
  description text,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS lib_publishers_name_idx ON lib_publishers (name);

CREATE TABLE IF NOT EXISTS lib_books (
  id             serial PRIMARY KEY,
  title          varchar(500) NOT NULL,
  subtitle       varchar(500),
  sort_title     varchar(500),
  series_id      integer REFERENCES lib_series(id) ON DELETE SET NULL,
  series_index   double precision,
  publisher_id   integer REFERENCES lib_publishers(id) ON DELETE SET NULL,
  category_id    integer REFERENCES lib_categories(id) ON DELETE SET NULL,
  pubdate        timestamptz,
  isbn           varchar(32),
  language       varchar(16),
  pages          integer,
  words          integer,
  rating         double precision,
  description    text,
  cover          varchar(500),
  tags           jsonb        NOT NULL DEFAULT '[]',
  file_count     integer      NOT NULL DEFAULT 0,
  file_size      integer      NOT NULL DEFAULT 0,
  view_count     integer      NOT NULL DEFAULT 0,
  read_count     integer      NOT NULL DEFAULT 0,
  download_count integer      NOT NULL DEFAULT 0,
  favorite_count integer      NOT NULL DEFAULT 0,
  is_public      boolean      NOT NULL DEFAULT true,
  is_active      boolean      NOT NULL DEFAULT true,
  user_id        integer,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX IF NOT EXISTS lib_books_title_idx     ON lib_books (title);
CREATE INDEX IF NOT EXISTS lib_books_series_idx    ON lib_books (series_id);
CREATE INDEX IF NOT EXISTS lib_books_publisher_idx ON lib_books (publisher_id);
CREATE INDEX IF NOT EXISTS lib_books_category_idx  ON lib_books (category_id);
CREATE INDEX IF NOT EXISTS lib_books_active_idx    ON lib_books (is_active);
CREATE INDEX IF NOT EXISTS lib_books_created_idx   ON lib_books (created_at);

CREATE TABLE IF NOT EXISTS lib_book_authors (
  id         serial PRIMARY KEY,
  book_id    integer NOT NULL REFERENCES lib_books(id) ON DELETE CASCADE,
  author_id  integer NOT NULL REFERENCES lib_authors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lib_book_authors_pair_idx   ON lib_book_authors (book_id, author_id);
CREATE INDEX IF NOT EXISTS        lib_book_authors_author_idx ON lib_book_authors (author_id);

CREATE TABLE IF NOT EXISTS lib_book_files (
  id            serial PRIMARY KEY,
  book_id       integer NOT NULL REFERENCES lib_books(id) ON DELETE CASCADE,
  format        varchar(16)  NOT NULL,
  path          varchar(500) NOT NULL,
  original_name varchar(255) NOT NULL,
  mime_type     varchar(120),
  size          integer      NOT NULL DEFAULT 0,
  hash          varchar(64),
  file_id       integer,
  is_primary    boolean      NOT NULL DEFAULT false,
  user_id       integer,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS lib_book_files_book_idx   ON lib_book_files (book_id);
CREATE INDEX IF NOT EXISTS lib_book_files_format_idx ON lib_book_files (format);

CREATE TABLE IF NOT EXISTS lib_reading_progress (
  id            serial PRIMARY KEY,
  book_id       integer NOT NULL REFERENCES lib_books(id) ON DELETE CASCADE,
  user_id       integer NOT NULL,
  status        varchar(20) NOT NULL DEFAULT 'unread',
  percent       double precision NOT NULL DEFAULT 0,
  location      text,
  chapter_index integer NOT NULL DEFAULT 0,
  started_at    timestamptz,
  finished_at   timestamptz,
  last_read_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lib_reading_progress_book_user_idx ON lib_reading_progress (book_id, user_id);
CREATE INDEX IF NOT EXISTS        lib_reading_progress_user_idx      ON lib_reading_progress (user_id);

CREATE TABLE IF NOT EXISTS lib_bookmarks (
  id            serial PRIMARY KEY,
  book_id       integer NOT NULL REFERENCES lib_books(id) ON DELETE CASCADE,
  user_id       integer NOT NULL,
  type          varchar(20) NOT NULL DEFAULT 'bookmark',
  location      text,
  chapter_index integer NOT NULL DEFAULT 0,
  text          text,
  note          text,
  color         varchar(24),
  style         varchar(24),
  start_offset  integer,
  end_offset    integer,
  percent       double precision NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS lib_bookmarks_book_user_idx ON lib_bookmarks (book_id, user_id);

CREATE TABLE IF NOT EXISTS lib_collections (
  id          serial PRIMARY KEY,
  name        varchar(200) NOT NULL,
  slug        varchar(220) NOT NULL UNIQUE,
  description text,
  cover       varchar(500),
  user_id     integer,
  is_public   boolean      NOT NULL DEFAULT true,
  sort_order  integer      NOT NULL DEFAULT 0,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS lib_collections_slug_idx ON lib_collections (slug);
CREATE INDEX IF NOT EXISTS lib_collections_user_idx ON lib_collections (user_id);

CREATE TABLE IF NOT EXISTS lib_collection_books (
  id            serial PRIMARY KEY,
  collection_id integer NOT NULL REFERENCES lib_collections(id) ON DELETE CASCADE,
  book_id       integer NOT NULL REFERENCES lib_books(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lib_collection_books_pair_idx ON lib_collection_books (collection_id, book_id);
CREATE INDEX IF NOT EXISTS        lib_collection_books_book_idx ON lib_collection_books (book_id);

CREATE TABLE IF NOT EXISTS lib_favorites (
  id         serial PRIMARY KEY,
  user_id    integer NOT NULL,
  book_id    integer NOT NULL REFERENCES lib_books(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lib_favorites_pair_idx ON lib_favorites (user_id, book_id);
CREATE INDEX IF NOT EXISTS        lib_favorites_book_idx ON lib_favorites (book_id);

CREATE TABLE IF NOT EXISTS lib_book_chapters (
  id            serial PRIMARY KEY,
  book_id       integer NOT NULL REFERENCES lib_books(id) ON DELETE CASCADE,
  chapter_index integer NOT NULL,
  title         varchar(512),
  href          varchar(1024),
  text          text NOT NULL,
  char_count    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lib_book_chapters_book_idx ON lib_book_chapters (book_id, chapter_index);
`

/**
 * Additive upgrades for tables that already exist in a running installation.
 * Every statement is idempotent, so this is safe on each boot.
 */
const UPGRADES = `
ALTER TABLE lib_books ADD COLUMN IF NOT EXISTS text_indexed_at timestamptz;
ALTER TABLE lib_bookmarks ADD COLUMN IF NOT EXISTS style varchar(24);
ALTER TABLE lib_bookmarks ADD COLUMN IF NOT EXISTS start_offset integer;
ALTER TABLE lib_bookmarks ADD COLUMN IF NOT EXISTS end_offset integer;
`

/**
 * Apply the library schema (idempotent). Safe to call on every server boot.
 */
export async function runLibraryMigrations(): Promise<void> {
  await pool.query(DDL)
  await pool.query(UPGRADES)
}
