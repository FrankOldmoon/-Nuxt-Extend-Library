<script setup lang="ts">
/**
 * Library — create / edit a book's metadata.
 *
 * Uses the module's own `/api/library/books` endpoints (which also handle the
 * author pivot and "create or reuse" for series/publishers). Cover images are
 * uploaded through the host file API so they render everywhere.
 */
import type { FetchedMetadata, LibraryBook } from '../../composables/useLibrary'

const props = withDefaults(defineProps<{
  open: boolean
  mode: 'create' | 'update'
  item?: LibraryBook | null
  categories?: Array<{ id: number, name: string }>
}>(), {
  item: null,
  categories: () => []
})

const emit = defineEmits<{
  'update:open': [boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()

// Nuxt UI's USelect rejects empty-string item values, so "no category" uses a
// sentinel that maps back to `null` when the form is submitted.
const ALL = 'all'

interface FormState {
  title: string
  subtitle: string
  authors: string
  seriesName: string
  seriesIndex: string
  publisherName: string
  categoryId: string
  pubdate: string
  isbn: string
  language: string
  pages: string
  rating: string
  tags: string
  description: string
  cover: string
  isPublic: boolean
}

const form = ref<FormState>(emptyForm())
const saving = ref(false)
const errorMsg = ref('')
const coverInput = ref<HTMLInputElement | null>(null)
const metadataOpen = ref(false)

/** Fill the form from a fetched metadata record (user still reviews + saves). */
function applyMetadata(metadata: FetchedMetadata) {
  form.value = {
    ...form.value,
    title: metadata.title || form.value.title,
    subtitle: metadata.subtitle ?? form.value.subtitle,
    authors: metadata.authors.length ? metadata.authors.join(', ') : form.value.authors,
    seriesName: metadata.series || form.value.seriesName,
    publisherName: metadata.publisher || form.value.publisherName,
    pubdate: metadata.pubdate ? metadata.pubdate.slice(0, 10) : form.value.pubdate,
    isbn: metadata.isbn || form.value.isbn,
    pages: metadata.pages != null ? String(metadata.pages) : form.value.pages,
    rating: metadata.rating != null ? String(metadata.rating) : form.value.rating,
    tags: metadata.tags.length ? metadata.tags.join(', ') : form.value.tags,
    description: metadata.description || form.value.description,
    cover: metadata.cover || form.value.cover
  }
}

function emptyForm(): FormState {
  return {
    title: '',
    subtitle: '',
    authors: '',
    seriesName: '',
    seriesIndex: '',
    publisherName: '',
    categoryId: ALL,
    pubdate: '',
    isbn: '',
    language: '',
    pages: '',
    rating: '',
    tags: '',
    description: '',
    cover: '',
    isPublic: true
  }
}

function fromBook(book: LibraryBook): FormState {
  return {
    title: book.title ?? '',
    subtitle: book.subtitle ?? '',
    authors: book.authors.map(a => a.name).join(', '),
    seriesName: book.series?.name ?? '',
    seriesIndex: book.seriesIndex != null ? String(book.seriesIndex) : '',
    publisherName: book.publisher?.name ?? '',
    categoryId: book.category ? String(book.category.id) : ALL,
    pubdate: book.pubdate ? book.pubdate.slice(0, 10) : '',
    isbn: book.isbn ?? '',
    language: book.language ?? '',
    pages: book.pages != null ? String(book.pages) : '',
    rating: book.rating != null ? String(book.rating) : '',
    tags: book.tags.join(', '),
    description: book.description ?? '',
    cover: book.cover ?? '',
    isPublic: book.isPublic
  }
}

watch(() => props.open, (open) => {
  if (!open) return
  errorMsg.value = ''
  form.value = props.mode === 'update' && props.item ? fromBook(props.item) : emptyForm()
})

function splitList(value: string): string[] {
  return value.split(/[,，;]/).map(s => s.trim()).filter(Boolean)
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

async function uploadCover(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const body = new FormData()
    body.append('files', file, file.name)
    const res = await cRequest<{ files: Array<{ path: string }> }>('/api/files/upload', { method: 'POST', body })
    const path = res.files?.[0]?.path
    if (path) form.value.cover = path
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.saveFailed')), color: 'error' })
  } finally {
    input.value = ''
  }
}

async function save() {
  if (!form.value.title.trim()) {
    errorMsg.value = t('library.editor.title')
    return
  }
  saving.value = true
  errorMsg.value = ''
  const payload: Record<string, unknown> = {
    title: form.value.title.trim(),
    subtitle: form.value.subtitle.trim() || null,
    authors: splitList(form.value.authors),
    seriesName: form.value.seriesName.trim() || null,
    seriesIndex: numberOrNull(form.value.seriesIndex),
    publisherName: form.value.publisherName.trim() || null,
    categoryId: form.value.categoryId === ALL ? null : numberOrNull(form.value.categoryId),
    pubdate: form.value.pubdate.trim() || null,
    isbn: form.value.isbn.trim() || null,
    language: form.value.language.trim() || null,
    pages: numberOrNull(form.value.pages),
    rating: numberOrNull(form.value.rating),
    tags: splitList(form.value.tags),
    description: form.value.description.trim() || null,
    cover: form.value.cover.trim() || null,
    isPublic: form.value.isPublic
  }

  try {
    if (props.mode === 'create') {
      await cPost('/api/library/books', payload)
    } else if (props.item?.id) {
      await cPut(`/api/library/books/${props.item.id}`, payload)
    }
    toast.add({ title: t('library.messages.saved'), color: 'success' })
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('library.messages.saveFailed'))
  } finally {
    saving.value = false
  }
}

function cancel() {
  emit('update:open', false)
}
</script>

<template>
  <DashboardCrudFormModal
    :modal-open="open"
    :modal-title="mode === 'create' ? t('library.editor.createTitle') : t('library.editor.editTitle')"
    :saving="saving"
    :error-msg="errorMsg"
    @update:modal-open="emit('update:open', $event)"
    @save="save"
    @cancel="cancel"
  >
    <template #form>
      <div class="space-y-4">
        <div class="flex items-center justify-end">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-cloud-download"
            :label="t('library.metadata.button')"
            @click="metadataOpen = true"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            :label="t('library.editor.title')"
            required
            class="sm:col-span-2"
          >
            <UInput
              v-model="form.title"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('library.editor.subtitle')">
            <UInput
              v-model="form.subtitle"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('library.editor.authors')"
            :help="t('library.editor.authorsHint')"
          >
            <UInput
              v-model="form.authors"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('library.editor.series')">
            <UInput
              v-model="form.seriesName"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('library.editor.seriesIndex')">
            <UInput
              v-model="form.seriesIndex"
              type="number"
              step="0.1"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('library.editor.publisher')">
            <UInput
              v-model="form.publisherName"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('library.editor.category')">
            <USelect
              v-model="form.categoryId"
              :items="[{ label: t('library.filters.all'), value: ALL }, ...categories.map(c => ({ label: c.name, value: String(c.id) }))]"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('library.editor.pubdate')">
            <UInput
              v-model="form.pubdate"
              type="date"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('library.editor.isbn')">
            <UInput
              v-model="form.isbn"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('library.editor.language')">
            <UInput
              v-model="form.language"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('library.editor.pages')">
            <UInput
              v-model="form.pages"
              type="number"
              min="0"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('library.editor.rating')">
            <UInput
              v-model="form.rating"
              type="number"
              min="0"
              max="10"
              step="0.1"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('library.editor.tags')"
            class="sm:col-span-2"
          >
            <UInput
              v-model="form.tags"
              :placeholder="t('library.editor.tagsPlaceholder')"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField :label="t('library.editor.description')">
          <UTextarea
            v-model="form.description"
            :rows="4"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('library.editor.cover')"
          :help="t('library.editor.coverHint')"
        >
          <div class="flex items-start gap-3">
            <div class="h-28 w-20 shrink-0 overflow-hidden rounded-md border border-default">
              <LibraryBookCover
                :cover="form.cover"
                :title="form.title || '?'"
              />
            </div>
            <div class="flex-1 space-y-2">
              <UInput
                v-model="form.cover"
                placeholder="https://…"
                class="w-full"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-image-plus"
                :label="t('library.actions.upload')"
                @click="coverInput?.click()"
              />
              <input
                ref="coverInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="uploadCover"
              >
            </div>
          </div>
        </UFormField>

        <UFormField
          :label="t('library.editor.isPublic')"
          :help="t('library.editor.publicHint')"
        >
          <USwitch v-model="form.isPublic" />
        </UFormField>
      </div>
    </template>
  </DashboardCrudFormModal>

  <LibraryMetadataModal
    v-model:open="metadataOpen"
    :query="form.title"
    :isbn="form.isbn"
    @apply="applyMetadata"
  />
</template>
