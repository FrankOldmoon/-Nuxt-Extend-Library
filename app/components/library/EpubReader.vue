<script setup lang="ts">
/**
 * Library — in-browser EPUB reader.
 *
 * Three layouts of the same sanitised chapter markup (produced by
 * `/api/library/books/:id/content`):
 *   - `page`   the chapter is fragmented into one-page-wide CSS columns and the
 *              flow is translated by whole pages (default, book-like);
 *   - `spread` the same, two columns to a page;
 *   - `scroll` the classic continuous vertical scroll.
 *
 * Pagination is translation, not scrolling: the container clips (`overflow:
 * hidden`) and the page index moves the flow by exactly one pitch. A swipe can
 * therefore only ever turn a page, never leave a page half in view.
 *
 * Also provides a table of contents, typography/theme controls, bookmarks and
 * debounced reading-progress sync. The layout arithmetic lives in
 * `app/utils/reader.ts` so it can be unit-tested.
 */
import type { ReaderContent } from '../../composables/useLibrary'
import type { SpeechSegment } from '../../utils/reader'
import type { Annotation } from '../../utils/annotations'

const props = defineProps<{
  content: ReaderContent
  initial?: { chapterIndex?: number, location?: string | null } | null
}>()

const { t } = useI18n()
const toast = useToast()

/**
 * Chapters are cached locally so a search hit can swap in the *highlighted*
 * version of just that chapter without refetching the whole book.
 */
const localChapters = ref<ReaderContent['chapters']>([...props.content.chapters])
watch(() => props.content, (next) => {
  localChapters.value = [...next.chapters]
})

const chapters = computed(() => localChapters.value)
const total = computed(() => chapters.value.length)

const chapterIndex = ref(Math.max(0, props.initial?.chapterIndex ?? 0))
const scrollEl = ref<HTMLElement | null>(null)
const flowEl = ref<HTMLElement | null>(null)
const chapterEl = ref<HTMLElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const tocOpen = ref(false)
const bookmarking = ref(false)
const saving = ref(false)
const justSaved = ref(false)
const isFullscreen = ref(false)
const localPercent = ref(0)

const current = computed(() => chapters.value[chapterIndex.value] ?? null)

// ---- Layout mode ----
type Mode = 'page' | 'spread' | 'scroll'
const MODES: Mode[] = ['page', 'spread', 'scroll']
const mode = ref<Mode>('page')

/**
 * `pad` is both the horizontal margin every page keeps and the *floor* for the
 * column gutter.
 *
 * The chapter is fragmented into `contentWidth`-wide columns and the flow is
 * translated by whole pages. Consecutive pages are adjacent columns, so a gutter
 * narrower than the margin lets the neighbouring page bleed into the margin
 * (this is what made page 1 show a strip of page 2 along its right edge). The
 * gutter never lands inside the page, so overshooting it is free.
 */
const pad = ref(28)
const contentWidth = ref(600)
const pageIndex = ref(0)
const pageCount = ref(1)

const isPaged = computed(() => mode.value !== 'scroll')
const columnsPerPage = computed(() => (mode.value === 'spread' ? 2 : 1))
const geometry = computed(() => pagedGeometry(contentWidth.value, columnsPerPage.value, pad.value))
/**
 * Distance between consecutive columns, and between consecutive pages.
 *
 * The gutter repeats after *every* column (including the last one of a spread),
 * so a spread's pitch is `2 × (columnWidth + columnGap)`; using
 * `2 × columnWidth + columnGap` would fall short by one gutter per turn.
 */
const columnStep = computed(() => geometry.value.columnWidth + geometry.value.columnGap)
const pagePitch = computed(() => columnStep.value * columnsPerPage.value)
/** Two columns need room to be readable at all. */
const spreadAvailable = computed(() => mode.value === 'spread'
  || pagedGeometry(contentWidth.value, 2, pad.value).columnWidth >= 260)

/** Horizontal offset that brings the current page into the viewport. */
const pageOffset = computed(() => pad.value - pageIndex.value * pagePitch.value)

// ---- Typography / theme (persisted per browser) ----
const fontSize = ref(18)
const lineHeight = ref(1.8)
const pageWidth = ref(720)
const theme = ref<'light' | 'sepia' | 'dark'>('light')

const THEMES: Array<'light' | 'sepia' | 'dark'> = ['light', 'sepia', 'dark']

const themeLabel = computed(() => t(`library.reader.${theme.value}`))

function cycleTheme() {
  const index = THEMES.indexOf(theme.value)
  theme.value = THEMES[(index + 1) % THEMES.length]!
}

// ---- Progress ----
const percent = computed(() => {
  if (isPaged.value) {
    return bookPercent(chapterIndex.value, total.value, pagedFraction(pageIndex.value, pageCount.value))
  }
  return bookPercent(chapterIndex.value, total.value, localPercent.value)
})

let saveTimer: ReturnType<typeof setTimeout> | null = null
let savedTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveProgress(), 1500)
}

async function saveProgress() {
  if (saving.value) return
  saving.value = true
  try {
    await cPut('/api/library/progress', {
      bookId: props.content.bookId,
      percent: percent.value,
      chapterIndex: chapterIndex.value,
      location: JSON.stringify({
        mode: mode.value,
        page: pageIndex.value,
        scrollTop: scrollEl.value?.scrollTop ?? 0
      })
    })
    justSaved.value = true
    if (savedTimer) clearTimeout(savedTimer)
    savedTimer = setTimeout(() => {
      justSaved.value = false
    }, 2000)
  } catch {
    /* progress sync is best-effort */
  } finally {
    saving.value = false
  }
}

// ---- Measurement ----
function measureWidths() {
  const el = scrollEl.value
  if (!el) return
  const width = el.clientWidth
  if (width <= 0) return
  const inset = width >= 1000 ? 64 : width >= 700 ? 40 : 18
  pad.value = inset
  contentWidth.value = Math.max(200, width - inset * 2)
}

/**
 * Number of pages in the current chapter.
 *
 * Derived from the fragmented chapter's own extent (`n` columns of
 * `columnWidth` separated by `n-1` gutters), backed up by the flow's overflow
 * width so a browser quirk cannot under-report and hide pages.
 */
function measurePages(): number {
  const step = columnStep.value
  const pitch = pagePitch.value
  if (step <= 0 || pitch <= 0) return 1
  const gap = geometry.value.columnGap
  // The flow overflows its own box by the surplus columns; adding the missing
  // trailing gutter turns `n` columns into `n * step`, which then divides evenly.
  const extent = Math.max(
    flowEl.value?.scrollWidth ?? 0,
    chapterEl.value?.scrollWidth ?? 0,
    step
  )
  const columns = pageCountFor(extent + gap, step)
  return Math.max(1, Math.ceil(columns / columnsPerPage.value))
}

function refreshPageCount() {
  pageCount.value = isPaged.value ? measurePages() : 1
  pageIndex.value = clampPage(pageIndex.value, pageCount.value)
}

/** Move to a page; the flow is translated from `pageIndex`, so this is all of it. */
function goPage(target: number, save = true) {
  if (!isPaged.value) return
  pageIndex.value = clampPage(target, pageCount.value)
  if (save) scheduleSave()
}

function onScroll() {
  const el = scrollEl.value
  if (!el || isPaged.value) return
  const max = el.scrollHeight - el.clientHeight
  localPercent.value = max > 0 ? el.scrollTop / max : 1
  scheduleSave()
}

/**
 * Horizontal offset of `el` from the start of the column flow.
 *
 * Measured against the flow, not the viewport: the flow is translated, so a
 * viewport-relative offset would shift with the current page while the
 * difference between two rects stays put.
 */
function flowOffset(el: HTMLElement): number {
  const flow = flowEl.value
  if (!flow) return 0
  return el.getBoundingClientRect().left - flow.getBoundingClientRect().left
}

// ---- Navigation ----
function chapterIndexByPath(path: string): number {
  return chapters.value.findIndex(chapter => chapter.path === path)
}

// ---- Full-text search (in-book) ----
interface SearchHit {
  bookId: number
  bookTitle: string
  chapterIndex: number
  chapterTitle: string | null
  snippet: string
  offset: number
}

const searchOpen = ref(false)
const searchQuery = ref('')
const searchHits = ref<SearchHit[]>([])
const searchTotal = ref(0)
const searching = ref(false)
const openingHit = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void runSearch()
  }, 350)
}

async function runSearch() {
  const q = searchQuery.value.trim()
  if (!q) {
    searchHits.value = []
    searchTotal.value = 0
    return
  }
  searching.value = true
  try {
    const params = new URLSearchParams({ q, bookId: String(props.content.bookId), limit: '80' })
    const res = await cGet<{ total: number, hits: SearchHit[] }>(`/api/library/search?${params.toString()}`)
    searchHits.value = res.hits ?? []
    searchTotal.value = res.total ?? 0
  } catch (e) {
    searchHits.value = []
    searchTotal.value = 0
    toast.add({ title: extractErrorMessage(e, t('library.messages.loadFailed')), color: 'error' })
  } finally {
    searching.value = false
  }
}

/** Wait for the chapter markup to be in the DOM (gotoChapter schedules async work). */
async function afterRender(steps = 4) {
  for (let i = 0; i < steps; i++) await nextTick()
}

/**
 * Follow a search hit: fetch only that chapter with the query highlighted,
 * swap it into the cached chapters, jump there and scroll to the first match.
 */
async function openHit(hit: SearchHit) {
  const q = searchQuery.value.trim()
  openingHit.value = true
  try {
    const params = new URLSearchParams({ chapter: String(hit.chapterIndex) })
    if (q) params.set('highlight', q)
    const res = await cGet<ReaderContent>(`/api/library/books/${props.content.bookId}/content?${params.toString()}`)
    const replacement = res.chapters?.[0]
    if (replacement) {
      localChapters.value = localChapters.value.map(chapter =>
        chapter.index === replacement.index ? replacement : chapter)
    }
    searchOpen.value = false
    gotoChapter(hit.chapterIndex, 'first')
    await afterRender()
    jumpToFirstMark()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.loadFailed')), color: 'error' })
  } finally {
    openingHit.value = false
  }
}

/** Scroll to the first highlighted match of the current chapter. */
function jumpToFirstMark() {
  const container = scrollEl.value
  if (!container) return
  const mark = container.querySelector('mark.lib-hit') as HTMLElement | null
  if (!mark) return
  if (isPaged.value) {
    goPage(pageForColumn(flowOffset(mark), pagePitch.value), false)
  } else {
    mark.scrollIntoView({ block: 'center' })
  }
}

function closeSearch() {
  searchOpen.value = false
  searchQuery.value = ''
  searchHits.value = []
  searchTotal.value = 0
}

function scrollToFragment(fragment: string): boolean {
  const el = scrollEl.value
  if (!el || typeof CSS === 'undefined') return false
  const target = el.querySelector(`#${CSS.escape(fragment)}`) as HTMLElement | null
  if (!target) return false
  if (isPaged.value) {
    goPage(pageForColumn(flowOffset(target), pagePitch.value), false)
  } else {
    target.scrollIntoView()
  }
  return true
}

/** Jump to a chapter; `edge` lands on its first/last page. */
function gotoChapter(index: number, edge?: 'first' | 'last', fragment?: string) {
  const wasSpeaking = ttsSpeaking.value
  chapterIndex.value = Math.max(0, Math.min(total.value - 1, index))
  tocOpen.value = false
  nextTick(() => {
    refreshPageCount()
    nextTick(() => {
      if (isPaged.value) {
        if (fragment && scrollToFragment(fragment)) {
          scheduleSave()
          return
        }
        goPage(edge === 'last' ? pageCount.value - 1 : 0, false)
      } else {
        localPercent.value = 0
        scrollEl.value?.scrollTo({ top: 0 })
        if (fragment) scrollToFragment(fragment)
      }
      scheduleSave()
      // Keep read-aloud in step with manual navigation.
      if (wasSpeaking) startTts(0)
      else clearTtsHighlight()
    })
  })
}

const atEnd = computed(() => chapterIndex.value >= total.value - 1
  && (isPaged.value ? pageIndex.value >= pageCount.value - 1 : true))
const atStart = computed(() => chapterIndex.value <= 0
  && (isPaged.value ? pageIndex.value <= 0 : true))

function goNext() {
  if (isPaged.value && pageIndex.value < pageCount.value - 1) {
    goPage(pageIndex.value + 1)
    return
  }
  if (chapterIndex.value < total.value - 1) gotoChapter(chapterIndex.value + 1)
}

function goPrev() {
  if (isPaged.value && pageIndex.value > 0) {
    goPage(pageIndex.value - 1)
    return
  }
  if (chapterIndex.value > 0) gotoChapter(chapterIndex.value - 1, 'last')
}

const hasLiveSelection = () => {
  if (typeof window === 'undefined') return false
  const selection = window.getSelection()
  return !!selection && !selection.isCollapsed
}

function onContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  // A click on a highlight opens it — unless it is the tail of a fresh selection.
  const highlight = target?.closest?.('span.lib-anno') as HTMLElement | null
  if (highlight && !hasLiveSelection()) {
    const id = Number(highlight.dataset.annoId)
    if (Number.isInteger(id)) {
      openAnnotationToolbar(id)
      return
    }
  }
  const anchor = target?.closest?.('a[data-lib-href]') as HTMLAnchorElement | null
  if (!anchor) return
  const path = anchor.getAttribute('data-lib-href') ?? ''
  const fragment = anchor.getAttribute('data-lib-frag') ?? undefined
  const index = chapterIndexByPath(path)
  if (index < 0) return
  event.preventDefault()
  gotoChapter(index, 'first', fragment)
}

/** A finished drag inside the chapter becomes a pending highlight. */
function onChapterMouseUp() {
  if (!currentSelection()) return
  openSelectionToolbar()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (noteEditorOpen.value) resetNoteEditor()
    else if (annotationPanelOpen.value) annotationPanelOpen.value = false
    else if (toolbar.value) closeToolbar()
    return
  }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (event.key === 'ArrowLeft') goPrev()
  else if (event.key === 'ArrowRight') goNext()
}

// ---- Swipe / wheel navigation (paged layouts) ----
/** Committed swipe distance, in pixels. */
const WHEEL_STEP = 48
/** A gesture ends after this idle gap, so one flick turns exactly one page. */
const GESTURE_IDLE = 120
let wheelDelta = 0
let wheelFired = false
let wheelIdle: ReturnType<typeof setTimeout> | null = null
let wheelTarget: HTMLElement | null = null

/**
 * Page on wheel/trackpad input instead of panning.
 *
 * A paged container never scrolls (`overflow: hidden`), so a trackpad's
 * horizontal swipe has nowhere to go; this accumulates the gesture and turns
 * exactly one page once it is deliberate enough to be a swipe rather than noise.
 */
function onWheel(event: WheelEvent) {
  if (!isPaged.value) return
  event.preventDefault()
  // Firefox reports wheel deltas in lines/pages rather than pixels.
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1
  const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * scale
  if (wheelIdle) clearTimeout(wheelIdle)
  wheelIdle = setTimeout(() => {
    wheelDelta = 0
    wheelFired = false
  }, GESTURE_IDLE)
  if (wheelFired) return
  wheelDelta += delta
  if (Math.abs(wheelDelta) < WHEEL_STEP) return
  wheelFired = true
  if (wheelDelta > 0) goNext()
  else goPrev()
  wheelDelta = 0
}

let touchStartX = 0
let touchStartY = 0

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (!isPaged.value || !touch) return
  touchStartX = touch.clientX
  touchStartY = touch.clientY
}

function onTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!isPaged.value || !touch) return
  const dx = touch.clientX - touchStartX
  const dy = touch.clientY - touchStartY
  // A mostly-horizontal, long-enough drag is a page turn; anything else is a tap or a scroll.
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
  if (dx < 0) goNext()
  else goPrev()
}

/** Current position as a fraction of the chapter, whatever the layout. */
function chapterFraction(): number {
  return isPaged.value ? pagedFraction(pageIndex.value, pageCount.value) : localPercent.value
}

/**
 * Re-measure the flow and put the reader back at `within` (a fraction of the
 * chapter). Two ticks: the first lets the new typography reach the DOM, the
 * second re-reads the reflowed column count once it has settled.
 */
function relayoutTo(within: number) {
  nextTick(() => {
    measureWidths()
    nextTick(() => {
      refreshPageCount()
      const el = scrollEl.value
      if (isPaged.value) {
        goPage(pageForFraction(within, pageCount.value), false)
      } else if (el) {
        const max = el.scrollHeight - el.clientHeight
        localPercent.value = within
        el.scrollTo({ top: Math.max(0, Math.round(within * max)) })
      }
      scheduleSave()
    })
  })
}

/**
 * Switch layout while keeping the reader roughly where it was: the current
 * in-chapter fraction is carried across every direction.
 */
function setMode(next: Mode) {
  if (mode.value === next) return
  if (next === 'spread' && !spreadAvailable.value) {
    toast.add({ title: t('library.reader.spreadUnavailable'), color: 'warning' })
    return
  }
  const within = chapterFraction()
  mode.value = next
  relayoutTo(within)
}

/** Cycle page → two pages → scroll (the spread is skipped without room). */
function cycleMode() {
  const order = spreadAvailable.value ? MODES : MODES.filter(candidate => candidate !== 'spread')
  const index = order.indexOf(mode.value)
  setMode(order[(index + 1) % order.length]!)
}

function restorePosition() {
  const raw = props.initial?.location
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as { mode?: Mode, page?: number, scrollTop?: number }
    // Only restore when the saved position came from a similar layout
    // (page ↔ spread are both paginated, so page numbers carry over).
    if (parsed.mode && (parsed.mode === 'scroll') !== (mode.value === 'scroll')) return
    if (isPaged.value && typeof parsed.page === 'number') goPage(parsed.page, false)
    else if (typeof parsed.scrollTop === 'number') scrollEl.value?.scrollTo({ top: parsed.scrollTop })
  } catch {
    /* corrupt location token — start at the chapter top */
  }
}

// ---- Fullscreen / bookmarks ----
async function toggleFullscreen() {
  if (!import.meta.client) return
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      isFullscreen.value = false
    } else if (rootEl.value) {
      await rootEl.value.requestFullscreen()
      isFullscreen.value = true
    }
  } catch {
    /* fullscreen may be blocked by the browser */
  }
}

async function addBookmark() {
  bookmarking.value = true
  try {
    await cPost('/api/library/bookmarks', {
      bookId: props.content.bookId,
      type: 'bookmark',
      chapterIndex: chapterIndex.value,
      percent: percent.value,
      text: current.value?.title ?? ''
    })
    toast.add({ title: t('library.reader.bookmark'), color: 'success' })
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.saveFailed')), color: 'error' })
  } finally {
    bookmarking.value = false
  }
}

// ---- Text-to-speech (browser Web Speech API) ----
const tts = useReaderTts()
const {
  supported: ttsSupported,
  speaking: ttsSpeaking,
  paused: ttsPaused,
  index: ttsIndex,
  voices: ttsVoices,
  voiceUri: ttsVoiceUri,
  rate: ttsRate
} = tts

const ttsActive = ref(false)
const ttsSegments = ref<SpeechSegment[]>([])

/**
 * Flattened chapter text plus the text nodes it was built from, so a character
 * offset maps to the DOM and back. Highlights, notes and read-aloud all anchor
 * to it: wrapping a range splits text nodes but never changes the concatenation,
 * so offsets stay valid across re-paints.
 */
let textMap = {
  text: '',
  nodes: [] as Array<{ node: Text, start: number, end: number }>,
  byNode: new Map<Text, { node: Text, start: number, end: number }>()
}

/**
 * True for text nodes that hold readable prose.
 *
 * A book's stylesheet is inlined *into the chapter*, so the article contains text
 * that is not prose. Counting it would shift every annotation offset by the CSS
 * length and make read-aloud narrate the stylesheet.
 */
function isProseNode(node: Text): boolean {
  if (!node.nodeValue) return false
  return !node.parentElement?.closest('style, script, title')
}

function buildTextMap() {
  const next = {
    text: '',
    nodes: [] as typeof textMap.nodes,
    byNode: new Map<Text, { node: Text, start: number, end: number }>()
  }
  const root = chapterEl.value
  if (!root || typeof document === 'undefined') {
    textMap = next
    return
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const parts: string[] = []
  let offset = 0
  let node = walker.nextNode() as Text | null
  while (node) {
    if (isProseNode(node)) {
      const entry = { node, start: offset, end: offset + node.nodeValue!.length }
      parts.push(node.nodeValue!)
      next.nodes.push(entry)
      next.byNode.set(node, entry)
      offset = entry.end
    }
    node = walker.nextNode() as Text | null
  }
  next.text = parts.join('')
  textMap = next
}

/** First (or last) prose text node inside `node`. */
function edgeText(node: Node, last: boolean): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return isProseNode(node as Text) ? node as Text : null
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  let found: Text | null = null
  let current = walker.nextNode() as Text | null
  while (current) {
    if (isProseNode(current)) {
      found = current
      if (!last) break
    }
    current = walker.nextNode() as Text | null
  }
  return found
}

/**
 * Character offset of a DOM point inside the chapter text.
 *
 * Selections usually land inside a text node, but a range that ends on a
 * paragraph boundary reports the *element* plus a child index — that case is
 * resolved to the nearest text node on the correct side of the point.
 */
function pointOffset(node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const entry = textMap.byNode.get(node as Text)
    return entry ? entry.start + offset : null
  }
  const after = node.childNodes[offset] ? edgeText(node.childNodes[offset]!, false) : null
  if (after) {
    const entry = textMap.byNode.get(after)
    if (entry) return entry.start
  }
  const previous = offset > 0 && node.childNodes[offset - 1] ? edgeText(node.childNodes[offset - 1]!, true) : null
  if (previous) {
    const entry = textMap.byNode.get(previous)
    if (entry) return entry.end
  }
  return null
}

/** Unwrap previously highlighted speech ranges and merge the split text nodes back. */
function clearTtsHighlight() {
  const root = chapterEl.value
  if (!root) return
  for (const wrapper of Array.from(root.querySelectorAll('span.lib-tts'))) {
    const parent = wrapper.parentNode
    if (!parent) continue
    while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper)
    parent.removeChild(wrapper)
    parent.normalize()
  }
}

/**
 * Wrap `[start, end)` of the chapter text, decorating each wrapper via `decorate`.
 *
 * The range is cut per text node: a selection usually spans several nodes, and
 * `Range.surroundContents` only works while it stays inside one, so each node's
 * intersection gets its own wrapper. Returns them in document order.
 */
function wrapRange(start: number, end: number, decorate: (span: HTMLElement) => void): HTMLElement[] {
  const wrappers: HTMLElement[] = []
  for (const entry of textMap.nodes) {
    const from = Math.max(start, entry.start)
    const to = Math.min(end, entry.end)
    if (to <= from) continue
    const range = document.createRange()
    try {
      range.setStart(entry.node, from - entry.start)
      range.setEnd(entry.node, to - entry.start)
    } catch {
      continue
    }
    const wrapper = document.createElement('span')
    decorate(wrapper)
    try {
      range.surroundContents(wrapper)
    } catch {
      continue
    }
    wrappers.push(wrapper)
  }
  return wrappers
}

/** Follow the spoken text: highlight the segment and keep it on screen. */
function highlightSpoken(segmentIndex: number) {
  const segment = ttsSegments.value[segmentIndex]
  clearTtsHighlight()
  if (!segment) return
  // Rebuild after unwrapping: splitting/merging text nodes invalidates old refs.
  buildTextMap()
  const wrappers = wrapRange(segment.start, segment.end, (span) => {
    span.className = 'lib-tts'
  })
  const wrapper = wrappers[0] ?? null
  if (!wrapper) return

  const container = scrollEl.value
  if (!container) return
  if (isPaged.value) {
    goPage(pageForColumn(flowOffset(wrapper), pagePitch.value))
  } else {
    wrapper.scrollIntoView({ block: 'center', behavior: 'auto' })
  }
}

/** Begin speaking the current chapter from `from`. */
function startTts(from = 0) {
  if (!ttsSupported.value) {
    toast.add({ title: t('library.tts.unsupported'), color: 'warning' })
    return
  }
  buildTextMap()
  const segments = splitSpeechSegments(textMap.text)
  if (!segments.length) {
    toast.add({ title: t('library.tts.empty'), color: 'warning' })
    return
  }
  ttsSegments.value = segments
  ttsActive.value = true
  tts.play(segments, from, {
    language: props.content.language ?? null,
    onSegment: index => highlightSpoken(index),
    onFinish: () => advanceAfterSpeech()
  })
}

function stopTts() {
  tts.stop()
  ttsActive.value = false
  ttsSegments.value = []
  clearTtsHighlight()
}

/** Continue reading aloud into the next chapter. */
function advanceAfterSpeech() {
  clearTtsHighlight()
  if (chapterIndex.value < total.value - 1) {
    gotoChapter(chapterIndex.value + 1, 'first')
    return
  }
  ttsActive.value = false
  toast.add({ title: t('library.tts.finished'), color: 'success' })
}

function toggleTts() {
  if (ttsSpeaking.value) stopTts()
  else startTts(0)
}

// ---- Annotations: highlights with a style + colour, and notes ----
const {
  items: annotationItems,
  saving: annotationSaving,
  load: loadAnnotations,
  create: createAnnotation,
  update: updateAnnotation,
  remove: removeAnnotation,
  rangesFor: annotationRanges,
  find: findAnnotation
} = useReaderAnnotations(props.content.bookId)

/** What the floating toolbar is currently pointed at. */
interface ToolbarState {
  anchor: { left: number, top: number, bottom: number }
  /** The pending selection, or null when the toolbar edits an existing annotation. */
  range: { start: number, end: number, text: string } | null
  annotationId: number | null
  style: string
  color: string
  quoted: string
  hasNote: boolean
}

const toolbar = ref<ToolbarState | null>(null)
const annotationPanelOpen = ref(false)
const activeAnnotationId = ref<number | null>(null)
const annotationBusy = computed(() => annotationSaving.value)
const noteEditorOpen = ref(false)
const noteEditingId = ref<number | null>(null)
const noteQuoted = ref('')
const noteText = ref('')
const noteRange = ref<{ start: number, end: number, text: string } | null>(null)

/**
 * The last look the reader picked. Remembered so the next highlight matches the
 * previous one instead of resetting to the default every time.
 */
const lastStyle = ref(DEFAULT_ANNOTATION_STYLE)
const lastColor = ref(DEFAULT_ANNOTATION_COLOR)

const chapterTitles = computed(() => chapters.value.map(chapter => chapter.title ?? ''))

/**
 * Repaint every highlight of the open chapter.
 *
 * Wrapping is destructive to text nodes (a wrapped range is split in three), so
 * existing wrappers are unwrapped and merged first, and the text map is rebuilt
 * before and after — that is what keeps offsets stable across re-paints.
 */
function renderAnnotations() {
  const root = chapterEl.value
  if (!root) return
  for (const wrapper of Array.from(root.querySelectorAll('span.lib-anno'))) {
    const parent = wrapper.parentNode
    if (!parent) continue
    while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper)
    parent.removeChild(wrapper)
    parent.normalize()
  }
  buildTextMap()
  for (const item of annotationRanges(chapterIndex.value)) {
    const vars = annotationVars(item.color)
    wrapRange(item.startOffset!, item.endOffset!, (span) => {
      span.className = item.id === activeAnnotationId.value ? 'lib-anno is-active' : 'lib-anno'
      span.dataset.annoId = String(item.id)
      span.dataset.annoStyle = annotationStyle(item.style).key
      for (const [name, value] of Object.entries(vars)) span.style.setProperty(name, value)
      if (item.note) span.title = item.note
    })
  }
  buildTextMap()
}

/** The live DOM selection as chapter-text offsets, or null when there is none. */
function currentSelection(): { start: number, end: number, text: string, rect: DOMRect } | null {
  const root = chapterEl.value
  if (!root || typeof window === 'undefined') return null
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const start = pointOffset(range.startContainer, range.startOffset)
  const end = pointOffset(range.endContainer, range.endOffset)
  if (start == null || end == null || end <= start) return null
  const text = textMap.text.slice(start, end)
  if (!text.trim()) return null
  return { start, end, text, rect: range.getBoundingClientRect() }
}

const viewportCentre = () => (import.meta.client ? window.innerWidth / 2 : 640)

/** Show the toolbar for a fresh selection. */
function openSelectionToolbar() {
  const picked = currentSelection()
  if (!picked) return
  toolbar.value = {
    anchor: { left: picked.rect.left + picked.rect.width / 2, top: picked.rect.top, bottom: picked.rect.bottom },
    range: { start: picked.start, end: picked.end, text: picked.text },
    annotationId: null,
    style: lastStyle.value,
    color: lastColor.value,
    quoted: picked.text,
    hasNote: false
  }
}

/** Show the toolbar for an existing highlight, anchored to it. */
function openAnnotationToolbar(id: number) {
  const item = findAnnotation(id)
  if (!item) return
  const wrapper = chapterEl.value?.querySelector(`span.lib-anno[data-anno-id="${id}"]`) as HTMLElement | null
  const rect = wrapper?.getBoundingClientRect()
  activeAnnotationId.value = id
  lastStyle.value = item.style ?? DEFAULT_ANNOTATION_STYLE
  lastColor.value = item.color ?? DEFAULT_ANNOTATION_COLOR
  toolbar.value = {
    anchor: rect
      ? { left: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom }
      : { left: viewportCentre(), top: 160, bottom: 180 },
    range: null,
    annotationId: id,
    style: lastStyle.value,
    color: lastColor.value,
    quoted: item.text ?? item.note ?? '',
    hasNote: !!item.note
  }
}

function closeToolbar() {
  toolbar.value = null
  activeAnnotationId.value = null
}

/** Clicking anywhere but the toolbar itself dismisses it. */
function onRootMouseDown(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest?.('.lib-anno-bar')) return
  if (toolbar.value) closeToolbar()
}

/**
 * Apply the toolbar's look: create the highlight for a fresh selection, or update
 * the annotation being edited. The toolbar stays open so a colour and a line
 * style can be combined without re-selecting the text.
 */
async function applyAnnotation(payload: { style: string, color: string }) {
  const state = toolbar.value
  if (!state) return
  lastStyle.value = payload.style
  lastColor.value = payload.color
  toolbar.value = { ...state, ...payload }
  try {
    if (state.annotationId != null) {
      await updateAnnotation(state.annotationId, payload)
      return
    }
    if (!state.range) return
    const created = await createAnnotation({
      chapterIndex: chapterIndex.value,
      startOffset: state.range.start,
      endOffset: state.range.end,
      text: state.range.text,
      style: payload.style,
      color: payload.color,
      percent: percent.value
    })
    if (!created) return
    activeAnnotationId.value = created.id
    toolbar.value = { ...state, ...payload, annotationId: created.id, hasNote: false }
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.saveFailed')), color: 'error' })
  }
}

function resetNoteEditor() {
  noteEditorOpen.value = false
  noteEditingId.value = null
  noteQuoted.value = ''
  noteText.value = ''
  noteRange.value = null
}

function openNoteEditor(id?: number | null) {
  const state = toolbar.value
  const target = id ?? state?.annotationId ?? null
  const item = target != null ? findAnnotation(target) : null
  noteEditingId.value = target
  noteRange.value = state?.range ?? null
  noteQuoted.value = item?.text ?? state?.quoted ?? ''
  noteText.value = item?.note ?? ''
  noteEditorOpen.value = true
}

/** Save a note, creating the highlight first when the note targets a fresh selection. */
async function saveNote() {
  const text = noteText.value.trim()
  try {
    let id = noteEditingId.value
    if (id == null && noteRange.value) {
      const created = await createAnnotation({
        chapterIndex: chapterIndex.value,
        startOffset: noteRange.value.start,
        endOffset: noteRange.value.end,
        text: noteRange.value.text,
        style: lastStyle.value,
        color: lastColor.value,
        percent: percent.value
      })
      id = created?.id ?? null
    }
    if (id == null) return
    await updateAnnotation(id, { note: text || null })
    if (toolbar.value) toolbar.value = { ...toolbar.value, annotationId: id, hasNote: !!text }
    resetNoteEditor()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.saveFailed')), color: 'error' })
  }
}

async function deleteAnnotation(id: number | null | undefined) {
  if (id == null) return
  try {
    await removeAnnotation(id)
    if (activeAnnotationId.value === id) activeAnnotationId.value = null
    if (toolbar.value?.annotationId === id) toolbar.value = null
    if (noteEditingId.value === id) resetNoteEditor()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('library.messages.saveFailed')), color: 'error' })
  }
}

/** Bring a highlight into view. */
function scrollToAnnotation(id: number) {
  const wrapper = chapterEl.value?.querySelector(`span.lib-anno[data-anno-id="${id}"]`) as HTMLElement | null
  if (!wrapper) return
  if (isPaged.value) goPage(pageForColumn(flowOffset(wrapper), pagePitch.value), false)
  else wrapper.scrollIntoView({ block: 'center' })
}

async function jumpToAnnotation(item: Annotation) {
  lastStyle.value = item.style ?? lastStyle.value
  lastColor.value = item.color ?? lastColor.value
  activeAnnotationId.value = item.id
  annotationPanelOpen.value = false
  if (item.chapterIndex !== chapterIndex.value) {
    gotoChapter(item.chapterIndex, 'first')
    await afterRender(6)
  }
  if (!isRange(item)) return
  scrollToAnnotation(item.id)
  openAnnotationToolbar(item.id)
}

// ---- Lifecycle ----
let resizeObserver: ResizeObserver | null = null
/** Last observed container width, so the observer only reacts to real resizes. */
let lastWidth = 0

onMounted(() => {
  try {
    const raw = localStorage.getItem('library:reader:settings')
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      fontSize.value = Number(parsed.fontSize) || 18
      lineHeight.value = Number(parsed.lineHeight) || 1.8
      pageWidth.value = Number(parsed.pageWidth) || 720
      if (parsed.mode === 'scroll' || parsed.mode === 'page' || parsed.mode === 'spread') mode.value = parsed.mode
      const savedTheme = String(parsed.theme ?? 'light')
      theme.value = (THEMES as string[]).includes(savedTheme) ? savedTheme as typeof theme.value : 'light'
      ttsRate.value = Number(parsed.ttsRate) || 1
      if (typeof parsed.ttsVoice === 'string') ttsVoiceUri.value = parsed.ttsVoice
    }
  } catch { /* ignore corrupt settings */ }

  nextTick(() => {
    measureWidths()
    lastWidth = scrollEl.value?.clientWidth ?? 0
    nextTick(() => {
      refreshPageCount()
      nextTick(restorePosition)
    })
  })

  if (import.meta.client && typeof ResizeObserver !== 'undefined' && scrollEl.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width === lastWidth) return
      lastWidth = width
      // A resize reflows the chapter, so re-paginate and keep the reading spot.
      relayoutTo(chapterFraction())
    })
    resizeObserver.observe(scrollEl.value)
  }
  wheelTarget = scrollEl.value
  // Non-passive, so `preventDefault` can stop the trackpad from panning.
  wheelTarget?.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKeydown)

  void loadAnnotations()
})

/** Repaint highlights after the chapter DOM is in place (post-flush, not before). */
watch([chapterIndex, annotationItems, activeAnnotationId], () => {
  if (!import.meta.client) return
  renderAnnotations()
}, { flush: 'post' })

onUnmounted(() => {
  if (import.meta.client) window.removeEventListener('keydown', onKeydown)
  wheelTarget?.removeEventListener('wheel', onWheel)
  wheelTarget = null
  if (wheelIdle) clearTimeout(wheelIdle)
  resizeObserver?.disconnect()
  if (saveTimer) clearTimeout(saveTimer)
  if (savedTimer) clearTimeout(savedTimer)
  if (searchTimer) clearTimeout(searchTimer)
  void saveProgress()
})

watch([fontSize, lineHeight, pageWidth], () => {
  if (!import.meta.client) return
  // Type size / leading change how much text fits, so the page count is stale.
  relayoutTo(chapterFraction())
})

watch([fontSize, lineHeight, pageWidth, theme, mode, ttsRate, ttsVoiceUri], () => {
  if (!import.meta.client) return
  try {
    localStorage.setItem('library:reader:settings', JSON.stringify({
      fontSize: fontSize.value,
      lineHeight: lineHeight.value,
      pageWidth: pageWidth.value,
      theme: theme.value,
      mode: mode.value,
      ttsRate: ttsRate.value,
      ttsVoice: ttsVoiceUri.value
    }))
  } catch { /* storage may be unavailable */ }
})

const flowStyle = computed(() => (isPaged.value
  ? {
      // An explicit width is the column box, and it must be exactly
      // `contentWidth` — any fraction of the container leaking in would make the
      // column width disagree with the page pitch and drift the turns.
      width: `${contentWidth.value}px`,
      columnWidth: `${geometry.value.columnWidth}px`,
      columnGap: `${geometry.value.columnGap}px`,
      paddingTop: '1.5rem',
      paddingBottom: '1.5rem',
      // `pad` places the current page's left margin; the rest is the page turn.
      transform: `translateX(${pageOffset.value}px)`
    }
  : {}))

const contentStyle = computed(() => (isPaged.value
  ? { fontSize: `${fontSize.value}px`, lineHeight: String(lineHeight.value) }
  : {
      maxWidth: `${pageWidth.value}px`,
      fontSize: `${fontSize.value}px`,
      lineHeight: String(lineHeight.value)
    }))

/** Layout label / icon for the toolbar cycle button. */
const modeLabel = computed(() => t(`library.reader.${mode.value === 'page' ? 'paged' : mode.value === 'spread' ? 'spread' : 'scrolling'}`))
const modeIcon = computed(() => (mode.value === 'spread'
  ? 'i-lucide-columns-2'
  : mode.value === 'page' ? 'i-lucide-book-open' : 'i-lucide-scroll-text'))

/** Voices for the TTS selector (USelect rejects empty values). */
const voiceItems = computed(() =>
  ttsVoices.value.map(voice => ({ label: `${voice.name} (${voice.lang})`, value: voice.voiceURI })))
</script>

<template>
  <div
    ref="rootEl"
    class="library-reader"
    :class="`is-${theme}`"
    @mousedown="onRootMouseDown"
  >
    <!-- Toolbar -->
    <header class="library-reader__bar">
      <div class="flex items-center gap-1">
        <UButton
          :to="`/library/book/${content.bookId}`"
          icon="i-lucide-arrow-left"
          size="sm"
          color="neutral"
          variant="ghost"
          :title="t('library.reader.backToBook')"
        />
        <UButton
          icon="i-lucide-list"
          size="sm"
          color="neutral"
          variant="ghost"
          :title="t('library.reader.toc')"
          @click="tocOpen = !tocOpen"
        />
        <UButton
          icon="i-lucide-search"
          size="sm"
          color="neutral"
          :variant="searchOpen ? 'soft' : 'ghost'"
          :title="t('library.fulltext.title')"
          @click="searchOpen ? closeSearch() : (searchOpen = true)"
        />
        <UButton
          v-if="ttsSupported"
          :icon="ttsSpeaking ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
          size="sm"
          color="neutral"
          :variant="ttsActive ? 'soft' : 'ghost'"
          :title="ttsSpeaking ? t('library.tts.stop') : t('library.tts.play')"
          @click="toggleTts"
        />
        <span class="ml-2 hidden text-sm text-muted sm:inline">
          {{ t('library.reader.chapterOf', { current: chapterIndex + 1, total }) }}
        </span>
        <UIcon
          v-if="justSaved"
          name="i-lucide-cloud-check"
          class="ml-1 size-4 text-success"
          :title="t('library.reader.progressSaved')"
        />
      </div>

      <div class="flex items-center gap-1">
        <UButton
          :icon="modeIcon"
          size="sm"
          color="neutral"
          :variant="mode === 'scroll' ? 'ghost' : 'soft'"
          :title="t('library.reader.cycleLayout')"
          :label="modeLabel"
          @click="cycleMode"
        />
        <UButton
          icon="i-lucide-minus"
          size="sm"
          color="neutral"
          variant="ghost"
          :title="t('library.reader.fontSize')"
          :disabled="fontSize <= 12"
          @click="fontSize = Math.max(12, fontSize - 2)"
        />
        <span class="w-8 text-center text-xs text-muted">{{ fontSize }}</span>
        <UButton
          icon="i-lucide-plus"
          size="sm"
          color="neutral"
          variant="ghost"
          :disabled="fontSize >= 32"
          @click="fontSize = Math.min(32, fontSize + 2)"
        />
        <UButton
          icon="i-lucide-align-justify"
          size="sm"
          color="neutral"
          variant="ghost"
          :title="t('library.reader.lineHeight')"
          @click="lineHeight = lineHeight >= 2.4 ? 1.4 : Math.round((lineHeight + 0.2) * 10) / 10"
        />
        <UButton
          icon="i-lucide-scaling"
          size="sm"
          color="neutral"
          variant="ghost"
          :title="t('library.reader.width')"
          @click="pageWidth = pageWidth >= 1000 ? 640 : pageWidth + 120"
        />
        <UButton
          :icon="theme === 'dark' ? 'i-lucide-moon' : theme === 'sepia' ? 'i-lucide-coffee' : 'i-lucide-sun'"
          size="sm"
          color="neutral"
          variant="ghost"
          :title="`${t('library.reader.theme')}: ${themeLabel}`"
          @click="cycleTheme"
        />
        <UButton
          icon="i-lucide-notebook-pen"
          size="sm"
          color="neutral"
          :variant="annotationPanelOpen ? 'soft' : 'ghost'"
          :title="t('library.annotations.title')"
          @click="annotationPanelOpen = !annotationPanelOpen"
        />
        <UButton
          icon="i-lucide-bookmark-plus"
          size="sm"
          color="neutral"
          variant="ghost"
          :loading="bookmarking"
          :title="t('library.reader.bookmark')"
          @click="addBookmark"
        />
        <UButton
          :icon="isFullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
          size="sm"
          color="neutral"
          variant="ghost"
          :title="isFullscreen ? t('library.reader.exitFullscreen') : t('library.reader.fullscreen')"
          @click="toggleFullscreen"
        />
      </div>
    </header>

    <!-- Progress -->
    <div class="library-reader__progress">
      <div
        class="library-reader__progress-fill"
        :style="{ width: `${percent}%` }"
      />
    </div>

    <!-- Table of contents -->
    <div
      v-if="tocOpen"
      class="library-reader__overlay"
      @click="tocOpen = false"
    />
    <aside
      v-if="tocOpen"
      class="library-reader__toc"
    >
      <div class="flex items-center justify-between border-b border-default px-4 py-3">
        <span class="font-semibold">{{ t('library.reader.toc') }}</span>
        <UButton
          icon="i-lucide-x"
          size="xs"
          square
          color="neutral"
          variant="ghost"
          @click="tocOpen = false"
        />
      </div>
      <nav class="flex-1 overflow-auto p-2">
        <button
          v-for="(item, i) in content.toc"
          :key="`${item.href}-${i}`"
          type="button"
          class="block w-full truncate rounded px-2 py-1.5 text-left text-sm transition hover:bg-elevated"
          :class="chapterIndexByPath(item.href) === chapterIndex ? 'font-medium text-primary' : 'text-default'"
          :style="{ paddingLeft: `${8 + item.level * 14}px` }"
          @click="gotoChapter(chapterIndexByPath(item.href) >= 0 ? chapterIndexByPath(item.href) : chapterIndex, 'first', item.fragment)"
        >
          {{ item.title }}
        </button>
      </nav>
    </aside>

    <!-- Chapter -->
    <div
      ref="scrollEl"
      class="library-reader__scroll"
      :class="isPaged ? 'is-paged' : 'is-scroll'"
      @scroll.passive="onScroll"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
    >
      <div
        ref="flowEl"
        class="library-reader__flow"
        :class="isPaged ? 'is-paged' : 'is-scroll'"
        :style="flowStyle"
      >
        <!-- eslint-disable vue/no-v-html -- sanitised server-side by utils/html.ts -->
        <article
          v-if="current"
          ref="chapterEl"
          class="library-reader__content"
          :class="isPaged ? 'is-paged' : 'is-scroll'"
          :style="contentStyle"
          @click="onContentClick"
          @mouseup="onChapterMouseUp"
          v-html="current.html"
        />
        <p
          v-else
          class="py-20 text-center text-muted"
        >
          {{ t('library.reader.noContent') }}
        </p>
        <!-- eslint-enable vue/no-v-html -->
      </div>
    </div>

    <!-- In-book full-text search -->
    <aside
      v-if="searchOpen"
      class="library-reader__search"
    >
      <div class="flex items-center gap-2 border-b border-default px-3 py-2">
        <UInput
          v-model="searchQuery"
          :placeholder="t('library.fulltext.placeholder')"
          icon="i-lucide-search"
          size="sm"
          class="flex-1"
          @input="scheduleSearch"
          @keydown.enter="runSearch"
        />
        <UButton
          icon="i-lucide-x"
          size="xs"
          square
          color="neutral"
          variant="ghost"
          @click="closeSearch"
        />
      </div>
      <div class="flex items-center justify-between gap-2 px-3 py-2 text-xs text-dimmed">
        <span>
          <template v-if="searching">{{ t('library.fulltext.searching') }}</template>
          <template v-else-if="searchQuery.trim()">{{ t('library.fulltext.results', { count: searchTotal }) }}</template>
          <template v-else>{{ t('library.fulltext.hint') }}</template>
        </span>
        <UIcon
          v-if="openingHit"
          name="i-lucide-loader-2"
          class="size-4 animate-spin"
        />
      </div>
      <nav class="flex-1 overflow-auto px-2 pb-3">
        <p
          v-if="!searching && searchQuery.trim() && !searchHits.length"
          class="px-2 py-6 text-center text-sm text-muted"
        >
          {{ t('library.fulltext.noResults') }}
        </p>
        <button
          v-for="hit in searchHits"
          :key="`${hit.chapterIndex}-${hit.offset}`"
          type="button"
          class="block w-full rounded px-2 py-2 text-left transition hover:bg-elevated"
          @click="openHit(hit)"
        >
          <span class="block truncate text-xs text-dimmed">
            {{ hit.chapterTitle || t('library.reader.chapterOf', { current: hit.chapterIndex + 1, total }) }}
          </span>
          <span class="mt-0.5 block text-xs leading-relaxed">{{ hit.snippet }}</span>
        </button>
      </nav>
    </aside>

    <!-- Highlights, notes and bookmarks for this book -->
    <LibraryAnnotationPanel
      v-if="annotationPanelOpen"
      :items="annotationItems"
      :titles="chapterTitles"
      :active-id="activeAnnotationId"
      @jump="jumpToAnnotation"
      @edit="item => openNoteEditor(item.id)"
      @remove="item => deleteAnnotation(item.id)"
      @close="annotationPanelOpen = false"
    />

    <!-- Floating highlight / note toolbar -->
    <LibraryAnnotationToolbar
      :anchor="toolbar?.anchor ?? null"
      :style="toolbar?.style ?? lastStyle"
      :color="toolbar?.color ?? lastColor"
      :quoted="toolbar?.quoted ?? ''"
      :has-note="toolbar?.hasNote ?? false"
      :existing="toolbar?.annotationId != null"
      :busy="annotationBusy"
      @apply="applyAnnotation"
      @edit-note="openNoteEditor()"
      @remove="deleteAnnotation(toolbar?.annotationId)"
    />

    <!-- Note editor -->
    <div
      v-if="noteEditorOpen"
      class="library-reader__overlay"
      @click="resetNoteEditor"
    />
    <div
      v-if="noteEditorOpen"
      class="library-reader__note"
      role="dialog"
    >
      <p class="library-reader__note-quote">
        {{ noteQuoted || t('library.annotations.emptyQuote') }}
      </p>
      <UTextarea
        v-model="noteText"
        :rows="5"
        :placeholder="t('library.annotations.notePlaceholder')"
        class="w-full"
      />
      <div class="library-reader__note-actions">
        <UButton
          v-if="noteEditingId != null"
          icon="i-lucide-trash-2"
          size="sm"
          color="error"
          variant="ghost"
          :label="t('library.annotations.remove')"
          @click="deleteAnnotation(noteEditingId)"
        />
        <span class="library-reader__note-spacer" />
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :label="t('library.actions.cancel')"
          @click="resetNoteEditor"
        />
        <UButton
          size="sm"
          color="primary"
          :loading="annotationBusy"
          :label="t('library.actions.save')"
          @click="saveNote"
        />
      </div>
    </div>

    <!-- Read aloud (browser text-to-speech) -->
    <div
      v-if="ttsActive || ttsSpeaking"
      class="library-reader__tts"
    >
      <UButton
        :icon="ttsSpeaking && !ttsPaused ? 'i-lucide-pause' : 'i-lucide-play'"
        size="sm"
        color="primary"
        variant="soft"
        :title="ttsSpeaking && !ttsPaused ? t('library.tts.pause') : t('library.tts.play')"
        @click="ttsSpeaking && !ttsPaused ? tts.pause() : (ttsSpeaking ? tts.resume() : startTts(0))"
      />
      <UButton
        icon="i-lucide-square"
        size="sm"
        color="neutral"
        variant="ghost"
        :title="t('library.tts.stop')"
        @click="stopTts"
      />
      <UButton
        icon="i-lucide-skip-back"
        size="sm"
        color="neutral"
        variant="ghost"
        :title="t('library.tts.prev')"
        :disabled="ttsIndex <= 0"
        @click="tts.prev()"
      />
      <UButton
        icon="i-lucide-skip-forward"
        size="sm"
        color="neutral"
        variant="ghost"
        :title="t('library.tts.next')"
        @click="tts.next()"
      />
      <span class="shrink-0 text-xs text-dimmed">
        {{ ttsIndex < 0 ? 0 : ttsIndex + 1 }} / {{ ttsSegments.length }}
      </span>
      <USelect
        v-model="ttsVoiceUri"
        :items="voiceItems"
        size="sm"
        class="w-48 shrink-0"
        :placeholder="t('library.tts.voice')"
      />
      <div class="flex shrink-0 items-center gap-2">
        <span class="text-xs text-dimmed">{{ t('library.tts.speed') }}</span>
        <input
          v-model.number="ttsRate"
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          class="w-24 accent-[var(--ui-primary)]"
        >
        <span class="w-9 text-xs text-dimmed">{{ ttsRate.toFixed(1) }}×</span>
      </div>
    </div>

    <!-- Pager -->
    <footer class="library-reader__nav">
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="soft"
        size="sm"
        :disabled="atStart"
        :label="t('library.reader.prev')"
        @click="goPrev"
      />
      <span class="flex items-center gap-2 text-xs text-dimmed">
        <span>{{ t('library.reader.chapterOf', { current: chapterIndex + 1, total }) }}</span>
        <template v-if="mode === 'page'">
          <span class="opacity-50">·</span>
          <span>{{ t('library.reader.pageOf', { current: pageIndex + 1, total: pageCount }) }}</span>
        </template>
        <template v-else-if="mode === 'spread'">
          <span class="opacity-50">·</span>
          <span>{{ t('library.reader.spreadOf', { current: pageIndex + 1, total: pageCount }) }}</span>
        </template>
      </span>
      <UButton
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="soft"
        size="sm"
        :disabled="atEnd"
        :label="t('library.reader.next')"
        @click="goNext"
      />
    </footer>
  </div>
</template>

<style scoped>
.library-reader {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.library-reader.is-light { --reader-bg: #ffffff; --reader-fg: #1f2328; }
.library-reader.is-sepia { --reader-bg: #f6ecd9; --reader-fg: #4b3f2f; }
.library-reader.is-dark { --reader-bg: #17181c; --reader-fg: #d7d8dc; }

.library-reader__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg);
}
.library-reader__progress {
  height: 3px;
  background: var(--ui-bg-elevated);
}
.library-reader__progress-fill {
  height: 100%;
  background: var(--ui-primary);
  transition: width 0.2s ease;
}
.library-reader__scroll {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  background: var(--reader-bg);
  color: var(--reader-fg);
}
.library-reader__scroll.is-scroll {
  overflow: auto;
  scroll-behavior: smooth;
}
.library-reader__scroll.is-paged {
  /* Paged layouts never scroll: the flow is translated by whole pages, so a
     swipe can only ever page — never leave one page half in view. */
  overflow: hidden;
  overscroll-behavior: contain;
}

/* Scroll layout */
.library-reader__flow.is-scroll {
  display: block;
}
.library-reader__content.is-scroll {
  margin: 0 auto;
  padding: 2.5rem 1.25rem 1rem;
  word-wrap: break-word;
}

/* Paged layout: the chapter is fragmented into page-wide columns and the flow
   is translated horizontally by whole pages. */
.library-reader__flow.is-paged {
  box-sizing: border-box;
  height: 100%;
  column-fill: auto;
  will-change: transform;
}
.library-reader__content.is-paged {
  height: 100%;
  word-wrap: break-word;
}
.library-reader__content.is-paged :deep(p:first-child),
.library-reader__content.is-paged :deep(h1:first-child),
.library-reader__content.is-paged :deep(h2:first-child) {
  margin-top: 0;
}

.library-reader__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--ui-border);
  background: var(--ui-bg);
}
.library-reader__overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.35);
}
.library-reader__toc {
  position: fixed;
  inset-block: 0;
  left: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  width: 18rem;
  max-width: 85vw;
  background: var(--ui-bg);
  color: var(--ui-text);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}
.library-reader__search {
  position: fixed;
  inset-block: 0;
  right: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  width: 22rem;
  max-width: 92vw;
  background: var(--ui-bg);
  color: var(--ui-text);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}
.library-reader__tts {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  overflow-x: auto;
  padding: 0.4rem 0.75rem;
  border-top: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
}
.library-reader__note {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 26rem;
  max-width: 92vw;
  padding: 1rem;
  transform: translate(-50%, -50%);
  border-radius: 0.75rem;
  background: var(--ui-bg);
  color: var(--ui-text);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.library-reader__note-quote {
  max-height: 4.5em;
  overflow: auto;
  padding-left: 0.6rem;
  border-left: 3px solid var(--ui-primary);
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
.library-reader__note-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.library-reader__note-spacer {
  flex: 1;
}

/* Search hits + the sentence currently being read aloud */
.library-reader__content :deep(mark.lib-hit) {
  background: rgba(250, 204, 21, 0.45);
  color: inherit;
  border-radius: 2px;
}
.library-reader__content :deep(span.lib-tts) {
  background: rgba(59, 130, 246, 0.24);
  border-radius: 2px;
}
.library-reader.is-dark .library-reader__content :deep(span.lib-tts) {
  background: rgba(96, 165, 250, 0.32);
}

/* Highlights and underlines. The paint comes from the per-annotation custom
   properties (`--anno-ink`, `--anno-wash`), so the stylesheet needs one rule per
   line style rather than one per style × colour. */
.library-reader__content :deep(span.lib-anno) {
  border-radius: 2px;
  cursor: pointer;
}
.library-reader__content :deep(span.lib-anno[data-anno-style='highlight']) {
  background: var(--anno-wash);
}
.library-reader__content :deep(span.lib-anno:not([data-anno-style='highlight'])) {
  text-decoration-line: underline;
  text-decoration-color: var(--anno-ink);
  text-underline-offset: 2px;
}
.library-reader__content :deep(span.lib-anno[data-anno-style='underline']) { text-decoration-style: solid; }
.library-reader__content :deep(span.lib-anno[data-anno-style='double']) { text-decoration-style: double; }
.library-reader__content :deep(span.lib-anno[data-anno-style='dotted']) { text-decoration-style: dotted; }
.library-reader__content :deep(span.lib-anno[data-anno-style='dashed']) { text-decoration-style: dashed; }
.library-reader__content :deep(span.lib-anno[data-anno-style='wavy']) { text-decoration-style: wavy; }

/* On a dark page the pastel wash reads better than the darker ink. */
.library-reader.is-dark .library-reader__content :deep(span.lib-anno:not([data-anno-style='highlight'])) {
  text-decoration-color: var(--anno-wash);
}

/* The highlight being edited / jumped to. */
.library-reader__content :deep(span.lib-anno.is-active) {
  background: var(--anno-wash);
}
.library-reader__content :deep(span.lib-anno.is-active[data-anno-style='highlight']) {
  box-shadow: inset 0 0 0 1px var(--anno-ink);
}

/* Chapter typography (v-html is not scoped, so reach in with :deep) */
.library-reader__content :deep(img),
.library-reader__content :deep(svg),
.library-reader__content :deep(image) {
  max-width: 100%;
  height: auto;
}
.library-reader__content :deep(h1),
.library-reader__content :deep(h2),
.library-reader__content :deep(h3),
.library-reader__content :deep(h4) {
  margin: 1.4em 0 0.6em;
  font-weight: 700;
  line-height: 1.3;
}
.library-reader__content :deep(p) { margin: 0 0 1em; }
.library-reader__content :deep(blockquote) {
  margin: 1em 0;
  padding: 0.25em 1em;
  border-left: 3px solid var(--ui-primary);
  opacity: 0.85;
}
.library-reader__content :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
}
.library-reader__content :deep(table) {
  border-collapse: collapse;
  max-width: 100%;
}
.library-reader__content :deep(td),
.library-reader__content :deep(th) {
  border: 1px solid currentColor;
  padding: 0.35em 0.6em;
}
.library-reader__content :deep(pre) {
  overflow: auto;
  padding: 0.75em;
  background: rgba(127, 127, 127, 0.12);
  border-radius: 4px;
}
</style>
