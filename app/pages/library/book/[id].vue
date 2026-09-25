<script setup lang="ts">
/**
 * Library — book detail at `/library/book/:id`.
 *
 * Metadata, description, tags, attached files (download / inline preview) and
 * the primary actions (read online, favourite, edit, delete, add to list).
 */
import type { LibraryBook } from '../../../composables/useLibrary'

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const { isLoggedIn } = useAuth()

const id = Number(route.params.id)
const { data, status, refresh } = useLibraryBook(id)
const { data: facets } = useLibraryFacets()

const book = computed<LibraryBook | null>(() => data.value?.book ?? null)
const files = computed(() => data.value?.files ?? [])
const canEdit = computed(() => data.value?.canEdit ?? false)
const missingFiles = computed(() => files.value.filter(file => file.available === false))
const authors = computed(() => (book.value ? bookAuthorsLabel(book.value) : null))
const canRead = computed(() => files.value.some(file => file.available !== false && canReadInline(file)))

const editorOpen = ref(false)
const attachOpen = ref(false)
const collectionOpen = ref(false)
const favoriting = ref(false)

async function toggleFavorite() {
  if (!book.value) return
  favoriting.value = true
  try {
    await cPost('/api/library/favorites', { bookId: book.value.id })
    await refresh()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.favoriteFailed')), color: 'error' })
  } finally {
    favoriting.value = false
  }
}

async function removeBook() {
  if (!book.value) return
  try {
    await cDelete(`/api/library/books/${book.value.id}`)
    toast.add({ title: t('library.messages.deleted'), color: 'success' })
    await navigateTo('/library')
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.deleteFailed')), color: 'error' })
  }
}

useSeoMeta(() => ({ title: () => book.value?.title ?? t('library.title') }))
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/library"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      size="sm"
      :label="t('library.allBooks')"
      class="mb-6"
    />

    <!-- The ebook bytes are gone, so reading/downloading cannot work until a
         replacement file is attached. -->
    <div
      v-if="missingFiles.length"
      class="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      <UIcon
        name="i-lucide-file-warning"
        class="size-5 shrink-0 text-warning"
      />
      <span class="flex-1 text-default">{{ t('library.book.filesMissingHint') }}</span>
      <UButton
        v-if="canEdit"
        size="xs"
        color="warning"
        variant="soft"
        icon="i-lucide-file-plus"
        :label="t('library.upload.attachShort')"
        @click="attachOpen = true"
      />
    </div>

    <div
      v-if="status === 'pending'"
      class="grid gap-8 md:grid-cols-[220px_1fr]"
    >
      <div class="aspect-[2/3] animate-pulse rounded-lg bg-muted/60" />
      <div class="space-y-4">
        <div class="h-8 w-2/3 animate-pulse rounded bg-muted/60" />
        <div class="h-4 w-1/3 animate-pulse rounded bg-muted/40" />
        <div class="h-32 animate-pulse rounded bg-muted/40" />
      </div>
    </div>

    <p
      v-else-if="!book"
      class="py-16 text-center text-muted"
    >
      {{ t('library.messages.notFound') }}
    </p>

    <template v-else>
      <div class="grid gap-8 md:grid-cols-[220px_1fr]">
        <!-- Cover -->
        <div class="mx-auto w-40 md:mx-0 md:w-full">
          <div class="aspect-[2/3] overflow-hidden rounded-lg border border-default shadow-sm">
            <LibraryBookCover
              :cover="book.cover"
              :title="book.title"
            />
          </div>
          <div class="mt-3 flex flex-wrap gap-1">
            <UBadge
              v-for="fmt in book.formats"
              :key="fmt"
              color="neutral"
              variant="subtle"
              size="sm"
              class="uppercase"
              :label="fmt"
            />
          </div>
        </div>

        <!-- Meta -->
        <div>
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 class="text-2xl font-bold tracking-tight">
                {{ book.title }}
              </h1>
              <p
                v-if="book.subtitle"
                class="mt-1 text-muted"
              >
                {{ book.subtitle }}
              </p>
              <p class="mt-2 text-sm text-muted">
                <template v-if="authors">
                  <NuxtLink
                    v-for="(a, i) in book.authors"
                    :key="a.id"
                    :to="`/library?author=${encodeURIComponent(a.name)}`"
                    class="text-primary hover:underline"
                  >{{ a.name }}<span v-if="i < book.authors.length - 1">, </span></NuxtLink>
                </template>
                <template v-else>
                  {{ t('library.book.unknownAuthor') }}
                </template>
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-if="canRead"
                :to="`/library/read/${book.id}`"
                icon="i-lucide-book-open"
                color="primary"
                :label="t('library.actions.read')"
              />
              <UButton
                v-if="isLoggedIn"
                icon="i-lucide-heart"
                color="neutral"
                :variant="book.favorited ? 'solid' : 'soft'"
                :loading="favoriting"
                :label="book.favorited ? t('library.actions.unfavorite') : t('library.actions.favorite')"
                @click="toggleFavorite"
              />
              <UButton
                v-if="isLoggedIn"
                icon="i-lucide-list-plus"
                color="neutral"
                variant="soft"
                :label="t('library.actions.addToCollection')"
                @click="collectionOpen = true"
              />
              <UButton
                v-if="canEdit"
                icon="i-lucide-pencil"
                color="neutral"
                variant="soft"
                :label="t('library.actions.edit')"
                @click="editorOpen = true"
              />
              <UButton
                v-if="canEdit"
                icon="i-lucide-file-plus"
                color="neutral"
                variant="soft"
                :label="t('library.upload.attachShort')"
                @click="attachOpen = true"
              />
              <LibraryConvertFormatButton
                v-if="canEdit"
                :book-id="book.id"
                :formats="book.formats"
                @converted="refresh"
              />
              <BaseConfirmButton
                v-if="canEdit"
                icon="i-lucide-trash-2"
                color="error"
                variant="soft"
                :label="t('library.actions.delete')"
                :confirm-text="t('library.messages.confirmDelete')"
                @confirm="removeBook"
              />
            </div>
          </div>

          <!-- Fact table -->
          <dl class="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div
              v-if="book.series"
              class="col-span-1"
            >
              <dt class="text-dimmed">
                {{ t('library.book.series') }}
              </dt>
              <dd>
                <NuxtLink
                  :to="`/library?series=${encodeURIComponent(book.series.name)}`"
                  class="text-primary hover:underline"
                >
                  {{ book.series.name }}<template v-if="book.seriesIndex"> #{{ book.seriesIndex }}</template>
                </NuxtLink>
              </dd>
            </div>
            <div v-if="book.publisher">
              <dt class="text-dimmed">
                {{ t('library.book.publisher') }}
              </dt>
              <dd>
                <NuxtLink
                  :to="`/library?publisher=${encodeURIComponent(book.publisher.name)}`"
                  class="text-primary hover:underline"
                >
                  {{ book.publisher.name }}
                </NuxtLink>
              </dd>
            </div>
            <div v-if="book.pubdate">
              <dt class="text-dimmed">
                {{ t('library.book.published') }}
              </dt>
              <dd>{{ formatLibraryDate(book.pubdate) }}</dd>
            </div>
            <div v-if="book.isbn">
              <dt class="text-dimmed">
                {{ t('library.book.isbn') }}
              </dt>
              <dd>{{ book.isbn }}</dd>
            </div>
            <div v-if="book.language">
              <dt class="text-dimmed">
                {{ t('library.book.language') }}
              </dt>
              <dd>{{ book.language }}</dd>
            </div>
            <div v-if="book.pages">
              <dt class="text-dimmed">
                {{ t('library.book.pages') }}
              </dt>
              <dd>{{ book.pages }}</dd>
            </div>
            <div v-if="book.rating != null">
              <dt class="text-dimmed">
                {{ t('library.book.rating') }}
              </dt>
              <dd class="inline-flex items-center gap-1">
                <UIcon
                  name="i-lucide-star"
                  class="size-4 text-warning"
                />{{ book.rating }}
              </dd>
            </div>
            <div>
              <dt class="text-dimmed">
                {{ t('library.book.formats') }}
              </dt>
              <dd class="uppercase">
                {{ book.formats.join(', ') || '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-dimmed">
                {{ t('library.book.addedAt') }}
              </dt>
              <dd>{{ formatLibraryDate(book.createdAt) }}</dd>
            </div>
          </dl>

          <div
            v-if="book.progress"
            class="mt-5"
          >
            <div class="mb-1 flex items-center justify-between text-xs text-muted">
              <span>{{ t('library.book.progress') }}</span>
              <span>{{ Math.round(book.progress.percent) }}%</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-elevated">
              <div
                class="h-full bg-primary"
                :style="{ width: `${Math.min(100, book.progress.percent)}%` }"
              />
            </div>
          </div>

          <!-- Tags -->
          <div
            v-if="book.tags.length"
            class="mt-5 flex flex-wrap gap-1.5"
          >
            <UButton
              v-for="tag in book.tags"
              :key="tag"
              :to="`/library?tag=${encodeURIComponent(tag)}`"
              size="xs"
              color="primary"
              variant="soft"
              :label="`#${tag}`"
            />
          </div>
        </div>
      </div>

      <!-- Description -->
      <section class="mt-10">
        <h2 class="mb-3 text-lg font-semibold">
          {{ t('library.book.description') }}
        </h2>
        <p class="whitespace-pre-line text-default">
          {{ book.description || t('library.book.noDescription') }}
        </p>
      </section>

      <!-- Files -->
      <section class="mt-10">
        <h2 class="mb-3 text-lg font-semibold">
          {{ t('library.book.files') }}
        </h2>
        <p
          v-if="!files.length"
          class="text-muted"
        >
          —
        </p>
        <ul
          v-else
          class="divide-y divide-default rounded-lg border border-default"
        >
          <li
            v-for="file in files"
            :key="file.id"
            class="flex flex-wrap items-center gap-3 px-4 py-3"
          >
            <UIcon
              name="i-lucide-file-text"
              class="size-5 text-primary"
            />
            <span class="flex-1 truncate text-sm">{{ file.originalName }}</span>
            <UBadge
              color="neutral"
              variant="subtle"
              size="sm"
              class="uppercase"
              :label="file.format"
            />
            <span class="text-xs text-dimmed">{{ formatBytes(file.size) }}</span>
            <template v-if="file.available !== false">
              <UButton
                :to="`/api/library/files/${file.id}/download`"
                external
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-download"
                :label="t('library.actions.download')"
              />
              <UButton
                v-if="file.format === 'pdf'"
                :to="`/api/library/files/${file.id}/download?inline=1`"
                external
                target="_blank"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-eye"
              />
            </template>
            <UBadge
              v-else
              color="error"
              variant="subtle"
              size="sm"
              :label="t('library.book.fileMissing')"
            />
          </li>
        </ul>
      </section>

      <LibraryBookEditorModal
        v-model:open="editorOpen"
        mode="update"
        :item="book"
        :categories="facets?.categories ?? []"
        @saved="refresh"
      />
      <LibraryBookUploadModal
        v-model:open="attachOpen"
        :book-id="book.id"
        @uploaded="refresh"
      />
      <LibraryAddToCollectionModal
        :open="collectionOpen"
        :book-id="book.id"
        @update:open="collectionOpen = $event"
        @added="refreshNuxtData('library:collections')"
      />
    </template>
  </UContainer>
</template>
