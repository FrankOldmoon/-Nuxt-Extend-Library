/**
 * Library module — conversion engine unit tests.
 *
 * The EPUB round trip also exercises the ZIP *writer* (`createZip`) against the
 * module's own ZIP reader and EPUB parser.
 */
import { describe, it, expect } from 'vitest'
import {
  buildEpub,
  canConvertNatively,
  convertNatively,
  isConvertTarget,
  nativeTargets,
  splitTextChapters
} from '../../server/utils/convert'
import { buildReaderContent } from '../../server/utils/ebook'
import { unzipToMap } from '../../server/utils/zip'

const meta = { title: 'Fixture Book', author: 'Test Author', language: 'zh' }

describe('target capability checks', () => {
  it('validates target formats', () => {
    expect(isConvertTarget('epub')).toBe(true)
    expect(isConvertTarget('mobi')).toBe(true)
    expect(isConvertTarget('exe')).toBe(false)
    expect(isConvertTarget(undefined)).toBe(false)
  })

  it('knows which pairs are built in', () => {
    expect(canConvertNatively('epub', 'txt')).toBe(true)
    expect(canConvertNatively('EPUB', 'html')).toBe(true)
    expect(canConvertNatively('mobi', 'epub')).toBe(false)
    expect(nativeTargets('txt')).toEqual(['epub', 'html'])
    expect(nativeTargets('mobi')).toEqual([])
  })

  it('refuses unsupported native pairs', () => {
    expect(() => convertNatively(Buffer.from('x'), 'mobi', 'epub', meta)).toThrow()
  })
})

describe('splitTextChapters', () => {
  it('splits on detected chapter headings', () => {
    const text = `第一章 开端\n正文一。\n\n第二章 发展\n正文二。\n\n第三章 结束\n正文三。`
    const chapters = splitTextChapters(text)
    expect(chapters).toHaveLength(3)
    expect(chapters[0]!.title).toBe('第一章 开端')
    expect(chapters[0]!.body).toBe('正文一。')
    expect(chapters[2]!.title).toBe('第三章 结束')
  })

  it('groups by size when there are no headings', () => {
    const paragraph = 'x'.repeat(100)
    const text = Array.from({ length: 10 }, () => paragraph).join('\n\n')
    const chapters = splitTextChapters(text, 300)
    expect(chapters.length).toBeGreaterThan(1)
    // Allow for the paragraph separators the grouping adds.
    expect(chapters.every(chapter => chapter.body.replace(/\n/g, '').length <= 300)).toBe(true)
  })

  it('returns nothing for blank input', () => {
    expect(splitTextChapters('   ')).toEqual([])
  })
})

describe('buildEpub', () => {
  it('produces a spec-shaped EPUB the module can read back', () => {
    const epub = buildEpub([
      { title: 'Chapter 1', body: 'Hello world.\n\n第二段落。' },
      { title: 'Chapter 2', body: 'Second chapter body.' }
    ], meta)

    // ZIP container: mimetype must be the first, uncompressed entry.
    const entries = unzipToMap(epub)
    expect(entries.has('mimetype')).toBe(true)
    expect(entries.has('META-INF/container.xml')).toBe(true)
    expect(entries.has('OEBPS/content.opf')).toBe(true)
    expect(entries.has('OEBPS/ch1.xhtml')).toBe(true)
    expect(epub.subarray(30, 38).toString('ascii')).toBe('mimetype')

    // And the reader parser understands it.
    const content = buildReaderContent(epub, () => '')
    expect(content.chapters).toHaveLength(2)
    expect(content.chapters[0]!.html).toContain('Hello world.')
    expect(content.toc.length).toBeGreaterThan(0)
  })

  it('escapes markup in the source text', () => {
    const epub = buildEpub([{ title: 'A & B', body: '<script>alert(1)</script>' }], meta)
    const text = unzipToMap(epub).get('OEBPS/ch1.xhtml')!.toString('utf8')
    expect(text).toContain('&lt;script&gt;')
    expect(text).not.toContain('<script>')
  })
})

describe('convertNatively', () => {
  const epub = buildEpub([
    { title: 'One', body: 'Hello world.\n\n中文句子一。' },
    { title: 'Two', body: 'Another body.' }
  ], meta)

  it('converts EPUB → TXT with chapter text', () => {
    const out = convertNatively(epub, 'epub', 'txt', meta)
    const text = out.buffer.toString('utf8')
    expect(out.format).toBe('txt')
    expect(out.mimeType).toBe('text/plain')
    expect(text).toContain('Hello world.')
    expect(text).toContain('中文句子一。')
    expect(text).toContain('Another body.')
    expect(text).not.toContain('<p>')
  })

  it('prints each chapter title only once in the extracted text', () => {
    const out = convertNatively(epub, 'epub', 'txt', meta)
    const text = out.buffer.toString('utf8')
    // The chapter markup repeats its own <h1>, which must not be duplicated.
    expect(text.match(/One/g)).toHaveLength(1)
    expect(text.match(/Two/g)).toHaveLength(1)
  })

  it('converts EPUB → HTML as a single document', () => {
    const out = convertNatively(epub, 'epub', 'html', meta)
    const html = out.buffer.toString('utf8')
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('Fixture Book')
    expect(html).toContain('Hello world.')
  })

  it('converts TXT → EPUB that reads back cleanly', () => {
    const text = '第一章 开始\n内容一。\n\n第二章 继续\n内容二。'
    const out = convertNatively(Buffer.from(text, 'utf8'), 'txt', 'epub', {
      title: 'Plain Book',
      author: 'Someone',
      language: 'zh'
    })
    expect(out.format).toBe('epub')
    expect(out.buffer.subarray(0, 2).toString('ascii')).toBe('PK')

    const content = buildReaderContent(out.buffer, () => '')
    expect(content.chapters.length).toBe(2)
    expect(content.chapters[0]!.html).toContain('内容一。')
    expect(content.chapters[1]!.html).toContain('内容二。')
  })

  it('converts TXT → HTML', () => {
    const out = convertNatively(Buffer.from('Hello\n\nWorld', 'utf8'), 'txt', 'html', meta)
    expect(out.buffer.toString('utf8')).toContain('Hello')
  })
})
