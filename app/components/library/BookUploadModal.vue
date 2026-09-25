<script setup lang="ts">
/**
 * Library — upload one or more ebook files.
 *
 * Without `bookId` each file becomes a new book (metadata auto-read from EPUB).
 * Emits `uploaded` after a successful batch so the page can refresh.
 */
const props = withDefaults(defineProps<{
  open: boolean
  categories?: Array<{ id: number, name: string }>
  /** When set, the files are attached to this existing book instead of creating one. */
  bookId?: number | null
}>(), {
  categories: () => [],
  bookId: null
})

const emit = defineEmits<{
  'update:open': [boolean]
  'uploaded': []
}>()

const { t } = useI18n()
const toast = useToast()

// Nuxt UI's USelect rejects empty-string item values, so "no category" uses a
// sentinel that is translated back to "omit the field" on upload.
const ALL = 'all'

const files = ref<File[]>([])
const categoryId = ref(ALL)
const isPublic = ref(true)
const uploading = ref(false)
const errorMsg = ref('')
const dragActive = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

watch(() => props.open, (open) => {
  if (!open) return
  files.value = []
  categoryId.value = ALL
  isPublic.value = true
  errorMsg.value = ''
  dragActive.value = false
})

function addFiles(list: FileList | null) {
  if (!list) return
  files.value = [...files.value, ...Array.from(list)]
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  addFiles(event.dataTransfer?.files ?? null)
}

function removeFile(index: number) {
  files.value = files.value.filter((_, i) => i !== index)
}

async function upload() {
  if (!files.value.length) {
    errorMsg.value = t('library.upload.hint')
    return
  }
  uploading.value = true
  errorMsg.value = ''
  try {
    const form = new FormData()
    for (const file of files.value) form.append('files', file, file.name)
    if (props.bookId) form.append('bookId', String(props.bookId))
    if (!props.bookId && categoryId.value && categoryId.value !== ALL) form.append('categoryId', categoryId.value)
    form.append('isPublic', String(isPublic.value))

    const res = await cRequest<{ books: unknown[] }>('/api/library/books/upload', { method: 'POST', body: form })
    toast.add({
      title: t('library.upload.success', { count: res.books?.length ?? files.value.length }),
      color: 'success'
    })
    emit('uploaded')
    emit('update:open', false)
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('library.upload.failed'))
  } finally {
    uploading.value = false
  }
}

function cancel() {
  emit('update:open', false)
}
</script>

<template>
  <DashboardCrudFormModal
    :modal-open="open"
    :modal-title="bookId ? t('library.upload.attachTitle') : t('library.upload.title')"
    :saving="uploading"
    :error-msg="errorMsg"
    @update:modal-open="emit('update:open', $event)"
    @save="upload"
    @cancel="cancel"
  >
    <template #form>
      <div class="space-y-4">
        <div
          class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition"
          :class="dragActive ? 'border-primary bg-primary/5' : 'border-default hover:border-primary/60'"
          @click="fileInput?.click()"
          @dragover.prevent="dragActive = true"
          @dragleave.prevent="dragActive = false"
          @drop.prevent="onDrop"
        >
          <UIcon
            name="i-lucide-upload-cloud"
            class="size-8 text-primary"
          />
          <p class="text-sm text-default">
            {{ dragActive ? t('library.upload.dropActive') : t('library.upload.hint') }}
          </p>
          <p class="text-xs text-dimmed">
            {{ t('library.upload.maxSize', { size: '200 MB' }) }}
          </p>
          <input
            ref="fileInput"
            type="file"
            multiple
            accept=".epub,.pdf,.mobi,.azw,.azw3,.fb2,.txt,.md,.djvu,.cbz,.cbr"
            class="hidden"
            @change="addFiles(($event.target as HTMLInputElement).files)"
          >
        </div>

        <ul
          v-if="files.length"
          class="max-h-48 space-y-1 overflow-auto"
        >
          <li
            v-for="(file, index) in files"
            :key="`${file.name}-${index}`"
            class="flex items-center justify-between gap-2 rounded-md bg-elevated px-3 py-1.5 text-sm"
          >
            <span class="truncate">{{ file.name }}</span>
            <UButton
              icon="i-lucide-x"
              size="xs"
              square
              color="neutral"
              variant="ghost"
              @click="removeFile(index)"
            />
          </li>
        </ul>

        <div
          v-if="categories.length && !bookId"
          class="grid gap-4 sm:grid-cols-2"
        >
          <UFormField :label="t('library.filters.category')">
            <USelect
              v-model="categoryId"
              :items="[{ label: t('library.filters.all'), value: ALL }, ...categories.map(c => ({ label: c.name, value: String(c.id) }))]"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('library.editor.isPublic')">
            <USwitch v-model="isPublic" />
          </UFormField>
        </div>

        <p class="text-xs text-dimmed">
          {{ t('library.upload.metadataHint') }}
        </p>
      </div>
    </template>
  </DashboardCrudFormModal>
</template>
