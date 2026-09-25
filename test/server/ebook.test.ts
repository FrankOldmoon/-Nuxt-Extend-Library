/**
 * Library module — ZIP reader + EPUB parser unit tests.
 *
 * Pure, dependency-free: the archive is assembled in-memory by
 * `test/helpers/zipFixture.ts`, so these tests need no database, network or
 * fixture binaries.
 */
import { describe, it, expect } from 'vitest'
import { ZipError, listZipEntries, readZipEntry, unzipToMap } from '../../server/utils/zip'
import {
  buildReaderContent,
  detectFormat,
  extractMetadata,
  mimeForPath,
  readEpubAsset,
  readEpubStructure
} from '../../server/utils/ebook'
import { extractBody, resolveRelativePath, sanitizeHtml } from '../../server/utils/html'
import { buildEpubFixture, buildZip } from '../helpers/zipFixture'

describe('zip reader', () => {
  it('lists and extracts STORE entries', () => {
    const zip = buildZip([
      { name: 'a.txt', data: 'hello' },
      { name: 'dir/b.txt', data: 'world' }
    ])
    const entries = listZipEntries(zip)
    expect(entries.map(e => e.name)).toEqual(['a.txt', 'dir/b.txt'])
    expect(readZipEntry(zip, entries[0]!).toString('utf8')).toBe('hello')
    expect(readZipEntry(zip, entries[1]!).toString('utf8')).toBe('world')
  })

  it('extracts DEFLATE entries', () => {
    const zip = buildZip([{ name: 'c.txt', data: 'compress me '.repeat(50), deflate: true }])
    const [entry] = listZipEntries(zip)
    expect(entry!.method).toBe(8)
    expect(readZipEntry(zip, entry!).toString('utf8')).toBe('compress me '.repeat(50))
  })

  it('builds a name → buffer map and skips nothing unexpected', () => {
    const map = unzipToMap(buildZip([{ name: 'x/1', data: '1' }, { name: 'x/2', data: '2' }]))
    expect([...map.keys()]).toEqual(['x/1', 'x/2'])
  })

  it('throws ZipError on non-zip input', () => {
    expect(() => listZipEntries(Buffer.from('not a zip file at all'))).toThrow(ZipError)
  })
})

describe('html helpers', () => {
  it('resolves relative archive paths', () => {
    expect(resolveRelativePath('OEBPS/Text', '../Images/a.png')).toBe('OEBPS/Images/a.png')
    expect(resolveRelativePath('OEBPS', 'ch1.xhtml')).toBe('OEBPS/ch1.xhtml')
    expect(resolveRelativePath('OEBPS/Text', 'https://x/y.png')).toBe('https://x/y.png')
  })

  it('extracts the body and strips executable markup', () => {
    const html = '<html><head><title>t</title></head><body><p>hi</p><script>bad()</script></body></html>'
    expect(extractBody(html)).toBe('<p>hi</p><script>bad()</script>')
    const safe = sanitizeHtml(extractBody(html))
    expect(safe).toBe('<p>hi</p>')
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
    expect(sanitizeHtml('<p onmouseover="x()">y</p>')).toBe('<p>y</p>')
  })
})

describe('ebook helpers', () => {
  it('maps mime types and normalises formats', () => {
    expect(mimeForPath('a/b/c.png')).toBe('image/png')
    expect(mimeForPath('noext')).toBe('application/octet-stream')
    expect(detectFormat('Book.EPUB')).toBe('epub')
    expect(detectFormat('photo.jpeg')).toBe('jpg')
  })

  it('opens the structure and reads assets', () => {
    const epub = buildEpubFixture()
    const structure = readEpubStructure(epub)
    expect(structure).not.toBeNull()
    expect(structure!.opfPath).toBe('OEBPS/content.opf')
    expect(structure!.spine.map(s => s.item.path)).toEqual(['OEBPS/ch1.xhtml', 'OEBPS/ch2.xhtml'])
    expect(readEpubAsset(epub, 'OEBPS/style.css')!.toString('utf8')).toContain('background')
  })

  it('extracts metadata including series, isbn and cover', () => {
    const meta = extractMetadata(buildEpubFixture())
    expect(meta.title).toBe('Test Book')
    expect(meta.authors).toEqual(['Jane Doe', 'John Roe'])
    expect(meta.language).toBe('zh')
    expect(meta.publisher).toBe('Test Press')
    expect(meta.pubdate).toBe('2020-05-01')
    expect(meta.isbn).toBe('9781234567897')
    expect(meta.description).toBe('A & B')
    expect(meta.tags).toEqual(['Fiction'])
    expect(meta.series).toBe('My Series')
    expect(meta.seriesIndex).toBe(2)
    expect(meta.cover?.mime).toBe('image/png')
  })

  it('returns partial metadata for invalid input instead of throwing', () => {
    const meta = extractMetadata(Buffer.from('garbage'))
    expect(meta.title).toBeUndefined()
    expect(meta.authors).toEqual([])
  })

  it('builds sanitised reader content with TOC, inlined CSS and rewritten assets', () => {
    const assetUrl = (path: string) => `/asset?path=${encodeURIComponent(path)}`
    const content = buildReaderContent(buildEpubFixture(), assetUrl)

    expect(content.toc.map(t => t.title)).toEqual(['Chapter One', 'Chapter Two'])
    expect(content.chapters.map(c => c.path)).toEqual(['OEBPS/ch1.xhtml', 'OEBPS/ch2.xhtml'])
    expect(content.chapters.map(c => c.title)).toEqual(['Chapter One', 'Chapter Two'])

    const ch1 = content.chapters[0]!.html
    expect(ch1).not.toContain('<script')
    expect(ch1).not.toContain('onclick')
    expect(ch1).not.toContain('onerror')
    // Image src rewritten to the asset endpoint …
    expect(ch1).toContain('/asset?path=OEBPS%2FImages%2Fpic.png')
    // … stylesheet inlined, with its url() rewritten too.
    expect(ch1).toContain('<style>')
    expect(ch1).toContain('/asset?path=OEBPS%2FImages%2Fbg.png')
    // Internal link → reader jump protocol, external link stays external.
    expect(ch1).toContain('data-lib-href="OEBPS/ch2.xhtml"')
    expect(ch1).toContain('data-lib-frag="top"')
    expect(ch1).toContain('target="_blank"')
  })
})
