import { describe, it, expect } from 'vitest'
import { deriveSkillTypeFromCapabilityType } from '../capabilityTypes'

describe('deriveSkillTypeFromCapabilityType', () => {
  // Slice 1 (cap-v2) identity fix: recognise_form_from_meaning_cap is "pick the Indonesian word
  // from the L1 meaning" — a RECEPTIVE multiple-choice recognition, not a recall.
  // It was mis-grouped under meaning_recall; the correct level is recognition.
  // Receptive-before-productive sequencing (ADR 0007) keys off this derived level.
  it('maps recognise_form_from_meaning_cap to recognition (Slice 1 mis-level fix)', () => {
    expect(deriveSkillTypeFromCapabilityType('recognise_form_from_meaning_cap')).toBe('recognise_mode')
  })

  it('keeps meaning_recall on the meaning_recall skill', () => {
    expect(deriveSkillTypeFromCapabilityType('recall_meaning_from_text_cap')).toBe('recall_mode')
  })

  it('keeps the recognition group on recognition', () => {
    for (const t of ['recognise_meaning_from_text_cap', 'recognise_meaning_from_audio_cap', 'recognise_grammar_pattern_cap', 'contrast_grammar_pattern_cap', 'recognise_word_form_link_cap', 'recognise_gist_from_audio_cap'] as const) {
      expect(deriveSkillTypeFromCapabilityType(t)).toBe('recognise_mode')
    }
  })

  it('keeps the form_recall group on form_recall', () => {
    for (const t of ['produce_form_from_meaning_cap', 'produce_form_from_audio_cap', 'produce_derived_form_cap', 'produce_form_from_context_cap'] as const) {
      expect(deriveSkillTypeFromCapabilityType(t)).toBe('produce_mode')
    }
  })
})
