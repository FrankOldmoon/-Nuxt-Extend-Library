<script setup lang="ts">
/**
 * Library — mindmap viewer at `/mindmap/:id`.
 *
 * Full-screen markmap view of a book's outline. The markmap libraries (d3 +
 * markmap-lib + markmap-view) are heavy, so they are loaded lazily via dynamic
 * import on the client only — SSR only delivers the outline metadata.
 *
 * Rendering options mirror the offline single-file viewer:
 * only 3 levels expanded initially (large outlines are unreadable when fully
 * expanded), auto-fit, click a node circle to expand further.
 */
import type { Markmap } from 'markmap-view'

definePageMeta({ layout: false })

const { t } = useI18n()
const route = useRoute()
const id = Number(route.params.id)

const { data: mindmap, status, error } = useLibraryMindmap(id)

const wrapEl = ref<HTMLDivElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
let mm: Markmap | null = null
let renderToken = 0

/** Read the Nuxt UI primary color so nodes follow the active theme. */
function primaryColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--ui-primary').trim() || '#10b981'
}

async function render() {
  const md = mindmap.value?.content
  const svg = svgEl.value
  if (!md || !svg) return
  const token = ++renderToken
  try {
    // Client-only lazy load: keeps d3/markmap out of the SSR bundle.
    const [{ Transformer }, { Markmap: MarkmapCtor }] = await Promise.all([
      import('markmap-lib'),
      import('markmap-view')
    ])
    const { root } = new Transformer().transform(md)
    // Another render started (or the page unmounted) while we transformed — bail.
    if (token !== renderToken) return
    mm?.destroy?.()
    mm = MarkmapCtor.create(svg, {
      color: primaryColor,
      colorFreezeLevel: 1,
      initialExpandLevel: 3,
      autoFit: true,
      spacingVertical: 12,
      spacingHorizontal: 78,
      maxWidth: 220,
      duration: 260
    }, root)
    setTimeout(() => mm?.fit?.(), 120)
    setTimeout(() => mm?.fit?.(), 520)
  } catch (e) {
    console.error('[library:mindmap] render failed:', e)
  }
}

onMounted(render)
// flush:'post' is required: during client-side navigation the data resolves
// *after* mount, so the pending branch is showing and the <svg> does not
// exist yet. With the default 'pre' flush this watcher would fire before the
// DOM update, find svgEl still null, and bail — which is why navigating here
// rendered nothing while a hard refresh (SSR delivers data pre-mount) worked.
watch(mindmap, render, { flush: 'post' })

onBeforeUnmount(() => {
  renderToken++
  try { mm?.destroy?.() } catch { /* already gone */ }
  mm = null
})

// Debounced refit on resize — the layout does not change, only the viewport.
let resizeTimer: ReturnType<typeof setTimeout> | undefined
function onResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => mm?.fit?.(), 200)
}
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => {
  clearTimeout(resizeTimer)
  window.removeEventListener('resize', onResize)
})

useSeoMeta(() => ({ title: () => `${t('library.mindmap.title')} · ${mindmap.value?.bookTitle ?? t('library.title')}` }))
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-default">
    <!-- Top bar -->
    <div class="flex items-center gap-3 border-b border-default bg-default px-3 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))]">
      <UButton
        :to="`/book/${id}`"
        icon="i-lucide-arrow-left"
        :label="t('library.mindmap.backToBook')"
        color="neutral"
        variant="soft"
        size="sm"
      />
      <span class="min-w-0 flex-1 truncate font-semibold text-highlighted">
        {{ mindmap?.bookTitle || t('library.mindmap.title') }}
      </span>
      <!-- 导图统计徽标：节点 / 域 / 卡 -->
      <div
        v-if="mindmap"
        class="hidden items-center gap-2 text-xs text-dimmed sm:flex"
      >
        <UBadge
          color="neutral"
          variant="subtle"
          :label="`${mindmap.nodes} ${t('library.mindmap.nodes')}`"
        />
        <UBadge
          color="neutral"
          variant="subtle"
          :label="`${mindmap.domains} ${t('library.mindmap.domains')}`"
        />
        <UBadge
          v-if="mindmap.cards"
          color="neutral"
          variant="subtle"
          :label="`${mindmap.cards} ${t('library.mindmap.cards')}`"
        />
      </div>
    </div>

    <!-- Completeness note -->
    <div
      v-if="mindmap?.note"
      class="mx-3 mt-2 max-h-32 overflow-auto rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-default"
    >
      <UIcon
        name="i-lucide-triangle-alert"
        class="mr-1 inline-block size-3.5 align-[-2px] text-warning"
      />
      <span class="whitespace-pre-line">{{ mindmap.note }}</span>
    </div>

    <!-- Canvas -->
    <div
      ref="wrapEl"
      class="relative min-h-0 flex-1 overflow-hidden"
    >
      <div
        v-if="status === 'pending'"
        class="absolute inset-0 flex items-center justify-center text-sm text-muted"
      >
        {{ t('library.mindmap.loading') }}
      </div>
      <div
        v-else-if="error || !mindmap"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted"
      >
        <UIcon
          name="i-lucide-git-fork"
          class="size-8 opacity-50"
        />
        <p>{{ error?.statusCode === 404 ? t('library.mindmap.notFound') : t('library.mindmap.loadFailed') }}</p>
        <UButton
          :to="`/book/${id}`"
          :label="t('library.mindmap.backToBook')"
          color="neutral"
          variant="soft"
          size="sm"
        />
      </div>
      <template v-else>
        <svg
          ref="svgEl"
          class="block h-full w-full"
        />
        <div class="pointer-events-none absolute bottom-3 left-3 rounded-md bg-elevated/80 px-2 py-1 text-[11px] text-dimmed">
          {{ t('library.mindmap.hint') }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
svg :deep(.markmap-foreign) {
  font-family: "PingFang SC", "Microsoft YaHei", -apple-system, sans-serif;
}
</style>
