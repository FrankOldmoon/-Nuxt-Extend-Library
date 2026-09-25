<script setup lang="ts">
/** Library — browse publishers. */
const { t } = useI18n()
const { data: facets } = useLibraryFacets()

const items = computed(() => (facets.value?.publishers ?? []).map(p => ({
  label: p.name,
  count: p.count,
  to: `/library?publisher=${encodeURIComponent(p.name)}`
})))

useSeoMeta({ title: () => t('library.browse.publishers') })
</script>

<template>
  <UContainer class="py-10">
    <LibraryHeader />
    <LibraryBrowseList
      :title="t('library.browse.publishers')"
      icon="i-lucide-building-2"
      :items="items"
    />
  </UContainer>
</template>
