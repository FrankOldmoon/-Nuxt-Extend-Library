/**
 * Library module — annotation vocabulary.
 *
 * A highlight is stored as a `style` + `color` key pair, never as CSS. The reader
 * renders those two keys through the tables below, so adding a colour or a line
 * style is a one-line change here instead of a rule per combination.
 *
 * Both keys are also the server's allow-list (see
 * `server/api/library/bookmarks/`), which imports these helpers — keep them
 * dependency-free.
 */

export interface AnnotationColor {
  key: string
  /** i18n key suffix under `library.annotations.color.*`. */
  labelKey: string
  /** Solid ink: underline, border and marker colour. */
  ink: string
  /** Translucent wash used as the background of a `highlight` style. */
  wash: string
}

export const ANNOTATION_COLORS: AnnotationColor[] = [
  { key: 'yellow', labelKey: 'library.annotations.color.yellow', ink: '#c99700', wash: 'rgba(247, 213, 77, 0.45)' },
  { key: 'green', labelKey: 'library.annotations.color.green', ink: '#2f9e44', wash: 'rgba(140, 214, 148, 0.45)' },
  { key: 'blue', labelKey: 'library.annotations.color.blue', ink: '#1c7ed6', wash: 'rgba(142, 197, 245, 0.45)' },
  { key: 'pink', labelKey: 'library.annotations.color.pink', ink: '#d6336c', wash: 'rgba(247, 168, 196, 0.45)' },
  { key: 'purple', labelKey: 'library.annotations.color.purple', ink: '#7048e8', wash: 'rgba(195, 166, 240, 0.45)' },
  { key: 'orange', labelKey: 'library.annotations.color.orange', ink: '#e8590c', wash: 'rgba(248, 189, 126, 0.5)' }
]

export interface AnnotationStyle {
  key: string
  /** i18n key suffix under `library.annotations.style.*`. */
  labelKey: string
  icon: string
  /** CSS `text-decoration-style`; `null` means "fill the background instead". */
  decoration: 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy' | null
}

export const ANNOTATION_STYLES: AnnotationStyle[] = [
  { key: 'highlight', labelKey: 'library.annotations.style.highlight', icon: 'i-lucide-highlighter', decoration: null },
  { key: 'underline', labelKey: 'library.annotations.style.underline', icon: 'i-lucide-underline', decoration: 'solid' },
  { key: 'double', labelKey: 'library.annotations.style.double', icon: 'i-lucide-equal', decoration: 'double' },
  { key: 'dotted', labelKey: 'library.annotations.style.dotted', icon: 'i-lucide-ellipsis', decoration: 'dotted' },
  { key: 'dashed', labelKey: 'library.annotations.style.dashed', icon: 'i-lucide-minus', decoration: 'dashed' },
  { key: 'wavy', labelKey: 'library.annotations.style.wavy', icon: 'i-lucide-activity', decoration: 'wavy' }
]

export const DEFAULT_ANNOTATION_COLOR = 'yellow'
export const DEFAULT_ANNOTATION_STYLE = 'highlight'

/** The colour for `key`, falling back to the default for unknown/absent keys. */
export function annotationColor(key?: string | null): AnnotationColor {
  return ANNOTATION_COLORS.find(candidate => candidate.key === key) ?? ANNOTATION_COLORS[0]!
}

/** The line style for `key`, falling back to the default for unknown/absent keys. */
export function annotationStyle(key?: string | null): AnnotationStyle {
  return ANNOTATION_STYLES.find(candidate => candidate.key === key) ?? ANNOTATION_STYLES[0]!
}

export function isAnnotationColor(key: unknown): boolean {
  return typeof key === 'string' && ANNOTATION_COLORS.some(candidate => candidate.key === key)
}

export function isAnnotationStyle(key: unknown): boolean {
  return typeof key === 'string' && ANNOTATION_STYLES.some(candidate => candidate.key === key)
}

/**
 * CSS custom properties that drive one highlight's paint, so the stylesheet needs
 * one rule per *style* rather than one per style × colour.
 */
export function annotationVars(color?: string | null): Record<string, string> {
  const { ink, wash } = annotationColor(color)
  return { '--anno-ink': ink, '--anno-wash': wash }
}

/** A `lib_bookmarks` row as the reader uses it. */
export interface Annotation {
  id: number
  bookId: number
  userId?: number
  /** bookmark | highlight | note */
  type: string
  chapterIndex: number
  /** The quoted text for a highlight, or the chapter title for a bookmark. */
  text: string | null
  note: string | null
  color: string | null
  style: string | null
  /** Character range inside the chapter's plain text; null for plain bookmarks. */
  startOffset: number | null
  endOffset: number | null
  percent: number
  createdAt?: string | null
}

/** True when the annotation covers a text range and can be painted in the flow. */
export function isRange(annotation: Pick<Annotation, 'startOffset' | 'endOffset'>): boolean {
  const { startOffset, endOffset } = annotation
  return typeof startOffset === 'number' && typeof endOffset === 'number' && endOffset > startOffset
}

/** A short single-line preview of a quoted range or note, for lists and tooltips. */
export function annotationPreview(annotation: Pick<Annotation, 'text' | 'note'>, maxLength = 90): string {
  const raw = (annotation.text ?? annotation.note ?? '').replace(/\s+/g, ' ').trim()
  return raw.length > maxLength ? `${raw.slice(0, maxLength - 1)}…` : raw
}

/** The solid ink colour for `key` — underlines, borders and list markers. */
export function annotationInk(key?: string | null): string {
  return annotationColor(key).ink
}
