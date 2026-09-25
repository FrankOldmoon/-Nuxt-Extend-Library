<script setup lang="ts">
/**
 * Library — "convert format" action.
 *
 * The available targets come from the server (`/api/library/convert/options`)
 * so the menu reflects what this installation can really do: built-in
 * conversions always, everything else only when Calibre is installed.
 */
const props = withDefaults(defineProps<{
  bookId: number
  /** Formats the book already has — excluded from the menu. */
  formats?: string[]
  fileId?: number | null
  size?: 'xs' | 'sm' | 'md'
  variant?: 'solid' | 'soft' | 'ghost' | 'outline'
  block?: boolean
}>(), {
  formats: () => [],
  fileId: null,
  size: 'sm',
  variant: 'soft',
  block: false
})

const emit = defineEmits<{ converted: [format: string] }>()

const { t } = useI18n()
const toast = useToast()
const converting = ref('')

const { data: options } = useAsyncData('library:convert:options', () =>
  cGet<{ targets: string[], native: Record<string, string[]>, calibre: boolean, calibreEnabled: boolean }>(
    '/api/library/convert/options'
  ))

/** Prefer an EPUB as the conversion source (richest input). */
const sourceFormat = computed(() => {
  const list = props.formats ?? []
  return list.includes('epub') ? 'epub' : (list[0] ?? '')
})

const nativeTargets = computed(() => options.value?.native?.[sourceFormat.value] ?? [])

const menuItems = computed(() => {
  const opts = options.value
  if (!opts || !sourceFormat.value) return []
  // Without Calibre only the built-in pairs are offered.
  const targets = opts.calibre ? opts.targets : nativeTargets.value
  return targets
    .filter(target => target !== sourceFormat.value && !(props.formats ?? []).includes(target))
    .map(target => ({
      label: nativeTargets.value.includes(target)
        ? target.toUpperCase()
        : `${target.toUpperCase()} · Calibre`,
      onSelect: () => {
        void convert(target)
      }
    }))
})

const hint = computed(() => {
  const list = nativeTargets.value
  return list.length ? t('library.convert.nativeNote', { list: list.join(' / ').toUpperCase() }) : ''
})

async function convert(target: string) {
  converting.value = target
  try {
    await cPost(`/api/library/books/${props.bookId}/convert`, {
      to: target,
      ...(props.fileId ? { fileId: props.fileId } : {})
    })
    toast.add({ title: t('library.convert.done', { format: target.toUpperCase() }), color: 'success' })
    emit('converted', target)
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.convert.failed')), color: 'error' })
  } finally {
    converting.value = ''
  }
}
</script>

<template>
  <UDropdownMenu
    v-if="menuItems.length"
    :items="menuItems"
    :content="{ align: 'end' }"
    :ui="{ content: 'min-w-40' }"
  >
    <UButton
      icon="i-lucide-refresh-cw"
      color="neutral"
      :size="size"
      :variant="variant"
      :block="block"
      :loading="Boolean(converting)"
      :label="t('library.convert.action')"
      :title="hint || t('library.convert.hint')"
    />
  </UDropdownMenu>
</template>
