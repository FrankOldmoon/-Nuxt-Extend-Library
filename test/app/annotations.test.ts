/**
 * Library module — annotation vocabulary unit tests.
 */
import { describe, it, expect } from 'vitest'
import {
  ANNOTATION_COLORS,
  ANNOTATION_STYLES,
  annotationColor,
  annotationInk,
  annotationPreview,
  annotationStyle,
  annotationVars,
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_ANNOTATION_STYLE,
  isAnnotationColor,
  isAnnotationStyle,
  isRange
} from '../../app/utils/annotations'

describe('annotation vocabulary', () => {
  it('has unique, non-empty keys and labels', () => {
    for (const list of [ANNOTATION_COLORS, ANNOTATION_STYLES]) {
      const keys = list.map(entry => entry.key)
      expect(new Set(keys).size).toBe(keys.length)
      expect(keys.every(key => key.length > 0)).toBe(true)
    }
    expect(ANNOTATION_COLORS.every(color => color.ink && color.wash)).toBe(true)
    expect(ANNOTATION_STYLES.every(style => style.icon.startsWith('i-lucide-'))).toBe(true)
  })

  it('offers several colours and several line styles', () => {
    expect(ANNOTATION_COLORS.length).toBeGreaterThanOrEqual(4)
    // One background highlight plus at least four underline variants.
    const decorations = ANNOTATION_STYLES.filter(style => style.decoration)
    expect(decorations.length).toBeGreaterThanOrEqual(4)
    expect(ANNOTATION_STYLES.some(style => style.decoration === null)).toBe(true)
  })

  it('gives every line style a distinct decoration', () => {
    const decorations = ANNOTATION_STYLES
      .map(style => style.decoration)
      .filter((decoration): decoration is string => decoration !== null)
    expect(new Set(decorations).size).toBe(decorations.length)
  })

  it('resolves known keys and falls back to the defaults', () => {
    expect(annotationColor('green').key).toBe('green')
    expect(annotationStyle('wavy').key).toBe('wavy')
    expect(annotationColor('nope').key).toBe(DEFAULT_ANNOTATION_COLOR)
    expect(annotationStyle(undefined).key).toBe(DEFAULT_ANNOTATION_STYLE)
    expect(annotationColor(null).key).toBe(DEFAULT_ANNOTATION_COLOR)
  })

  it('validates keys for the server allow-list', () => {
    expect(isAnnotationColor('yellow')).toBe(true)
    expect(isAnnotationColor('chartreuse')).toBe(false)
    expect(isAnnotationColor(7)).toBe(false)
    expect(isAnnotationStyle('double')).toBe(true)
    expect(isAnnotationStyle('blink')).toBe(false)
    expect(isAnnotationStyle(null)).toBe(false)
  })

  it('exposes paint variables for a colour', () => {
    const vars = annotationVars('blue')
    expect(Object.keys(vars).sort()).toEqual(['--anno-ink', '--anno-wash'])
    expect(vars['--anno-ink']).toBe(annotationInk('blue'))
    // Unknown colours still paint something rather than throwing.
    expect(annotationVars(undefined)['--anno-ink']).toBe(annotationInk(DEFAULT_ANNOTATION_COLOR))
  })
})

describe('isRange', () => {
  it('accepts a forward range and rejects everything else', () => {
    expect(isRange({ startOffset: 3, endOffset: 9 })).toBe(true)
    expect(isRange({ startOffset: 3, endOffset: 3 })).toBe(false)
    expect(isRange({ startOffset: 9, endOffset: 3 })).toBe(false)
    expect(isRange({ startOffset: null, endOffset: 9 })).toBe(false)
    expect(isRange({ startOffset: 0, endOffset: null })).toBe(false)
  })
})

describe('annotationPreview', () => {
  it('collapses whitespace and prefers the quoted text', () => {
    expect(annotationPreview({ text: '  a\n\nb  ', note: 'ignored' })).toBe('a b')
    expect(annotationPreview({ text: null, note: 'only a note' })).toBe('only a note')
    expect(annotationPreview({ text: null, note: null })).toBe('')
  })

  it('truncates with an ellipsis', () => {
    const preview = annotationPreview({ text: 'x'.repeat(200), note: null }, 20)
    expect(preview.length).toBe(20)
    expect(preview.endsWith('…')).toBe(true)
  })
})
