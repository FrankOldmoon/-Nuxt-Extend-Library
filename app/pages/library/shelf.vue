<script setup lang="ts">
/**
 * Library — the viewer's shelf: in-progress, finished and favourite books.
 */
import type { LibraryBook } from '../../composables/useLibrary'

const { t } = useI18n()
const toast = useToast()
const { isLoggedIn } = useAuth()

type Tab = 'reading' | 'finished' | 'favorites'
const tab = ref<Tab>('reading')

const shelfStatus = computed(() => (tab.value === 'favorites' ? 'reading' : tab.value))
const { data: shelf, refresh: refreshShelf } = useLibraryShelf(shelfStatus)
const { data: favorites, refresh: refreshFavorites } = useLibraryFavorites()

const books = computed<LibraryBook[]>(() => {
  if (tab.value === 'favorites') return favorites.value?.items ?? []
  return (shelf.value?.items ?? []).map(item => item.book)
})

const emptyText = computed(() => {
  if (tab.value === 'favorites') return t('library.shelf.emptyFavorites')
  if (tab.value === 'finished') return t('library.shelf.emptyFinished')
  return t('library.shelf.emptyReading')
})

const tabs = computed(() => [
  { key: 'reading' as Tab, label: t('library.shelf.reading'), icon: 'i-lucide-book-open' },
  { key: 'finished' as Tab, label: t('library.shelf.finished'), icon: 'i-lucide-check-circle' },
  { key: 'favorites' as Tab, label: t('library.shelf.favorites'), icon: 'i-lucide-heart' }
])

const favoritingId = ref<number | null>(null)
const collectionBook = ref<LibraryBook | null>(null)

async function toggleFavorite(book: LibraryBook) {
  favoritingId.value = book.id
  try {
    await cPost('/api/library/favorites', { bookId: book.id })
    await Promise.all([refreshFavorites(), refreshShelf()])
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.favoriteFailed')), color: 'error' })
  } finally {
    favoritingId.value = null
  }
}

useSeoMeta({ title: () => t('library.shelf.title') })
</script>

<template>
  <UContainer class="py-10">
    <LibraryHeader />

    <UAlert
      v-if="!isLoggedIn"
      color="info"
      variant="subtle"
      icon="i-lucide-lock"
      :description="t('library.messages.loginRequired')"
      class="mb-6"
    />

    <div class="mb-6 flex flex-wrap gap-1.5">
      <UButton
        v-for="item in tabs"
        :key="item.key"
        size="sm"
        :icon="item.icon"
        :label="item.label"
        :color="tab === item.key ? 'primary' : 'neutral'"
        :variant="tab === item.key ? 'soft' : 'ghost'"
        @click="tab = item.key"
      />
    </div>

    <p
      v-if="!books.length"
      class="py-16 text-center text-muted"
    >
      {{ emptyText }}
    </p>

    <div
      v-else
      class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
    >
      <LibraryBookCard
        v-for="book in books"
        :key="book.id"
        :book="book"
        :can-edit="false"
        :favoriting="favoritingId === book.id"
        @favorite="toggleFavorite"
        @edit="() => {}"
        @delete="() => {}"
        @add-collection="collectionBook = $event"
      />
    </div>

    <LibraryAddToCollectionModal
      :open="!!collectionBook"
      :book-id="collectionBook?.id ?? null"
      @update:open="(v: boolean) => { if (!v) collectionBook = null }"
      @added="refreshNuxtData('library:collections')"
    />
  </UContainer>
</template>
