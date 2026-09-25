/**
 * Library module — EPUB parsing (metadata, cover, chapters, TOC, assets).
 *
 * EPUB is an OCF (ZIP) container: `META-INF/container.xml` points at an OPF
 * package document that carries the metadata, a manifest and a spine. This
 * module reads all of that with the bundled `zip.ts` reader and regex-based XML
 * scanning — no third-party dependency (modules may not add packages).
 *
 * Everything is defensive: malformed books degrade to partial metadata rather
 * than throwing, so a bad upload never breaks the importer.
 */
import { listZipEntries, readZipEntry, unzipToMap } from './zip'
import {
  decodeXmlEntities,
  dirname,
  extractBody,
  resolveRelativePath,
  sanitizeHtml,
  stripTags
} from './html'

export interface EbookMetadata {
  title?: string
  authors: string[]
  language?: string
  publisher?: string
  /** ISO date string (YYYY-MM-DD) when parseable. */
  pubdate?: string
  isbn?: string
  description?: string
  tags: string[]
  series?: string
  seriesIndex?: number
  cover?: { data: Buffer, mime: string }
}

export interface TocItem {
  title: string
  /** Archive path (fragment stripped) the entry points at. */
  href: string
  /** Optional in-document fragment. */
  fragment?: string
  level: number
}

export interface ReaderChapter {
  index: number
  title: string
  /** Archive path of the chapter document. */
  path: string
  /** Sanitised HTML ready for `v-html`. */
  html: string
}

export interface ReaderContent {
  toc: TocItem[]
  chapters: ReaderChapter[]
}

export interface ManifestItem {
  id: string
  href: string
  mediaType: string
  properties: string
  /** Resolved archive path. */
  path: string
}

export interface SpineItem {
  idref: string
  linear: boolean
  item: ManifestItem
}

export interface EpubStructure {
  opfPath: string
  opfDir: string
  files: Map<string, Buffer>
  /** Raw OPF metadata block. */
  metadataXml: string
  manifest: ManifestItem[]
  spine: SpineItem[]
  navPath: string | null
  ncxPath: string | null
  coverPath: string | null
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  css: 'text/css',
  js: 'text/javascript',
  otf: 'font/otf',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  xhtml: 'application/xhtml+xml',
  html: 'text/html',
  htm: 'text/html',
  ncx: 'application/x-dtbncx+xml',
  xml: 'application/xml',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  ogv: 'video/ogg'
}

/** Guess the MIME type of an archive entry from its extension. */
export function mimeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] ?? 'application/octet-stream'
}

/** Normalise an ebook filename extension into a short, lower-case format tag. */
export function detectFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'jpeg') return 'jpg'
  return ext || 'bin'
}

/** Read an attribute value from a raw tag string. */
function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
  const m = tag.match(re)
  if (!m) return null
  return m[2] ?? m[3] ?? ''
}

/** All raw `<item …>` tags of a manifest block. */
function allTags(xml: string, localName: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${localName}\\b[^>]*>`, 'gi')
  return xml.match(re) ?? []
}

/** Inner text of the first `<localName>` element, entity-decoded and tag-free. */
function firstText(xml: string, localName: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${localName}\\s*>`, 'i')
  const m = xml.match(re)
  if (!m) return null
  const text = stripTags(m[1]!)
  return text || null
}

/** Inner text of every `<localName>` element. */
function allText(xml: string, localName: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${localName}\\s*>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const text = stripTags(m[1]!)
    if (text) out.push(text)
  }
  return out
}

/** Parse `META-INF/container.xml` → OPF path (falls back to a `*.opf` scan). */
function findOpfPath(files: Map<string, Buffer>): string | null {
  const container = files.get('META-INF/container.xml')?.toString('utf8')
  if (container) {
    for (const tag of allTags(container, 'rootfile')) {
      const path = attr(tag, 'full-path')
      if (path) return decodeXmlEntities(path)
    }
  }
  for (const name of files.keys()) {
    if (name.toLowerCase().endsWith('.opf')) return name
  }
  return null
}

/** Parse an OPF package document into a navigable structure. */
export function parseOpf(files: Map<string, Buffer>, opfPath: string): EpubStructure {
  const opfDir = dirname(opfPath)
  const opf = files.get(opfPath)?.toString('utf8') ?? ''

  const metadataMatch = opf.match(/<(?:\w+:)?metadata\b[^>]*>([\s\S]*?)<\/(?:\w+:)?metadata\s*>/i)
  const metadataXml = metadataMatch?.[1] ?? ''
  const manifestMatch = opf.match(/<(?:\w+:)?manifest\b[^>]*>([\s\S]*?)<\/(?:\w+:)?manifest\s*>/i)
  const manifestXml = manifestMatch?.[1] ?? ''
  const spineMatch = opf.match(/<(?:\w+:)?spine\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?spine\s*>/i)
  const spineAttrs = spineMatch?.[1] ?? ''
  const spineXml = spineMatch?.[2] ?? ''

  const manifest: ManifestItem[] = []
  for (const tag of allTags(manifestXml, 'item')) {
    const href = attr(tag, 'href')
    if (!href) continue
    const rawHref = decodeXmlEntities(href)
    manifest.push({
      id: attr(tag, 'id') ?? '',
      href: rawHref,
      mediaType: attr(tag, 'media-type') ?? '',
      properties: attr(tag, 'properties') ?? '',
      path: resolveRelativePath(opfDir, rawHref)
    })
  }
  const byId = new Map(manifest.map(i => [i.id, i]))

  // EPUB3 navigation document / EPUB2 NCX table of contents.
  let navPath: string | null = null
  let ncxPath: string | null = null
  for (const item of manifest) {
    if (item.properties.split(/\s+/).includes('nav')) navPath = item.path
    if (item.mediaType === 'application/x-dtbncx+xml' || item.path.toLowerCase().endsWith('.ncx')) {
      ncxPath = item.path
    }
  }
  const spineToc = attr(spineAttrs, 'toc')
  if (!ncxPath && spineToc && byId.has(spineToc)) ncxPath = byId.get(spineToc)!.path

  // Cover image: EPUB3 `cover-image` property, EPUB2 `<meta name="cover">`,
  // or a manifest image whose id/href hints at a cover.
  let coverPath: string | null = null
  const coverMeta = metadataXml.match(/<(?:\w+:)?meta\b[^>]*\bname\s*=\s*["']cover["'][^>]*>/i)
  const coverId = coverMeta ? attr(coverMeta[0], 'content') : null
  const coverProp = manifest.find(i => i.properties.split(/\s+/).includes('cover-image'))
  if (coverProp) coverPath = coverProp.path
  else if (coverId && byId.has(coverId)) coverPath = byId.get(coverId)!.path
  else {
    const guessed = manifest.find(i =>
      i.mediaType.startsWith('image/') && /cover/i.test(`${i.id} ${i.href}`)
    )
    if (guessed) coverPath = guessed.path
  }

  const spine: SpineItem[] = []
  for (const tag of allTags(spineXml, 'itemref')) {
    const idref = attr(tag, 'idref')
    if (!idref) continue
    const item = byId.get(idref)
    if (!item) continue
    spine.push({ idref, linear: attr(tag, 'linear') !== 'no', item })
  }

  return { opfPath, opfDir, files, metadataXml, manifest, spine, navPath, ncxPath, coverPath }
}

/** Open an EPUB buffer into its navigable structure, or null when invalid. */
export function readEpubStructure(buffer: Buffer): EpubStructure | null {
  let files: Map<string, Buffer>
  try {
    files = unzipToMap(buffer)
  } catch {
    return null
  }
  const opfPath = findOpfPath(files)
  if (!opfPath) return null
  try {
    return parseOpf(files, opfPath)
  } catch {
    return null
  }
}

/** Extract a usable publication date (YYYY-MM-DD) from a free-form dc:date. */
function normalizeDate(value: string | null): string | undefined {
  if (!value) return undefined
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const year = value.match(/(\d{4})/)
  return year ? `${year[1]}-01-01` : undefined
}

/** Extract metadata (title, authors, cover, …) from an EPUB buffer. */
export function extractMetadata(buffer: Buffer): EbookMetadata {
  const meta: EbookMetadata = { authors: [], tags: [] }
  const structure = readEpubStructure(buffer)
  if (!structure) return meta
  const xml = structure.metadataXml

  meta.title = firstText(xml, 'title') ?? undefined
  meta.authors = allText(xml, 'creator')
  meta.language = firstText(xml, 'language') ?? undefined
  meta.publisher = firstText(xml, 'publisher') ?? undefined
  meta.description = firstText(xml, 'description') ?? undefined
  meta.tags = allText(xml, 'subject')
  meta.pubdate = normalizeDate(firstText(xml, 'date'))

  // Series / index come from Calibre and EPUB3 belongs-to-collection metadata.
  const seriesMeta = xml.match(/<(?:\w+:)?meta\b[^>]*\bname\s*=\s*["']calibre:series["'][^>]*>/i)
  meta.series = seriesMeta ? decodeXmlEntities(attr(seriesMeta[0], 'content') ?? '') || undefined : undefined
  const indexMeta = xml.match(/<(?:\w+:)?meta\b[^>]*\bname\s*=\s*["']calibre:series_index["'][^>]*>/i)
  if (indexMeta) {
    const n = Number(attr(indexMeta[0], 'content'))
    if (Number.isFinite(n)) meta.seriesIndex = n
  }
  if (!meta.series) {
    const belongs = xml.match(/<(?:\w+:)?meta\b[^>]*\bproperty\s*=\s*["']belongs-to-collection["'][^>]*>([\s\S]*?)<\/(?:\w+:)?meta\s*>/i)
    if (belongs) meta.series = stripTags(belongs[1]!) || undefined
  }

  // ISBN: prefer an identifier whose scheme/id mentions ISBN, else a value that
  // looks like an ISBN-10/13.
  const identifierTags = allTags(xml, 'identifier')
  for (const tag of identifierTags) {
    const scheme = `${attr(tag, 'opf:scheme') ?? ''} ${attr(tag, 'id') ?? ''}`.toLowerCase()
    if (scheme.includes('isbn')) {
      const value = stripTags(tag.replace(/<[^>]*>/g, ''))
      if (value) {
        meta.isbn = value
        break
      }
    }
  }
  if (!meta.isbn) {
    const candidate = allText(xml, 'identifier').find(v => /^(97[89])?\d{9}[\dxX]$/.test(v.replace(/[-\s]/g, '')))
    if (candidate) meta.isbn = candidate.replace(/[-\s]/g, '')
  }

  if (structure.coverPath) {
    const data = structure.files.get(structure.coverPath)
    if (data) meta.cover = { data, mime: mimeForPath(structure.coverPath) }
  }

  return meta
}

/** Parse the EPUB3 navigation document (`<nav epub:type="toc">`). */
function parseNav(navHtml: string, navPath: string): TocItem[] {
  const navBlock = navHtml.match(/<nav\b[^>]*epub:type\s*=\s*["'][^"']*\btoc\b[^"']*["'][^>]*>([\s\S]*?)<\/nav\s*>/i)
  const scope = navBlock?.[1] ?? navHtml
  const baseDir = dirname(navPath)
  const items: TocItem[] = []
  const re = /<\/?(?:ol|ul)\b[^>]*>|<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
  let depth = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(scope))) {
    const tag = m[0]
    if (/^<\/?(?:ol|ul)\b/i.test(tag)) {
      depth += tag.startsWith('</') ? -1 : 1
      if (depth < 0) depth = 0
      continue
    }
    const href = m[1] ? attr(`<a${m[1]}>`, 'href') : null
    const title = stripTags(m[2] ?? '')
    if (href && title) {
      const [path, fragment] = splitHref(decodeXmlEntities(href))
      items.push({ title, href: resolveRelativePath(baseDir, path), fragment, level: Math.max(0, depth - 1) })
    }
  }
  return items
}

/** Parse the EPUB2 NCX table of contents (nested `<navPoint>` elements). */
function parseNcx(ncxXml: string, ncxPath: string): TocItem[] {
  const baseDir = dirname(ncxPath)
  const items: TocItem[] = []
  const re = /<(?:\w+:)?navPoint\b[^>]*>|<\/(?:\w+:)?navPoint\s*>|<(?:\w+:)?navLabel\b[^>]*>([\s\S]*?)<\/(?:\w+:)?navLabel\s*>|<(?:\w+:)?content\b[^>]*>/gi
  let depth = 0
  let pendingTitle = ''
  let m: RegExpExecArray | null
  while ((m = re.exec(ncxXml))) {
    const tag = m[0]
    if (/^<(?:\w+:)?navPoint\b/i.test(tag)) {
      depth++
      pendingTitle = ''
      continue
    }
    if (/^<\/(?:\w+:)?navPoint/i.test(tag)) {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (/^<(?:\w+:)?navLabel\b/i.test(tag)) {
      pendingTitle = stripTags(m[1] ?? '')
      continue
    }
    const src = attr(tag, 'src')
    if (src && pendingTitle && !/<navLabel/i.test(tag)) {
      const [path, fragment] = splitHref(decodeXmlEntities(src))
      items.push({ title: pendingTitle, href: resolveRelativePath(baseDir, path), fragment, level: Math.max(0, depth - 1) })
      pendingTitle = ''
    }
  }
  return items
}

function splitHref(href: string): [string, string | undefined] {
  const hash = href.indexOf('#')
  if (hash < 0) return [href, undefined]
  return [href.slice(0, hash), href.slice(hash + 1) || undefined]
}

/** Rewrite one URL-bearing attribute value inside a raw tag. */
function rewriteUrlAttr(
  value: string,
  baseDir: string,
  assetUrl: (path: string) => string
): string {
  if (!value) return value
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(value)) return value
  const [path, fragment] = splitHref(value)
  const resolved = resolveRelativePath(baseDir, path)
  const url = assetUrl(resolved)
  return fragment ? `${url}#${fragment}` : url
}

/** Rewrite `url()` references inside a CSS chunk to the asset endpoint. */
function rewriteCssUrls(
  css: string,
  cssDir: string,
  assetUrl: (path: string) => string
): string {
  return css.replace(/\burl\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (whole: string, _quote: string, url: string) => {
    const trimmed = url.trim()
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(trimmed)) return whole
    return `url("${assetUrl(resolveRelativePath(cssDir, trimmed))}")`
  })
}

/**
 * Collect and inline every `<link rel="stylesheet">` referenced by a chapter.
 * The link elements normally live in `<head>` — which `extractBody` drops — so
 * they must be resolved against the *full* document before the body is taken.
 */
function collectStylesheets(
  html: string,
  baseDir: string,
  structure: EpubStructure,
  assetUrl: (path: string) => string
): string {
  const chunks: string[] = []
  const re = /<link\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const tag = m[0]
    const rel = (attr(tag, 'rel') ?? '').toLowerCase()
    const href = attr(tag, 'href')
    if (!rel.includes('stylesheet') || !href) continue
    const cssPath = resolveRelativePath(baseDir, decodeXmlEntities(href))
    const css = structure.files.get(cssPath)?.toString('utf8')
    if (css) chunks.push(rewriteCssUrls(css, dirname(cssPath), assetUrl))
  }
  return chunks.join('\n')
}

/**
 * Rewrite a chapter document for the browser reader:
 *   - inline `<link rel="stylesheet">` files (with their `url()` assets),
 *   - point `<img>/<source>/<video>/<audio>/<image>` at the asset endpoint,
 *   - point intra-book `<a>` links at the reader's chapter jump protocol,
 *   - strip anything executable.
 */
function prepareChapter(
  rawHtml: string,
  chapterPath: string,
  structure: EpubStructure,
  assetUrl: (path: string) => string
): string {
  const baseDir = dirname(chapterPath)
  // 1. Resolve head stylesheets first (they are lost once we take the body).
  const css = collectStylesheets(rawHtml, baseDir, structure, assetUrl)
  let html = extractBody(rawHtml)

  // Media / image sources → asset endpoint.
  html = html.replace(/<(img|source|video|audio|track)\b([^>]*)\/?>/gi, (whole: string, name: string, attrs: string) => {
    const updated = attrs.replace(/\b(src|poster)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, key: string, _q: string, dq?: string, sq?: string) => {
      const value = dq ?? sq ?? ''
      const next = rewriteUrlAttr(decodeXmlEntities(value), baseDir, assetUrl)
      return `${key}="${next}"`
    })
    return `<${name}${updated}>`
  })

  // SVG <image xlink:href="…">.
  html = html.replace(/<image\b([^>]*)\/?>/gi, (whole: string, attrs: string) => {
    const updated = attrs.replace(/\b(xlink:href|href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, key: string, _q: string, dq?: string, sq?: string) => {
      const value = dq ?? sq ?? ''
      const next = rewriteUrlAttr(decodeXmlEntities(value), baseDir, assetUrl)
      return `${key}="${next}"`
    })
    return `<image${updated}>`
  })

  // Intra-book anchors → reader jump protocol (detected client-side).
  html = html.replace(/<a\b([^>]*)>/gi, (whole: string, attrs: string) => {
    const href = attr(`<a${attrs}>`, 'href')
    if (!href) return whole
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) {
      // External link: open safely in a new tab.
      return `<a${attrs.replace(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i, `href="${href}" target="_blank" rel="noopener noreferrer"`)}>`
    }
    const [path, fragment] = splitHref(decodeXmlEntities(href))
    const resolved = path ? resolveRelativePath(baseDir, path) : chapterPath
    const cleaned = attrs.replace(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i, '')
    return `<a${cleaned} href="#" data-lib-href="${resolved}"${fragment ? ` data-lib-frag="${fragment}"` : ''}>`
  })

  // Prepend the inlined stylesheets (scoped by the reader's container styles).
  const withCss = css
    ? `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>\n${html}`
    : html
  return sanitizeHtml(withCss)
}

/** Derive a human title for a chapter (TOC match → `<title>` → heading). */
function chapterTitle(html: string, path: string, tocByPath: Map<string, string>): string {
  const fromToc = tocByPath.get(path)
  if (fromToc) return fromToc
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)
  if (title) {
    const text = stripTags(title[1]!)
    if (text) return text
  }
  const heading = html.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]\s*>/i)
  if (heading) {
    const text = stripTags(heading[1]!)
    if (text) return text
  }
  return path.split('/').pop() ?? path
}

/**
 * Build the reader payload: the sanitised chapter list plus the TOC.
 * `assetUrl` maps an archive path to a browser URL (the asset endpoint).
 */
export function buildReaderContent(buffer: Buffer, assetUrl: (path: string) => string): ReaderContent {
  const structure = readEpubStructure(buffer)
  if (!structure) return { toc: [], chapters: [] }
  const { files, spine, navPath, ncxPath } = structure

  let toc: TocItem[] = []
  if (navPath && files.has(navPath)) {
    toc = parseNav(files.get(navPath)!.toString('utf8'), navPath)
  }
  if (!toc.length && ncxPath && files.has(ncxPath)) {
    toc = parseNcx(files.get(ncxPath)!.toString('utf8'), ncxPath)
  }
  // Fall back to the spine order when the book ships no usable TOC.
  if (!toc.length) {
    toc = spine
      .filter(s => s.item.mediaType.includes('html'))
      .map(s => ({ title: chapterTitle(files.get(s.item.path)?.toString('utf8') ?? '', s.item.path, new Map()), href: s.item.path, level: 0 }))
  }

  const tocByPath = new Map<string, string>()
  for (const item of toc) {
    if (!tocByPath.has(item.href)) tocByPath.set(item.href, item.title)
  }

  const chapters: ReaderChapter[] = []
  const seen = new Set<string>()
  for (const spineItem of spine) {
    const { item } = spineItem
    const isHtml = item.mediaType.includes('html') || /\.x?html?$/i.test(item.path)
    if (!isHtml || seen.has(item.path)) continue
    const raw = files.get(item.path)?.toString('utf8')
    if (!raw) continue
    seen.add(item.path)
    chapters.push({
      index: chapters.length,
      title: chapterTitle(raw, item.path, tocByPath),
      path: item.path,
      html: prepareChapter(raw, item.path, structure, assetUrl)
    })
  }

  return { toc, chapters }
}

/** Read a single raw asset (image/css/font) out of an EPUB buffer. */
export function readEpubAsset(buffer: Buffer, path: string): Buffer | null {
  try {
    const entry = listZipEntries(buffer).find(e => e.name === path)
    return entry ? readZipEntry(buffer, entry) : null
  } catch {
    return null
  }
}
