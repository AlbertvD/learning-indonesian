import { describe, it, expect } from 'vitest'
import { effectiveVoiceFor } from '../tts-client'

const DESPINA = 'id-ID-Chirp3-HD-Despina'
const DESPINA_FALLBACK = 'id-ID-Wavenet-A'

describe('effectiveVoiceFor — Chirp3-HD short-word fallback', () => {
  it('keeps Chirp3-HD for normal-length words', () => {
    expect(effectiveVoiceFor('rumah', DESPINA)).toBe(DESPINA)
    expect(effectiveVoiceFor('tiga', DESPINA)).toBe(DESPINA) // 4 chars — fine
  })

  it('falls back for ≤2-char words (broken audio)', () => {
    expect(effectiveVoiceFor('ke', DESPINA)).toBe(DESPINA_FALLBACK)
    expect(effectiveVoiceFor('di', DESPINA)).toBe(DESPINA_FALLBACK)
  })

  it('falls back for "dua" — mispronounced at 3 chars (admin flag)', () => {
    expect(effectiveVoiceFor('dua', DESPINA)).toBe(DESPINA_FALLBACK)
    expect(effectiveVoiceFor(' Dua ', DESPINA)).toBe(DESPINA_FALLBACK) // trim + lowercase
  })

  it('leaves a non-Chirp3 voice untouched even for a short word', () => {
    expect(effectiveVoiceFor('dua', 'id-ID-Wavenet-A')).toBe('id-ID-Wavenet-A')
  })
})
