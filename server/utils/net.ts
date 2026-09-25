/**
 * Library module — outbound URL safety guard.
 *
 * The library fetches remote metadata (Douban) and remote cover images. Both
 * are server-side requests to URLs that are at least partly influenced by
 * external data, so every fetch first passes through `assertFetchableUrl`:
 *
 *   - only `http:` / `https:` is allowed;
 *   - loopback / link-local / cloud-metadata / multicast / unspecified targets
 *     are ALWAYS rejected (that is the SSRF-to-self / SSRF-to-metadata risk);
 *   - RFC1918 / CGNAT / ULA "private" targets are rejected too, unless the
 *     caller opts in via `allowPrivate` (used only for the *admin-configured*
 *     provider base URL, so a LAN mirror keeps working).
 *
 * DNS names are resolved and every returned address is checked, which closes
 * the "public hostname that resolves to 127.0.0.1" hole.
 *
 * Pure helpers are exported separately so they can be unit-tested without a
 * network or Nitro context.
 */
import { lookup } from 'node:dns/promises'

// `createError` comes from Nitro's server auto-imports (see the module's API
// routes for the same pattern); importing it from 'h3' directly would tie this
// pure-ish helper to a package that is not a direct dependency.

/** Parse a dotted-quad IPv4 into an unsigned 32-bit int, or null. */
export function parseIpv4(input: string): number | null {
  const parts = input.split('.')
  if (parts.length !== 4) return null
  let acc = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    acc = (acc << 8) | n
  }
  return acc >>> 0
}

function inIpv4Range(ip: number, base: string, bits: number): boolean {
  const baseInt = parseIpv4(base)
  if (baseInt == null) return false
  if (bits <= 0) return true
  if (bits >= 32) return ip === baseInt
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ip & mask) === (baseInt & mask)
}

// Never legitimate as an outbound metadata/cover target.
const ALWAYS_BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network" / unspecified
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. 169.254.169.254 metadata
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4] // reserved
]

// Private / non-routable ranges — blocked unless the caller opts in.
const PRIVATE_V4: Array<[string, number]> = [
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24] // documentation
]

/** Extract the embedded IPv4 of an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`). */
function mappedIpv4(input: string): number | null {
  const m = input.toLowerCase().match(/^::ffff:((?:\d{1,3}\.){3}\d{1,3})$/)
  return m ? parseIpv4(m[1]!) : null
}

/**
 * True for loopback / link-local / unspecified / multicast / metadata targets.
 * These are rejected regardless of the `allowPrivate` opt-in.
 */
export function isAlwaysBlockedAddress(input: string): boolean {
  const host = input.replace(/^\[|\]$/g, '').toLowerCase()
  const mapped = mappedIpv4(host)
  if (mapped != null) return ALWAYS_BLOCKED_V4.some(([base, bits]) => inIpv4Range(mapped, base, bits))

  const v4 = parseIpv4(host)
  if (v4 != null) return ALWAYS_BLOCKED_V4.some(([base, bits]) => inIpv4Range(v4, base, bits))

  if (!host.includes(':')) return false
  // IPv6 textual checks — covers loopback/unspecified, link-local, multicast
  // and IPv4-compatible loopback forms.
  if (host === '::' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  if (/^fe[89ab]/.test(host)) return true // fe80::/10 link-local
  if (/^ff/.test(host)) return true // ff00::/8 multicast
  return false
}

/** True for private / non-routable addresses (RFC1918, CGNAT, ULA, …). */
export function isPrivateAddress(input: string): boolean {
  const host = input.replace(/^\[|\]$/g, '').toLowerCase()
  const mapped = mappedIpv4(host)
  if (mapped != null) return PRIVATE_V4.some(([base, bits]) => inIpv4Range(mapped, base, bits))

  const v4 = parseIpv4(host)
  if (v4 != null) return PRIVATE_V4.some(([base, bits]) => inIpv4Range(v4, base, bits))

  // IPv6 unique-local addresses fc00::/7.
  return /^f[cd]/.test(host)
}

/** True for obviously-local hostnames (no DNS lookup needed). */
export function isLocalHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return h === '' || h === 'localhost' || h.endsWith('.localhost') || h === 'local' || h.endsWith('.local')
}

export interface FetchGuardOptions {
  /** Allow RFC1918 / ULA targets (admin-configured provider mirrors only). */
  allowPrivate?: boolean
}

/**
 * Validate an outbound URL, throwing a 400 when it is not safe to fetch.
 * Returns the parsed URL on success.
 */
export async function assertFetchableUrl(raw: string, options: FetchGuardOptions = {}): Promise<URL> {
  let url: URL
  try {
    url = new URL(String(raw))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid URL' })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw createError({ statusCode: 400, statusMessage: 'Only http(s) URLs are supported' })
  }

  const hostname = url.hostname
  if (isLocalHostname(hostname)) {
    throw createError({ statusCode: 400, statusMessage: 'Refusing to fetch a local address' })
  }

  // Literal IPs can be judged immediately; names need DNS.
  const literal = hostname.replace(/^\[|\]$/g, '')
  const isLiteral = parseIpv4(literal) != null || literal.includes(':')
  const addresses = isLiteral
    ? [literal]
    : await lookup(literal, { all: true }).then(rows => rows.map(r => r.address)).catch(() => [] as string[])

  if (!addresses.length) {
    throw createError({ statusCode: 400, statusMessage: 'Host could not be resolved' })
  }
  for (const address of addresses) {
    if (isAlwaysBlockedAddress(address)) {
      throw createError({ statusCode: 400, statusMessage: 'Refusing to fetch a non-public address' })
    }
    if (!options.allowPrivate && isPrivateAddress(address)) {
      throw createError({ statusCode: 400, statusMessage: 'Refusing to fetch a private address' })
    }
  }
  return url
}
