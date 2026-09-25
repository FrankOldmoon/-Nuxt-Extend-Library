/**
 * Library module — HTML helpers for the ebook reader.
 *
 * Ebooks are untrusted input: chapter XHTML may embed scripts, event handlers
 * or `javascript:` URLs. The reader injects chapter markup into the page, so it
 * must be sanitised first. These helpers are deliberately regex based (no DOM
 * dependency) and kept pure, so they can be unit-tested in isolation.
 */

/** Resolve a (possibly relative) href against a base directory inside a ZIP. */
export function resolveRelativePath(baseDir: string, href: string): string {
  const clean = href.split('#')[0]!.split('?')[0]!
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return clean // absolute URL / data URI
  const base = clean.startsWith('/') ? [] : baseDir.split('/').filter(Boolean)
  const parts = clean.replace(/^\//, '').split('/')
  const stack = [...base]
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

/** Return the directory portion of an archive path (`a/b/c.xhtml` → `a/b`). */
export function dirname(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx < 0 ? '' : path.slice(0, idx)
}

/**
 * Extract the inner HTML of `<body>` (dropping the XML prolog, `<head>` and
 * the surrounding document) so chapter markup can be rendered standalone.
 */
export function extractBody(html: string): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  if (body) return body[1]!
  // No <body> — strip declaration/head if present and return as-is.
  return html
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
}

// Elements whose entire subtree must be removed (scripts / embedded content).
const DROP_SUBTREE = /<(script|iframe|frame|frameset|object|embed|applet|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
// Void/self-closing sensitive elements — remove the single tag only.
const DROP_TAG = /<\/?(script|iframe|frame|frameset|object|embed|applet|base|meta|form|input|button|link|noscript|template)\b[^>]*\/?>/gi

/**
 * Strip anything executable from chapter markup: script/iframe trees, event
 * handler attributes and `javascript:` URLs. Inline styling is preserved.
 */
export function sanitizeHtml(html: string): string {
  let out = html
  out = out.replace(/<!--[\s\S]*?-->/g, '')
  out = out.replace(DROP_SUBTREE, '')
  out = out.replace(DROP_TAG, '')
  // on*="…" / on*='…' / on*=bare
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // srcdoc on remaining elements
  out = out.replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*')/gi, '')
  // javascript: URLs in url-bearing attributes
  out = out.replace(/\s(href|src|xlink:href|action)\s*=\s*(["'])\s*(?:javascript|vbscript|data:text\/html)[^"']*\2/gi, '')
  return out
}

/** Decode the handful of XML entities that appear in OPF metadata. */
export function decodeXmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: '\'',
    nbsp: '\u00a0'
  }
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => named[name.toLowerCase()] ?? m)
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

/** Collapse whitespace and strip tags from a fragment of markup. */
export function stripTags(input: string): string {
  return decodeXmlEntities(input.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Drop embedded CSS/JS/comments from a markup fragment before it is turned into
 * plain text — scraped pages (e.g. Douban's description block) inline `<style>`
 * rules whose *contents* would otherwise leak into the extracted text.
 */
export function stripNoiseHtml(input: string): string {
  return input
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
}
