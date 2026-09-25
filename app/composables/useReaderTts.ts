/**
 * Library — browser text-to-speech for the reader (Web Speech API).
 *
 * The reader hands over the current chapter as speakable segments and this
 * composable plays them one by one, reporting the active segment so the caller
 * can highlight it. Everything is guarded so it is inert during SSR and on
 * browsers without speech synthesis.
 */
import type { SpeechSegment } from '../utils/reader'

interface Hooks {
  onSegment?: (index: number, segment: SpeechSegment) => void
  onFinish?: () => void
}

/** Map an ebook language code onto a BCP-47 tag the speech engine understands. */
export function speechLangFromBook(language?: string | null): string {
  const raw = String(language ?? '').trim()
  const code = raw.toLowerCase().replace('_', '-')
  if (code.startsWith('zh')) return code.includes('tw') || code.includes('hant') ? 'zh-TW' : 'zh-CN'
  if (code.startsWith('en')) return 'en-US'
  if (code.startsWith('ja')) return 'ja-JP'
  if (code.startsWith('ko')) return 'ko-KR'
  if (code.startsWith('fr')) return 'fr-FR'
  if (code.startsWith('de')) return 'de-DE'
  if (code.startsWith('es')) return 'es-ES'
  // Unknown code: pass it through unchanged (region casing is meaningful).
  return raw || 'en-US'
}

function speechApi(): SpeechSynthesis | null {
  if (!import.meta.client || typeof window === 'undefined') return null
  return 'speechSynthesis' in window ? window.speechSynthesis : null
}

export function useReaderTts() {
  const supported = ref(false)
  const speaking = ref(false)
  const paused = ref(false)
  const index = ref(-1)
  const total = ref(0)
  const voices = ref<SpeechSynthesisVoice[]>([])
  const voiceUri = ref('')
  const rate = ref(1)
  /** Language of the book currently in the reader — drives the default voice. */
  const bookLang = ref<string | null>(null)

  let queue: SpeechSegment[] = []
  let hooks: Hooks = {}
  /** Invalidates in-flight utterance callbacks after stop / chapter change. */
  let generation = 0

  function refreshVoices() {
    const api = speechApi()
    if (!api) return
    const list = api.getVoices()
    if (!list.length) return
    voices.value = list
    if (voiceUri.value) return
    const wanted = speechLangFromBook(bookLang.value).toLowerCase()
    const match = list.find(voice => voice.lang?.replace('_', '-').toLowerCase() === wanted)
      ?? list.find(voice => voice.lang?.toLowerCase().startsWith(wanted.slice(0, 2)))
    if (match) voiceUri.value = match.voiceURI
  }

  function finish() {
    speaking.value = false
    paused.value = false
    hooks.onFinish?.()
  }

  function speakCurrent() {
    const api = speechApi()
    if (!api) return
    const segment = queue[index.value]
    if (!segment) {
      finish()
      return
    }

    const mine = generation
    const utterance = new SpeechSynthesisUtterance(segment.text)
    const voice = voices.value.find(candidate => candidate.voiceURI === voiceUri.value)
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    } else {
      utterance.lang = speechLangFromBook(bookLang.value)
    }
    utterance.rate = rate.value

    utterance.onend = () => {
      if (mine !== generation || paused.value) return
      const next = index.value + 1
      if (next >= queue.length) {
        index.value = queue.length
        finish()
        return
      }
      index.value = next
      hooks.onSegment?.(next, queue[next]!)
      speakCurrent()
    }
    utterance.onerror = () => {
      if (mine !== generation) return
      speaking.value = false
      paused.value = false
    }

    api.speak(utterance)
  }

  /** Start (or restart) playback of a chapter's segments. */
  function play(segments: SpeechSegment[], from = 0, options: { language?: string | null } & Hooks = {}) {
    const api = speechApi()
    if (!api) return
    generation++
    api.cancel()
    queue = segments
    hooks = { onSegment: options.onSegment, onFinish: options.onFinish }
    if (options.language !== undefined) bookLang.value = options.language
    refreshVoices()
    total.value = segments.length
    if (!segments.length) {
      finish()
      return
    }
    index.value = Math.max(0, Math.min(from, segments.length - 1))
    speaking.value = true
    paused.value = false
    hooks.onSegment?.(index.value, queue[index.value]!)
    speakCurrent()
  }

  function pause() {
    const api = speechApi()
    if (!api || !speaking.value) return
    paused.value = true
    api.pause()
  }

  function resume() {
    const api = speechApi()
    if (!api || !speaking.value) return
    paused.value = false
    api.resume()
  }

  function stop() {
    generation++
    queue = []
    hooks = {}
    speaking.value = false
    paused.value = false
    index.value = -1
    total.value = 0
    speechApi()?.cancel()
  }

  /** Jump to a specific segment (used by prev/next and by search jumps). */
  function skipTo(target: number) {
    const api = speechApi()
    if (!api || !queue.length) return
    const next = Math.max(0, Math.min(target, queue.length - 1))
    generation++
    api.cancel()
    index.value = next
    speaking.value = true
    paused.value = false
    hooks.onSegment?.(next, queue[next]!)
    speakCurrent()
  }

  onMounted(() => {
    const api = speechApi()
    if (!api) return
    supported.value = true
    refreshVoices()
    api.addEventListener?.('voiceschanged', refreshVoices)
  })

  onUnmounted(() => {
    generation++
    speechApi()?.cancel()
  })

  return {
    supported,
    speaking,
    paused,
    index,
    total,
    voices,
    voiceUri,
    rate,
    bookLang,
    play,
    pause,
    resume,
    stop,
    skipTo,
    next: () => skipTo(index.value + 1),
    prev: () => skipTo(index.value - 1)
  }
}
