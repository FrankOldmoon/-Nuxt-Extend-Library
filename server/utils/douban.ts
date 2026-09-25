/**
 * Library module — Douban book metadata provider.
 *
 * Douban exposes no public API key, so this module uses the two endpoints
 * talebook also relies on:
 *   1. `GET /j/subject_suggest?q=…` — JSON autocomplete (search by title/ISBN);
 *   2. `GET /subject/{id}/`          — the book page HTML (full metadata).
 *
 * Both fetches go through the SSRF guard in `net.ts`. The parsing is written as
 * pure functions over the raw JSON/HTML so it can be unit-tested against saved
 * fixtures without any network access, and so upstream marker drift degrades
 * gracefully (missing fields are simply absent, never thrown).
 */
import { decodeXmlEntities, stripNoiseHtml, stripTags } from './html'
import { assertFetchableUrl, type FetchGuardOptions } from './net'

export interface MetadataCandidate {
  source: 'douban'
  sourceId: string
  title: string
  subtitle?: string
  authors: string[]
  year?: string
  publisher?: string
  label?: string
  cover?: string
}

export interface FetchedMetadata extends MetadataCandidate {
  sourceUrl: string
  pubdate?: string
  isbn?: string
  pages?: number
  language?: string
  description?: string
  tags: string[]
  rating?: number
  series?: string
}

export interface DoubanOptions {
  baseUrl: string
  cookie?: string
  timeoutMs: number
}

/** Browser-ish UA — Douban rejects obviously non-browser clients. */
export const DOUBAN_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
/** Referer sent with metadata/cover requests (hotlink protection). */
export const DOUBAN_REFERER = 'https://book.douban.com/'

/** Split an author-ish string on the separators Douban mixes. */
function splitNames(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(/[/、,;]|\s{2,}/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** Collect the trimmed inner text of every `<a>` in a fragment. */
function anchorTexts(fragment: string): string[] {
  const out: string[] = []
  const re = /<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(fragment))) {
    const text = stripTags(m[1] ?? '')
    if (text) out.push(text)
  }
  return out
}

/**
 * Upgrade a Douban thumbnail to a larger variant. Douban's CDN encodes the size
 * in the path (`/view/subject/s/` = small, `m` = medium, `l` = large).
 */
export function normalizeDoubanCover(url: string | null | undefined): string | undefined {
  const raw = String(url ?? '').trim()
  if (!raw) return undefined
  let out = raw.startsWith('//') ? `https:${raw}` : raw
  out = out.replace(/^http:/i, 'https:')
  out = out.replace(/\/(view\/subject)\/[smt]\//i, '/$1/l/')
  out = out.replace(/\/(view\/subject)\/[smt]_ratio_poster\//i, '/$1/l_ratio_poster/')
  return out
}

/** Normalise Douban's loose dates (`2008`, `2008-1`, `2008年1月`) to `YYYY-MM-01`. */
export function normalizeDoubanDate(value: string | null | undefined): string | undefined {
  const raw = String(value ?? '').trim()
  if (!raw) return undefined
  const full = raw.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/)
  if (full) return `${full[1]}-${full[2]!.padStart(2, '0')}-${full[3]!.padStart(2, '0')}`
  const ym = raw.match(/(\d{4})\D(\d{1,2})/)
  if (ym) return `${ym[1]}-${ym[2]!.padStart(2, '0')}-01`
  const year = raw.match(/(\d{4})/)
  return year ? `${year[1]}-01-01` : undefined
}

/** Parse the `/j/subject_suggest` JSON payload into candidates. */
export function parseDoubanSuggest(raw: string): MetadataCandidate[] {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []

  const out: MetadataCandidate[] = []
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    // `type: 'b'` marks a book entry; other types (music/movie) are skipped.
    const type = String(row.type ?? '')
    if (type && type !== 'b') continue

    const sourceId = row.id != null ? String(row.id) : ''
    const title = stripTags(String(row.title ?? ''))
    if (!sourceId || !title) continue

    const label = String(row.label ?? '').trim()
    const parts = label.split('/').map(s => s.trim()).filter(Boolean)
    const authors = splitNames(String(row.author_name ?? ''))
    if (!authors.length && parts[0]) authors.push(...splitNames(parts[0]))

    out.push({
      source: 'douban',
      sourceId,
      title,
      subtitle: stripTags(String(row.sub_title ?? '')) || undefined,
      authors,
      year: String(row.year ?? parts[1] ?? '').trim() || undefined,
      publisher: parts[2] || undefined,
      label: label || undefined,
      cover: normalizeDoubanCover(String(row.pic ?? ''))
    })
  }
  return out
}

/** Split the `#info` block into `label → raw value fragment` pairs. */
function parseInfoBlock(html: string): Map<string, string> {
  const map = new Map<string, string>()
  const blockMatch = html.match(/<div[^>]*id=["']info["'][^>]*>([\s\S]*?)<\/div>/i)
  const block = blockMatch?.[1] ?? ''
  if (!block) return map

  const re = /<span[^>]*class=["'][^"']*\bpl\b[^"']*["'][^>]*>([\s\S]*?)<\/span>([\s\S]*?)(?=<span[^>]*class=["'][^"']*\bpl\b|$)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) {
    const key = stripTags(m[1] ?? '').replace(/[:：\s]+$/, '')
    const value = m[2] ?? ''
    if (key) map.set(key, value)
  }
  return map
}

/** Extract the first plain-text value for a label from an `#info` map. */
function infoText(map: Map<string, string>, ...labels: string[]): string | undefined {
  for (const label of labels) {
    const raw = map.get(label)
    if (raw == null) continue
    const withBreaks = raw.replace(/<br\s*\/?>/gi, ' ')
    const text = stripTags(stripNoiseHtml(withBreaks)).replace(/^[:：]\s*/, '').trim()
    if (text) return text
  }
  return undefined
}

/** Extract linked names (authors / translators) for a label from an `#info` map. */
function infoNames(map: Map<string, string>, ...labels: string[]): string[] {
  for (const label of labels) {
    const raw = map.get(label)
    if (raw == null) continue
    const names = anchorTexts(raw)
    if (names.length) return names
    const text = infoText(map, label)
    if (text) return splitNames(text)
  }
  return []
}

/** Parse a Douban subject page into structured metadata. */
export function parseDoubanSubject(html: string, sourceId: string): FetchedMetadata {
  const titleMatch = html.match(/<span[^>]*property=["']v:itemreviewed["'][^>]*>([\s\S]*?)<\/span\s*>/i)
    ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1\s*>/i)
  const title = stripTags(titleMatch?.[1] ?? '')

  const info = parseInfoBlock(html)
  const authors = infoNames(info, '作者')
  const translators = infoNames(info, '译者')

  const ratingMatch = html.match(/<strong[^>]*class=["'][^"']*rating_num[^"']*["'][^>]*>\s*([\d.]+)\s*<\/strong\s*>/i)
  const ratingValue = ratingMatch ? Number(ratingMatch[1]) : NaN

  // Description: the structured summary span, else the whole report block.
  // Douban inlines a `<style>` block in there, so strip noise before stripping tags.
  const summaryMatch = html.match(/<span[^>]*property=["']v:summary["'][^>]*>([\s\S]*?)<\/span\s*>/i)
  const reportMatch = html.match(/<div[^>]*id=["']link-report["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
  const description = stripTags(stripNoiseHtml(summaryMatch?.[1] ?? reportMatch?.[1] ?? '')) || undefined

  // Tags: the tag cloud anchors (also matched by their ` tag` class).
  const tags: string[] = []
  const tagRe = /<a\b[^>]*class=["'][^"']*\btag\b[^"']*["'][^>]*>([\s\S]*?)<\/a\s*>/gi
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = tagRe.exec(html))) {
    const tag = stripTags(tagMatch[1] ?? '')
    if (tag && !tags.includes(tag)) tags.push(tag)
  }

  const coverMatch = html.match(/<img[^>]*src=["']([^"']+)["'][^>]*id=["']mainpic["']/i)
    ?? html.match(/<a\b[^>]*class=["'][^"']*\bnbg\b[^"']*["'][^>]*>[\s\S]{0,300}?<img[^>]*src=["']([^"']+)["']/i)
    ?? html.match(/<img[^>]*property=["']v:image["'][^>]*src=["']([^"']+)["']/i)

  const pagesRaw = infoText(info, '页数')
  const pagesDigits = pagesRaw?.match(/\d{1,5}/)?.[0]

  const subtitle = infoText(info, '副标题')

  return {
    source: 'douban',
    sourceId,
    sourceUrl: `https://book.douban.com/subject/${sourceId}/`,
    title,
    subtitle: subtitle ?? undefined,
    authors: [...authors, ...translators.filter(name => !authors.includes(name))],
    publisher: infoText(info, '出版社'),
    pubdate: normalizeDoubanDate(infoText(info, '出版年', '出版日期')),
    isbn: infoText(info, 'ISBN')?.replace(/[^\dxX]/g, '') || undefined,
    pages: pagesDigits ? Number(pagesDigits) : undefined,
    description: description ? decodeXmlEntities(description) : undefined,
    tags,
    rating: Number.isFinite(ratingValue) ? ratingValue : undefined,
    series: infoText(info, '丛书'),
    cover: normalizeDoubanCover(coverMatch?.[1])
  }
}

/** Fetch a URL as text with a timeout, a browser-ish UA and optional cookies. */
async function fetchText(
  url: string,
  options: DoubanOptions,
  guard: FetchGuardOptions
): Promise<{ text: string, finalUrl: string }> {
  const target = await assertFetchableUrl(url, guard)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, options.timeoutMs))
  try {
    const headers: Record<string, string> = {
      'user-agent': DOUBAN_USER_AGENT,
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'referer': DOUBAN_REFERER
    }
    if (options.cookie) headers.cookie = options.cookie
    const response = await fetch(target, { headers, signal: controller.signal, redirect: 'follow' })
    if (!response.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: `Douban responded with HTTP ${response.status}`
      })
    }
    return { text: await response.text(), finalUrl: response.url || url }
  } catch (error) {
    // Re-throw our own typed errors; wrap everything else (DNS, TLS, timeout).
    if ((error as { statusCode?: number })?.statusCode) throw error
    throw createError({
      statusCode: 502,
      statusMessage: 'Could not reach Douban (network blocked, timed out or rate limited)'
    })
  } finally {
    clearTimeout(timer)
  }
}

/** True when the query looks like an ISBN-10 / ISBN-13. */
export function isIsbn(query: string): boolean {
  const compact = String(query ?? '').replace(/[-\s]/g, '')
  return /^(?:\d{9}[\dxX]|\d{13})$/.test(compact)
}

/**
 * Search Douban by free-text query (title, author, …).
 *
 * Douban's autocomplete endpoint does not index ISBNs, so an ISBN query that
 * yields nothing falls back to the `/isbn/{isbn}/` route (which redirects to
 * the matching subject) and returns that single book as a candidate.
 */
export async function searchDouban(query: string, options: DoubanOptions): Promise<MetadataCandidate[]> {
  const url = new URL('/j/subject_suggest', options.baseUrl)
  url.searchParams.set('q', query)
  // The provider base URL is admin-configured, so LAN mirrors are allowed here.
  const { text } = await fetchText(url.toString(), options, { allowPrivate: true })
  const items = parseDoubanSuggest(text)
  if (items.length) return items

  if (isIsbn(query)) {
    try {
      const metadata = await fetchDoubanByIsbn(query, options)
      return [{
        source: 'douban',
        sourceId: metadata.sourceId,
        title: metadata.title,
        subtitle: metadata.subtitle,
        authors: metadata.authors,
        year: metadata.pubdate?.slice(0, 4),
        publisher: metadata.publisher,
        cover: metadata.cover
      }]
    } catch {
      // Fall through — an unknown ISBN simply has no candidates.
    }
  }
  return items
}

/** Fetch one Douban subject's full metadata by its numeric id. */
export async function fetchDoubanSubject(sourceId: string, options: DoubanOptions): Promise<FetchedMetadata> {
  if (!/^\d{4,12}$/.test(sourceId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Douban subject id' })
  }
  const url = new URL(`/subject/${sourceId}/`, options.baseUrl)
  const { text } = await fetchText(url.toString(), options, { allowPrivate: true })
  const metadata = parseDoubanSubject(text, sourceId)
  if (!metadata.title) {
    throw createError({ statusCode: 502, statusMessage: 'Could not parse Douban metadata for this subject' })
  }
  return metadata
}

/**
 * Look a book up by ISBN via Douban's `/isbn/{isbn}/` route, which redirects to
 * the matching subject page. The subject id is recovered from the final URL.
 */
export async function fetchDoubanByIsbn(isbn: string, options: DoubanOptions): Promise<FetchedMetadata> {
  const compact = String(isbn ?? '').replace(/[-\s]/g, '')
  if (!isIsbn(compact)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid ISBN' })
  }
  const url = new URL(`/isbn/${compact}/`, options.baseUrl)
  const { text, finalUrl } = await fetchText(url.toString(), options, { allowPrivate: true })

  const sourceId = finalUrl.match(/\/subject\/(\d+)/)?.[1] ?? ''
  const metadata = parseDoubanSubject(text, sourceId)
  if (!metadata.title) {
    throw createError({ statusCode: 404, statusMessage: 'No Douban book was found for that ISBN' })
  }
  metadata.sourceId = sourceId || metadata.sourceId
  metadata.sourceUrl = finalUrl
  return metadata
}
