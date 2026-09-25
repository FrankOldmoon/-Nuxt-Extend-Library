/**
 * Library module — client helper unit tests (pure functions only).
 */
import { describe, it, expect } from 'vitest'
import {
  bookAuthorsLabel,
  canReadInline,
  coverGradient,
  coverInitials,
  formatBytes,
  formatLibraryDate,
  resolveCover
} from '../../app/composables/useLibrary'

describe('resolveCover', () => {
  it('returns null for empty values', () => {
    expect(resolveCover(null)).toBeNull()
    expect(resolveCover(undefined)).toBeNull()
    expect(resolveCover('   ')).toBeNull()
  })

  it('passes absolute URLs and paths through', () => {
    expect(resolveCover('https://x.test/a.png')).toBe('https://x.test/a.png')
    expect(resolveCover('/api/library/books/1/cover')).toBe('/api/library/books/1/cover')
    expect(resolveCover('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
  })

  it('prefixes stored storage paths with the host file route', () => {
    expect(resolveCover('271/abc.png')).toBe('/api/files/serve/271/abc.png')
  })
})

describe('formatBytes', () => {
  it('formats sizes across units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('is defensive about bad input', () => {
    expect(formatBytes(null)).toBe('0 B')
    expect(formatBytes(-10)).toBe('0 B')
  })
})

describe('formatLibraryDate', () => {
  it('formats an ISO date and tolerates invalid input', () => {
    expect(formatLibraryDate('2020-05-01T00:00:00.000Z')).toMatch(/2020/)
    expect(formatLibraryDate(null)).toBe('')
    expect(formatLibraryDate('not-a-date')).toBe('')
  })
})

describe('bookAuthorsLabel', () => {
  it('joins author names', () => {
    expect(bookAuthorsLabel({ authors: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] })).toBe('A, B')
    expect(bookAuthorsLabel({ authors: [] })).toBeNull()
  })
})

describe('canReadInline', () => {
  it('accepts the custom EPUB reader', () => {
    expect(canReadInline({ format: 'epub' })).toBe(true)
  })

  it('accepts formats the browser can render itself', () => {
    for (const format of ['pdf', 'txt', 'md', 'html']) {
      expect(canReadInline({ format })).toBe(true)
    }
    expect(canReadInline({ format: 'bin', mimeType: 'application/pdf' })).toBe(true)
    expect(canReadInline({ format: 'bin', mimeType: 'text/plain; charset=utf-8' })).toBe(true)
  })

  it('rejects formats that need an external reader', () => {
    expect(canReadInline({ format: 'mobi' })).toBe(false)
    expect(canReadInline({ format: 'azw3', mimeType: 'application/vnd.amazon.ebook' })).toBe(false)
    expect(canReadInline({ format: 'cbr' })).toBe(false)
    expect(canReadInline({})).toBe(false)
  })
})

describe('cover fallbacks', () => {
  it('derives a stable gradient per title', () => {
    expect(coverGradient('Dune')).toBe(coverGradient('Dune'))
    expect(coverGradient('Dune')).toContain('linear-gradient')
  })

  it('builds a monogram from latin and CJK titles', () => {
    expect(coverInitials('Dune')).toBe('DU')
    expect(coverInitials('The Left Hand')).toBe('TL')
    expect(coverInitials('三体')).toBe('三体')
    expect(coverInitials('')).toBe('?')
  })
})
