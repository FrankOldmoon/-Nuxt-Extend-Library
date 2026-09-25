/**
 * Library module — filename / text helper unit tests.
 */
import { describe, it, expect } from 'vitest'
import {
  formatBytes,
  normalizeSortTitle,
  parseBookFilename,
  slugify,
  splitAuthors
} from '../../server/utils/parse'

describe('parseBookFilename', () => {
  it('parses "Title (Author)"', () => {
    expect(parseBookFilename('The Hobbit (Tolkien).epub')).toEqual({
      title: 'The Hobbit',
      authors: ['Tolkien']
    })
  })

  it('parses "[Author] Title"', () => {
    expect(parseBookFilename('[Isaac Asimov] Foundation.pdf')).toEqual({
      title: 'Foundation',
      authors: ['Isaac Asimov']
    })
  })

  it('parses "Title - Author"', () => {
    expect(parseBookFilename('Dune - Frank Herbert.epub')).toEqual({
      title: 'Dune',
      authors: ['Frank Herbert']
    })
  })

  it('parses a series with an index', () => {
    const parsed = parseBookFilename('Foundation (Foundation #3).epub')
    expect(parsed.title).toBe('Foundation')
    expect(parsed.series).toBe('Foundation')
    expect(parsed.seriesIndex).toBe(3)
  })

  it('falls back to the bare filename', () => {
    expect(parseBookFilename('some random book name.mobi')).toEqual({
      title: 'some random book name',
      authors: []
    })
  })
})

describe('splitAuthors', () => {
  it('splits on the common separators', () => {
    expect(splitAuthors('A, B')).toEqual(['A', 'B'])
    expect(splitAuthors('A & B')).toEqual(['A', 'B'])
    expect(splitAuthors('A、B')).toEqual(['A', 'B'])
    expect(splitAuthors(null)).toEqual([])
  })
})

describe('slugify', () => {
  it('produces url-safe slugs, keeping CJK', () => {
    expect(slugify('Must-Read Sci-Fi!')).toBe('must-read-sci-fi')
    expect(slugify('科幻 必读')).toBe('科幻-必读')
  })

  it('never returns an empty slug', () => {
    expect(slugify('!!!').startsWith('item-')).toBe(true)
  })
})

describe('normalizeSortTitle', () => {
  it('drops leading articles and punctuation', () => {
    expect(normalizeSortTitle('The Hobbit')).toBe('hobbit')
    expect(normalizeSortTitle('A Tale of Two Cities')).toBe('taleoftwocities')
    expect(normalizeSortTitle('三体')).toBe('三体')
  })
})

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(0)).toBe('0 B')
  })
})
