<script setup lang="ts">
/**
 * Library — online reader at `/library/read/:id`.
 *
 * Picks a viewer from the book's attached formats:
 *   - EPUB          → the custom paged/scroll reader;
 *   - PDF / text    → the browser's built-in viewer (`LibraryNativeViewer`);
 *   - anything else → a clear message plus the download(s).
 *
 * Renders full-screen (no host layout) so the reader owns the viewport.
 */
definePageMeta({ layout: false })

const { t } = useI18n()
const route = useRoute()

const id = Number(route.params.id)
const { data, status, refresh } = useLibraryReader(id)

const book = computed(() => data.value?.detail.book ?? null)
const files = computed(() => data.value?.detail.files ?? [])
const content = computed(() => data.value?.content ?? null)
const contentError = computed(() => data.value?.contentError ?? null)
const canEdit = computed(() => data.value?.detail.canEdit ?? false)
const attachOpen = ref(false)

const epubFile = computed(() =>
  files.value.find(file => file.format === 'epub' && file.available !== false) ?? null)
const nativeFile = computed(() =>
  files.value.find(file => file.format !== 'epub' && file.available !== false && canReadInline(file)) ?? null)
const missingFiles = computed(() => files.value.filter(file => file.available === false))

const initial = computed(() => ({
  chapterIndex: book.value?.progress?.chapterIndex ?? 0,
  location: book.value?.progress?.location ?? null
}))

const loading = computed(() => status.value === 'pending')

const errorMessage = computed(() => {
  const error = contentError.value
  if (!error) return ''
  if (error.statusCode === 415 || error.statusCode === 409) return t('library.reader.unsupported')
  return error.message || t('library.messages.loadFailed')
})
</script>

<template>
  <div class="flex h-screen flex-col bg-default">
    <div
      v-if="loading"
      class="flex flex-1 items-center justify-center"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="size-8 animate-spin text-primary"
      />
    </div>

    <!-- EPUB: custom reader (paged or scrolling) -->
    <LibraryEpubReader
      v-else-if="epubFile && content"
      class="flex-1"
      :content="content"
      :initial="initial"
    />

    <!-- EPUB present but its content could not be produced -->
    <div
      v-else-if="errorMessage"
      class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <UIcon
        name="i-lucide-book-x"
        class="size-10 text-muted"
      />
      <p class="max-w-md text-muted">
        {{ errorMessage }}
      </p>
      <div class="flex items-center gap-2">
        <UButton
          :to="`/library/book/${id}`"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="soft"
          :label="t('library.reader.backToBook')"
        />
        <UButton
          to="/library"
          icon="i-lucide-library"
          color="primary"
          variant="soft"
          :label="t('library.allBooks')"
        />
      </div>
    </div>

    <!-- PDF / text: browser-native viewer -->
    <LibraryNativeViewer
      v-else-if="nativeFile"
      class="flex-1"
      :book-id="id"
      :file-id="nativeFile.id"
      :title="book?.title ?? ''"
      :format="nativeFile.format"
    />

    <!-- Nothing readable inline -->
    <div
      v-else-if="book"
      class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <UIcon
        name="i-lucide-book-x"
        class="size-10 text-muted"
      />
      <div>
        <p class="font-medium">
          {{ book.title }}
        </p>
        <p class="mt-1 max-w-md text-sm text-muted">
          {{ missingFiles.length ? t('library.book.filesMissingHint') : t('library.reader.unsupported') }}
        </p>
      </div>
      <ul class="flex flex-wrap items-center justify-center gap-2">
        <li
          v-for="file in files"
          :key="file.id"
        >
          <UButton
            v-if="file.available !== false"
            :to="`/api/library/files/${file.id}/download`"
            external
            icon="i-lucide-download"
            color="neutral"
            variant="soft"
            :label="`${file.format.toUpperCase()} · ${formatBytes(file.size)}`"
          />
          <UBadge
            v-else
            color="error"
            variant="subtle"
            :label="`${file.format.toUpperCase()} · ${t('library.book.fileMissing')}`"
          />
        </li>
      </ul>
      <LibraryConvertFormatButton
        v-if="canEdit && files.length"
        :book-id="id"
        :formats="files.map(file => file.format)"
        variant="soft"
        @converted="refresh"
      />
      <UButton
        v-if="canEdit && missingFiles.length"
        color="warning"
        variant="soft"
        icon="i-lucide-file-plus"
        :label="t('library.upload.attachShort')"
        @click="attachOpen = true"
      />
      <UButton
        :to="`/library/book/${id}`"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        :label="t('library.reader.backToBook')"
      />
    </div>

    <div
      v-else
      class="flex flex-1 items-center justify-center text-muted"
    >
      {{ t('library.messages.notFound') }}
    </div>

    <LibraryBookUploadModal
      v-model:open="attachOpen"
      :book-id="id"
      @uploaded="refresh"
    />
  </div>
</template>
