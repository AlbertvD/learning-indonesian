import { describe, it, expect } from 'vitest'
import { deriveSkillTypeFromCapabilityType } from '../capabilityTypes'

describe('deriveSkillTypeFromCapabilityType', () => {
  // Slice 1 (cap-v2) identity fix: l1_to_id_choice is "pick the Indonesian word
  // from the L1 meaning" — a RECEPTIVE multiple-choice recognition, not a recall.
  // It was mis-grouped under meaning_recall; the correct level is recognition.
  // Receptive-before-productive sequencing (ADR 0007) keys off this derived level.
  it('maps l1_to_id_choice to recognition (Slice 1 mis-level fix)', () => {
    expect(deriveSkillTypeFromCapabilityType('l1_to_id_choice')).toBe('recognition')
  })

  it('keeps meaning_recall on the meaning_recall skill', () => {
    expect(deriveSkillTypeFromCapabilityType('meaning_recall')).toBe('meaning_recall')
  })

  it('keeps the recognition group on recognition', () => {
    for (const t of ['text_recognition', 'audio_recognition', 'pattern_recognition', 'pattern_contrast', 'root_derived_recognition', 'podcast_gist'] as const) {
      expect(deriveSkillTypeFromCapabilityType(t)).toBe('recognition')
    }
  })

  it('keeps the form_recall group on form_recall', () => {
    for (const t of ['form_recall', 'dictation', 'root_derived_recall', 'contextual_cloze'] as const) {
      expect(deriveSkillTypeFromCapabilityType(t)).toBe('form_recall')
    }
  })
})
