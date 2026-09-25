<script setup lang="ts">
/**
 * Library — a single book list at `/library/collections/:id`.
 */
import type { LibraryBook, LibraryCollection } from '../../../../composables/useLibrary'

const { t } = useI18n()
const route = useRoute()
const toast = useToast()

const id = Number(route.params.id)

interface CollectionDetail {
  collection: LibraryCollection
  books: LibraryBook[]
}

const { data, status, refresh } = useAsyncData<CollectionDetail>(
  `library:collection:${id}`,
  () => cGet<CollectionDetail>(`/api/library/collections/${id}`)
)

const collection = computed(() => data.value?.collection ?? null)
const books = computed(() => data.value?.books ?? [])

const editorOpen = ref(false)
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

async function removeFromList(book: LibraryBook) {
  try {
    await cPost(`/api/library/collections/${id}/books`, { bookId: book.id, action: 'remove' })
    toast.add({ title: t('library.collections.removeSuccess'), color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.saveFailed')), color: 'error' })
  }
}

async function removeCollection() {
  if (!collection.value) return
  try {
    await cDelete(`/api/library/collections/${id}`)
    toast.add({ title: t('library.collections.deleted'), color: 'success' })
    await navigateTo('/library/collections')
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.deleteFailed')), color: 'error' })
  }
}

useSeoMeta(() => ({ title: () => collection.value?.name ?? t('library.collections.title') }))
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/library/collections"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      size="sm"
      :label="t('library.collections.title')"
      class="mb-6"
    />

    <div
      v-if="status === 'pending'"
      class="h-24 animate-pulse rounded-lg bg-muted/40"
    />

    <p
      v-else-if="!collection"
      class="py-16 text-center text-muted"
    >
      {{ t('library.messages.notFound') }}
    </p>

    <template v-else>
      <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">
            {{ collection.name }}
          </h1>
          <p
            v-if="collection.description"
            class="mt-1 max-w-2xl text-muted"
          >
            {{ collection.description }}
          </p>
          <div class="mt-2 flex items-center gap-2 text-sm text-dimmed">
            <UIcon
              name="i-lucide-book-marked"
              class="size-4"
            />
            {{ t('library.collections.bookCount', { count: books.length }) }}
            <UIcon
              v-if="!collection.isPublic"
              name="i-lucide-lock"
              class="size-4"
            />
          </div>
        </div>

        <div
          v-if="collection.canEdit"
          class="flex items-center gap-2"
        >
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="soft"
            :label="t('library.actions.edit')"
            @click="editorOpen = true"
          />
          <BaseConfirmButton
            icon="i-lucide-trash-2"
            color="error"
            variant="soft"
            :label="t('library.actions.delete')"
            @confirm="removeCollection"
          />
        </div>
      </div>

      <p
        v-if="!books.length"
        class="py-16 text-center text-muted"
      >
        {{ t('library.collections.emptyBooks') }}
      </p>

      <div
        v-else
        class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
      >
        <div
          v-for="book in books"
          :key="book.id"
          class="relative"
        >
          <LibraryBookCard
            :book="book"
            :favoriting="favoritingId === book.id"
            @favorite="toggleFavorite"
            @edit="() => {}"
            @delete="() => {}"
            @add-collection="() => {}"
          />
          <UButton
            v-if="collection.canEdit"
            icon="i-lucide-x"
            size="xs"
            square
            color="error"
            variant="solid"
            class="absolute right-2 top-2 z-10"
            :title="t('library.collections.remove')"
            @click.stop="removeFromList(book)"
          />
        </div>
      </div>

      <LibraryCollectionEditorModal
        v-model:open="editorOpen"
        :item="collection"
        @saved="refresh"
      />
    </template>
  </UContainer>
</template>
