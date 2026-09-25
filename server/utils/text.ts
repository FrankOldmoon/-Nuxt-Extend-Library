/**
 * Library module — plain-text helpers for full-text search.
 *
 * Chapters are stored as sanitised HTML, but search needs readable text and
 * highlighted results. Everything here is pure (regex based, no DOM) so it can
 * be unit-tested without a browser or database.
 */
import { decodeXmlEntities } from './html'

// Block-level boundaries become newlines so paragraphs stay separable.
const BLOCK_BOUNDARY = /<\/?(?:p|div|br|h[1-6]|li|tr|td|th|blockquote|section|article|figcaption|pre|hr|dd|dt)\b[^>]*>/gi

/** Convert sanitised chapter markup into readable plain text. */
export function htmlToText(html: string): string {
  if (!html) return ''
  const spaced = html.replace(BLOCK_BOUNDARY, '\n')
  const stripped = spaced.replace(/<[^>]*>/g, '')
  return decodeXmlEntities(stripped)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Escape a query the way `decodeXmlEntities` would have encoded it. */
function encodeEntities(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Wrap every occurrence of `query` in `<mark class="lib-hit">`.
 *
 * The markup is tokenised on tags first, so replacements only ever touch text
 * segments — attributes and structure can never be corrupted. Entity-encoded
 * matches (e.g. a query containing `&`) are handled by matching both the raw and
 * the encoded form.
 */
export function highlightHtml(html: string, query: string): string {
  const needle = query.trim()
  if (!html || !needle) return html

  // Longest alternative first: otherwise the raw `&` would win over `&amp;`
  // and leave a dangling `amp;` outside the highlight.
  const forms = [...new Set([needle, encodeEntities(needle)])].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(forms.map(escapeRegExp).join('|'), 'gi')

  return html
    .split(/(<[^>]*>)/)
    .map((segment) => {
      if (segment.startsWith('<')) return segment
      return segment.replace(pattern, match => `<mark class="lib-hit">${match}</mark>`)
    })
    .join('')
}

export interface TextSnippet {
  snippet: string
  /** Character offset of the match inside the chapter text. */
  offset: number
  /** True when the query was found (false = fallback preview of the chapter). */
  matched: boolean
}

/** Build a one-line preview centred on the first match (or the chapter head). */
export function buildSnippet(text: string, query: string, radius = 80): TextSnippet {
  const flat = text.replace(/\s+/g, ' ').trim()
  const needle = query.trim().toLowerCase()
  const found = needle ? flat.toLowerCase().indexOf(needle) : -1

  if (found < 0) {
    return {
      snippet: flat.slice(0, radius * 2) + (flat.length > radius * 2 ? '…' : ''),
      offset: 0,
      matched: false
    }
  }

  const start = Math.max(0, found - radius)
  const end = Math.min(flat.length, found + needle.length + radius)
  return {
    snippet: (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : ''),
    offset: found,
    matched: true
  }
}
