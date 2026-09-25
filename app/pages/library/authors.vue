<script setup lang="ts">
/** Library — browse authors. */
const { t } = useI18n()
const { data: facets } = useLibraryFacets()

const items = computed(() => (facets.value?.authors ?? []).map(a => ({
  label: a.name,
  count: a.count,
  to: `/library?author=${encodeURIComponent(a.name)}`
})))

useSeoMeta({ title: () => t('library.browse.authors') })
</script>

<template>
  <UContainer class="py-10">
    <LibraryHeader />
    <LibraryBrowseList
      :title="t('library.browse.authors')"
      icon="i-lucide-user-pen"
      :items="items"
    />
  </UContainer>
</template>
