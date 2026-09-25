<script setup lang="ts">
/**
 * Library — Douban metadata picker.
 *
 * Search a title/ISBN, pick a candidate, preview the full metadata, then apply
 * it. The remote cover is downloaded into local storage through the module's
 * `/api/library/metadata/cover` endpoint before being handed to the caller, so
 * the book never references an expiring third-party URL.
 *
 * Emits `apply` with the fetched metadata (cover already localised); the caller
 * decides what to do with it (the editor fills its form and lets the user save).
 */
import type { FetchedMetadata, MetadataCandidate } from '../../composables/useLibrary'

const props = withDefaults(defineProps<{
  open: boolean
  query?: string
  isbn?: string
}>(), {
  query: '',
  isbn: ''
})

const emit = defineEmits<{
  'update:open': [boolean]
  'apply': [metadata: FetchedMetadata]
}>()

const { t } = useI18n()
const toast = useToast()

const q = ref('')
const searching = ref(false)
const loadingDetail = ref(false)
const applying = ref(false)
const errorMsg = ref('')
const candidates = ref<MetadataCandidate[]>([])
const selected = ref<FetchedMetadata | null>(null)
const searched = ref(false)

watch(() => props.open, (open) => {
  if (!open) return
  errorMsg.value = ''
  candidates.value = []
  selected.value = null
  searched.value = false
  const initial = (props.isbn || props.query || '').trim()
  q.value = initial
  if (initial) void search()
})

async function search() {
  const query = q.value.trim()
  if (!query) return
  searching.value = true
  errorMsg.value = ''
  selected.value = null
  try {
    const res = await cPost<{ items: MetadataCandidate[] }>('/api/library/metadata/search', { q: query })
    candidates.value = res.items ?? []
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('library.metadata.failed'))
    candidates.value = []
  } finally {
    searching.value = false
    searched.value = true
  }
}

async function pick(candidate: MetadataCandidate) {
  loadingDetail.value = true
  errorMsg.value = ''
  try {
    const res = await cPost<{ metadata: FetchedMetadata }>('/api/library/metadata/fetch', {
      sourceId: candidate.sourceId
    })
    selected.value = res.metadata
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('library.metadata.failed'))
  } finally {
    loadingDetail.value = false
  }
}

async function applySelected() {
  if (!selected.value) return
  applying.value = true
  errorMsg.value = ''
  try {
    let cover = selected.value.cover
    if (cover && !cover.startsWith('/') && !cover.startsWith('data:')) {
      try {
        const res = await cPost<{ cover: string }>('/api/library/metadata/cover', { url: cover })
        cover = resolveCover(res.cover) ?? res.cover
      } catch {
        // Keep the remote URL as a fallback; the user can replace it later.
        toast.add({ title: t('library.metadata.coverFailed'), color: 'warning' })
      }
    }
    emit('apply', { ...selected.value, cover })
    toast.add({ title: t('library.metadata.applied'), color: 'success' })
    emit('update:open', false)
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('library.metadata.failed'))
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('library.metadata.title')"
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

      <div class="flex items-center gap-2">
        <UInput
          v-model="q"
          icon="i-lucide-search"
          :placeholder="t('library.metadata.queryPlaceholder')"
          class="flex-1"
          @keyup.enter="search"
        />
        <UButton
          icon="i-lucide-search"
          color="primary"
          :loading="searching"
          :label="t('library.metadata.search')"
          @click="search"
        />
      </div>

      <p class="mt-2 text-xs text-dimmed">
        {{ t('library.metadata.hint') }}
      </p>

      <!-- Results -->
      <div
        v-if="candidates.length && !selected"
        class="mt-4 max-h-72 space-y-1 overflow-auto"
      >
        <button
          v-for="item in candidates"
          :key="item.sourceId"
          type="button"
          class="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition hover:bg-elevated"
          :disabled="loadingDetail"
          @click="pick(item)"
        >
          <span class="h-16 w-11 shrink-0 overflow-hidden rounded border border-default bg-muted">
            <img
              v-if="item.cover"
              :src="item.cover"
              :alt="item.title"
              class="h-full w-full object-cover"
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            >
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ item.title }}</span>
            <span
              v-if="item.subtitle"
              class="block truncate text-xs text-muted"
            >{{ item.subtitle }}</span>
            <span class="mt-0.5 block truncate text-xs text-dimmed">{{ item.label || item.authors.join(', ') }}</span>
          </span>
          <UIcon
            v-if="loadingDetail"
            name="i-lucide-loader-2"
            class="mt-1 size-4 animate-spin text-primary"
          />
        </button>
      </div>

      <p
        v-else-if="searched && !selected && !searching"
        class="mt-6 text-center text-sm text-muted"
      >
        {{ t('library.metadata.empty') }}
      </p>

      <!-- Preview -->
      <div
        v-if="selected"
        class="mt-4 space-y-3"
      >
        <div class="flex items-start gap-4">
          <div class="h-32 w-20 shrink-0 overflow-hidden rounded border border-default bg-muted">
            <img
              v-if="selected.cover"
              :src="selected.cover"
              :alt="selected.title"
              class="h-full w-full object-cover"
              referrerpolicy="no-referrer"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            >
          </div>
          <div class="min-w-0 flex-1 space-y-1 text-sm">
            <p class="font-semibold">
              {{ selected.title }}
            </p>
            <p
              v-if="selected.subtitle"
              class="text-muted"
            >
              {{ selected.subtitle }}
            </p>
            <p
              v-if="selected.authors.length"
              class="text-muted"
            >
              {{ t('library.metadata.author') }}：{{ selected.authors.join(', ') }}
            </p>
            <p
              v-if="selected.publisher"
              class="text-muted"
            >
              {{ t('library.metadata.publisher') }}：{{ selected.publisher }}
            </p>
            <p
              v-if="selected.pubdate"
              class="text-muted"
            >
              {{ t('library.metadata.date') }}：{{ selected.pubdate }}
            </p>
            <p
              v-if="selected.rating != null"
              class="text-muted"
            >
              {{ t('library.metadata.rating') }}：{{ selected.rating }}
            </p>
            <div
              v-if="selected.tags.length"
              class="flex flex-wrap gap-1 pt-1"
            >
              <UBadge
                v-for="tag in selected.tags"
                :key="tag"
                size="sm"
                color="primary"
                variant="subtle"
                :label="tag"
              />
            </div>
          </div>
        </div>

        <p
          v-if="selected.description"
          class="line-clamp-4 rounded-md bg-elevated p-3 text-xs text-muted"
        >
          {{ selected.description }}
        </p>

        <div class="flex items-center justify-between gap-2 pt-1">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-arrow-left"
            :label="t('library.metadata.back')"
            @click="selected = null"
          />
          <UButton
            color="primary"
            size="sm"
            icon="i-lucide-check"
            :loading="applying"
            :label="t('library.metadata.apply')"
            @click="applySelected"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
