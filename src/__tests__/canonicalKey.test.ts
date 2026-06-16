import { describe, expect, it } from 'vitest'
import { buildCanonicalKey, normalizeLessonSourceRef } from '@/lib/capabilities/canonicalKey'

describe('canonical capability keys', () => {
  it('percent-encodes reserved separators', () => {
    expect(buildCanonicalKey({
      sourceKind: 'vocabulary_src',
      sourceRef: 'learning_items/id:with%reserved',
      capabilityType: 'recall_meaning_from_text_cap',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'nl',
    })).toBe('cap:v1:vocabulary_src:learning_items/id%3Awith%25reserved:recall_meaning_from_text_cap:id_to_l1:text:nl')
  })

  it.each([
    ['lesson-01/vocab-food', 'lesson-1/vocab-food'],
    ['Lesson 1/vocab-food', 'lesson-1/vocab-food'],
    ['lesson_1/vocab-food', 'lesson-1/vocab-food'],
    ['lesson-1/vocab-food', 'lesson-1/vocab-food'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeLessonSourceRef(input)).toBe(expected)
  })

  it.each([
    'dialogue_line_src',
    'podcast_segment_src',
    'podcast_phrase_src',
    'word_form_pair_src',
  ] as const)('supports %s source kind', sourceKind => {
    expect(buildCanonicalKey({
      sourceKind,
      sourceRef: `${sourceKind}/example`,
      capabilityType: sourceKind === 'word_form_pair_src' ? 'recognise_word_form_link_cap' : 'recognise_meaning_from_audio_cap',
      direction: sourceKind === 'word_form_pair_src' ? 'derived_to_root' : 'id_to_l1',
      modality: sourceKind === 'podcast_segment_src' ? 'audio' : 'text',
      learnerLanguage: 'none',
    })).toContain(`cap:v1:${sourceKind}:`)
  })
})
