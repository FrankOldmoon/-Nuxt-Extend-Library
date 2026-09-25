/**
 * Library module — reader layout maths unit tests.
 */
import { describe, it, expect } from 'vitest'
import {
  bookPercent,
  clampPage,
  pageCountFor,
  pageForColumn,
  pageForFraction,
  pagedFraction,
  pagedGeometry,
  spreadGeometry,
  splitSpeechSegments
} from '../../app/utils/reader'
import { speechLangFromBook } from '../../app/composables/useReaderTts'

describe('pageCountFor', () => {
  it('counts pages from the flow width', () => {
    expect(pageCountFor(2400, 800)).toBe(3)
    expect(pageCountFor(800, 800)).toBe(1)
    expect(pageCountFor(1601, 800)).toBe(3)
  })

  it('does not invent a trailing blank page for an exact fit', () => {
    // A real flow is `n * width - horizontalPadding`, which must stay `n` pages.
    expect(pageCountFor(3 * 800 - 40, 800)).toBe(3)
    expect(pageCountFor(2 * 800 - 1, 800)).toBe(2)
  })

  it('never returns less than one page', () => {
    expect(pageCountFor(0, 800)).toBe(1)
    expect(pageCountFor(500, 0)).toBe(1)
    expect(pageCountFor(Number.NaN, 800)).toBe(1)
  })
})

describe('pageForColumn', () => {
  it('floors an in-column offset onto its own page', () => {
    expect(pageForColumn(0, 800)).toBe(0)
    // The last pixel of a column is still that column's page.
    expect(pageForColumn(799, 800)).toBe(0)
    expect(pageForColumn(800, 800)).toBe(1)
    expect(pageForColumn(1999, 800)).toBe(2)
    expect(pageForColumn(-5, 800)).toBe(0)
    expect(pageForColumn(100, 0)).toBe(0)
  })
})

describe('clampPage', () => {
  it('keeps the page inside the available range', () => {
    expect(clampPage(-1, 5)).toBe(0)
    expect(clampPage(9, 5)).toBe(4)
    expect(clampPage(2.4, 5)).toBe(2)
    expect(clampPage(3, 0)).toBe(0)
    expect(clampPage(Number.NaN, 5)).toBe(0)
  })
})

describe('bookPercent', () => {
  it('combines chapter progress with in-chapter progress', () => {
    expect(bookPercent(0, 10, 0)).toBe(0)
    expect(bookPercent(0, 10, 1)).toBe(10)
    expect(bookPercent(4, 10, 0.5)).toBe(45)
    expect(bookPercent(9, 10, 1)).toBe(100)
  })

  it('clamps out-of-range input', () => {
    expect(bookPercent(-1, 10, -2)).toBe(0)
    expect(bookPercent(99, 10, 5)).toBe(100)
    expect(bookPercent(0, 0, 1)).toBe(0)
  })
})

describe('pagedFraction', () => {
  it('treats the last page as the end of the chapter', () => {
    expect(pagedFraction(0, 1)).toBe(1)
    expect(pagedFraction(0, 4)).toBe(0.25)
    expect(pagedFraction(3, 4)).toBe(1)
    expect(pagedFraction(9, 4)).toBe(1)
  })
})

describe('pageForFraction', () => {
  it('round-trips with pagedFraction, so a reflow keeps the reader in place', () => {
    for (const [page, count] of [[0, 4], [1, 4], [3, 4], [0, 1], [5, 7], [11, 16]] as const) {
      expect(pageForFraction(pagedFraction(page, count), count)).toBe(page)
    }
  })

  it('clamps out-of-range input', () => {
    expect(pageForFraction(0, 4)).toBe(0)
    expect(pageForFraction(1, 4)).toBe(3)
    expect(pageForFraction(2, 4)).toBe(3)
    expect(pageForFraction(-1, 4)).toBe(0)
    expect(pageForFraction(0.5, 0)).toBe(0)
  })
})

describe('spreadGeometry', () => {
  it('keeps two columns plus the gutter exactly one page wide', () => {
    for (const width of [640, 1000, 1001, 1152, 1213, 1600]) {
      const { columnWidth, columnGap } = spreadGeometry(width, 32)
      // The whole point: one spread must equal the scroll pitch, or page turns drift.
      expect(columnWidth * 2 + columnGap).toBe(width)
      expect(columnWidth).toBeGreaterThan(0)
    }
  })

  it('absorbs rounding in the gutter', () => {
    const { columnWidth, columnGap } = spreadGeometry(1153, 32)
    expect(columnWidth).toBe(560)
    expect(columnGap).toBe(33)
  })

  it('shrinks the gutter instead of overflowing a narrow page', () => {
    const { columnWidth, columnGap } = spreadGeometry(300, 200)
    expect(columnWidth * 2 + columnGap).toBe(300)
    // Columns stay about half the width; the +1 is rounding absorbed by the gutter.
    expect(columnWidth).toBeLessThan(150)
    expect(columnGap).toBeLessThanOrEqual(76)
  })

  it('degrades safely for unusable widths', () => {
    expect(spreadGeometry(0)).toEqual({ columnWidth: 1, columnGap: 0 })
    expect(spreadGeometry(Number.NaN)).toEqual({ columnWidth: 1, columnGap: 0 })
  })
})

describe('pagedGeometry', () => {
  it('never lets the gutter fall below the page margin', () => {
    // A narrower gutter would let the next page's column bleed into the margin —
    // the bug where page 1 showed a strip of page 2 along its right edge.
    for (const inset of [18, 40, 64]) {
      for (const width of [600, 1000, 1152, 1153, 1213]) {
        expect(pagedGeometry(width, 1, inset).columnGap).toBeGreaterThanOrEqual(inset)
        expect(pagedGeometry(width, 2, inset).columnGap).toBeGreaterThanOrEqual(inset)
      }
    }
  })

  it('keeps a single page exactly one page wide', () => {
    expect(pagedGeometry(1152, 1, 64)).toEqual({ columnWidth: 1152, columnGap: 64 })
  })

  it('keeps a spread exactly one page wide', () => {
    for (const width of [600, 1000, 1152, 1153, 1213]) {
      const { columnWidth, columnGap } = pagedGeometry(width, 2, 64)
      expect(columnWidth * 2 + columnGap).toBe(width)
      expect(columnGap).toBeGreaterThanOrEqual(64)
    }
  })

  it('degrades safely for unusable widths', () => {
    expect(pagedGeometry(0, 1, 64)).toEqual({ columnWidth: 1, columnGap: 0 })
    expect(pagedGeometry(Number.NaN, 2, 64)).toEqual({ columnWidth: 1, columnGap: 0 })
  })
})

describe('splitSpeechSegments', () => {
  it('splits on sentence punctuation and keeps offsets', () => {
    const text = '第一句。第二句！第三句？'
    const segments = splitSpeechSegments(text)
    expect(segments.map(segment => segment.text)).toEqual(['第一句。', '第二句！', '第三句？'])
    // Offsets must map back onto the original text exactly.
    for (const segment of segments) {
      expect(text.slice(segment.start, segment.end)).toBe(segment.text)
    }
  })

  it('splits Latin sentences and drops blank runs', () => {
    const segments = splitSpeechSegments('One. Two!\n\nThree?')
    expect(segments.map(segment => segment.text)).toEqual(['One.', 'Two!', 'Three?'])
  })

  it('hard-splits a very long run without punctuation', () => {
    const segments = splitSpeechSegments('x'.repeat(500), 100)
    expect(segments.length).toBe(5)
    expect(segments.every(segment => segment.text.length <= 100)).toBe(true)
  })

  it('prefers a soft break for long sentences', () => {
    const text = `${'a'.repeat(90)}，${'b'.repeat(90)}。`
    const segments = splitSpeechSegments(text, 100)
    expect(segments[0]!.text.endsWith('，')).toBe(true)
    expect(segments[1]!.text.endsWith('。')).toBe(true)
  })

  it('returns nothing for blank input', () => {
    expect(splitSpeechSegments('')).toEqual([])
    expect(splitSpeechSegments('   \n  ')).toEqual([])
  })
})

describe('speechLangFromBook', () => {
  it('maps ebook language codes to speech tags', () => {
    expect(speechLangFromBook('zh')).toBe('zh-CN')
    expect(speechLangFromBook('zh-Hant')).toBe('zh-TW')
    expect(speechLangFromBook('zh_CN')).toBe('zh-CN')
    expect(speechLangFromBook('en')).toBe('en-US')
    expect(speechLangFromBook('ja')).toBe('ja-JP')
  })

  it('falls back sensibly for unknown or missing codes', () => {
    expect(speechLangFromBook('pt-BR')).toBe('pt-BR')
    expect(speechLangFromBook(null)).toBe('en-US')
    expect(speechLangFromBook(undefined)).toBe('en-US')
  })
})
