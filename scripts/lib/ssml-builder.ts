/**
 * SSML builder for TTS pipeline.
 *
 * Generates SSML markup with configurable pauses and speed
 * for learner-friendly and natural playback variants.
 */

export interface SpeakableLine {
  text: string
  language: 'id' | 'nl'
  speaker?: string
}

export const LEARNER_PAUSE_MS = 800
export const NATURAL_PAUSE_MS = 300

/**
 * Escape text for safe embedding in SSML/XML.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Build an SSML document from speakable lines.
 *
 * @param lines     - Array of lines to speak
 * @param variant   - 'learner' (longer pauses) or 'natural' (shorter pauses)
 * @param speed     - Playback rate (1.0 = normal, 0.85 = slow)
 */
export function buildSSML(
  lines: SpeakableLine[],
  variant: 'learner' | 'natural',
  speed: number,
): string {
  const pauseMs = variant === 'learner' ? LEARNER_PAUSE_MS : NATURAL_PAUSE_MS
  const rate = `${Math.round(speed * 100)}%`

  const parts: string[] = ['<speak>']
  parts.push(`<prosody rate="${rate}">`)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const escapedText = escapeXml(line.text)

    if (line.speaker) {
      if (i > 0) parts.push(`<break time="${pauseMs}ms"/>`)
      parts.push(`<p>${escapedText}</p>`)
    } else {
      if (i > 0) parts.push(`<break time="${pauseMs}ms"/>`)
      parts.push(`<s>${escapedText}</s>`)
    }
  }

  parts.push('</prosody>')
  parts.push('</speak>')

  return parts.join('\n')
}

/**
 * Generate SRT subtitle content from speakable lines.
 *
 * @param lines   - Array of lines
 * @param speed   - Playback speed for timing calculation
 * @param durationPerLineMs - Estimated duration per line at 1.0x
 */
export function generateSrt(
  lines: SpeakableLine[],
  speed: number,
  durationPerLineMs: number = 2500,
): string {
  let currentMs = 0
  const adjustedDuration = Math.round(durationPerLineMs / speed)
  const entries: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const startMs = currentMs
    const endMs = startMs + adjustedDuration
    const text = lines[i].speaker
      ? `[${lines[i].speaker}] ${lines[i].text}`
      : lines[i].text

    entries.push(
      `${i + 1}\n${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}\n${text}\n`,
    )

    currentMs = endMs + 200
  }

  return entries.join('\n')
}

function formatSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0')
}
