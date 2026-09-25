/**
 * Library — reader annotations.
 *
 * Owns the book's highlights/notes and their CRUD against
 * `/api/library/bookmarks`, so the reader component only has to paint ranges and
 * turn a DOM selection into character offsets.
 */
import type { Annotation } from '../utils/annotations'

/** A brand-new highlight, already resolved to character offsets. */
export interface AnnotationDraft {
  chapterIndex: number
  startOffset: number
  endOffset: number
  text: string
  style: string
  color: string
  percent: number
}

/** A partial update: only the keys present are written. */
export type AnnotationPatch = {
  style?: string
  color?: string
  note?: string | null
}

/** Reading order: chapter, then position in the chapter, then creation. */
function byPosition(a: Annotation, b: Annotation): number {
  return a.chapterIndex - b.chapterIndex
    || (a.startOffset ?? 0) - (b.startOffset ?? 0)
    || a.id - b.id
}

export function useReaderAnnotations(bookId: number) {
  const items = ref<Annotation[]>([])
  const loading = ref(false)
  const saving = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      const res = await cGet<{ items: Annotation[] }>(`/api/library/bookmarks?bookId=${bookId}`)
      items.value = [...(res.items ?? [])].sort(byPosition)
    } catch {
      items.value = []
    } finally {
      loading.value = false
    }
  }

  async function create(draft: AnnotationDraft): Promise<Annotation | null> {
    saving.value = true
    try {
      const res = await cPost<{ bookmark: Annotation }>('/api/library/bookmarks', {
        bookId,
        type: 'highlight',
        ...draft
      })
      const row = res.bookmark ?? null
      if (row) items.value = [...items.value, row].sort(byPosition)
      return row
    } finally {
      saving.value = false
    }
  }

  async function update(id: number, patch: AnnotationPatch): Promise<Annotation | null> {
    saving.value = true
    try {
      const res = await cPut<{ bookmark: Annotation }>(`/api/library/bookmarks/${id}`, patch)
      const row = res.bookmark ?? null
      if (row) items.value = items.value.map(item => (item.id === id ? row : item))
      return row
    } finally {
      saving.value = false
    }
  }

  async function remove(id: number): Promise<void> {
    saving.value = true
    try {
      await cDelete(`/api/library/bookmarks/${id}`)
      items.value = items.value.filter(item => item.id !== id)
    } finally {
      saving.value = false
    }
  }

  /** The range annotations of one chapter, in reading order. */
  function rangesFor(chapterIndex: number): Annotation[] {
    return items.value.filter(item => item.chapterIndex === chapterIndex && isRange(item))
  }

  function find(id: number): Annotation | null {
    return items.value.find(item => item.id === id) ?? null
  }

  return { items, loading, saving, load, create, update, remove, rangesFor, find }
}
