<script setup lang="ts">
/**
 * Library — native in-browser viewer for PDF / plain-text formats.
 *
 * Rather than reimplementing a document renderer, this embeds the file through
 * the module's authenticated `?inline=1` download route and lets the browser's
 * built-in viewer provide paging, zoom, search and printing. Opening the book
 * also marks it as "reading" so it appears on the shelf.
 */
const props = defineProps<{
  bookId: number
  fileId: number
  title: string
  format: string
}>()

const { t } = useI18n()

const inlineUrl = computed(() => `/api/library/files/${props.fileId}/download?inline=1`)
const downloadUrl = computed(() => `/api/library/files/${props.fileId}/download`)

onMounted(async () => {
  try {
    await cPut('/api/library/progress', { bookId: props.bookId, status: 'reading' })
  } catch {
    /* marking the shelf is best-effort */
  }
})
</script>

<template>
  <div class="flex h-full flex-col bg-default">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-3 py-2">
      <div class="flex min-w-0 items-center gap-2">
        <UButton
          :to="`/library/book/${bookId}`"
          icon="i-lucide-arrow-left"
          size="sm"
          color="neutral"
          variant="ghost"
          :title="t('library.reader.backToBook')"
        />
        <UBadge
          color="neutral"
          variant="subtle"
          size="sm"
          class="uppercase"
          :label="format"
        />
        <span class="truncate text-sm text-muted">{{ title }}</span>
      </div>

      <div class="flex items-center gap-1">
        <span class="hidden text-xs text-dimmed lg:inline">{{ t('library.reader.nativeHint') }}</span>
        <UButton
          :to="inlineUrl"
          external
          target="_blank"
          icon="i-lucide-external-link"
          size="sm"
          color="neutral"
          variant="ghost"
          :title="t('library.reader.openInNewTab')"
        />
        <UButton
          :to="downloadUrl"
          external
          icon="i-lucide-download"
          size="sm"
          color="neutral"
          variant="soft"
          :label="t('library.actions.download')"
        />
      </div>
    </header>

    <iframe
      :src="inlineUrl"
      :title="title"
      class="min-h-0 w-full flex-1 border-0 bg-white"
    />
  </div>
</template>
