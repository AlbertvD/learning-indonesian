import { describe, it, expect } from 'vitest'
import type { LearningItem, ItemMeaning, ItemContext } from '@/types/learning'
import {
  RENDER_CONTRACTS,
  exerciseTypesForCapability,
  requiredArtifactsFor,
  supportsSourceKind,
  projectBuilderInput,
  type RawProjectorInput,
} from '../renderContracts'

// ─── Fixture builders ──────────────────────────────────────────────────────

function makeLearningItem(overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    id: 'item-1',
    item_type: 'word',
    base_text: 'makan',
    normalized_text: 'makan',
    language: 'id',
    level: 'A1',
    source_type: 'lesson',
    source_vocabulary_id: null,
    source_card_id: null,
    notes: null,
    is_active: true,
    pos: null,
    translation_nl: 'eten',
    translation_en: 'eat',
    usage_note: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeMeaning(overrides: Partial<ItemMeaning> = {}): ItemMeaning {
  return {
    id: 'm-1',
    learning_item_id: 'item-1',
    translation_language: 'nl',
    translation_text: 'eten',
    sense_label: null,
    usage_note: null,
    is_primary: true,
    ...overrides,
  }
}

function makeClozeContext(overrides: Partial<ItemContext> = {}): ItemContext {
  return {
    id: 'c-1',
    learning_item_id: 'item-1',
    context_type: 'cloze',
    source_text: 'Saya ___ nasi',
    translation_text: 'I eat rice',
    difficulty: null,
    topic_tag: null,
    is_anchor_context: false,
    source_lesson_id: null,
    source_section_id: null,
    ...overrides,
  }
}

function makeRawInput(overrides: Partial<RawProjectorInput> = {}): RawProjectorInput {
  return {
    learningItem: null,
    dialogueLine: null,
    affixedFormPair: null,
    meanings: [],
    contexts: [],
    answerVariants: [],
    variant: null,
    artifactsByKind: new Map(),
    poolItems: [],
    poolMeaningsByItem: new Map(),
    userLanguage: 'nl',
    ...overrides,
  }
}

// ─── RENDER_CONTRACTS table ────────────────────────────────────────────────

describe('RENDER_CONTRACTS table', () => {
  it('has an entry for every ExerciseType (exhaustiveness enforced via satisfies)', () => {
    expect(Object.keys(RENDER_CONTRACTS)).toHaveLength(12)
  })

  it('every entry declares supportedSourceKinds non-empty', () => {
    for (const contract of Object.values(RENDER_CONTRACTS)) {
      expect(contract.supportedSourceKinds.length).toBeGreaterThan(0)
    }
  })

  it('pattern_recognition is not named in any contract entry (Option D)', () => {
    for (const contract of Object.values(RENDER_CONTRACTS)) {
      expect(contract.capabilityTypes).not.toContain('pattern_recognition')
    }
  })

  it('pattern_contrast is not named in any contract entry (Option D)', () => {
    for (const contract of Object.values(RENDER_CONTRACTS)) {
      expect(contract.capabilityTypes).not.toContain('pattern_contrast')
    }
  })
})

// ─── Helpers ───────────────────────────────────────────────────────────────

describe('exerciseTypesForCapability', () => {
  it('returns ["recognition_mcq"] for text_recognition', () => {
    expect(exerciseTypesForCapability('text_recognition')).toEqual(['recognition_mcq'])
  })

  it('returns [] for pattern_recognition', () => {
    expect(exerciseTypesForCapability('pattern_recognition')).toEqual([])
  })

  it('returns [] for pattern_contrast', () => {
    expect(exerciseTypesForCapability('pattern_contrast')).toEqual([])
  })

  it('returns both cloze and cloze_mcq for contextual_cloze', () => {
    expect(exerciseTypesForCapability('contextual_cloze')).toEqual(
      expect.arrayContaining(['cloze', 'cloze_mcq']),
    )
  })

  it('returns listening_mcq for audio_recognition AND podcast_gist', () => {
    expect(exerciseTypesForCapability('audio_recognition')).toEqual(['listening_mcq'])
    expect(exerciseTypesForCapability('podcast_gist')).toEqual(['listening_mcq'])
  })
})

describe('supportsSourceKind', () => {
  it('every exercise supports source kind item', () => {
    for (const et of Object.keys(RENDER_CONTRACTS) as Array<keyof typeof RENDER_CONTRACTS>) {
      expect(supportsSourceKind(et, 'item')).toBe(true)
    }
  })

  it('no exercise supports pattern source kind (Option D)', () => {
    for (const et of Object.keys(RENDER_CONTRACTS) as Array<keyof typeof RENDER_CONTRACTS>) {
      expect(supportsSourceKind(et, 'pattern')).toBe(false)
    }
  })

  it('only cloze supports dialogue_line source kind (PR-B of lib/exercise-content fold); cloze_mcq is item-only until lesson-pool distractors land', () => {
    for (const et of Object.keys(RENDER_CONTRACTS) as Array<keyof typeof RENDER_CONTRACTS>) {
      const expected = et === 'cloze'
      expect(supportsSourceKind(et, 'dialogue_line')).toBe(expected)
    }
  })

  it('only typed_recall supports affixed_form_pair source kind (added 2026-05-21); cued_recall is item-only until distractor authoring lands', () => {
    for (const et of Object.keys(RENDER_CONTRACTS) as Array<keyof typeof RENDER_CONTRACTS>) {
      const expected = et === 'typed_recall'
      expect(supportsSourceKind(et, 'affixed_form_pair')).toBe(expected)
    }
  })
})

describe('requiredArtifactsFor', () => {
  // Decision R (PR 1): item-sourced caps no longer require capability_artifacts.
  // Translations come from learning_items.translation_{nl,en} inline columns.
  it('cloze item-source requires [] (Decision R: no artifact check for item caps)', () => {
    expect(requiredArtifactsFor('cloze', 'item')).toEqual([])
  })

  it('cloze dialogue_line-source requires [] (PR 2 slice: structure guaranteed by the typed dialogue_clozes table + validateDialogueClozes + HC15, not capability_artifacts)', () => {
    expect(requiredArtifactsFor('cloze', 'dialogue_line')).toEqual([])
  })

  // Decision Q (PR 1): audio for item caps is resolved via capability_audio_refs,
  // not capability_artifacts. requiredArtifacts.item = [] for audio exercise types.
  it('listening_mcq item-source requires [] (Decision Q: audio via capability_audio_refs)', () => {
    expect(requiredArtifactsFor('listening_mcq', 'item')).toEqual([])
  })

  it('dictation item-source requires [] (Decision Q: audio via capability_audio_refs)', () => {
    expect(requiredArtifactsFor('dictation', 'item')).toEqual([])
  })

  it('recognition_mcq item-source requires [] (Decision R: translation from inline columns)', () => {
    expect(requiredArtifactsFor('recognition_mcq', 'item')).toEqual([])
  })

  it('typed_recall affixed_form_pair-source requires [] (PR 3 slice: structure guaranteed by the typed affixed_form_pairs table + validateAffixedFormPairs + HC17, not capability_artifacts)', () => {
    expect(requiredArtifactsFor('typed_recall', 'affixed_form_pair')).toEqual([])
  })

  it('returns [] for an exercise/source-kind combination the contract does not declare', () => {
    // recognition_mcq does not support affixed_form_pair.
    expect(requiredArtifactsFor('recognition_mcq', 'affixed_form_pair')).toEqual([])
    // cued_recall does not support affixed_form_pair (deferred per D3/D4).
    expect(requiredArtifactsFor('cued_recall', 'affixed_form_pair')).toEqual([])
  })
})

// ─── projectBuilderInput ───────────────────────────────────────────────────

describe('projectBuilderInput — common failures', () => {
  it('fails closed when learningItem is null AND no alternative source-kind input is set', () => {
    // Every exercise rejects an input with no learningItem and no
    // dialogueLine / affixedFormPair populated. typed_recall + cloze accept
    // the alternative paths when those are populated (covered elsewhere).
    for (const et of Object.keys(RENDER_CONTRACTS) as Array<keyof typeof RENDER_CONTRACTS>) {
      const raw = makeRawInput({ learningItem: null, dialogueLine: null, affixedFormPair: null })
      const result = projectBuilderInput(et, raw)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reasonCode).toBe('item_not_found')
      }
    }
  })
})

describe('projectBuilderInput — affixed_form_pair (typed_recall path)', () => {
  const AFFIXED_FIXTURE = {
    root: 'baca',
    derived: 'membaca',
    direction: 'root_to_derived' as const,
    allomorphRule: 'meN- becomes mem- before roots beginning with b.',
    sourceRef: 'lesson-9/morphology/meN-baca-membaca',
  }

  it('succeeds for typed_recall with affixedFormPair populated + learningItem null', () => {
    const raw = makeRawInput({ learningItem: null, affixedFormPair: AFFIXED_FIXTURE })
    const result = projectBuilderInput('typed_recall', raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const input = result.input as { affixedFormPair: typeof AFFIXED_FIXTURE | null; learningItem: unknown; primaryMeaning: unknown }
      expect(input.affixedFormPair).toEqual(AFFIXED_FIXTURE)
      expect(input.learningItem).toBeNull()
      expect(input.primaryMeaning).toBeNull()
    }
  })

  it('rejects typed_recall when both learningItem and affixedFormPair are populated (bucketing invariant)', () => {
    const raw = makeRawInput({
      learningItem: makeLearningItem(),
      affixedFormPair: AFFIXED_FIXTURE,
      meanings: [makeMeaning()],
    })
    const result = projectBuilderInput('typed_recall', raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasonCode).toBe('malformed_payload')
    }
  })

  it('rejects dictation when only affixedFormPair is populated (dictation does not accept affixed_form_pair)', () => {
    const raw = makeRawInput({ learningItem: null, affixedFormPair: AFFIXED_FIXTURE })
    const result = projectBuilderInput('dictation', raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasonCode).toBe('item_not_found')
    }
  })

  it('rejects cued_recall when only affixedFormPair is populated (cued_recall stays item-only per D4)', () => {
    const raw = makeRawInput({ learningItem: null, affixedFormPair: AFFIXED_FIXTURE })
    const result = projectBuilderInput('cued_recall', raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasonCode).toBe('item_not_found')
    }
  })
})

describe('projectBuilderInput — primaryMeaning', () => {
  for (const et of ['recognition_mcq', 'cued_recall', 'typed_recall', 'meaning_recall', 'listening_mcq'] as const) {
    it(`fails with no_meaning_in_lang for ${et} when no user-lang meaning present`, () => {
      const raw = makeRawInput({
        learningItem: makeLearningItem(),
        meanings: [makeMeaning({ translation_language: 'en' })],
        userLanguage: 'nl',
      })
      const result = projectBuilderInput(et, raw)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reasonCode).toBe('no_meaning_in_lang')
      }
    })

    it(`succeeds for ${et} when user-lang meaning present`, () => {
      const raw = makeRawInput({
        learningItem: makeLearningItem(),
        meanings: [makeMeaning()],
        userLanguage: 'nl',
      })
      const result = projectBuilderInput(et, raw)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect((result.input as { primaryMeaning: ItemMeaning }).primaryMeaning).toEqual(
          expect.objectContaining({ translation_text: 'eten' }),
        )
      }
    })
  }
})

describe('projectBuilderInput — cloze', () => {
  it('fails with malformed_cloze when no cloze-typed context', () => {
    const raw = makeRawInput({
      learningItem: makeLearningItem(),
      contexts: [],
    })
    const result = projectBuilderInput('cloze', raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasonCode).toBe('malformed_cloze')
    }
  })

  it('succeeds when cloze context present', () => {
    const raw = makeRawInput({
      learningItem: makeLearningItem(),
      contexts: [makeClozeContext()],
    })
    const result = projectBuilderInput('cloze', raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.input as { clozeContext: ItemContext }).clozeContext.context_type).toBe('cloze')
    }
  })
})

describe('projectBuilderInput — cloze_mcq', () => {
  it('fails when neither cloze context nor matching authored variant present', () => {
    const raw = makeRawInput({
      learningItem: makeLearningItem(),
      contexts: [],
      variant: null,
    })
    const result = projectBuilderInput('cloze_mcq', raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasonCode).toBe('malformed_cloze')
    }
  })

  it('succeeds with cloze context and clozeContext is non-null (runtime path)', () => {
    const raw = makeRawInput({
      learningItem: makeLearningItem(),
      contexts: [makeClozeContext()],
      variant: null,
    })
    const result = projectBuilderInput('cloze_mcq', raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const input = result.input as { clozeContext: ItemContext | null; variant: unknown }
      expect(input.clozeContext).not.toBeNull()
      expect(input.variant).toBeNull()
    }
  })

  it('succeeds with authored variant and clozeContext is null (authored path)', () => {
    const raw = makeRawInput({
      learningItem: makeLearningItem(),
      contexts: [],
      variant: { id: 'v-1', exercise_type: 'cloze_mcq', payload_json: {}, answer_key_json: null, is_active: true, learning_item_id: 'item-1' } as never,
    })
    const result = projectBuilderInput('cloze_mcq', raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const input = result.input as { clozeContext: ItemContext | null; variant: unknown }
      expect(input.clozeContext).toBeNull()
      expect(input.variant).not.toBeNull()
    }
  })
})

describe('projectBuilderInput — variant-required builders', () => {
  for (const et of ['contrast_pair', 'sentence_transformation', 'constrained_translation'] as const) {
    it(`fails with no_active_variant for ${et} when no matching variant`, () => {
      const raw = makeRawInput({
        learningItem: makeLearningItem(),
        variant: null,
      })
      const result = projectBuilderInput(et, raw)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reasonCode).toBe('no_active_variant')
      }
    })

    it(`fails with no_active_variant for ${et} when variant type mismatches`, () => {
      const raw = makeRawInput({
        learningItem: makeLearningItem(),
        variant: { id: 'v-1', exercise_type: 'cloze_mcq', payload_json: {}, answer_key_json: null, is_active: true, learning_item_id: 'item-1' } as never,
      })
      const result = projectBuilderInput(et, raw)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reasonCode).toBe('no_active_variant')
      }
    })

    it(`succeeds for ${et} when matching variant present`, () => {
      const raw = makeRawInput({
        learningItem: makeLearningItem(),
        variant: { id: 'v-1', exercise_type: et, payload_json: {}, answer_key_json: null, is_active: true, learning_item_id: 'item-1' } as never,
      })
      const result = projectBuilderInput(et, raw)
      expect(result.ok).toBe(true)
    })
  }
})

describe('projectBuilderInput — dictation', () => {
  it('succeeds with just learningItem (audio resolved upstream)', () => {
    const raw = makeRawInput({ learningItem: makeLearningItem() })
    const result = projectBuilderInput('dictation', raw)
    expect(result.ok).toBe(true)
  })
})

describe('projectBuilderInput — speaking', () => {
  it('succeeds with just learningItem (item-anchored fallback)', () => {
    const raw = makeRawInput({ learningItem: makeLearningItem() })
    const result = projectBuilderInput('speaking', raw)
    expect(result.ok).toBe(true)
  })

  it('succeeds with authored speaking variant', () => {
    const raw = makeRawInput({
      learningItem: makeLearningItem(),
      variant: { id: 'v-1', exercise_type: 'speaking', payload_json: {}, answer_key_json: null, is_active: true, learning_item_id: 'item-1' } as never,
    })
    const result = projectBuilderInput('speaking', raw)
    expect(result.ok).toBe(true)
  })
})
