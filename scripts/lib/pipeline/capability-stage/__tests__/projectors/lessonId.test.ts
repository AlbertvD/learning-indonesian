import { describe, it, expect } from 'vitest'

import { validateLessonIdPresence } from '../../validators/lessonId'
import { projectVocab, type VocabStagingItem } from '../../projectors/vocab'
import type { CapabilityInput } from '../../adapter'

function makeCapability(overrides: Partial<CapabilityInput>): CapabilityInput {
  return {
    canonicalKey: 'item:halo::text_recognition::id_to_l1::text::none',
    sourceKind: 'item',
    sourceRef: 'item-halo',
    capabilityType: 'text_recognition',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'none',
    projectionVersion: 'capability-v3',
    sourceFingerprint: 'fp-source',
    artifactFingerprint: 'fp-artifact',
    lessonId: 'lesson-1-uuid',
    metadata: {
      skillType: 'recognition',
      requiredArtifacts: ['base_text', 'meaning:l1'],
      prerequisiteKeys: [],
      difficultyLevel: 1,
      goalTags: [],
    },
    ...overrides,
  }
}

describe('validateLessonIdPresence — Decision 3b / ADR 0006 defensive gate', () => {
  it('passes when every lesson-derived capability has lessonId set', () => {
    const caps: CapabilityInput[] = [
      makeCapability({ sourceKind: 'item', lessonId: 'lesson-1-uuid' }),
      makeCapability({ sourceKind: 'pattern', lessonId: 'lesson-2-uuid' }),
      makeCapability({ sourceKind: 'dialogue_line', lessonId: 'lesson-3-uuid' }),
      makeCapability({ sourceKind: 'affixed_form_pair', lessonId: 'lesson-9-uuid' }),
    ]
    expect(() => validateLessonIdPresence(caps)).not.toThrow()
  })

  it('throws when a non-podcast capability has null lessonId', () => {
    const caps: CapabilityInput[] = [
      makeCapability({ sourceKind: 'item', lessonId: null, canonicalKey: 'item:ada::text_recognition::id_to_l1::text::none' }),
    ]
    expect(() => validateLessonIdPresence(caps)).toThrow(/null lessonId/i)
  })

  it('error message names the violating canonical_key', () => {
    const caps: CapabilityInput[] = [
      makeCapability({
        sourceKind: 'item',
        lessonId: null,
        canonicalKey: 'item:bad::text_recognition::id_to_l1::text::none',
      }),
    ]
    expect(() => validateLessonIdPresence(caps)).toThrow(/item:bad/)
  })

  it('passes when a podcast_segment capability has null lessonId', () => {
    const caps: CapabilityInput[] = [
      makeCapability({
        sourceKind: 'podcast_segment',
        lessonId: null,
        canonicalKey: 'podcast_segment:warung-1::audio_recognition::audio_to_l1::audio::none',
      }),
    ]
    expect(() => validateLessonIdPresence(caps)).not.toThrow()
  })

  it('passes when a podcast_phrase capability has null lessonId', () => {
    const caps: CapabilityInput[] = [
      makeCapability({
        sourceKind: 'podcast_phrase',
        lessonId: null,
        canonicalKey: 'podcast_phrase:warung-1-phrase-3::meaning_recall::id_to_l1::audio::none',
      }),
    ]
    expect(() => validateLessonIdPresence(caps)).not.toThrow()
  })

  it('passes on an empty capability list', () => {
    expect(() => validateLessonIdPresence([])).not.toThrow()
  })

  it('counts and samples multiple violations in the thrown message', () => {
    const caps: CapabilityInput[] = [
      makeCapability({ sourceKind: 'item', lessonId: null, canonicalKey: 'item:one' }),
      makeCapability({ sourceKind: 'item', lessonId: null, canonicalKey: 'item:two' }),
      makeCapability({ sourceKind: 'item', lessonId: null, canonicalKey: 'item:three' }),
    ]
    expect(() => validateLessonIdPresence(caps)).toThrow(/3 capability\/ies/)
  })
})

describe('projectVocab — Decision 3b: contextual_cloze inherits projecting lesson', () => {
  const baseItem = (overrides: Partial<VocabStagingItem>): VocabStagingItem => ({
    base_text: 'halo',
    item_type: 'word',
    context_type: 'vocabulary_list',
    translation_nl: 'hallo',
    translation_en: 'hello',
    pos: 'greeting',
    level: 'A1',
    review_status: 'pending_review',
    ...overrides,
  })

  it('stamps lessonId on every emitted contextual_cloze capability', () => {
    const out = projectVocab({
      lessonNumber: 9,
      lessonId: 'lesson-9-uuid',
      level: 'A1',
      sections: [
        {
          id: 'sec1',
          title: 'Dialoog',
          order_index: 1,
          content: {
            type: 'dialogue',
            lines: [
              { text: 'Apa kabar', speaker: 'Andi' },
              { text: 'Baik baik', speaker: 'Budi' },
            ],
          },
        },
      ],
      learningItems: [baseItem({})],
      clozeContexts: [
        { learning_item_slug: 'apa kabar', source_text: '___ kabar?', translation_text: 'Hoe ___?' },
        { learning_item_slug: 'baik baik', source_text: '___ baik', translation_text: '___ goed' },
      ],
    })
    expect(out.contextualClozeCapabilities).toHaveLength(2)
    for (const cap of out.contextualClozeCapabilities) {
      expect(cap.lessonId).toBe('lesson-9-uuid')
    }
  })

  it('emitted contextual_cloze capabilities pass the validator', () => {
    const out = projectVocab({
      lessonNumber: 9,
      lessonId: 'lesson-9-uuid',
      level: 'A1',
      sections: [
        {
          id: 'sec1',
          title: 'Dialoog',
          order_index: 1,
          content: {
            type: 'dialogue',
            lines: [{ text: 'Apa kabar', speaker: 'Andi' }],
          },
        },
      ],
      learningItems: [baseItem({})],
      clozeContexts: [
        { learning_item_slug: 'apa kabar', source_text: '___ kabar?', translation_text: 'Hoe ___?' },
      ],
    })
    expect(() => validateLessonIdPresence(out.contextualClozeCapabilities)).not.toThrow()
  })
})
