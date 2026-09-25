/**
 * Library — import a remote cover image into local storage.
 *
 * Used after picking a metadata candidate: remote cover URLs (Douban's CDN) are
 * hotlink-protected and may expire, so the image is downloaded once, validated
 * as an image, size-capped, and stored through the host storage pipeline.
 *
 * The URL is fully SSRF-guarded (no private/loopback targets) because it comes
 * from an external response, not from admin configuration.
 */
import { requireUser } from '../../../../../../server/utils/auth'
import { DOUBAN_REFERER, DOUBAN_USER_AGENT } from '../../../utils/douban'
import { assertFetchableUrl } from '../../../utils/net'
import { ensureCoverFile, isCoverMime } from '../../../utils/store'

const MAX_COVER_BYTES = 8 * 1024 * 1024

/** Detect an image MIME type from the file signature (magic bytes). */
function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer.length >= 6 && buffer.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5).toLowerCase() === '<?xml') return 'image/svg+xml'
  return null
}

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)

  const body = await readBody<{ url?: string }>(event)
  const raw = String(body?.url ?? '').trim()
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'url is required' })

  const target = await assertFetchableUrl(raw)

  let response: Response
  try {
    response = await fetch(target, {
      headers: {
        'user-agent': DOUBAN_USER_AGENT,
        'referer': DOUBAN_REFERER,
        'accept': 'image/*,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow'
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Could not download the cover image' })
  }
  if (!response.ok) {
    throw createError({ statusCode: 502, statusMessage: `Cover download failed (HTTP ${response.status})` })
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) {
    throw createError({ statusCode: 502, statusMessage: 'The cover image was empty' })
  }
  if (buffer.length > MAX_COVER_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'The cover image is too large (max 8 MB)' })
  }

  const headerMime = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  const mime = isCoverMime(headerMime) ? headerMime : sniffImageMime(buffer)
  if (!mime) {
    throw createError({ statusCode: 415, statusMessage: 'The URL did not return an image' })
  }

  const cover = await ensureCoverFile(ctx.user.id, buffer, mime)
  return { cover, bytes: buffer.length, mime }
})
