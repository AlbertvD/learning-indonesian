import { describe, expect, it } from 'vitest'
import { buildCanonicalKey, normalizeLessonSourceRef } from '@/lib/capabilities/canonicalKey'

describe('canonical capability keys', () => {
  it('percent-encodes reserved separators', () => {
    expect(buildCanonicalKey({
      sourceKind: 'item',
      sourceRef: 'learning_items/id:with%reserved',
      capabilityType: 'meaning_recall',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'nl',
    })).toBe('cap:v1:item:learning_items/id%3Awith%25reserved:meaning_recall:id_to_l1:text:nl')
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
    'dialogue_line',
    'podcast_segment',
    'podcast_phrase',
    'affixed_form_pair',
  ] as const)('supports %s source kind', sourceKind => {
    expect(buildCanonicalKey({
      sourceKind,
      sourceRef: `${sourceKind}/example`,
      capabilityType: sourceKind === 'affixed_form_pair' ? 'root_derived_recognition' : 'audio_recognition',
      direction: sourceKind === 'affixed_form_pair' ? 'derived_to_root' : 'id_to_l1',
      modality: sourceKind === 'podcast_segment' ? 'audio' : 'text',
      learnerLanguage: 'none',
    })).toContain(`cap:v1:${sourceKind}:`)
  })
})
