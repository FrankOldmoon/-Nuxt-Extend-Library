<script setup lang="ts">
/**
 * Library — add a book to one of the viewer's book lists.
 *
 * Fetches the current collections on open, supports creating a new one inline,
 * and emits `added` after a successful add.
 */
import type { LibraryCollection } from '../../composables/useLibrary'

const props = withDefaults(defineProps<{
  open: boolean
  bookId?: number | null
}>(), {
  bookId: null
})

const emit = defineEmits<{
  'update:open': [boolean]
  'added': []
}>()

const { t } = useI18n()
const toast = useToast()

const collections = ref<LibraryCollection[]>([])
const loading = ref(false)
const busy = ref(false)
const errorMsg = ref('')
const newName = ref('')

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await cGet<{ items: LibraryCollection[] }>('/api/library/collections')
    collections.value = res.items ?? []
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('library.messages.loadFailed'))
  } finally {
    loading.value = false
  }
}

watch(() => props.open, (open) => {
  if (!open) return
  newName.value = ''
  load()
})

async function addTo(collectionId: number) {
  if (!props.bookId) return
  busy.value = true
  errorMsg.value = ''
  try {
    await cPost(`/api/library/collections/${collectionId}/books`, { bookId: props.bookId, action: 'add' })
    toast.add({ title: t('library.collections.addSuccess'), color: 'success' })
    emit('added')
    emit('update:open', false)
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('library.messages.saveFailed'))
  } finally {
    busy.value = false
  }
}

async function createAndAdd() {
  if (!newName.value.trim()) return
  busy.value = true
  errorMsg.value = ''
  try {
    const res = await cPost<{ collection: LibraryCollection }>('/api/library/collections', {
      name: newName.value.trim()
    })
    emit('added')
    if (res.collection?.id) await addTo(res.collection.id)
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('library.messages.saveFailed'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('library.actions.addToCollection')"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <UAlert
        v-if="errorMsg"
        color="error"
        variant="subtle"
        :description="errorMsg"
        class="mb-4"
      />

      <p
        v-if="loading"
        class="py-6 text-center text-sm text-muted"
      >
        {{ t('common.loading') }}
      </p>
      <ul
        v-else-if="collections.length"
        class="max-h-64 space-y-1 overflow-auto"
      >
        <li
          v-for="collection in collections"
          :key="collection.id"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-elevated disabled:opacity-50"
            :disabled="busy"
            @click="addTo(collection.id)"
          >
            <span class="truncate">{{ collection.name }}</span>
            <span class="text-xs text-dimmed">{{ t('library.collections.bookCount', { count: collection.bookCount }) }}</span>
          </button>
        </li>
      </ul>
      <p
        v-else
        class="py-6 text-center text-sm text-muted"
      >
        {{ t('library.collections.empty') }}
      </p>

      <div class="mt-4 flex items-center gap-2 border-t border-default pt-3">
        <UInput
          v-model="newName"
          :placeholder="t('library.collections.namePlaceholder')"
          size="sm"
          class="flex-1"
        />
        <UButton
          size="sm"
          icon="i-lucide-plus"
          color="primary"
          :disabled="!newName.trim()"
          :loading="busy"
          @click="createAndAdd"
        />
      </div>
    </template>
  </UModal>
</template>
