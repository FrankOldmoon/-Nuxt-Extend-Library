<script setup lang="ts">
/**
 * Library — the annotation list for the open book.
 *
 * Highlights, notes and plain bookmarks all live in the same table, so this is
 * the reader's single "my marks" panel. Clicking an entry jumps to it.
 */
import type { Annotation } from '../../utils/annotations'

defineProps<{
  items: Annotation[]
  /** Chapter titles, indexed by chapter number. */
  titles: string[]
  activeId: number | null
}>()

const emit = defineEmits<{
  jump: [item: Annotation]
  edit: [item: Annotation]
  remove: [item: Annotation]
  close: []
}>()

const { t } = useI18n()

function chapterLabel(titles: string[], item: Annotation): string {
  return titles[item.chapterIndex] || t('library.reader.chapterOf', { current: item.chapterIndex + 1, total: titles.length })
}
</script>

<template>
  <aside class="lib-anno-panel">
    <header class="lib-anno-panel__head">
      <span class="font-semibold">{{ t('library.annotations.title') }}</span>
      <span class="text-xs text-dimmed">{{ t('library.annotations.count', { count: items.length }) }}</span>
      <UButton
        icon="i-lucide-x"
        size="xs"
        square
        color="neutral"
        variant="ghost"
        :aria-label="t('library.reader.close')"
        @click="emit('close')"
      />
    </header>

    <nav class="lib-anno-panel__list">
      <p
        v-if="!items.length"
        class="px-3 py-10 text-center text-sm text-muted"
      >
        {{ t('library.annotations.empty') }}
      </p>

      <div
        v-for="item in items"
        :key="item.id"
        class="lib-anno-panel__item"
        :class="{ 'is-active': item.id === activeId }"
        role="button"
        tabindex="0"
        @click="emit('jump', item)"
        @keydown.enter="emit('jump', item)"
      >
        <span class="lib-anno-panel__meta">
          <span
            class="lib-anno-panel__dot"
            :style="{ background: annotationInk(item.color) }"
          />
          <UIcon
            v-if="!isRange(item)"
            name="i-lucide-bookmark"
            class="size-3 shrink-0"
          />
          <span class="truncate">{{ chapterLabel(titles, item) }}</span>
          <span class="lib-anno-panel__actions">
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              square
              color="neutral"
              variant="ghost"
              :aria-label="t('library.annotations.editNote')"
              @click.stop="emit('edit', item)"
            />
            <UButton
              icon="i-lucide-trash-2"
              size="xs"
              square
              color="neutral"
              variant="ghost"
              :aria-label="t('library.annotations.remove')"
              @click.stop="emit('remove', item)"
            />
          </span>
        </span>

        <span class="lib-anno-panel__quote">{{ annotationPreview(item) }}</span>
        <span
          v-if="item.note"
          class="lib-anno-panel__note"
        >{{ item.note }}</span>
      </div>
    </nav>
  </aside>
</template>

<style scoped>
.lib-anno-panel {
  position: fixed;
  inset-block: 0;
  right: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  width: 21rem;
  max-width: 92vw;
  background: var(--ui-bg);
  color: var(--ui-text);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}
.lib-anno-panel__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ui-border);
}
.lib-anno-panel__head > :last-child {
  margin-left: auto;
}
.lib-anno-panel__list {
  flex: 1;
  overflow: auto;
  padding: 0.5rem;
}
.lib-anno-panel__item {
  display: block;
  width: 100%;
  padding: 0.5rem 0.6rem;
  border-radius: 0.4rem;
  cursor: pointer;
  transition: background 0.12s ease;
}
.lib-anno-panel__item:hover {
  background: var(--ui-bg-elevated);
}
.lib-anno-panel__item.is-active {
  background: var(--ui-bg-elevated);
  box-shadow: inset 2px 0 0 var(--ui-primary);
}
.lib-anno-panel__meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  color: var(--ui-text-dimmed);
}
.lib-anno-panel__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  flex-shrink: 0;
}
.lib-anno-panel__actions {
  display: flex;
  margin-left: auto;
  gap: 0.1rem;
}
.lib-anno-panel__quote {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.82rem;
  line-height: 1.45;
}
.lib-anno-panel__note {
  display: block;
  margin-top: 0.3rem;
  padding-left: 0.5rem;
  border-left: 2px solid var(--ui-border);
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--ui-text-muted);
  white-space: pre-wrap;
}
</style>
