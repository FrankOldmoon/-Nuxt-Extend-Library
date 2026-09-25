/**
 * Library module — reader layout maths.
 *
 * Paged EPUB reading is implemented with CSS multi-column overflow: the chapter
 * is fragmented into columns one page wide and the flow is translated horizontally
 * by whole pages. These pure helpers own the arithmetic so it can be unit-tested
 * without a DOM.
 */

/**
 * Number of pages a column flow of `scrollWidth` produces at `pageWidth` per
 * page. The tiny epsilon keeps an exact multiple from rounding up to a blank
 * extra page (the flow is usually a few pixels short of `n * pageWidth`).
 */
export function pageCountFor(scrollWidth: number, pageWidth: number): number {
  if (!Number.isFinite(scrollWidth) || !Number.isFinite(pageWidth) || pageWidth <= 0) return 1
  return Math.max(1, Math.ceil(scrollWidth / pageWidth - 0.001))
}

/**
 * Page index of an offset *inside the column flow*.
 *
 * Column `j` spans `[j * pitch, j * pitch + columnWidth]`, so an offset anywhere
 * in it — from its first to its last pixel — is on page `j`: the offset floors
 * into its page rather than rounding onto a neighbour. Used to reveal a search
 * hit or the sentence currently being read aloud.
 */
export function pageForColumn(offset: number, pitch: number): number {
  if (!Number.isFinite(offset) || !Number.isFinite(pitch) || pitch <= 0) return 0
  return Math.max(0, Math.floor(offset / pitch))
}

/** Clamp a page index into `[0, pageCount - 1]`. */
export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 0
  const last = Math.max(0, Math.max(1, pageCount) - 1)
  return Math.max(0, Math.min(last, Math.round(page)))
}

/**
 * Whole-book completion percentage from a chapter index plus the progress
 * *inside* that chapter (0–1). Rounds to one decimal, capped at 100.
 */
export function bookPercent(chapterIndex: number, totalChapters: number, withinChapter: number): number {
  if (!Number.isFinite(totalChapters) || totalChapters <= 0) return 0
  const within = Math.max(0, Math.min(1, Number.isFinite(withinChapter) ? withinChapter : 0))
  const index = Math.min(Math.max(0, Math.round(chapterIndex)), totalChapters - 1)
  return Math.min(100, Math.round(((index + within) / totalChapters) * 1000) / 10)
}

/**
 * Progress inside the current chapter for a paginated chapter:
 * the last page counts as fully read, so finishing the final page of the final
 * chapter reports 100%.
 */
export function pagedFraction(pageIndex: number, pageCount: number): number {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return 1
  const page = clampPage(pageIndex, pageCount)
  return (page + 1) / pageCount
}

/**
 * Inverse of `pagedFraction`: the page that best represents `fraction` (0–1) of
 * the chapter. Used to stay in place when the flow is re-measured after a font
 * size / line height / window size change, or when switching layout.
 */
export function pageForFraction(fraction: number, pageCount: number): number {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return 0
  const within = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  return clampPage(Math.round(within * pageCount - 1), pageCount)
}

export interface SpreadGeometry {
  columnWidth: number
  columnGap: number
}

/**
 * Column geometry for a two-page spread inside `contentWidth` px.
 *
 * Two columns plus the gutter must add up to exactly `contentWidth` (the gutter
 * absorbs the rounding of the floored column width), because `contentWidth` is
 * also the scroll pitch — that is what keeps a page turn pixel-exact.
 */
export function spreadGeometry(contentWidth: number, gutter = 32): SpreadGeometry {
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return { columnWidth: 1, columnGap: 0 }
  const safeGutter = Math.max(0, Math.min(gutter, Math.floor(contentWidth / 4)))
  const columnWidth = Math.max(1, Math.floor((contentWidth - safeGutter) / 2))
  return { columnWidth, columnGap: Math.max(0, contentWidth - columnWidth * 2) }
}

/**
 * Column geometry for one page (`columns = 1`) or one spread (`columns = 2`).
 *
 * `inset` is the horizontal margin the pages keep on both sides, and it doubles
 * as the *minimum* gutter. The gutter has to be at least as wide as the margin
 * because consecutive pages are adjacent columns in the same flow: with a
 * narrower gutter the following page's column pokes `inset - gutter` px into the
 * visible margin, i.e. "page 1 shows a strip of page 2 on its right edge".
 * For a single page the gutter only ever lands in the margin, so it can be as
 * generous as the inset requires.
 */
export function pagedGeometry(contentWidth: number, columns: number, inset: number): SpreadGeometry {
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return { columnWidth: 1, columnGap: 0 }
  const count = Math.max(1, Math.floor(columns) || 1)
  const minGutter = Math.max(0, Number.isFinite(inset) ? Math.ceil(inset) : 0)
  if (count < 2) return { columnWidth: Math.max(1, Math.floor(contentWidth)), columnGap: minGutter }
  return spreadGeometry(contentWidth, minGutter)
}

export interface SpeechSegment {
  text: string
  /** Offsets into the source text, so the reader can highlight the range. */
  start: number
  end: number
}

/** Sentence-ish terminators (CJK + Latin) that end a spoken chunk. */
const SPEECH_BREAK = /[。！？!?；;….．]/
const SPEECH_SOFT_BREAK = /[，,、：:）)》】」』]/

/**
 * Split text into speakable segments for the Web Speech API.
 *
 * Segments end on sentence punctuation, but a very long sentence is split at a
 * soft break (or hard at `maxLength`) because browsers behave badly with huge
 * utterances. Offsets are kept so the reader can highlight what is being read.
 */
export function splitSpeechSegments(text: string, maxLength = 140): SpeechSegment[] {
  if (!text || !text.trim()) return []
  const segments: SpeechSegment[] = []
  let cursor = 0
  let start = 0
  let lastSoft = -1

  const push = (end: number) => {
    const raw = text.slice(start, end)
    const leading = raw.length - raw.trimStart().length
    const trailing = raw.length - raw.trimEnd().length
    const body = raw.trim()
    if (body) {
      segments.push({ text: body, start: start + leading, end: end - trailing })
    }
    start = end
  }

  while (cursor < text.length) {
    const char = text[cursor]!
    const length = cursor - start

    if (SPEECH_BREAK.test(char)) {
      push(cursor + 1)
      lastSoft = -1
      cursor++
      continue
    }
    // A blank line ends a paragraph: break there. A single newline is only a
    // preferred break point for an over-long run.
    if (char === '\n') {
      if (text[cursor + 1] === '\n') {
        push(cursor + 1)
        lastSoft = -1
        cursor++
        continue
      }
      lastSoft = cursor
      cursor++
      continue
    }
    if (SPEECH_SOFT_BREAK.test(char)) lastSoft = cursor

    if (length >= maxLength) {
      // Prefer a soft break in the latter half of the budget, otherwise hard split.
      const cut = lastSoft > start + maxLength / 2 ? lastSoft + 1 : cursor
      push(cut)
      lastSoft = -1
      cursor = cut
      continue
    }
    cursor++
  }
  push(text.length)
  return segments
}
