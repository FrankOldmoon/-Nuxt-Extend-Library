<script setup lang="ts">
/**
 * Library — book card used by the shelf grid / list.
 *
 * Emits `favorite` / `edit` / `delete` / `add-collection` so the parent owns
 * the mutations (and the toast feedback).
 */
import type { LibraryBook } from '../../composables/useLibrary'

const props = withDefaults(defineProps<{
  book: LibraryBook
  view?: 'grid' | 'list'
  favoriting?: boolean
  canEdit?: boolean
}>(), {
  view: 'grid',
  favoriting: false,
  canEdit: false
})

const emit = defineEmits<{
  favorite: [book: LibraryBook]
  edit: [book: LibraryBook]
  delete: [book: LibraryBook]
  addCollection: [book: LibraryBook]
}>()

const { t } = useI18n()

const authors = computed(() => bookAuthorsLabel(props.book))
const rating = computed(() => (props.book.rating != null ? Math.round(props.book.rating * 10) / 10 : null))
const progressPercent = computed(() => Math.round(props.book.progress?.percent ?? 0))

function statusLabel(status: string): string {
  if (status === 'reading') return t('library.status.reading')
  if (status === 'finished') return t('library.status.finished')
  return t('library.status.unread')
}
</script>

<template>
  <div
    class="group flex flex-col overflow-hidden rounded-lg border border-default bg-default transition hover:shadow-lg"
    :class="view === 'list' ? 'sm:flex-row' : ''"
  >
    <!-- Cover (clickable) -->
    <NuxtLink
      :to="`/library/book/${book.id}`"
      class="relative block shrink-0 overflow-hidden bg-muted"
      :class="view === 'list' ? 'aspect-[2/3] w-28 sm:w-32' : 'aspect-[2/3] w-full'"
    >
      <LibraryBookCover
        :cover="book.cover"
        :title="book.title"
      />
      <div class="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
        <UBadge
          v-for="fmt in book.formats.slice(0, 3)"
          :key="fmt"
          color="neutral"
          variant="solid"
          size="sm"
          class="uppercase"
          :label="fmt"
        />
      </div>
      <div
        v-if="book.progress"
        class="absolute bottom-0 left-0 right-0 h-1 bg-black/25"
      >
        <div
          class="h-full bg-primary"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>
    </NuxtLink>

    <!-- Body -->
    <div class="flex flex-1 flex-col p-3">
      <div class="flex items-start justify-between gap-2">
        <NuxtLink
          :to="`/library/book/${book.id}`"
          class="line-clamp-2 font-semibold text-highlighted hover:text-primary"
        >
          {{ book.title }}
        </NuxtLink>
        <UButton
          icon="i-lucide-heart"
          size="xs"
          square
          color="neutral"
          :variant="book.favorited ? 'solid' : 'ghost'"
          :class="book.favorited ? 'text-error' : ''"
          :loading="favoriting"
          :title="book.favorited ? t('library.actions.unfavorite') : t('library.actions.favorite')"
          @click.stop="emit('favorite', book)"
        />
      </div>

      <p class="mt-1 line-clamp-1 text-xs text-muted">
        {{ authors || t('library.book.unknownAuthor') }}
      </p>

      <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dimmed">
        <span
          v-if="book.series"
          class="inline-flex items-center gap-1"
        >
          <UIcon
            name="i-lucide-library"
            class="size-3.5"
          />
          {{ book.series.name }}<template v-if="book.seriesIndex"> #{{ book.seriesIndex }}</template>
        </span>
        <span
          v-if="rating != null"
          class="inline-flex items-center gap-1 text-warning"
        >
          <UIcon
            name="i-lucide-star"
            class="size-3.5"
          />
          {{ rating }}
        </span>
        <span
          v-if="book.progress"
          class="inline-flex items-center gap-1"
        >
          <UIcon
            name="i-lucide-bookmark-check"
            class="size-3.5"
          />
          {{ statusLabel(book.progress.status) }}
        </span>
      </div>

      <div class="mt-auto flex items-center gap-1 pt-3">
        <UButton
          v-if="book.primaryFileId"
          :to="`/library/read/${book.id}`"
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-book-open"
          :label="t('library.actions.read')"
        />
        <UButton
          :to="`/library/book/${book.id}`"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-info"
          :title="t('library.actions.details')"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-list-plus"
          :title="t('library.actions.addToCollection')"
          @click.stop="emit('addCollection', book)"
        />
        <UButton
          v-if="canEdit"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-pencil"
          :title="t('library.actions.edit')"
          @click.stop="emit('edit', book)"
        />
        <BaseConfirmButton
          v-if="canEdit"
          size="xs"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          :title="t('library.actions.delete')"
          :confirm-text="t('library.messages.confirmDelete')"
          @confirm="emit('delete', book)"
        />
      </div>
    </div>
  </div>
</template>
