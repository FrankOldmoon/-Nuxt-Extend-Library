<script setup lang="ts">
/**
 * Library — page header + section navigation, shared by every library page.
 */
withDefaults(defineProps<{
  showUpload?: boolean
  showAdd?: boolean
}>(), {
  showUpload: false,
  showAdd: false
})

const emit = defineEmits<{
  upload: []
  add: []
}>()

const { t } = useI18n()
const route = useRoute()

const links = computed(() => [
  { key: 'books', to: '/library', icon: 'i-lucide-layout-grid', label: t('library.allBooks') },
  { key: 'shelf', to: '/library/shelf', icon: 'i-lucide-bookmark', label: t('library.shelf.title') },
  { key: 'collections', to: '/library/collections', icon: 'i-lucide-list', label: t('library.collections.title') },
  { key: 'authors', to: '/library/authors', icon: 'i-lucide-user-pen', label: t('library.browse.authors') },
  { key: 'series', to: '/library/series', icon: 'i-lucide-library', label: t('library.browse.series') },
  { key: 'publishers', to: '/library/publishers', icon: 'i-lucide-building-2', label: t('library.browse.publishers') },
  { key: 'tags', to: '/library/tags', icon: 'i-lucide-tags', label: t('library.browse.tags') }
])

function isActive(to: string): boolean {
  if (to === '/library') return route.path === '/library'
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">
        {{ t('library.title') }}
      </h1>
      <p class="mt-1 text-muted">
        {{ t('library.subtitle') }}
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        v-if="showUpload"
        icon="i-lucide-upload"
        color="primary"
        :label="t('library.actions.upload')"
        @click="emit('upload')"
      />
      <UButton
        v-if="showAdd"
        icon="i-lucide-plus"
        color="neutral"
        variant="soft"
        :label="t('library.actions.addBook')"
        @click="emit('add')"
      />
    </div>
  </header>

  <nav class="mb-6 flex flex-wrap gap-1.5 border-b border-default pb-3">
    <UButton
      v-for="link in links"
      :key="link.key"
      :to="link.to"
      size="sm"
      :icon="link.icon"
      :label="link.label"
      :color="isActive(link.to) ? 'primary' : 'neutral'"
      :variant="isActive(link.to) ? 'soft' : 'ghost'"
    />
  </nav>
</template>
