/**
 * Library module — minimal, dependency-free ZIP reader.
 *
 * Ebooks (EPUB, and the OCF/zip container they use) are ZIP archives. The host
 * project ships no unzip library and modules may not add dependencies, so this
 * file implements just enough of the ZIP spec to list and extract entries:
 *   - central-directory driven (authoritative sizes/offsets),
 *   - supports STORE (0) and DEFLATE (8), the only methods ebooks use,
 *   - ZIP64 end-of-central-directory records are tolerated,
 *   - filenames decoded as UTF-8 (flag bit 11) with a latin1 fallback.
 *
 * Pure module — only depends on `node:zlib`, so it is unit-testable in
 * isolation with no database or Nitro context.
 */
import { inflateRawSync } from 'node:zlib'

const SIG_EOCD = 0x06054b50
const SIG_EOCD64 = 0x06064b50
const SIG_EOCD64_LOCATOR = 0x07064b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

const METHOD_STORE = 0
const METHOD_DEFLATE = 8

export interface ZipEntry {
  /** Entry path inside the archive, e.g. `OEBPS/Text/ch1.xhtml`. */
  name: string
  /** Compression method (0 = store, 8 = deflate). */
  method: number
  compressedSize: number
  uncompressedSize: number
  crc32: number
  /** Byte offset of the matching local file header. */
  localHeaderOffset: number
  /** General purpose bit flag of the central directory record. */
  flags: number
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipError'
  }
}

/** Find the offset of the End Of Central Directory record, scanning backwards. */
function findEocd(buf: Buffer): number {
  const minOffset = Math.max(0, buf.length - 0xffff - 22)
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i
  }
  throw new ZipError('End of central directory not found — not a ZIP/EPUB file')
}

function decodeName(buf: Buffer, start: number, length: number, flags: number): string {
  const raw = buf.subarray(start, start + length)
  // Bit 11 (0x800) signals a UTF-8 encoded filename; otherwise fall back to
  // latin1 which never throws on arbitrary bytes.
  if (flags & 0x800) return raw.toString('utf8')
  return raw.toString('latin1')
}

/**
 * Read the central directory and return every entry. Throws `ZipError` when the
 * archive is malformed. Entry order follows the central directory.
 */
export function listZipEntries(buf: Buffer): ZipEntry[] {
  if (buf.length < 22) throw new ZipError('Buffer too small to be a ZIP archive')
  const eocd = findEocd(buf)

  let totalEntries = buf.readUInt16LE(eocd + 10)
  let cdOffset = buf.readUInt32LE(eocd + 16)

  // ZIP64: when the 16/32-bit fields are saturated, read the real values from
  // the ZIP64 EOCD record located via the locator just before the EOCD.
  if (totalEntries === 0xffff || cdOffset === 0xffffffff) {
    const locatorOffset = eocd - 20
    if (locatorOffset >= 0 && buf.readUInt32LE(locatorOffset) === SIG_EOCD64_LOCATOR) {
      const eocd64 = Number(buf.readBigUInt64LE(locatorOffset + 8))
      if (eocd64 >= 0 && eocd64 + 56 <= buf.length && buf.readUInt32LE(eocd64) === SIG_EOCD64) {
        totalEntries = Number(buf.readBigUInt64LE(eocd64 + 32))
        cdOffset = Number(buf.readBigUInt64LE(eocd64 + 48))
      }
    }
  }

  const entries: ZipEntry[] = []
  let p = cdOffset
  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new ZipError(`Corrupt central directory at entry ${i}`)
    }
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const crc32 = buf.readUInt32LE(p + 16)
    let compressedSize = buf.readUInt32LE(p + 20)
    let uncompressedSize = buf.readUInt32LE(p + 24)
    const nameLength = buf.readUInt16LE(p + 28)
    const extraLength = buf.readUInt16LE(p + 30)
    const commentLength = buf.readUInt16LE(p + 32)
    let localHeaderOffset = buf.readUInt32LE(p + 42)
    const name = decodeName(buf, p + 46, nameLength, flags)

    // Parse the ZIP64 extra field (0x0001) when any 32-bit field is saturated.
    const extraStart = p + 46 + nameLength
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      let e = extraStart
      const extraEnd = extraStart + extraLength
      while (e + 4 <= extraEnd) {
        const headerId = buf.readUInt16LE(e)
        const dataSize = buf.readUInt16LE(e + 2)
        if (headerId === 0x0001) {
          let f = e + 4
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(buf.readBigUInt64LE(f))
            f += 8
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(buf.readBigUInt64LE(f))
            f += 8
          }
          if (localHeaderOffset === 0xffffffff) {
            localHeaderOffset = Number(buf.readBigUInt64LE(f))
          }
          break
        }
        e += 4 + dataSize
      }
    }

    entries.push({ name, method, compressedSize, uncompressedSize, crc32, localHeaderOffset, flags })
    p += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/** Extract a single entry, returning its decompressed bytes. */
export function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const lh = entry.localHeaderOffset
  if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== SIG_LOCAL) {
    throw new ZipError(`Local header not found for entry "${entry.name}"`)
  }
  const nameLength = buf.readUInt16LE(lh + 26)
  const extraLength = buf.readUInt16LE(lh + 28)
  const dataStart = lh + 30 + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > buf.length) throw new ZipError(`Truncated entry "${entry.name}"`)

  const compressed = buf.subarray(dataStart, dataEnd)
  if (entry.method === METHOD_STORE) return Buffer.from(compressed)
  if (entry.method === METHOD_DEFLATE) return inflateRawSync(compressed)
  throw new ZipError(`Unsupported compression method ${entry.method} for "${entry.name}"`)
}

/**
 * Extract every entry into a `Map<name, Buffer>`. Directory entries (names
 * ending with `/`) are skipped. Suitable for EPUB-sized archives.
 */
export function unzipToMap(buf: Buffer): Map<string, Buffer> {
  const map = new Map<string, Buffer>()
  for (const entry of listZipEntries(buf)) {
    if (entry.name.endsWith('/')) continue
    map.set(entry.name, readZipEntry(buf, entry))
  }
  return map
}

// ---------------------------------------------------------------------------
// Writing (used to generate EPUBs from plain text — no compression needed)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c >>> 0
  }
  return table
})()

/** Standard CRC-32 (the checksum ZIP entries carry). */
export function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntryInput {
  name: string
  data: Buffer
}

/**
 * Build a ZIP archive with **stored** (uncompressed) entries.
 *
 * EPUB mandates that the first entry is an uncompressed `mimetype`, which is
 * exactly what this writer produces, so the output is a valid `.epub` container.
 */
export function createZip(entries: ZipEntryInput[]): Buffer {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const data = entry.data
    const checksum = crc32(data)

    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4) // version needed
    header.writeUInt16LE(0x0800, 6) // UTF-8 names
    header.writeUInt16LE(0, 8) // method: stored
    header.writeUInt16LE(0, 10) // mod time
    header.writeUInt16LE(0x21, 12) // mod date (1980-01-01)
    header.writeUInt32LE(checksum, 14)
    header.writeUInt32LE(data.length, 18) // compressed size
    header.writeUInt32LE(data.length, 22) // uncompressed size
    header.writeUInt16LE(nameBuf.length, 26)
    header.writeUInt16LE(0, 28) // extra length

    local.push(header, nameBuf, data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4) // version made by
    cd.writeUInt16LE(20, 6) // version needed
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0x21, 14)
    cd.writeUInt32LE(checksum, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30) // extra
    cd.writeUInt16LE(0, 32) // comment
    cd.writeUInt16LE(0, 34) // disk number
    cd.writeUInt16LE(0, 36) // internal attributes
    cd.writeUInt32LE(0, 38) // external attributes
    cd.writeUInt32LE(offset, 42) // local header offset

    central.push(cd, nameBuf)
    offset += header.length + nameBuf.length + data.length
  }

  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // central directory disk
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...local, centralBuf, eocd])
}
