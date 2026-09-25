/**
 * Library module — filename parsing + text helpers.
 *
 * When a book is uploaded without embedded metadata (or with unusable metadata)
 * we fall back to heuristics over the file name, the way Calibre / talebook do.
 * Pure functions — unit-testable with no database or Nitro context.
 */

export interface ParsedFilename {
  title: string
  authors: string[]
  series?: string
  seriesIndex?: number
}

const AUTHOR_SPLIT = /\s*(?:,|;|\/|、|&|\band\b|\+)\s*/i

/** Split an author string into individual, trimmed names. */
export function splitAuthors(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(AUTHOR_SPLIT)
    .map(s => s.trim())
    .filter(Boolean)
}

/** Lower-case, ASCII slug suitable for a URL segment. */
export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `item-${Date.now().toString(36)}`
}

function parseIndex(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Best-effort parse of a book file name into title / authors / series.
 *
 * Recognised shapes (in priority order):
 *   `Title (Series #2)`      → title + series + index
 *   `[Author] Title`         → authors + title
 *   `Title (Author)`         → title + authors
 *   `Title - Author`         → title + authors
 *   anything else            → title only
 */
export function parseBookFilename(rawName: string): ParsedFilename {
  const base = rawName
    .replace(/\.(epub|pdf|mobi|azw3?|txt|fb2|djvu|cbz|cbr|md)$/i, '')
    .replace(/[_]+/g, ' ')
    .trim()

  // 1. Title (Series #index)
  const seriesMatch = base.match(/^(.*?)\s*\(([^()]+?)\s*#\s*([\d.]+)\s*\)\s*$/)
  if (seriesMatch) {
    return {
      title: seriesMatch[1]!.trim(),
      authors: [],
      series: seriesMatch[2]!.trim() || undefined,
      seriesIndex: parseIndex(seriesMatch[3])
    }
  }

  // 2. [Author] Title
  const bracketMatch = base.match(/^\[([^\]]+)\]\s*(.+)$/)
  if (bracketMatch) {
    return { title: bracketMatch[2]!.trim(), authors: splitAuthors(bracketMatch[1]) }
  }

  // 3. Title (Author)
  const parenMatch = base.match(/^(.+?)\s*\(([^()]+)\)\s*$/)
  if (parenMatch) {
    return { title: parenMatch[1]!.trim(), authors: splitAuthors(parenMatch[2]) }
  }

  // 4. Title - Author  (only when both sides are non-empty)
  const dashParts = base.split(/\s+-\s+/)
  if (dashParts.length === 2 && dashParts[0]!.trim() && dashParts[1]!.trim()) {
    return { title: dashParts[0]!.trim(), authors: splitAuthors(dashParts[1]) }
  }

  return { title: base || rawName, authors: [] }
}

/** Human-readable byte size, e.g. `1.4 MB`. */
export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = n
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/** Normalise a title for stable alphabetical sorting (ignores leading articles). */
export function normalizeSortTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^\s*(the|a|an)\s+/i, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
    .trim()
}
