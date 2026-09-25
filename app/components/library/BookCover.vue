<script setup lang="ts">
/**
 * Library — book cover with a graceful, data-driven fallback.
 *
 * Renders the stored cover image (served through the host file route). When no
 * cover exists — or the image fails to load — a deterministic gradient with a
 * monogram is shown instead, so the grid never looks broken.
 */
const props = withDefaults(defineProps<{
  cover?: string | null
  title: string
  imageClass?: string
}>(), {
  cover: null,
  imageClass: 'h-full w-full object-cover'
})

const failed = ref(false)

const src = computed(() => resolveCover(props.cover))

watch(() => props.cover, () => {
  failed.value = false
})

const gradient = computed(() => coverGradient(props.title))
const initials = computed(() => coverInitials(props.title))
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-muted">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="title"
      loading="lazy"
      :class="imageClass"
      @error="failed = true"
    >
    <div
      v-else
      class="flex h-full w-full items-center justify-center"
      :style="{ background: gradient }"
    >
      <span class="select-none text-2xl font-bold text-white/90">{{ initials }}</span>
    </div>
  </div>
</template>
