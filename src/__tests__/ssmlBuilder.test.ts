import { describe, it, expect } from 'vitest'
import {
  escapeXml,
  buildSSML,
  generateSrt,
  LEARNER_PAUSE_MS,
  NATURAL_PAUSE_MS,
  type SpeakableLine,
} from '../../scripts/lib/ssml-builder'

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B')
  })

  it('escapes angle brackets', () => {
    expect(escapeXml('<tag>')).toBe('&lt;tag&gt;')
  })

  it('escapes quotes', () => {
    expect(escapeXml('"hello"')).toBe('&quot;hello&quot;')
    expect(escapeXml("it's")).toBe('it&apos;s')
  })

  it('leaves plain text unchanged', () => {
    expect(escapeXml('Saya ke pasar')).toBe('Saya ke pasar')
  })
})

describe('buildSSML', () => {
  const lines: SpeakableLine[] = [
    { text: 'Selamat pagi', language: 'id' },
    { text: 'Apa kabar?', language: 'id' },
  ]

  it('wraps in <speak> tags', () => {
    const ssml = buildSSML(lines, 'learner', 1.0)
    expect(ssml).toMatch(/^<speak>/)
    expect(ssml).toMatch(/<\/speak>$/)
  })

  it('sets prosody rate for normal speed', () => {
    const ssml = buildSSML(lines, 'learner', 1.0)
    expect(ssml).toContain('<prosody rate="100%">')
  })

  it('sets prosody rate for slow speed', () => {
    const ssml = buildSSML(lines, 'learner', 0.85)
    expect(ssml).toContain('<prosody rate="85%">')
  })

  it('uses longer pauses for learner variant', () => {
    const ssml = buildSSML(lines, 'learner', 1.0)
    expect(ssml).toContain(`<break time="${LEARNER_PAUSE_MS}ms"/>`)
  })

  it('uses shorter pauses for natural variant', () => {
    const ssml = buildSSML(lines, 'natural', 1.0)
    expect(ssml).toContain(`<break time="${NATURAL_PAUSE_MS}ms"/>`)
  })

  it('wraps non-dialogue lines in <s> tags', () => {
    const ssml = buildSSML(lines, 'learner', 1.0)
    expect(ssml).toContain('<s>Selamat pagi</s>')
    expect(ssml).toContain('<s>Apa kabar?</s>')
  })

  it('wraps dialogue lines in <p> tags', () => {
    const dialogueLines: SpeakableLine[] = [
      { text: 'Halo!', language: 'id', speaker: 'Budi' },
      { text: 'Selamat pagi!', language: 'id', speaker: 'Siti' },
    ]
    const ssml = buildSSML(dialogueLines, 'learner', 1.0)
    expect(ssml).toContain('<p>Halo!</p>')
    expect(ssml).toContain('<p>Selamat pagi!</p>')
  })

  it('escapes special characters in text', () => {
    const special: SpeakableLine[] = [
      { text: 'A & B < C', language: 'id' },
    ]
    const ssml = buildSSML(special, 'learner', 1.0)
    expect(ssml).toContain('A &amp; B &lt; C')
  })

  it('does not add break before first line', () => {
    const ssml = buildSSML(lines, 'learner', 1.0)
    const firstBreak = ssml.indexOf('<break')
    const firstSentence = ssml.indexOf('<s>')
    expect(firstSentence).toBeLessThan(firstBreak)
  })
})

describe('generateSrt', () => {
  const lines: SpeakableLine[] = [
    { text: 'Selamat pagi', language: 'id' },
    { text: 'Apa kabar?', language: 'id' },
  ]

  it('generates correct number of entries', () => {
    const srt = generateSrt(lines, 1.0)
    const entries = srt.trim().split('\n\n')
    expect(entries).toHaveLength(2)
  })

  it('starts with entry 1', () => {
    const srt = generateSrt(lines, 1.0)
    expect(srt).toMatch(/^1\n/)
  })

  it('includes timestamps in SRT format', () => {
    const srt = generateSrt(lines, 1.0)
    expect(srt).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/)
  })

  it('includes speaker prefix for dialogue lines', () => {
    const dialogueLines: SpeakableLine[] = [
      { text: 'Halo!', language: 'id', speaker: 'Budi' },
    ]
    const srt = generateSrt(dialogueLines, 1.0)
    expect(srt).toContain('[Budi] Halo!')
  })

  it('adjusts timing for slow speed', () => {
    const normalSrt = generateSrt(lines, 1.0, 2500)
    const slowSrt = generateSrt(lines, 0.85, 2500)

    // The second entry should start later in slow mode
    const normalSecondStart = normalSrt.split('\n\n')[1]?.match(/^2\n(\S+)/)?.[1]
    const slowSecondStart = slowSrt.split('\n\n')[1]?.match(/^2\n(\S+)/)?.[1]

    expect(normalSecondStart).toBeDefined()
    expect(slowSecondStart).toBeDefined()
    // Slow timestamps should be larger (later)
    expect(slowSecondStart! > normalSecondStart!).toBe(true)
  })
})
