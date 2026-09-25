/**
 * Library module — plain-text helpers (full-text search) unit tests.
 */
import { describe, it, expect } from 'vitest'
import { buildSnippet, highlightHtml, htmlToText } from '../../server/utils/text'

describe('htmlToText', () => {
  it('turns block markup into readable text', () => {
    const text = htmlToText('<h1>Title</h1><p>First para.</p><p>Second<br/>para.</p>')
    expect(text).toBe('Title\n\nFirst para.\n\nSecond\npara.')
  })

  it('decodes entities and collapses stray whitespace', () => {
    expect(htmlToText('<p>Tom &amp; Jerry</p><p>   spaced    out </p>'))
      .toBe('Tom & Jerry\n\nspaced out')
  })

  it('drops markup but keeps CJK text intact', () => {
    expect(htmlToText('<div><p>中文段落一。</p><p>中文段落二。</p></div>')).toBe('中文段落一。\n\n中文段落二。')
  })

  it('keeps paragraph boundaries as a single blank line, not a run of them', () => {
    expect(htmlToText('<p>a</p><div><p></p><p>b</p></div>')).toBe('a\n\nb')
  })

  it('handles empty input', () => {
    expect(htmlToText('')).toBe('')
    expect(htmlToText('<p></p>')).toBe('')
  })
})

describe('highlightHtml', () => {
  it('wraps matches in mark, case-insensitively', () => {
    expect(highlightHtml('<p>Hello WORLD</p>', 'world'))
      .toBe('<p>Hello <mark class="lib-hit">WORLD</mark></p>')
  })

  it('never corrupts tags or attributes', () => {
    const html = '<p class="note-title title">title</p>'
    const out = highlightHtml(html, 'title')
    expect(out).toBe('<p class="note-title title"><mark class="lib-hit">title</mark></p>')
  })

  it('highlights every occurrence and supports CJK', () => {
    const out = highlightHtml('<p>爱 爱 爱</p>', '爱')
    expect(out.match(/<mark class="lib-hit">/g)).toHaveLength(3)
  })

  it('matches entity-encoded text', () => {
    expect(highlightHtml('<p>A &amp; B</p>', '&')).toContain('<mark class="lib-hit">&amp;</mark>')
  })

  it('is a no-op for an empty query', () => {
    expect(highlightHtml('<p>x</p>', '   ')).toBe('<p>x</p>')
  })
})

describe('buildSnippet', () => {
  it('centres the snippet on the match with ellipses', () => {
    const text = `${'a'.repeat(200)} needle ${'b'.repeat(200)}`
    const result = buildSnippet(text, 'needle', 20)
    expect(result.matched).toBe(true)
    expect(result.snippet).toContain('needle')
    expect(result.snippet.startsWith('…')).toBe(true)
    expect(result.snippet.endsWith('…')).toBe(true)
  })

  it('falls back to the chapter head when nothing matches', () => {
    const result = buildSnippet('short chapter body', 'absent')
    expect(result.matched).toBe(false)
    expect(result.snippet).toBe('short chapter body')
    expect(result.offset).toBe(0)
  })

  it('is case-insensitive and reports the offset', () => {
    const result = buildSnippet('Hello needle world', 'NEEDLE', 5)
    expect(result.matched).toBe(true)
    expect(result.offset).toBe(6)
  })
})
