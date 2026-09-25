<script setup lang="ts">
/**
 * Library — book lists (collections) index at `/library/collections`.
 */
import type { LibraryCollection } from '../../../composables/useLibrary'

const { t } = useI18n()
const toast = useToast()
const { isLoggedIn } = useAuth()

const { data, refresh } = useLibraryCollections()

const collections = computed(() => data.value?.items ?? [])
const editorOpen = ref(false)
const editing = ref<LibraryCollection | null>(null)

function openCreate() {
  editing.value = null
  editorOpen.value = true
}

function openEdit(collection: LibraryCollection) {
  editing.value = collection
  editorOpen.value = true
}

async function removeCollection(collection: LibraryCollection) {
  try {
    await cDelete(`/api/library/collections/${collection.id}`)
    toast.add({ title: t('library.collections.deleted'), color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.deleteFailed')), color: 'error' })
  }
}

useSeoMeta({ title: () => t('library.collections.title') })
</script>

<template>
  <UContainer class="py-10">
    <LibraryHeader />

    <div class="mb-5 flex items-center justify-between gap-3">
      <h2 class="text-xl font-semibold">
        {{ t('library.collections.title') }}
      </h2>
      <UButton
        v-if="isLoggedIn"
        icon="i-lucide-plus"
        color="primary"
        :label="t('library.collections.new')"
        @click="openCreate"
      />
    </div>

    <p
      v-if="!collections.length"
      class="py-16 text-center text-muted"
    >
      {{ t('library.collections.empty') }}
    </p>

    <div
      v-else
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <UCard
        v-for="collection in collections"
        :key="collection.id"
      >
        <div class="flex items-start justify-between gap-3">
          <NuxtLink
            :to="`/library/collections/${collection.id}`"
            class="flex-1"
          >
            <h3 class="font-semibold text-highlighted hover:text-primary">
              {{ collection.name }}
            </h3>
            <p
              v-if="collection.description"
              class="mt-1 line-clamp-2 text-sm text-muted"
            >
              {{ collection.description }}
            </p>
            <div class="mt-3 flex items-center gap-2 text-xs text-dimmed">
              <UIcon
                name="i-lucide-book-marked"
                class="size-3.5"
              />
              {{ t('library.collections.bookCount', { count: collection.bookCount }) }}
              <UIcon
                v-if="!collection.isPublic"
                name="i-lucide-lock"
                class="size-3.5"
              />
            </div>
          </NuxtLink>

          <div
            v-if="collection.canEdit"
            class="flex items-center gap-1"
          >
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              square
              color="neutral"
              variant="ghost"
              :title="t('library.actions.edit')"
              @click="openEdit(collection)"
            />
            <BaseConfirmButton
              icon="i-lucide-trash-2"
              size="xs"
              color="error"
              variant="ghost"
              :title="t('library.actions.delete')"
              @confirm="removeCollection(collection)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <LibraryCollectionEditorModal
      v-model:open="editorOpen"
      :item="editing"
      @saved="refresh"
    />
  </UContainer>
</template>
