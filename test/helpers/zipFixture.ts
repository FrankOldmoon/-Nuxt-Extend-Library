/**
 * Test helper — build a ZIP archive (STORE or DEFLATE) in memory.
 *
 * Lets the library module's unit tests exercise the dependency-free ZIP/EPUB
 * reader without shipping a binary fixture, and without a real zip library.
 */
import { deflateRawSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipFixtureEntry {
  name: string
  data: Buffer | string
  deflate?: boolean
}

/** Assemble a minimal but spec-valid ZIP archive from the given entries. */
export function buildZip(entries: ZipFixtureEntry[]): Buffer {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8')
    const method = entry.deflate ? 8 : 0
    const data = entry.deflate ? deflateRawSync(raw) : raw
    const crc = crc32(raw)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(method, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(raw.length, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(0, 28)
    local.push(localHeader, name, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(method, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(raw.length, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    central.push(centralHeader, name)

    offset += localHeader.length + name.length + data.length
  }

  const centralDir = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...local, centralDir, eocd])
}

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Jane Doe</dc:creator>
    <dc:creator>John Roe</dc:creator>
    <dc:language>zh</dc:language>
    <dc:publisher>Test Press</dc:publisher>
    <dc:date>2020-05-01</dc:date>
    <dc:identifier id="bookid" opf:scheme="ISBN">9781234567897</dc:identifier>
    <dc:description>A &amp; B</dc:description>
    <dc:subject>Fiction</dc:subject>
    <meta property="belongs-to-collection">My Series</meta>
    <meta name="calibre:series" content="My Series"/>
    <meta name="calibre:series_index" content="2"/>
    <meta name="cover" content="cover-img"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover-img" href="Images/pic.png" media-type="image/png"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body>
  <nav epub:type="toc">
    <ol>
      <li><a href="ch1.xhtml">Chapter One</a></li>
      <li><a href="ch2.xhtml#top">Chapter Two</a></li>
    </ol>
  </nav>
</body>
</html>`

const CH1 = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Ch1</title><link rel="stylesheet" href="style.css"/></head>
<body>
  <h1>Chapter One</h1>
  <script>alert('x')</script>
  <p onclick="evil()">Hello <img src="Images/pic.png" onerror="evil()"/></p>
  <a href="ch2.xhtml#top">Next</a>
  <a href="https://example.com/page">External</a>
</body>
</html>`

const CH2 = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Ch2</title></head>
<body><h1 id="top">Chapter Two</h1><p>Done.</p></body>
</html>`

const CSS = 'body { background: url(Images/bg.png); color: #222; }'

/** A tiny, valid, STORE-compressed EPUB used across the module's tests. */
export function buildEpubFixture(): Buffer {
  return buildZip([
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'META-INF/container.xml', data: CONTAINER },
    { name: 'OEBPS/content.opf', data: OPF },
    { name: 'OEBPS/nav.xhtml', data: NAV },
    { name: 'OEBPS/ch1.xhtml', data: CH1 },
    { name: 'OEBPS/ch2.xhtml', data: CH2 },
    { name: 'OEBPS/style.css', data: CSS },
    { name: 'OEBPS/Images/pic.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    { name: 'OEBPS/Images/bg.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]) }
  ])
}
