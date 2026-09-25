/**
 * Library — ebook format conversion.
 *
 * Two backends:
 *   1. **native** — dependency-free conversions handled by the module's own
 *      parsers: `epub → txt/html`, `txt/md/html → html/txt`, and text/HTML into
 *      a freshly generated EPUB (`utils/zip.ts` writes the container). These
 *      always work, even in a bare Node process.
 *   2. **Calibre** — anything else (mobi / azw3 / pdf / rtf / docx …) is handed
 *      to an external `ebook-convert` binary when one is installed and enabled
 *      via `library.converter.*`. The binary is executed directly (never through
 *      a shell) with an argv array, a timeout and validated extensions.
 */
import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildReaderContent } from './ebook'
import { htmlToText } from './text'
import { createZip } from './zip'

export const CONVERT_TARGETS = ['epub', 'pdf', 'mobi', 'azw3', 'txt', 'html', 'rtf', 'docx', 'fb2'] as const
export type ConvertTarget = typeof CONVERT_TARGETS[number]

const MIME: Record<ConvertTarget, string> = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  mobi: 'application/x-mobipocket-ebook',
  azw3: 'application/vnd.amazon.ebook',
  txt: 'text/plain',
  html: 'text/html',
  rtf: 'application/rtf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  fb2: 'application/x-fictionbook+xml'
}

export function mimeForTarget(target: ConvertTarget): string {
  return MIME[target]
}

export function isConvertTarget(value: unknown): value is ConvertTarget {
  return typeof value === 'string' && (CONVERT_TARGETS as readonly string[]).includes(value)
}

/** Conversions the module performs itself, keyed by source format. */
export const NATIVE_TARGETS: Record<string, ConvertTarget[]> = {
  epub: ['txt', 'html'],
  txt: ['epub', 'html'],
  md: ['epub', 'html', 'txt'],
  markdown: ['epub', 'html', 'txt'],
  html: ['epub', 'txt'],
  htm: ['epub', 'txt']
}

export function nativeTargets(from: string): ConvertTarget[] {
  return NATIVE_TARGETS[String(from ?? '').toLowerCase()] ?? []
}

export function canConvertNatively(from: string, to: string): boolean {
  return nativeTargets(from).includes(to as ConvertTarget)
}

export interface ConvertMeta {
  title: string
  author?: string | null
  language?: string | null
}

export interface ConvertOutput {
  buffer: Buffer
  mimeType: string
  format: ConvertTarget
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const CHAPTER_HEADING = /^\s*(?:第\s*[0-9一二三四五六七八九十百千零两]+\s*[章节回卷篇]|chapter\s+[0-9ivxlc]+\b|CHAPTER\s+[0-9IVXLC]+|序章|前言|后记|尾声|附录)\s*.*$/i

/**
 * Split plain text into chapters: at detected headings when there are at least
 * two of them, otherwise by grouping paragraphs up to `maxChars` each.
 */
export function splitTextChapters(text: string, maxChars = 8000): Array<{ title: string, body: string }> {
  const normalised = text.replace(/\r\n?/g, '\n').trim()
  if (!normalised) return []

  const lines = normalised.split('\n')
  const headingIndexes = lines
    .map((line, index) => (line.trim().length <= 60 && CHAPTER_HEADING.test(line) ? index : -1))
    .filter(index => index >= 0)

  if (headingIndexes.length >= 2) {
    const chapters: Array<{ title: string, body: string }> = []
    // Text before the first heading becomes a preface.
    const preface = lines.slice(0, headingIndexes[0]).join('\n').trim()
    if (preface) chapters.push({ title: 'Preface', body: preface })
    headingIndexes.forEach((start, i) => {
      const end = i + 1 < headingIndexes.length ? headingIndexes[i + 1]! : lines.length
      const title = lines[start]!.trim()
      const body = lines.slice(start + 1, end).join('\n').trim()
      chapters.push({ title, body })
    })
    return chapters.filter(chapter => chapter.body.length > 0)
  }

  // No usable headings — group paragraphs by size.
  const paragraphs = normalised.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const groups: Array<{ title: string, body: string }> = []
  let current: string[] = []
  let size = 0
  const flush = () => {
    if (!current.length) return
    groups.push({ title: `Part ${groups.length + 1}`, body: current.join('\n\n') })
    current = []
    size = 0
  }
  for (const paragraph of paragraphs) {
    if (size + paragraph.length > maxChars && current.length) flush()
    current.push(paragraph)
    size += paragraph.length
  }
  flush()
  return groups
}

function paragraphsToXhtml(title: string, body: string): string {
  const blocks = body
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head>
<body>
<h1>${escapeHtml(title)}</h1>
${blocks}
</body>
</html>`
}

/** Build a minimal, spec-shaped EPUB 3 container from chapters of text. */
export function buildEpub(chapters: Array<{ title: string, body: string }>, meta: ConvertMeta): Buffer {
  const list = chapters.length ? chapters : [{ title: meta.title, body: meta.title }]
  const language = meta.language && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/i.test(meta.language) ? meta.language : 'en'

  const manifest = list
    .map((_, i) => `<item id="ch${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('\n    ')
  const spine = list.map((_, i) => `<itemref idref="ch${i + 1}"/>`).join('\n    ')
  const navItems = list
    .map((chapter, i) => `<li><a href="ch${i + 1}.xhtml">${escapeHtml(chapter.title)}</a></li>`)
    .join('\n        ')

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeHtml(meta.title)}</dc:title>
    <dc:creator>${escapeHtml(meta.author ?? 'Unknown')}</dc:creator>
    <dc:language>${escapeHtml(language)}</dc:language>
    <dc:identifier id="bookid">urn:uuid:lib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}</dc:identifier>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
        ${navItems}
    </ol>
  </nav>
</body>
</html>`

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

  const entries = [
    { name: 'mimetype', data: Buffer.from('application/epub+zip', 'ascii') },
    { name: 'META-INF/container.xml', data: Buffer.from(container, 'utf8') },
    { name: 'OEBPS/content.opf', data: Buffer.from(opf, 'utf8') },
    { name: 'OEBPS/nav.xhtml', data: Buffer.from(nav, 'utf8') },
    ...list.map((chapter, i) => ({
      name: `OEBPS/ch${i + 1}.xhtml`,
      data: Buffer.from(paragraphsToXhtml(chapter.title, chapter.body), 'utf8')
    }))
  ]

  return createZip(entries)
}

/** Render the chapters of an EPUB (or of a text source) as one HTML document. */
function chaptersToHtml(chapters: Array<{ title: string, html: string }>, meta: ConvertMeta): string {
  const body = chapters
    .map(chapter => `<section>\n<h1>${escapeHtml(chapter.title)}</h1>\n${chapter.html}\n</section>`)
    .join('\n')
  return `<!DOCTYPE html>
<html lang="${escapeHtml(meta.language ?? 'en')}">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(meta.title)}</title>
<style>body{max-width:42rem;margin:0 auto;padding:2rem 1.25rem;line-height:1.7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}h1{font-size:1.4em;margin:2em 0 .6em}section+section{border-top:1px solid #ddd;margin-top:2rem;padding-top:1rem}</style>
</head>
<body>
${body}
</body>
</html>`
}

/** Convert using only the module's own parsers. Throws when the pair is unsupported. */
export function convertNatively(buffer: Buffer, from: string, to: ConvertTarget, meta: ConvertMeta): ConvertOutput {
  const source = String(from ?? '').toLowerCase()
  if (!canConvertNatively(source, to)) {
    throw new Error(`Native conversion ${source} → ${to} is not supported`)
  }

  const isArchiveSource = source === 'epub'
  const chapters: Array<{ title: string, html: string }> = isArchiveSource
    ? buildReaderContent(buffer, () => '').chapters.map(chapter => ({
        title: chapter.title || meta.title,
        html: chapter.html
      }))
    : (() => {
        const raw = buffer.toString('utf8')
        // HTML sources keep their markup; text sources are wrapped as paragraphs.
        const asHtml = source === 'html' || source === 'htm'
          ? raw
          : splitTextChapters(raw).map(chapter => paragraphsToXhtml(chapter.title, chapter.body)).join('\n')
        return [{ title: meta.title, html: asHtml }]
      })()

  if (to === 'txt') {
    const blocks = isArchiveSource
      ? chapters.map((chapter) => {
          const body = htmlToText(chapter.html)
          const title = chapter.title?.trim() ?? ''
          // Chapter markup normally repeats its title as a heading — don't print
          // it twice in the extracted text.
          const deduped = title && body.startsWith(title) ? body.slice(title.length).trim() : body
          return title ? `${title}\n\n${deduped}` : deduped
        })
      : [htmlToText(chapters.map(chapter => chapter.html).join('\n'))]
    return {
      buffer: Buffer.from(blocks.join('\n\n\n').trim() + '\n', 'utf8'),
      mimeType: MIME.txt,
      format: 'txt'
    }
  }

  if (to === 'html') {
    return {
      buffer: Buffer.from(chaptersToHtml(chapters, meta), 'utf8'),
      mimeType: MIME.html,
      format: 'html'
    }
  }

  if (to === 'epub') {
    const textChapters = isArchiveSource
      ? []
      : splitTextChapters(buffer.toString('utf8'))
    const input = textChapters.length
      ? textChapters
      : isArchiveSource
        ? chapters.map(chapter => ({ title: chapter.title, body: htmlToText(chapter.html) }))
        : [{ title: meta.title, body: htmlToText(chapters.map(chapter => chapter.html).join('\n')) }]
    return {
      buffer: buildEpub(input, meta),
      mimeType: MIME.epub,
      format: 'epub'
    }
  }

  throw new Error(`Native conversion to ${to} is not supported`)
}

// ---------------------------------------------------------------------------
// Calibre backend
// ---------------------------------------------------------------------------

const CALIBRE_CANDIDATES = [
  '/Applications/calibre.app/Contents/MacOS/ebook-convert',
  '/Applications/Calibre.app/Contents/MacOS/ebook-convert',
  '/usr/bin/ebook-convert',
  '/usr/local/bin/ebook-convert',
  '/opt/homebrew/bin/ebook-convert'
]

const probeCache = new Map<string, { at: number, path: string | null }>()
const PROBE_TTL_MS = 5 * 60 * 1000
/** Cap on a converted output we are willing to read into memory. */
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024

function probe(binary: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(binary, ['--version'], { timeout: timeoutMs }, error => resolve(!error))
  })
}

/**
 * Locate `ebook-convert`: an explicit path from config wins, then the well-known
 * install locations, then whatever is on `PATH`.
 */
export async function findCalibre(configured?: string | null): Promise<string | null> {
  const custom = configured?.trim()
  const key = custom || 'auto'

  const cached = probeCache.get(key)
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.path

  let found: string | null = null
  if (custom) {
    try {
      await access(custom, fsConstants.X_OK)
      found = custom
    } catch {
      found = null
    }
  }
  if (!found) {
    for (const candidate of CALIBRE_CANDIDATES) {
      try {
        await access(candidate, fsConstants.X_OK)
        found = candidate
        break
      } catch {
        // keep looking
      }
    }
  }
  // `ebook-convert` on PATH (execFile resolves through PATH).
  if (!found && await probe('ebook-convert')) found = 'ebook-convert'

  probeCache.set(key, { at: Date.now(), path: found })
  return found
}

/** Convert through an external `ebook-convert` binary. */
export async function convertWithCalibre(
  binary: string,
  input: Buffer,
  from: string,
  to: ConvertTarget,
  timeoutMs: number
): Promise<ConvertOutput> {
  const safeFrom = /^[a-z0-9]{1,8}$/.test(from) ? from : 'bin'
  const dir = await mkdtemp(join(tmpdir(), 'lib-convert-'))
  const inputPath = join(dir, `input.${safeFrom}`)
  const outputPath = join(dir, `output.${to}`)

  try {
    await writeFile(inputPath, input)
    await new Promise<void>((resolve, reject) => {
      execFile(binary, [inputPath, outputPath], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (error, _stdout, stderr) => {
        if (error) {
          const detail = String(stderr ?? '').trim().slice(0, 400) || error.message
          reject(new Error(`ebook-convert failed: ${detail}`))
          return
        }
        resolve()
      })
    })
    const buffer = await readFile(outputPath)
    if (!buffer.length) throw new Error('ebook-convert produced an empty file')
    if (buffer.length > MAX_OUTPUT_BYTES) throw new Error('Converted file exceeds the size limit')
    return { buffer, mimeType: MIME[to], format: to }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
