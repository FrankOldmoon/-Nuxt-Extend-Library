<script setup lang="ts">
/** Library — browse tags. */
const { t } = useI18n()
const { data: facets } = useLibraryFacets()

const items = computed(() => (facets.value?.tags ?? []).map(tag => ({
  label: `#${tag.tag}`,
  count: tag.count,
  to: `/library?tag=${encodeURIComponent(tag.tag)}`
})))

useSeoMeta({ title: () => t('library.browse.tags') })
</script>

<template>
  <UContainer class="py-10">
    <LibraryHeader />
    <LibraryBrowseList
      :title="t('library.browse.tags')"
      icon="i-lucide-tags"
      :items="items"
    />
  </UContainer>
</template>
