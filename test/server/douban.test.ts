/**
 * Library module — Douban metadata parsing + outbound URL guard tests.
 *
 * The network itself is never touched: the parsers are pure functions over
 * saved response fixtures, and the guard predicates work on literal IPs.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  isIsbn,
  normalizeDoubanCover,
  normalizeDoubanDate,
  parseDoubanSubject,
  parseDoubanSuggest
} from '../../server/utils/douban'
import {
  assertFetchableUrl,
  isAlwaysBlockedAddress,
  isPrivateAddress,
  parseIpv4
} from '../../server/utils/net'

// `createError` is a Nitro server auto-import at runtime; the bare Node test
// runner has no such global, so provide a minimal stub (only `assertFetchableUrl`
// reaches it — the parsers are pure).
vi.stubGlobal('createError', (input: { statusCode?: number, statusMessage?: string }) => {
  const error = new Error(input?.statusMessage ?? 'Error') as Error & { statusCode?: number }
  error.statusCode = input?.statusCode
  return error
})

const SUGGEST_JSON = `[
  {"title":"三体","sub_title":"","id":"2567698","type":"b","pic":"https://img1.doubanio.com/view/subject/s/public/s2768378.jpg","author_name":"刘慈欣","year":"2008","label":"刘慈欣 / 2008 / 重庆出版社"},
  {"title":"三体Ⅱ","id":"3066477","type":"b","pic":"//img9.doubanio.com/view/subject/m/public/s2768378.jpg","author_name":"刘慈欣","year":"2008","label":"刘慈欣 / 2008-05 / 重庆出版社"},
  {"title":"Some Album","id":"999","type":"m","pic":"https://img1.doubanio.com/x.jpg","author_name":"Band","year":"2019","label":"Band / 2019 / Label"}
]`

const SUBJECT_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><title>三体 (豆瓣)</title></head>
<body>
<div id="wrapper">
  <h1>
    <span property="v:itemreviewed">三体</span>
    <span class="year">(2008)</span>
  </h1>
  <div id="mainpic" class="subject-cover">
    <a class="nbg" href="https://book.douban.com/subject/2567698/" title="三体">
      <img src="https://img1.doubanio.com/view/subject/s/public/s2768378.jpg" title="三体" alt="三体" rel="v:image">
    </a>
  </div>
  <div id="interest_sectl">
    <div class="rating_wrap clearbox">
      <strong class="ll rating_num" property="v:average">8.9</strong>
      <span property="v:votes">123456</span>
    </div>
  </div>
  <div id="info" class="">
    <span class="pl"> 作者</span>: <a href="/author/24749/">刘慈欣</a><br>
    <span class="pl">出版社:</span> 重庆出版社<br>
    <span class="pl">副标题:</span> “地球往事”三部曲之一<br>
    <span class="pl">译者:</span> <a href="/search/%E6%9D%8E%E5%9B%9B">李四</a><br>
    <span class="pl">出版年:</span> 2008-1<br>
    <span class="pl">页数:</span> 302<br>
    <span class="pl">定价:</span> 23.00元<br>
    <span class="pl">装帧:</span> 平装<br>
    <span class="pl">丛书:</span> 中国科幻基石丛书<br>
    <span class="pl">ISBN:</span> 9787536692930<br>
  </div>
  <div class="related_info">
    <div id="link-report">
      <span property="v:summary" class="">文化大革命如火如荼进行的同时，军方探寻外星文明的绝秘计划取得了突破性进展。</span>
    </div>
  </div>
  <div id="db-tags-section">
    <div class="indent">
      <a class=" tag">科幻</a>
      <a class=" tag">刘慈欣</a>
      <a class=" tag">中国科幻</a>
    </div>
  </div>
</div>
</body>
</html>`

describe('parseDoubanSuggest', () => {
  it('keeps book entries and derives author / year / publisher from the label', () => {
    const items = parseDoubanSuggest(SUGGEST_JSON)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      source: 'douban',
      sourceId: '2567698',
      title: '三体',
      authors: ['刘慈欣'],
      year: '2008',
      publisher: '重庆出版社'
    })
    expect(items[1]!.title).toBe('三体Ⅱ')
  })

  it('upgrades cover thumbnails to the large variant over https', () => {
    const items = parseDoubanSuggest(SUGGEST_JSON)
    expect(items[0]!.cover).toBe('https://img1.doubanio.com/view/subject/l/public/s2768378.jpg')
    expect(items[1]!.cover).toBe('https://img9.doubanio.com/view/subject/l/public/s2768378.jpg')
  })

  it('is defensive about malformed payloads', () => {
    expect(parseDoubanSuggest('not json')).toEqual([])
    expect(parseDoubanSuggest('{"a":1}')).toEqual([])
    expect(parseDoubanSuggest('[{"type":"b"}]')).toEqual([])
  })
})

describe('parseDoubanSubject', () => {
  const meta = parseDoubanSubject(SUBJECT_HTML, '2567698')

  it('extracts the core bibliographic fields', () => {
    expect(meta.title).toBe('三体')
    expect(meta.subtitle).toBe('“地球往事”三部曲之一')
    expect(meta.publisher).toBe('重庆出版社')
    expect(meta.pubdate).toBe('2008-01-01')
    expect(meta.pages).toBe(302)
    expect(meta.isbn).toBe('9787536692930')
    expect(meta.series).toBe('中国科幻基石丛书')
    expect(meta.rating).toBe(8.9)
    expect(meta.sourceUrl).toBe('https://book.douban.com/subject/2567698/')
  })

  it('collects authors and appends translators', () => {
    expect(meta.authors).toEqual(['刘慈欣', '李四'])
  })

  it('extracts description, tags and an upgraded cover', () => {
    expect(meta.description).toContain('文化大革命')
    expect(meta.tags).toEqual(['科幻', '刘慈欣', '中国科幻'])
    expect(meta.cover).toBe('https://img1.doubanio.com/view/subject/l/public/s2768378.jpg')
  })

  it('degrades gracefully on unexpected markup', () => {
    const empty = parseDoubanSubject('<html><body>blocked</body></html>', '1')
    expect(empty.title).toBe('')
    expect(empty.authors).toEqual([])
    expect(empty.tags).toEqual([])
    expect(empty.rating).toBeUndefined()
  })
})

// A subject page shaped like Douban's *current* markup: the summary lives in
// `#link-report` (no `v:summary` span) and a `<style>` block is inlined.
const SUBJECT_HTML_MODERN = `<html><body>
  <div class="indent" id="link-report">
    <div>
      <style type="text/css" media="screen">
.intro p{text-indent:2em;word-break:normal;}
      </style>
      <div class="intro"><p>文化大革命如火如荼进行的同时。</p></div>
    </div>
  </div>
  <div id="info">
    <span class="pl">出版社:</span>
      <a href="https://book.douban.com/press/2162">重庆出版社</a>
    <br>
    <span class="pl">出版年:</span> 2008-1<br/>
    <span class="pl">ISBN:</span> 9787536692930<br>
  </div>
</body></html>`

describe('isIsbn', () => {
  it('recognises ISBN-10 and ISBN-13 with separators', () => {
    expect(isIsbn('9787536692930')).toBe(true)
    expect(isIsbn('978-7-5366-9293-0')).toBe(true)
    expect(isIsbn('7536692930')).toBe(true)
    expect(isIsbn('753669293X')).toBe(true)
    expect(isIsbn('三体')).toBe(false)
    expect(isIsbn('12345')).toBe(false)
  })
})

describe('parseDoubanSubject — modern markup', () => {
  const meta = parseDoubanSubject(SUBJECT_HTML_MODERN, '2567698')

  it('drops inline <style> noise from the description', () => {
    expect(meta.description).toBe('文化大革命如火如荼进行的同时。')
    expect(meta.description).not.toContain('text-indent')
  })

  it('still reads the info block around the inline anchors', () => {
    expect(meta.publisher).toBe('重庆出版社')
    expect(meta.pubdate).toBe('2008-01-01')
    expect(meta.isbn).toBe('9787536692930')
  })
})

describe('normalizeDoubanDate', () => {
  it('normalises the loose date formats Douban emits', () => {
    expect(normalizeDoubanDate('2008-1')).toBe('2008-01-01')
    expect(normalizeDoubanDate('2008')).toBe('2008-01-01')
    expect(normalizeDoubanDate('2019-04-05')).toBe('2019-04-05')
    expect(normalizeDoubanDate('2008年1月')).toBe('2008-01-01')
    expect(normalizeDoubanDate('')).toBeUndefined()
    expect(normalizeDoubanDate(null)).toBeUndefined()
  })
})

describe('normalizeDoubanCover', () => {
  it('rewrites protocol-relative and thumbnail URLs', () => {
    expect(normalizeDoubanCover('//img1.doubanio.com/view/subject/m/public/a.jpg'))
      .toBe('https://img1.doubanio.com/view/subject/l/public/a.jpg')
    expect(normalizeDoubanCover('http://img1.doubanio.com/view/subject/s/public/a.jpg'))
      .toBe('https://img1.doubanio.com/view/subject/l/public/a.jpg')
    expect(normalizeDoubanCover('https://example.com/a.jpg')).toBe('https://example.com/a.jpg')
    expect(normalizeDoubanCover('')).toBeUndefined()
  })
})

describe('outbound URL guard', () => {
  it('parses IPv4 literals', () => {
    expect(parseIpv4('127.0.0.1')).toBe(0x7f000001)
    expect(parseIpv4('1.2.3.4')).toBe(0x01020304)
    expect(parseIpv4('256.0.0.1')).toBeNull()
    expect(parseIpv4('nope')).toBeNull()
  })

  it('always blocks loopback / link-local / metadata / multicast', () => {
    for (const ip of ['127.0.0.1', '0.0.0.0', '169.254.169.254', '224.0.0.1', '::1', '::', 'fe80::1', 'ff02::1']) {
      expect(isAlwaysBlockedAddress(ip)).toBe(true)
    }
    expect(isAlwaysBlockedAddress('8.8.8.8')).toBe(false)
    expect(isAlwaysBlockedAddress('192.168.1.5')).toBe(false)
  })

  it('classifies private ranges separately', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '192.168.1.5', '100.64.0.1', 'fd00::1']) {
      expect(isPrivateAddress(ip)).toBe(true)
    }
    expect(isPrivateAddress('8.8.8.8')).toBe(false)
  })

  it('rejects non-http(s) and local/private targets', async () => {
    await expect(assertFetchableUrl('ftp://example.com/x')).rejects.toThrow()
    await expect(assertFetchableUrl('http://127.0.0.1/x')).rejects.toThrow()
    await expect(assertFetchableUrl('http://localhost/x')).rejects.toThrow()
    await expect(assertFetchableUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow()
    await expect(assertFetchableUrl('http://192.168.0.1/x')).rejects.toThrow()
    // …but an admin may opt into LAN mirrors for the provider base URL …
    await expect(assertFetchableUrl('http://192.168.0.1/x', { allowPrivate: true })).resolves.toBeInstanceOf(URL)
    // …while loopback stays blocked even then (SSRF-to-self).
    await expect(assertFetchableUrl('http://127.0.0.1/x', { allowPrivate: true })).rejects.toThrow()
  })

  it('accepts a public literal address', async () => {
    await expect(assertFetchableUrl('https://8.8.8.8/metadata')).resolves.toBeInstanceOf(URL)
  })
})
