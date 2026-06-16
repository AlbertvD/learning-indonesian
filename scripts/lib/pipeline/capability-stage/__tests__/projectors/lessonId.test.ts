import { describe, it, expect } from 'vitest'

import { validateLessonIdPresence } from '../../validators/lessonId'
import type { CapabilityInput } from '../../adapter'

function makeCapability(overrides: Partial<CapabilityInput>): CapabilityInput {
  return {
    canonicalKey: 'item:halo::recognise_meaning_from_text_cap::id_to_l1::text::none',
    sourceKind: 'vocabulary_src',
    sourceRef: 'item-halo',
    capabilityType: 'recognise_meaning_from_text_cap',
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
      makeCapability({ sourceKind: 'vocabulary_src', lessonId: 'lesson-1-uuid' }),
      makeCapability({ sourceKind: 'grammar_pattern_src', lessonId: 'lesson-2-uuid' }),
      makeCapability({ sourceKind: 'dialogue_line_src', lessonId: 'lesson-3-uuid' }),
      makeCapability({ sourceKind: 'word_form_pair_src', lessonId: 'lesson-9-uuid' }),
    ]
    expect(() => validateLessonIdPresence(caps)).not.toThrow()
  })

  it('throws when a non-podcast capability has null lessonId', () => {
    const caps: CapabilityInput[] = [
      makeCapability({ sourceKind: 'vocabulary_src', lessonId: null, canonicalKey: 'item:ada::recognise_meaning_from_text_cap::id_to_l1::text::none' }),
    ]
    expect(() => validateLessonIdPresence(caps)).toThrow(/null lessonId/i)
  })

  it('error message names the violating canonical_key', () => {
    const caps: CapabilityInput[] = [
      makeCapability({
        sourceKind: 'vocabulary_src',
        lessonId: null,
        canonicalKey: 'item:bad::recognise_meaning_from_text_cap::id_to_l1::text::none',
      }),
    ]
    expect(() => validateLessonIdPresence(caps)).toThrow(/item:bad/)
  })

  it('passes when a podcast_segment_src capability has null lessonId', () => {
    const caps: CapabilityInput[] = [
      makeCapability({
        sourceKind: 'podcast_segment_src',
        lessonId: null,
        canonicalKey: 'podcast_segment_src:warung-1::recognise_meaning_from_audio_cap::audio_to_l1::audio::none',
      }),
    ]
    expect(() => validateLessonIdPresence(caps)).not.toThrow()
  })

  it('passes when a podcast_phrase_src capability has null lessonId', () => {
    const caps: CapabilityInput[] = [
      makeCapability({
        sourceKind: 'podcast_phrase_src',
        lessonId: null,
        canonicalKey: 'podcast_phrase_src:warung-1-phrase-3::meaning_recall::id_to_l1::audio::none',
      }),
    ]
    expect(() => validateLessonIdPresence(caps)).not.toThrow()
  })

  it('passes on an empty capability list', () => {
    expect(() => validateLessonIdPresence([])).not.toThrow()
  })

  it('counts and samples multiple violations in the thrown message', () => {
    const caps: CapabilityInput[] = [
      makeCapability({ sourceKind: 'vocabulary_src', lessonId: null, canonicalKey: 'item:one' }),
      makeCapability({ sourceKind: 'vocabulary_src', lessonId: null, canonicalKey: 'item:two' }),
      makeCapability({ sourceKind: 'vocabulary_src', lessonId: null, canonicalKey: 'item:three' }),
    ]
    expect(() => validateLessonIdPresence(caps)).toThrow(/3 capability\/ies/)
  })
})
