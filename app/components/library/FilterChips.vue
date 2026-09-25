<script setup lang="ts">
/**
 * Library — facet filter chips for the shelf page.
 *
 * Renders category / format / tag chip rows plus removable badges for the
 * "lookup" filters (author, series, publisher). Emits a single `filter` event
 * so the page owns the URL/state update.
 */
import type { LibraryFacets } from '../../composables/useLibrary'

const props = defineProps<{
  facets: LibraryFacets
  active: Record<string, string | undefined>
}>()

const emit = defineEmits<{
  filter: [key: string, value: string]
  clear: []
}>()

const { t } = useI18n()

const topTags = computed(() => props.facets.tags.slice(0, 16))

const activeLookups = computed(() => {
  const out: Array<{ key: string, label: string, value: string }> = []
  const map: Array<[string, string]> = [
    ['author', t('library.filters.author')],
    ['series', t('library.filters.series')],
    ['publisher', t('library.filters.publisher')]
  ]
  for (const [key, label] of map) {
    const value = props.active[key]
    if (value) out.push({ key, label, value })
  }
  return out
})

function toggle(key: string, value: string, current?: string) {
  emit('filter', key, current === value ? '' : value)
}

const hasAny = computed(() =>
  Boolean(props.active.category || props.active.author || props.active.series
    || props.active.publisher || props.active.tag || props.active.format)
)
</script>

<template>
  <div class="mb-6 space-y-3">
    <!-- Categories -->
    <div
      v-if="facets.categories.length"
      class="flex flex-wrap items-center gap-1.5"
    >
      <UButton
        size="xs"
        color="neutral"
        :variant="!active.category ? 'solid' : 'ghost'"
        :label="t('library.filters.all')"
        @click="emit('filter', 'category', '')"
      />
      <UButton
        v-for="cat in facets.categories"
        :key="cat.id"
        size="xs"
        color="neutral"
        :variant="active.category === String(cat.id) ? 'solid' : 'ghost'"
        :label="`${cat.name} (${cat.count})`"
        @click="toggle('category', String(cat.id), active.category)"
      />
    </div>

    <!-- Formats + tags -->
    <div class="flex flex-wrap items-center gap-1.5">
      <UButton
        v-for="fmt in facets.formats"
        :key="fmt.format"
        size="xs"
        color="info"
        :variant="active.format === fmt.format ? 'solid' : 'soft'"
        class="uppercase"
        :label="`${fmt.format} (${fmt.count})`"
        @click="toggle('format', fmt.format, active.format)"
      />
      <UButton
        v-for="tag in topTags"
        :key="tag.tag"
        size="xs"
        color="primary"
        :variant="active.tag === tag.tag ? 'solid' : 'soft'"
        :label="`#${tag.tag} (${tag.count})`"
        @click="toggle('tag', tag.tag, active.tag)"
      />
    </div>

    <!-- Active lookup filters + clear -->
    <div
      v-if="activeLookups.length || hasAny"
      class="flex flex-wrap items-center gap-1.5"
    >
      <UBadge
        v-for="item in activeLookups"
        :key="item.key"
        color="primary"
        variant="subtle"
        size="sm"
        class="cursor-pointer"
        :label="`${item.label}: ${item.value} ✕`"
        @click="emit('filter', item.key, '')"
      />
      <UButton
        v-if="hasAny"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        :label="t('library.filters.clear')"
        @click="emit('clear')"
      />
    </div>
  </div>
</template>
