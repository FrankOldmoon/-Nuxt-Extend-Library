<script setup lang="ts">
/**
 * Library — the shelf (all books) at `/library`.
 *
 * Filter state lives in the URL query so shelves are shareable/bookmarkable.
 * Anonymous visitors only ever see public books (enforced server-side).
 */
import type { LibraryBook, LibraryFacets } from '../../composables/useLibrary'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { isLoggedIn, isAdmin } = useAuth()

// Nuxt UI's USelect rejects empty-string item values, so "any status" uses a
// sentinel that maps back to the empty (unfiltered) state.
const ALL = 'all'

const q = ref(String(route.query.q ?? ''))
const searchDraft = ref(String(route.query.q ?? ''))
const category = ref(String(route.query.category ?? ''))
const author = ref(String(route.query.author ?? ''))
const series = ref(String(route.query.series ?? ''))
const publisher = ref(String(route.query.publisher ?? ''))
const tag = ref(String(route.query.tag ?? ''))
const format = ref(String(route.query.format ?? ''))
const status = ref(String(route.query.status ?? ''))
const sort = ref(String(route.query.sort ?? 'recent'))
const view = ref<'grid' | 'list'>(route.query.view === 'list' ? 'list' : 'grid')
const page = ref(Number(route.query.page) || 1)
const pageSize = 24

const params = computed(() => ({
  q: q.value || undefined,
  category: category.value || undefined,
  author: author.value || undefined,
  series: series.value || undefined,
  publisher: publisher.value || undefined,
  tag: tag.value || undefined,
  format: format.value || undefined,
  status: status.value || undefined,
  sort: sort.value,
  order: sort.value === 'title' || sort.value === 'author' ? 'asc' : 'desc',
  page: page.value,
  pageSize
}))

const { data, status: fetchStatus, refresh } = useLibraryBooks(params)
const { data: facets } = useLibraryFacets()

const books = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const activeFilters = computed(() => ({
  category: category.value,
  author: author.value,
  series: series.value,
  publisher: publisher.value,
  tag: tag.value,
  format: format.value
}))

const sortItems = computed(() => [
  { label: t('library.sort.recent'), value: 'recent' },
  { label: t('library.sort.title'), value: 'title' },
  { label: t('library.sort.author'), value: 'author' },
  { label: t('library.sort.rating'), value: 'rating' },
  { label: t('library.sort.downloads'), value: 'downloads' },
  { label: t('library.sort.pubdate'), value: 'pubdate' }
])

const statusItems = computed(() => [
  { label: t('library.status.all'), value: ALL },
  { label: t('library.status.unread'), value: 'unread' },
  { label: t('library.status.reading'), value: 'reading' },
  { label: t('library.status.finished'), value: 'finished' }
])

const categoryOptions = computed(() => (facets.value as LibraryFacets | undefined)?.categories ?? [])

function applyQuery(patch: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...route.query, ...patch }
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(merged)) {
    if (value === '' || value === undefined || value === null) continue
    next[key] = value
  }
  router.replace({ query: next })
}

// Keep local state in sync when the URL changes (back/forward, external links).
watch(() => route.query, (query) => {
  q.value = String(query.q ?? '')
  searchDraft.value = q.value
  category.value = String(query.category ?? '')
  author.value = String(query.author ?? '')
  series.value = String(query.series ?? '')
  publisher.value = String(query.publisher ?? '')
  tag.value = String(query.tag ?? '')
  format.value = String(query.format ?? '')
  status.value = String(query.status ?? '')
  sort.value = String(query.sort ?? 'recent')
  view.value = query.view === 'list' ? 'list' : 'grid'
  page.value = Number(query.page) || 1
})

function commitSearch() {
  q.value = searchDraft.value.trim()
  page.value = 1
  applyQuery({ q: q.value || undefined, page: undefined })
}

function onFilter(key: string, value: string) {
  page.value = 1
  applyQuery({ [key]: value || undefined, page: undefined })
}

function clearFilters() {
  page.value = 1
  applyQuery({
    category: undefined, author: undefined, series: undefined,
    publisher: undefined, tag: undefined, format: undefined, page: undefined
  })
}

function setSort(value: string) {
  sort.value = value
  page.value = 1
  applyQuery({ sort: value === 'recent' ? undefined : value, page: undefined })
}

function setStatus(value: string) {
  const next = value === ALL ? '' : value
  status.value = next
  page.value = 1
  applyQuery({ status: next || undefined, page: undefined })
}

function setView(value: 'grid' | 'list') {
  view.value = value
  applyQuery({ view: value === 'list' ? 'list' : undefined })
}

function goPage(p: number) {
  page.value = p
  applyQuery({ page: p === 1 ? undefined : p })
}

// ---- Mutations ----
const favoritingId = ref<number | null>(null)

async function toggleFavorite(book: LibraryBook) {
  favoritingId.value = book.id
  try {
    await cPost('/api/library/favorites', { bookId: book.id })
    await refresh()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.favoriteFailed')), color: 'error' })
  } finally {
    favoritingId.value = null
  }
}

const uploadOpen = ref(false)
const editorOpen = ref(false)
const editorMode = ref<'create' | 'update'>('create')
const editorItem = ref<LibraryBook | null>(null)
const collectionBook = ref<LibraryBook | null>(null)

function openCreate() {
  editorMode.value = 'create'
  editorItem.value = null
  editorOpen.value = true
}

function openEdit(book: LibraryBook) {
  editorMode.value = 'update'
  editorItem.value = book
  editorOpen.value = true
}

async function removeBook(book: LibraryBook) {
  try {
    await cDelete(`/api/library/books/${book.id}`)
    toast.add({ title: t('library.messages.deleted'), color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.deleteFailed')), color: 'error' })
  }
}

async function onSaved() {
  await Promise.all([refresh(), refreshNuxtData('library:facets')])
}

// ---- Batch management + recycle bin ----
const manageMode = ref(false)
const trashMode = ref(false)
const selectedIds = ref<number[]>([])

const { data: trashed, refresh: refreshTrashed } = useAsyncData<{ items: LibraryBook[] }>(
  'library:trashed',
  () => cGet<{ items: LibraryBook[] }>('/api/library/books/trashed'),
  { immediate: false, default: () => ({ items: [] }) }
)
const trashedBooks = computed(() => trashed.value?.items ?? [])
const allSelected = computed(() => books.value.length > 0 && selectedIds.value.length === books.value.length)

function isSelected(id: number): boolean {
  return selectedIds.value.includes(id)
}

function toggleSelect(id: number) {
  selectedIds.value = isSelected(id)
    ? selectedIds.value.filter(current => current !== id)
    : [...selectedIds.value, id]
}

function toggleSelectAll() {
  selectedIds.value = allSelected.value ? [] : books.value.map(book => book.id)
}

function exitManage() {
  manageMode.value = false
  selectedIds.value = []
}

/** Soft delete the selected books (recoverable from the recycle bin). */
async function batchDelete() {
  if (!selectedIds.value.length) return
  try {
    const res = await cPost<{ affected: number }>('/api/library/books/batch', {
      action: 'soft-delete',
      ids: selectedIds.value
    })
    toast.add({ title: t('library.messages.batchDeleted', { count: res.affected }), color: 'success' })
    exitManage()
    await Promise.all([refresh(), refreshNuxtData('library:facets'), refreshNuxtData('library:trashed')])
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.deleteFailed')), color: 'error' })
  }
}

async function openTrash() {
  exitManage()
  trashMode.value = true
  await refreshTrashed()
}

async function restoreBook(book: LibraryBook) {
  try {
    await cPost('/api/library/books/batch', { action: 'restore', ids: [book.id] })
    toast.add({ title: t('library.messages.restored'), color: 'success' })
    await Promise.all([refreshTrashed(), refresh(), refreshNuxtData('library:facets')])
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.saveFailed')), color: 'error' })
  }
}

async function purgeBook(book: LibraryBook) {
  try {
    await cPost('/api/library/books/batch', { action: 'permanent-delete', ids: [book.id] })
    toast.add({ title: t('library.messages.purged'), color: 'success' })
    await refreshTrashed()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.deleteFailed')), color: 'error' })
  }
}

useSeoMeta({ title: () => t('library.title') })
</script>

<template>
  <UContainer class="py-10">
    <LibraryHeader
      :show-upload="isLoggedIn"
      :show-add="isLoggedIn"
      @upload="uploadOpen = true"
      @add="openCreate"
    />

    <UAlert
      v-if="!isLoggedIn"
      color="info"
      variant="subtle"
      icon="i-lucide-lock"
      :description="t('library.messages.loginRequired')"
      class="mb-6"
    />

    <LibraryFilterChips
      v-if="facets"
      :facets="facets"
      :active="activeFilters"
      @filter="onFilter"
      @clear="clearFilters"
    />

    <!-- Toolbar -->
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <UInput
        v-model="searchDraft"
        icon="i-lucide-search"
        size="sm"
        :placeholder="t('library.search.placeholder')"
        class="w-full sm:w-72"
        @keyup.enter="commitSearch"
      />
      <USelect
        :model-value="sort"
        :items="sortItems"
        size="sm"
        class="w-40"
        :aria-label="t('library.sort.label')"
        @update:model-value="setSort(String($event))"
      />
      <USelect
        v-if="isLoggedIn"
        :model-value="status || ALL"
        :items="statusItems"
        size="sm"
        class="w-40"
        :aria-label="t('library.filters.status')"
        @update:model-value="setStatus(String($event))"
      />
      <div
        class="flex items-center gap-1"
      >
        <UButton
          icon="i-lucide-layout-grid"
          size="sm"
          square
          color="neutral"
          :variant="view === 'grid' ? 'solid' : 'ghost'"
          :title="t('library.view.grid')"
          @click="setView('grid')"
        />
        <UButton
          icon="i-lucide-list"
          size="sm"
          square
          color="neutral"
          :variant="view === 'list' ? 'solid' : 'ghost'"
          :title="t('library.view.list')"
          @click="setView('list')"
        />
      </div>
      <div
        v-if="isLoggedIn"
        class="flex items-center gap-1"
      >
        <UButton
          :icon="manageMode ? 'i-lucide-check' : 'i-lucide-list-checks'"
          size="sm"
          color="neutral"
          :variant="manageMode ? 'solid' : 'ghost'"
          :title="manageMode ? t('library.actions.exitManage') : t('library.actions.manage')"
          @click="manageMode ? exitManage() : (manageMode = true)"
        />
        <UButton
          icon="i-lucide-trash-2"
          size="sm"
          color="neutral"
          :variant="trashMode ? 'solid' : 'ghost'"
          :title="trashMode ? t('library.trash.back') : t('library.trash.title')"
          @click="trashMode ? (trashMode = false) : openTrash()"
        />
      </div>
      <span class="ml-auto text-sm text-muted">{{ t('library.filters.results', { count: total }) }}</span>
    </div>

    <!-- Recycle bin: soft-deleted books can be restored or purged -->
    <template v-if="trashMode">
      <div class="mb-5 flex flex-wrap items-center gap-3">
        <h2 class="text-lg font-semibold">
          {{ t('library.trash.title') }}
        </h2>
        <UBadge
          color="neutral"
          variant="subtle"
          size="sm"
          :label="String(trashedBooks.length)"
        />
        <span class="text-xs text-dimmed">{{ t('library.trash.hint') }}</span>
        <UButton
          class="ml-auto"
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-arrow-left"
          :label="t('library.trash.back')"
          @click="trashMode = false"
        />
      </div>

      <p
        v-if="!trashedBooks.length"
        class="py-16 text-center text-muted"
      >
        {{ t('library.trash.empty') }}
      </p>

      <ul
        v-else
        class="divide-y divide-default rounded-lg border border-default"
      >
        <li
          v-for="book in trashedBooks"
          :key="book.id"
          class="flex flex-wrap items-center gap-3 px-3 py-2"
        >
          <div class="h-16 w-11 shrink-0 overflow-hidden rounded border border-default">
            <LibraryBookCover
              :cover="book.cover"
              :title="book.title"
            />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">
              {{ book.title }}
            </p>
            <p class="truncate text-xs text-dimmed">
              {{ bookAuthorsLabel(book) || t('library.book.unknownAuthor') }}
            </p>
          </div>
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-rotate-ccw"
            :label="t('library.actions.restore')"
            @click="restoreBook(book)"
          />
          <BaseConfirmButton
            v-if="isAdmin"
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            :label="t('library.actions.purge')"
            :confirm-text="t('library.trash.purgeConfirm')"
            @confirm="purgeBook(book)"
          />
        </li>
      </ul>
    </template>

    <template v-else>
      <!-- Loading -->
      <div
        v-if="fetchStatus === 'pending'"
        :class="view === 'grid' ? 'grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5' : 'space-y-3'"
      >
        <div
          v-for="i in 8"
          :key="i"
          class="h-64 animate-pulse rounded-lg bg-muted/60"
        />
      </div>

      <!-- Empty -->
      <p
        v-else-if="!books.length"
        class="py-16 text-center text-muted"
      >
        {{ total === 0 && !q && !activeFilters.category && !activeFilters.tag ? t('library.empty.noBooks') : t('library.empty.noResults') }}
      </p>

      <!-- Books -->
      <div
        v-else
        :class="view === 'grid' ? 'grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5' : 'space-y-3'"
      >
        <div
          v-for="book in books"
          :key="book.id"
          class="relative"
        >
          <LibraryBookCard
            :book="book"
            :view="view"
            :can-edit="isLoggedIn && !manageMode"
            :favoriting="favoritingId === book.id"
            @favorite="toggleFavorite"
            @edit="openEdit"
            @delete="removeBook"
            @add-collection="collectionBook = $event"
          />
          <!-- Selection overlay: in manage mode the whole card toggles selection -->
          <button
            v-if="manageMode"
            type="button"
            class="absolute inset-0 z-10 flex items-start justify-end rounded-lg bg-black/20 transition"
            :class="isSelected(book.id) ? 'ring-2 ring-inset ring-primary' : ''"
            @click="toggleSelect(book.id)"
          >
            <UCheckbox
              :model-value="isSelected(book.id)"
              class="pointer-events-none m-2"
            />
          </button>
        </div>
      </div>

      <div
        v-if="data && data.total > pageSize"
        class="mt-8 flex items-center justify-between gap-3"
      >
        <span class="text-sm text-muted">{{ t('library.filters.results', { count: total }) }}</span>
        <UPagination
          :page="page"
          :total="data.total"
          :items-per-page="pageSize"
          @update:page="goPage"
        />
      </div>
    </template>

    <!-- Batch action bar -->
    <div
      v-if="manageMode"
      class="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-default bg-elevated/95 px-4 py-3 shadow-lg backdrop-blur"
    >
      <UCheckbox
        :model-value="allSelected"
        :label="t('library.actions.selectAll')"
        @update:model-value="toggleSelectAll"
      />
      <span class="text-sm text-muted">{{ t('library.actions.selected', { count: selectedIds.length }) }}</span>
      <div class="ml-auto flex items-center gap-2">
        <UButton
          size="sm"
          color="error"
          variant="soft"
          icon="i-lucide-trash-2"
          :disabled="!selectedIds.length"
          :label="t('library.actions.batchDelete')"
          @click="batchDelete"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :label="t('library.actions.exitManage')"
          @click="exitManage"
        />
      </div>
    </div>

    <LibraryBookUploadModal
      v-model:open="uploadOpen"
      :categories="categoryOptions"
      @uploaded="onSaved"
    />
    <LibraryBookEditorModal
      v-model:open="editorOpen"
      :mode="editorMode"
      :item="editorItem"
      :categories="categoryOptions"
      @saved="onSaved"
    />
    <LibraryAddToCollectionModal
      :open="!!collectionBook"
      :book-id="collectionBook?.id ?? null"
      @update:open="(v: boolean) => { if (!v) collectionBook = null }"
      @added="refreshNuxtData('library:collections')"
    />
  </UContainer>
</template>
