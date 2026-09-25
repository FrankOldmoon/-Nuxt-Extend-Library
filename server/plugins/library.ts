/**
 * Library module — Nitro plugin.
 *
 * Runs once at server startup and plugs the module into the host project:
 *   1. Registers the library Drizzle schema with the dashboard auto-discovery.
 *   2. Runs the module's own idempotent DB migrations.
 *   3. Registers the `lib*` tables into the host's generic dashboard CRUD
 *      (main catalogue tables also get a sidebar menu entry).
 *   4. Merges default sidebar menu entries into the shared `dashboard.menu`.
 *   5. Seeds a few sample categories when the catalogue is empty.
 *   6. Seeds the built-in usage tutorial as the only initial book (empty shelf only).
 *
 * Everything library-specific lives in this module; the host only exposes the
 * generic `register*` extension points (imported via a path into the host's
 * server/ directory — the intended library→host seam).
 */
import { asc, eq } from 'drizzle-orm'
import { db } from '../../../../server/database'
import { configs as configsTable, users as usersTable } from '../../../../server/database/schema'
import { getConfigValue, upsertConfig } from '../../../../server/utils/configs'
import {
  registerDrizzleSchema,
  registerDashboardTable,
  DEFAULT_MENU
} from '../../../../server/utils/dashboard/tables'
import * as librarySchema from '../database/schema'
import { runLibraryMigrations } from '../database/migrate'
import { buildTutorialEpub, TUTORIAL_AUTHOR, TUTORIAL_FILENAME, TUTORIAL_LANGUAGE, TUTORIAL_TITLE } from '../seed/tutorial'
import { createBook } from '../utils/bookWrite'
import { recalcBookFileStats } from '../utils/books'
import { extractMetadata, type EbookMetadata } from '../utils/ebook'
import { indexBookText } from '../utils/indexer'
import { ensureCoverFile, isCoverMime, saveBookFile } from '../utils/store'
import {
  libAuthorMeta,
  libBookAuthorMeta,
  libBookFileMeta,
  libBookmarkMeta,
  libBookMeta,
  libCategoryMeta,
  libCollectionBookMeta,
  libCollectionMeta,
  libFavoriteMeta,
  libPublisherMeta,
  libReadingProgressMeta,
  libSeriesMeta
} from '../utils/fields'

const DASHBOARD_MENU_KEY = 'dashboard.menu'
const LIBRARY_ENABLED_KEY = 'library.enabled'
const CLEAR_NAV_KEY = 'library.clearSiteNavigation'
const SITE_NAV_KEY = 'site.navigation'

/**
 * Empty the host's header navigation (`site.navigation`) while the library owns
 * the site root — the shelf brings its own section nav, so leftover host links
 * would be confusing. Skipped when disabled, and skipped when already empty so
 * an admin's later edits are left alone unless they re-populate it.
 */
async function applyNavigationPolicy(): Promise<void> {
  try {
    const clear = await getConfigValue<boolean>(CLEAR_NAV_KEY, true).catch(() => true)
    if (!clear) return
    const current = await getConfigValue<string>(SITE_NAV_KEY, '').catch(() => '')
    if (current === '[]') return
    await upsertConfig({ key: SITE_NAV_KEY, value: '[]', type: 'json' })
    console.log(`[library] ${SITE_NAV_KEY} cleared`)
  } catch (e) {
    console.warn('[library] navigation policy failed (ignored):', e)
  }
}

export default defineNitroPlugin(async () => {
  // Master switch — controlled from the host's System Config > General
  // (`library.enabled`). When disabled the module registers nothing at all.
  const enabled = await getConfigValue(LIBRARY_ENABLED_KEY, true).catch(() => true)
  if (!enabled) {
    console.log('[library] disabled via config (library.enabled=false) — skipping setup')
    return
  }

  console.log('[library] initializing library module')

  // 0. Declare the module's editable settings (idempotent — admin edits win).
  await ensureConfigs()

  // 0b. The library takes over the site root, so the host's own header nav is
  //     cleared by default (opt out with `library.clearSiteNavigation=false`).
  await applyNavigationPolicy()

  // 1. Make the library tables discoverable by the generic dashboard.
  registerDrizzleSchema(librarySchema)

  // 2. Create/upgrade the library tables (idempotent).
  await runLibraryMigrations()

  // 3. Register the catalogue tables into the host CRUD + admin sidebar menu.
  //    The internal/join tables are registered too (so admins can inspect them)
  //    but deliberately omitted from the menu (no `menuOrder`).
  registerDashboardTable({ meta: libBookMeta, getTable: () => librarySchema.libBooks }, { menuOrder: 90 })
  registerDashboardTable({ meta: libCategoryMeta, getTable: () => librarySchema.libCategories }, { menuOrder: 92 })
  registerDashboardTable({ meta: libAuthorMeta, getTable: () => librarySchema.libAuthors }, { menuOrder: 94 })
  registerDashboardTable({ meta: libSeriesMeta, getTable: () => librarySchema.libSeries }, { menuOrder: 96 })
  registerDashboardTable({ meta: libPublisherMeta, getTable: () => librarySchema.libPublishers }, { menuOrder: 98 })
  registerDashboardTable({ meta: libCollectionMeta, getTable: () => librarySchema.libCollections }, { menuOrder: 100 })

  registerDashboardTable({ meta: libBookAuthorMeta, getTable: () => librarySchema.libBookAuthors })
  registerDashboardTable({ meta: libBookFileMeta, getTable: () => librarySchema.libBookFiles })
  registerDashboardTable({ meta: libReadingProgressMeta, getTable: () => librarySchema.libReadingProgress })
  registerDashboardTable({ meta: libBookmarkMeta, getTable: () => librarySchema.libBookmarks })
  registerDashboardTable({ meta: libFavoriteMeta, getTable: () => librarySchema.libFavorites })
  registerDashboardTable({ meta: libCollectionBookMeta, getTable: () => librarySchema.libCollectionBooks })

  // 4. Merge this module's menu entries into the persisted `dashboard.menu`.
  await ensureMenu()

  // 5. Seed sample categories when the catalogue is empty (idempotent).
  await seedDefaults()

  // 6. Ship the usage tutorial as the only initial book on an empty shelf.
  await seedTutorialBook()
})

/** Declare the module's settings in the shared `configs` table (idempotent — admin edits win). */
async function ensureConfigs(): Promise<void> {
  try {
    await db
      .insert(configsTable)
      .values([
        { key: LIBRARY_ENABLED_KEY, value: 'true', type: 'boolean', description: 'Enable the library module' },
        { key: CLEAR_NAV_KEY, value: 'true', type: 'boolean', description: 'Clear the host site.navigation while the library owns the home page' },
        { key: 'library.maxFileSizeMB', value: '200', type: 'number', description: 'Max upload size per ebook file (MB)' },
        { key: 'library.douban.enabled', value: 'true', type: 'boolean', description: 'Enable Douban book metadata fetching' },
        { key: 'library.douban.baseUrl', value: 'https://book.douban.com', type: 'string', description: 'Douban provider base URL (change to use a mirror)' },
        { key: 'library.douban.cookie', value: '', type: 'string', description: 'Optional Cookie header sent to Douban (improves rate limits)' },
        { key: 'library.douban.timeoutMs', value: '8000', type: 'number', description: 'Douban request timeout (ms)' },
        { key: 'library.converter.enabled', value: 'true', type: 'boolean', description: 'Allow format conversion (built-in pairs always; other formats need Calibre)' },
        { key: 'library.converter.path', value: '', type: 'string', description: 'Path to an ebook-convert binary (blank = auto-detect)' },
        { key: 'library.converter.timeoutMs', value: '120000', type: 'number', description: 'Timeout for an external ebook-convert run (ms)' }
      ])
      .onConflictDoNothing({ target: configsTable.key })
  } catch (e) {
    console.warn('[library] config ensure failed (ignored):', e)
  }
}

async function ensureMenu(): Promise<void> {
  try {
    const rows = await db
      .select({ value: configsTable.value })
      .from(configsTable)
      .where(eq(configsTable.key, DASHBOARD_MENU_KEY))

    let list: Array<{ table: string, label?: unknown, icon?: unknown, order?: unknown, hidden?: unknown }> = []
    const raw = rows[0]?.value
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) list = parsed
      } catch {
        list = []
      }
    }

    let changed = false
    if (list.length === 0) {
      // No menu configured yet — seed it from the full default list so the
      // sidebar is complete regardless of module boot order.
      list = DEFAULT_MENU.map(m => ({ table: m.table, label: m.label, icon: m.icon, order: m.order }))
      changed = true
    } else {
      const known = new Set(list.map(i => i.table))
      for (const m of DEFAULT_MENU) {
        if (!known.has(m.table)) {
          list.push({ table: m.table, label: m.label, icon: m.icon, order: m.order })
          changed = true
        }
      }
    }

    if (changed) {
      await db
        .insert(configsTable)
        .values({
          key: DASHBOARD_MENU_KEY,
          value: JSON.stringify(list),
          type: 'json',
          description: 'Dashboard left-sidebar menu config (JSON array)',
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: configsTable.key,
          set: { value: JSON.stringify(list), updatedAt: new Date() }
        })
      console.log('[library] dashboard menu updated')
    }
  } catch (e) {
    console.warn('[library] menu ensure failed (ignored):', e)
  }
}

async function seedDefaults(): Promise<void> {
  try {
    const existing = await db
      .select({ id: librarySchema.libCategories.id })
      .from(librarySchema.libCategories)
      .limit(1)
    if (existing.length > 0) return

    await db.insert(librarySchema.libCategories).values([
      { name: 'Literature', slug: 'literature', description: 'Novels, poetry and literary fiction.', icon: 'i-lucide-feather', sortOrder: 10 },
      { name: 'Technology', slug: 'technology', description: 'Programming, engineering and computer science.', icon: 'i-lucide-cpu', sortOrder: 20 },
      { name: 'History', slug: 'history', description: 'History, biography and memoir.', icon: 'i-lucide-landmark', sortOrder: 30 }
    ])
    console.log('[library] seeded sample categories')
  } catch (e) {
    console.warn('[library] seed failed (ignored):', e)
  }
}

/**
 * Ship the built-in usage tutorial as the only initial book.
 *
 * Runs only when the catalogue is completely empty, so a fresh installation opens
 * onto a shelf that documents itself — and never re-appears once the reader has
 * started collecting their own books. The EPUB is generated from
 * `server/seed/tutorial.ts` through the module's own ZIP writer, then stored and
 * indexed exactly like an uploaded book.
 */
async function seedTutorialBook(): Promise<void> {
  try {
    const existing = await db
      .select({ id: librarySchema.libBooks.id })
      .from(librarySchema.libBooks)
      .limit(1)
    if (existing.length > 0) return

    const [owner] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .orderBy(asc(usersTable.id))
      .limit(1)

    const buffer = buildTutorialEpub()
    let meta: EbookMetadata = { authors: [], tags: [] }
    try {
      meta = extractMetadata(buffer)
    } catch {
      meta = { authors: [], tags: [] }
    }

    let cover: string | null = null
    if (meta.cover && isCoverMime(meta.cover.mime)) {
      cover = await ensureCoverFile(owner?.id ?? 1, meta.cover.data, meta.cover.mime)
    }

    const bookId = await createBook({
      title: meta.title || TUTORIAL_TITLE,
      authors: meta.authors.length ? meta.authors : [TUTORIAL_AUTHOR],
      description: meta.description ?? null,
      tags: ['使用手册', '帮助'],
      language: meta.language ?? TUTORIAL_LANGUAGE,
      cover,
      isPublic: true
    }, { userId: owner?.id ?? null })

    const saved = await saveBookFile(buffer, TUTORIAL_FILENAME)
    await db.insert(librarySchema.libBookFiles).values({
      bookId,
      format: 'epub',
      path: saved.path,
      originalName: TUTORIAL_FILENAME,
      mimeType: saved.mimeType,
      size: saved.size,
      hash: saved.hash,
      isPrimary: true,
      userId: owner?.id ?? null
    })
    await recalcBookFileStats(bookId)
    await indexBookText(bookId)
    console.log(`[library] seeded the built-in usage tutorial book (#${bookId})`)
  } catch (e) {
    console.warn('[library] tutorial seed failed (ignored):', e)
  }
}
