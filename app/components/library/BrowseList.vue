<script setup lang="ts">
/**
 * Library — generic browse list (authors / series / publishers / tags).
 */
withDefaults(defineProps<{
  title: string
  icon?: string
  items: Array<{ label: string, count: number, to: string }>
  emptyText?: string
}>(), {
  icon: 'i-lucide-list',
  emptyText: ''
})

const { t } = useI18n()
</script>

<template>
  <section>
    <div class="mb-4 flex items-center gap-2">
      <UIcon
        :name="icon"
        class="size-5 text-primary"
      />
      <h2 class="text-xl font-semibold">
        {{ title }}
      </h2>
      <UBadge
        color="neutral"
        variant="subtle"
        size="sm"
        :label="String(items.length)"
      />
    </div>

    <p
      v-if="!items.length"
      class="py-12 text-center text-muted"
    >
      {{ emptyText || t('library.browse.empty') }}
    </p>

    <div
      v-else
      class="flex flex-wrap gap-2"
    >
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="inline-flex items-center gap-2 rounded-full border border-default px-3 py-1.5 text-sm transition hover:border-primary hover:text-primary"
      >
        <span class="max-w-[16rem] truncate">{{ item.label }}</span>
        <span class="rounded-full bg-elevated px-1.5 text-xs text-dimmed">{{ item.count }}</span>
      </NuxtLink>
    </div>
  </section>
</template>
