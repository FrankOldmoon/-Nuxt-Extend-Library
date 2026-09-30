/**
 * Library module — one-off importer for the offline mindmap bundle.
 *
 * Parses `library-offline.html` (the self-contained mindmap viewer shipped in
 * the module root), extracts the 74 book outlines (BOOKS metadata + MMDATA
 * markdown) and upserts them into `lib_mindmaps`, attaching each outline to a
 * matching `lib_books` row. Books not found by exact title are created as
 * mindmap-only entries (no files) so the outline has a home.
 *
 * Idempotent: re-running refreshes content + stats via ON CONFLICT upsert.
 *
 * Run from the host repo root:
 *   node --env-file=.env modules/library/scripts/import-mindmaps.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const htmlPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'library-offline.html')
const html = readFileSync(htmlPath, 'utf8')

/** Extract an inline JSON `<script>` block by id. */
function extractJson(id) {
  const m = html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`))
  if (!m) throw new Error(`JSON block #${id} not found in ${htmlPath}`)
  return JSON.parse(m[1])
}

const BOOKS = extractJson('BOOKS')
const MMDATA = extractJson('MMDATA')
console.log(`[import] parsed ${BOOKS.length} books, ${Object.keys(MMDATA).length} outlines`)

if (!process.env.DATABASE_URL) {
  console.error('[import] DATABASE_URL is not set (run with --env-file=.env)')
  process.exit(1)
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// The dev server creates this on boot via migrate.ts — create it here too so
// the importer works against a fresh database without booting the server.
const DDL = `
CREATE TABLE IF NOT EXISTS lib_mindmaps (
  id         serial PRIMARY KEY,
  book_id    integer NOT NULL REFERENCES lib_books(id) ON DELETE CASCADE,
  content    text    NOT NULL,
  nodes      integer NOT NULL DEFAULT 0,
  domains    integer NOT NULL DEFAULT 0,
  cards      integer NOT NULL DEFAULT 0,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lib_mindmaps_book_idx ON lib_mindmaps (book_id);
`

let matched = 0
let created = 0
let missingOutline = 0
const seenTitles = new Map()

try {
  await pool.query(DDL)
  console.log('[import] schema ready')
  for (const b of BOOKS) {
    const content = MMDATA[b.n]
    if (!content) {
      missingOutline++
      console.warn(`[import] no outline for "${b.n}", skipped`)
      continue
    }
    if (seenTitles.has(b.n)) {
      console.warn(`[import] duplicate title "${b.n}" — attached to the same book row`)
    }
    seenTitles.set(b.n, true)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Match an existing book by exact title (trash excluded).
      let bookId
      const found = await client.query(
        'SELECT id FROM lib_books WHERE title = $1 AND deleted_at IS NULL ORDER BY id LIMIT 1',
        [b.n]
      )
      if (found.rows.length) {
        bookId = found.rows[0].id
        matched++
      } else {
        // Mindmap-only book: no ebook file, outline is the content itself.
        const inserted = await client.query(
          `INSERT INTO lib_books (title, sort_title, is_public, is_active)
           VALUES ($1::text, lower($1::text), true, true)
           RETURNING id`,
          [b.n]
        )
        bookId = inserted.rows[0].id
        created++
      }

      await client.query(
        `INSERT INTO lib_mindmaps (book_id, content, nodes, domains, cards, note)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (book_id) DO UPDATE SET
           content = EXCLUDED.content,
           nodes = EXCLUDED.nodes,
           domains = EXCLUDED.domains,
           cards = EXCLUDED.cards,
           note = EXCLUDED.note,
           updated_at = now()`,
        [bookId, content, b.k ?? 0, b.d ?? 0, b.p ?? 0, b.adv || null]
      )

      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  const total = await pool.query('SELECT count(*)::int AS n FROM lib_mindmaps')
  console.log(`[import] done: ${matched} matched existing books, ${created} created as mindmap-only, ${missingOutline} without outline. lib_mindmaps rows: ${total.rows[0].n}`)
} finally {
  await pool.end()
}
