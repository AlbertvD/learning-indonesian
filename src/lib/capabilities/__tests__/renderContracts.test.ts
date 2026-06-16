import { describe, it, expect } from 'vitest'
import type {
  LearningItem, ItemMeaning, ItemContext,
  ContrastPairExercisesRow, SentenceTransformationExercisesRow,
  ConstrainedTranslationExercisesRow, ClozeMcqExercisesRow,
} from '@/types/learning'
import {
  RENDER_CONTRACTS,
  exerciseTypesForCapability,
  requiredArtifactsFor,
  supportsSourceKind,
  projectBuilderInput,
  type RawProjectorInput,
  type PatternExerciseInput,
} from '../renderContracts'

// Minimal typed grammar-exercise rows for the pattern-path projector tests.
function patternExerciseOf(exerciseType: PatternExerciseInput['exerciseType']): PatternExerciseInput {
  const base = { id: 'ex-1', grammar_pattern_id: 'gp-1', lesson_id: 'l-1', is_active: true, source_candidate_id: null, created_at: '', updated_at: '' }
  switch (exerciseType) {
    case 'choose_correct_form_ex':
      return { exerciseType, row: { ...base, prompt_text: 'p', target_meaning: 'm', options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], correct_option_id: 'a', explanation_text: 'e' } as ContrastPairExercisesRow }
    case 'transform_sentence_ex':
      return { exerciseType, row: { ...base, source_sentence: 's', transformation_instruction: 'i', hint_text: null, acceptable_answers: ['a'], explanation_text: 'e' } as SentenceTransformationExercisesRow }
    case 'translate_sentence_ex':
      return { exerciseType, row: { ...base, source_language_sentence: 's', required_target_pattern: 'belum', disallowed_shortcut_forms: [], acceptable_answers: ['a'], explanation_text: 'e' } as ConstrainedTranslationExercisesRow }
    case 'choose_missing_word_ex':
      return { exerciseType, row: { ...base, sentence: 's ___', translation: 't', options: ['a', 'b'], correct_option_id: 'a', explanation_text: 'e' } as ClozeMcqExercisesRow }
  }
}

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
    patternExercise: null,
    meanings: [],
    contexts: [],
    answerVariants: [],
    poolItems: [],
    poolMeaningsByItem: new Map(),
    userLanguage: 'nl',
    curatedRecognitionDistractors: new Map(),
    curatedCuedRecallDistractors: new Map(),
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

  it('recognise_grammar_pattern_cap routes to the 3 recognition grammar exercises (PR 4 Decision G)', () => {
    expect(RENDER_CONTRACTS.transform_sentence_ex.capabilityTypes).toContain('recognise_grammar_pattern_cap')
    expect(RENDER_CONTRACTS.translate_sentence_ex.capabilityTypes).toContain('recognise_grammar_pattern_cap')
    expect(RENDER_CONTRACTS.choose_missing_word_ex.capabilityTypes).toContain('recognise_grammar_pattern_cap')
  })

  it('contrast_grammar_pattern_cap routes to choose_correct_form_ex (PR 4 Decision G)', () => {
    expect(RENDER_CONTRACTS.choose_correct_form_ex.capabilityTypes).toEqual(['contrast_grammar_pattern_cap'])
  })

  it('the 4 grammar exercises support the pattern source kind with no required artifacts', () => {
    for (const et of ['choose_correct_form_ex', 'transform_sentence_ex', 'translate_sentence_ex', 'choose_missing_word_ex'] as const) {
      expect(RENDER_CONTRACTS[et].supportedSourceKinds).toContain('grammar_pattern_src')
      expect(requiredArtifactsFor(et, 'grammar_pattern_src')).toEqual([])
    }
  })
})

// ─── Helpers ───────────────────────────────────────────────────────────────

describe('exerciseTypesForCapability', () => {
  it('returns ["choose_meaning_ex"] for recognise_meaning_from_text_cap', () => {
    expect(exerciseTypesForCapability('recognise_meaning_from_text_cap')).toEqual(['choose_meaning_ex'])
  })

  it('returns the 3 recognition grammar exercises for recognise_grammar_pattern_cap (PR 4)', () => {
    expect(exerciseTypesForCapability('recognise_grammar_pattern_cap')).toEqual(
      expect.arrayContaining(['transform_sentence_ex', 'translate_sentence_ex', 'choose_missing_word_ex']),
    )
  })

  it('returns ["choose_correct_form_ex"] for contrast_grammar_pattern_cap (PR 4)', () => {
    expect(exerciseTypesForCapability('contrast_grammar_pattern_cap')).toEqual(['choose_correct_form_ex'])
  })

  it('returns only cloze for produce_form_from_context_cap (cap-v2 #161: item cloze is typed-only, not choose_missing_word_ex)', () => {
    expect(exerciseTypesForCapability('produce_form_from_context_cap')).toEqual(['type_missing_word_ex'])
  })

  it('returns choose_meaning_from_audio_ex for recognise_meaning_from_audio_cap AND recognise_gist_from_audio_cap', () => {
    expect(exerciseTypesForCapability('recognise_meaning_from_audio_cap')).toEqual(['choose_meaning_from_audio_ex'])
    expect(exerciseTypesForCapability('recognise_gist_from_audio_cap')).toEqual(['choose_meaning_from_audio_ex'])
  })
})

describe('supportsSourceKind', () => {
  it('every exercise supports source kind item except the 4 pattern-only grammar exercises (cap-v2 #161)', () => {
    // choose_correct_form_ex / transform_sentence_ex / translate_sentence_ex AND now
    // choose_missing_word_ex route exclusively to pattern caps — item cloze is typed-only (the
    // `cloze` builder), so choose_missing_word_ex dropped 'item' from supportedSourceKinds.
    const patternOnly = new Set(['choose_correct_form_ex', 'transform_sentence_ex', 'translate_sentence_ex', 'choose_missing_word_ex'])
    for (const et of Object.keys(RENDER_CONTRACTS) as Array<keyof typeof RENDER_CONTRACTS>) {
      expect(supportsSourceKind(et, 'vocabulary_src')).toBe(!patternOnly.has(et))
    }
  })

  it('only the 4 grammar exercises support pattern source kind (PR 4 Decision G)', () => {
    const grammar = new Set(['choose_correct_form_ex', 'transform_sentence_ex', 'translate_sentence_ex', 'choose_missing_word_ex'])
    for (const et of Object.keys(RENDER_CONTRACTS) as Array<keyof typeof RENDER_CONTRACTS>) {
      expect(supportsSourceKind(et, 'grammar_pattern_src')).toBe(grammar.has(et))
    }
  })

  it('only cloze supports dialogue_line source kind (PR-B of lib/exercise-content fold); choose_missing_word_ex is item-only until lesson-pool distractors land', () => {
    for (const et of Object.keys(RENDER_CONTRACTS) as Array<keyof typeof RENDER_CONTRACTS>) {
      const expected = et === 'type_missing_word_ex'
      expect(supportsSourceKind(et, 'dialogue_line_src')).toBe(expected)
    }
  })

  it('only type_form_ex supports word_form_pair_src source kind (added 2026-05-21); choose_form_ex is item-only until distractor authoring lands', () => {
    for (const et of Object.keys(RENDER_CONTRACTS) as Array<keyof typeof RENDER_CONTRACTS>) {
      const expected = et === 'type_form_ex'
      expect(supportsSourceKind(et, 'word_form_pair_src')).toBe(expected)
    }
  })
})

describe('requiredArtifactsFor', () => {
  // Decision R (PR 1): item-sourced caps no longer require capability_artifacts.
  // Translations come from learning_items.translation_{nl,en} inline columns.
  it('cloze item-source requires [] (Decision R: no artifact check for item caps)', () => {
    expect(requiredArtifactsFor('type_missing_word_ex', 'vocabulary_src')).toEqual([])
  })

  it('cloze dialogue_line-source requires [] (PR 2 slice: structure guaranteed by the typed dialogue_clozes table + validateDialogueClozes + HC15, not capability_artifacts)', () => {
    expect(requiredArtifactsFor('type_missing_word_ex', 'dialogue_line_src')).toEqual([])
  })

  // Decision Q (PR 1): audio for item caps is resolved via capability_audio_refs,
  // not capability_artifacts. requiredArtifacts.item = [] for audio exercise types.
  it('choose_meaning_from_audio_ex item-source requires [] (Decision Q: audio via capability_audio_refs)', () => {
    expect(requiredArtifactsFor('choose_meaning_from_audio_ex', 'vocabulary_src')).toEqual([])
  })

  it('dictation item-source requires [] (Decision Q: audio via capability_audio_refs)', () => {
    expect(requiredArtifactsFor('type_form_from_audio_ex', 'vocabulary_src')).toEqual([])
  })

  it('choose_meaning_ex item-source requires [] (Decision R: translation from inline columns)', () => {
    expect(requiredArtifactsFor('choose_meaning_ex', 'vocabulary_src')).toEqual([])
  })

  it('type_form_ex word_form_pair_src-source requires [] (PR 3 slice: structure guaranteed by the typed affixed_form_pairs table + validateAffixedFormPairs + HC17, not capability_artifacts)', () => {
    expect(requiredArtifactsFor('type_form_ex', 'word_form_pair_src')).toEqual([])
  })

  it('returns [] for an exercise/source-kind combination the contract does not declare', () => {
    // choose_meaning_ex does not support word_form_pair_src.
    expect(requiredArtifactsFor('choose_meaning_ex', 'word_form_pair_src')).toEqual([])
    // choose_form_ex does not support word_form_pair_src (deferred per D3/D4).
    expect(requiredArtifactsFor('choose_form_ex', 'word_form_pair_src')).toEqual([])
  })
})

// ─── projectBuilderInput ───────────────────────────────────────────────────

describe('projectBuilderInput — common failures', () => {
  it('fails closed when learningItem is null AND no alternative source-kind input is set', () => {
    // Every exercise rejects an input with no learningItem and no
    // dialogueLine / affixedFormPair populated. type_form_ex + cloze accept
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

describe('projectBuilderInput — word_form_pair_src (type_form_ex path)', () => {
  const AFFIXED_FIXTURE = {
    root: 'baca',
    derived: 'membaca',
    direction: 'root_to_derived' as const,
    allomorphRule: 'meN- becomes mem- before roots beginning with b.',
    sourceRef: 'lesson-9/morphology/meN-baca-membaca',
  }

  it('succeeds for type_form_ex with affixedFormPair populated + learningItem null', () => {
    const raw = makeRawInput({ learningItem: null, affixedFormPair: AFFIXED_FIXTURE })
    const result = projectBuilderInput('type_form_ex', raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const input = result.input as { affixedFormPair: typeof AFFIXED_FIXTURE | null; learningItem: unknown; primaryMeaning: unknown }
      expect(input.affixedFormPair).toEqual(AFFIXED_FIXTURE)
      expect(input.learningItem).toBeNull()
      expect(input.primaryMeaning).toBeNull()
    }
  })

  it('rejects type_form_ex when both learningItem and affixedFormPair are populated (bucketing invariant)', () => {
    const raw = makeRawInput({
      learningItem: makeLearningItem(),
      affixedFormPair: AFFIXED_FIXTURE,
      meanings: [makeMeaning()],
    })
    const result = projectBuilderInput('type_form_ex', raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasonCode).toBe('malformed_payload')
    }
  })

  it('rejects dictation when only affixedFormPair is populated (dictation does not accept word_form_pair_src)', () => {
    const raw = makeRawInput({ learningItem: null, affixedFormPair: AFFIXED_FIXTURE })
    const result = projectBuilderInput('type_form_from_audio_ex', raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasonCode).toBe('item_not_found')
    }
  })

  it('rejects choose_form_ex when only affixedFormPair is populated (choose_form_ex stays item-only per D4)', () => {
    const raw = makeRawInput({ learningItem: null, affixedFormPair: AFFIXED_FIXTURE })
    const result = projectBuilderInput('choose_form_ex', raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasonCode).toBe('item_not_found')
    }
  })
})

describe('projectBuilderInput — primaryMeaning', () => {
  for (const et of ['choose_meaning_ex', 'choose_form_ex', 'type_form_ex', 'type_meaning_ex', 'choose_meaning_from_audio_ex'] as const) {
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
    const result = projectBuilderInput('type_missing_word_ex', raw)
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
    const result = projectBuilderInput('type_missing_word_ex', raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.input as { clozeContext: ItemContext }).clozeContext.context_type).toBe('cloze')
    }
  })
})

describe('projectBuilderInput — choose_missing_word_ex (pattern-only since cap-v2 #161)', () => {
  it('fails (pattern_typed_row_missing) when no pattern choose_missing_word_ex row is present, even with a cloze context', () => {
    // Item cloze no longer routes to choose_missing_word_ex — a cloze context does not satisfy it.
    const raw = makeRawInput({
      learningItem: makeLearningItem(),
      contexts: [makeClozeContext()],
    })
    const result = projectBuilderInput('choose_missing_word_ex', raw)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasonCode).toBe('pattern_typed_row_missing')
    }
  })

  it('succeeds with a pattern choose_missing_word_ex row, learningItem null (pattern path)', () => {
    const raw = makeRawInput({
      learningItem: null,
      contexts: [],
      patternExercise: patternExerciseOf('choose_missing_word_ex'),
    })
    const result = projectBuilderInput('choose_missing_word_ex', raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const input = result.input as { exercise: unknown }
      expect(input.exercise).not.toBeNull()
    }
  })
})

describe('projectBuilderInput — pattern-exercise builders', () => {
  for (const et of ['choose_correct_form_ex', 'transform_sentence_ex', 'translate_sentence_ex'] as const) {
    it(`fails with item_not_found for ${et} when no learningItem and no pattern exercise`, () => {
      const raw = makeRawInput({ learningItem: null, patternExercise: null })
      const result = projectBuilderInput(et, raw)
      expect(result.ok).toBe(false)
      // No source at all → the fundamental gate fires first.
      if (!result.ok) expect(result.reasonCode).toBe('item_not_found')
    })

    it(`fails with pattern_typed_row_missing for ${et} when pattern exercise type mismatches`, () => {
      // A learningItem present (defends the guard) but a wrong-typed pattern row.
      const raw = makeRawInput({
        learningItem: makeLearningItem(),
        patternExercise: patternExerciseOf('choose_missing_word_ex'),
      })
      const result = projectBuilderInput(et, raw)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reasonCode).toBe('pattern_typed_row_missing')
    })

    it(`succeeds for ${et} when the matching pattern row is present (learningItem null)`, () => {
      const raw = makeRawInput({ learningItem: null, patternExercise: patternExerciseOf(et) })
      const result = projectBuilderInput(et, raw)
      expect(result.ok).toBe(true)
      if (result.ok) {
        const input = result.input as { exercise: { id: string } }
        expect(input.exercise.id).toBe('ex-1')
      }
    })
  }
})

describe('projectBuilderInput — dictation', () => {
  it('succeeds with just learningItem (audio resolved upstream)', () => {
    const raw = makeRawInput({ learningItem: makeLearningItem() })
    const result = projectBuilderInput('type_form_from_audio_ex', raw)
    expect(result.ok).toBe(true)
  })
})

describe('projectBuilderInput — speaking', () => {
  it('succeeds with just learningItem (item-anchored)', () => {
    const raw = makeRawInput({ learningItem: makeLearningItem() })
    const result = projectBuilderInput('speaking', raw)
    expect(result.ok).toBe(true)
  })
})
