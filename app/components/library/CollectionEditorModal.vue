<script setup lang="ts">
/**
 * Library — create / edit a book list (collection).
 */
import type { LibraryCollection } from '../../composables/useLibrary'

const props = withDefaults(defineProps<{
  open: boolean
  item?: LibraryCollection | null
}>(), {
  item: null
})

const emit = defineEmits<{
  'update:open': [boolean]
  'saved': []
}>()

const { t } = useI18n()
const toast = useToast()

const name = ref('')
const description = ref('')
const isPublic = ref(true)
const saving = ref(false)
const errorMsg = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  errorMsg.value = ''
  name.value = props.item?.name ?? ''
  description.value = props.item?.description ?? ''
  isPublic.value = props.item?.isPublic ?? true
})

async function save() {
  if (!name.value.trim()) {
    errorMsg.value = t('library.collections.name')
    return
  }
  saving.value = true
  errorMsg.value = ''
  try {
    const payload = { name: name.value.trim(), description: description.value.trim() || null, isPublic: isPublic.value }
    if (props.item?.id) {
      await cPut(`/api/library/collections/${props.item.id}`, payload)
    } else {
      await cPost('/api/library/collections', payload)
    }
    toast.add({ title: t('library.collections.created'), color: 'success' })
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('library.messages.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <DashboardCrudFormModal
    :modal-open="open"
    :modal-title="item ? t('library.actions.edit') : t('library.collections.new')"
    :saving="saving"
    :error-msg="errorMsg"
    @update:modal-open="emit('update:open', $event)"
    @save="save"
    @cancel="emit('update:open', false)"
  >
    <template #form>
      <div class="space-y-4">
        <UFormField
          :label="t('library.collections.name')"
          required
        >
          <UInput
            v-model="name"
            :placeholder="t('library.collections.namePlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('library.collections.description')">
          <UTextarea
            v-model="description"
            :rows="3"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('library.editor.isPublic')">
          <USwitch v-model="isPublic" />
        </UFormField>
      </div>
    </template>
  </DashboardCrudFormModal>
</template>
