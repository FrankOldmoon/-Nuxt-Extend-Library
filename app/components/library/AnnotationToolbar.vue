<script setup lang="ts">
/**
 * Library — the floating annotation toolbar.
 *
 * Shown for a fresh text selection (create) or for an existing highlight (edit).
 * Picking a colour or a line style applies straight away and the toolbar stays
 * open, so both dimensions can be combined on the same annotation — or a plain
 * colour pick can be a single click and nothing else.
 */
const props = defineProps<{
  /** Viewport-space anchor of the selection / highlight; `null` hides it. */
  anchor: { left: number, top: number, bottom: number } | null
  style: string
  color: string
  /** The quoted text, for the header. */
  quoted: string
  hasNote: boolean
  /** True when the toolbar targets an existing annotation (enables delete). */
  existing: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  apply: [value: { style: string, color: string }]
  editNote: []
  remove: []
}>()

const { t } = useI18n()

const BAR_WIDTH = 296

/** Keep the bar on screen and flip it below the selection near the top edge. */
const placement = computed(() => {
  const anchor = props.anchor
  if (!anchor) return { left: '0px', top: '0px', below: false }
  const viewport = import.meta.client ? window.innerWidth : 1280
  const left = Math.min(Math.max(8, anchor.left - BAR_WIDTH / 2), Math.max(8, viewport - BAR_WIDTH - 8))
  const below = anchor.top < 120
  return {
    left: `${left}px`,
    top: below ? `${anchor.bottom + 10}px` : `${anchor.top - 10}px`,
    below
  }
})
</script>

<template>
  <div
    v-if="anchor"
    class="lib-anno-bar"
    :style="{
      left: placement.left,
      top: placement.top,
      transform: placement.below ? 'none' : 'translateY(-100%)'
    }"
    :aria-busy="busy ? 'true' : 'false'"
    @mousedown.prevent
  >
    <p class="lib-anno-bar__quote">
      {{ quoted || t('library.annotations.emptyQuote') }}
    </p>

    <div class="lib-anno-bar__row">
      <button
        v-for="option in ANNOTATION_COLORS"
        :key="option.key"
        type="button"
        class="lib-anno-bar__swatch"
        :class="{ 'is-active': option.key === color }"
        :style="{ background: option.wash, borderColor: option.ink }"
        :title="t(option.labelKey)"
        :aria-label="t(option.labelKey)"
        @click="emit('apply', { style, color: option.key })"
      />
    </div>

    <div class="lib-anno-bar__row">
      <button
        v-for="option in ANNOTATION_STYLES"
        :key="option.key"
        type="button"
        class="lib-anno-bar__style"
        :class="{ 'is-active': option.key === style }"
        :style="annotationVars(color)"
        :title="t(option.labelKey)"
        :aria-label="t(option.labelKey)"
        @click="emit('apply', { style: option.key, color })"
      >
        <UIcon
          :name="option.icon"
          class="size-4"
        />
      </button>

      <span class="lib-anno-bar__gap" />

      <button
        type="button"
        class="lib-anno-bar__action"
        :title="hasNote ? t('library.annotations.editNote') : t('library.annotations.note')"
        @click="emit('editNote')"
      >
        <UIcon
          name="i-lucide-notebook-pen"
          class="size-4"
        />
        <span>{{ hasNote ? t('library.annotations.editNote') : t('library.annotations.note') }}</span>
      </button>

      <button
        v-if="existing"
        type="button"
        class="lib-anno-bar__action is-danger"
        :title="t('library.annotations.remove')"
        :aria-label="t('library.annotations.remove')"
        @click="emit('remove')"
      >
        <UIcon
          name="i-lucide-trash-2"
          class="size-4"
        />
      </button>
    </div>
  </div>
</template>

<style scoped>
.lib-anno-bar {
  position: fixed;
  z-index: 60;
  width: 296px;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.6rem;
  background: var(--ui-bg);
  color: var(--ui-text);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
}
.lib-anno-bar__quote {
  margin-bottom: 0.45rem;
  max-height: 2.6em;
  overflow: hidden;
  font-size: 0.72rem;
  line-height: 1.3;
  color: var(--ui-text-dimmed);
}
.lib-anno-bar__row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.lib-anno-bar__row + .lib-anno-bar__row {
  margin-top: 0.4rem;
}
.lib-anno-bar__swatch {
  width: 1.5rem;
  height: 1.5rem;
  border: 1.5px solid transparent;
  border-radius: 9999px;
  transition: transform 0.12s ease;
}
.lib-anno-bar__swatch:hover {
  transform: scale(1.12);
}
.lib-anno-bar__swatch.is-active {
  box-shadow: 0 0 0 2px var(--ui-bg), 0 0 0 4px var(--ui-primary);
}
.lib-anno-bar__style {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 0.4rem;
  color: var(--ui-text-muted);
}
.lib-anno-bar__style:hover {
  background: var(--ui-bg-elevated);
}
.lib-anno-bar__style.is-active {
  background: var(--ui-bg-elevated);
  color: var(--anno-ink);
  box-shadow: inset 0 0 0 1px var(--anno-ink);
}
.lib-anno-bar__gap {
  flex: 1;
}
.lib-anno-bar__action {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.45rem;
  border-radius: 0.4rem;
  font-size: 0.72rem;
  color: var(--ui-text-muted);
}
.lib-anno-bar__action:hover {
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
}
.lib-anno-bar__action.is-danger:hover {
  color: var(--ui-error);
}
</style>
