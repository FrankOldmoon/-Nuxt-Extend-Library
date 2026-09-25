<script setup lang="ts">
/** Library — browse series. */
const { t } = useI18n()
const { data: facets } = useLibraryFacets()

const items = computed(() => (facets.value?.series ?? []).map(s => ({
  label: s.name,
  count: s.count,
  to: `/library?series=${encodeURIComponent(s.name)}`
})))

useSeoMeta({ title: () => t('library.browse.series') })
</script>

<template>
  <UContainer class="py-10">
    <LibraryHeader />
    <LibraryBrowseList
      :title="t('library.browse.series')"
      icon="i-lucide-library"
      :items="items"
    />
  </UContainer>
</template>
