// Tests for the 12 type-specific builders. Cover happy path + each failure
// mode. Audio playability isn't a builder concern; we just check
// audibleTexts contains the right Indonesian fields.
//
// All builder calls route through buildForExerciseType, which exercises
// the projector + dispatch + builder pipeline together — the production
// path. Direct builder calls would bypass the projector's contract
// narrowing and require us to hand-build BuilderInputFor<T> fixtures.

import { describe, it, expect } from 'vitest'
import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant,
  ContrastPairExercisesRow, SentenceTransformationExercisesRow,
  ConstrainedTranslationExercisesRow, ClozeMcqExercisesRow,
} from '@/types/learning'
import type { PatternExerciseInput } from '@/lib/capabilities'
import type { SessionBlock } from '@/lib/session-builder'
import { normalizeTtsText } from '@/lib/ttsNormalize'

import { buildForExerciseType, type RawProjectorInput } from '../byType'

// ─── fixtures ───

function makeItem(overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    id: 'item-1', item_type: 'word', base_text: 'akhir', normalized_text: 'akhir',
    language: 'id', level: 'A1', source_type: 'lesson',
    source_vocabulary_id: null, source_card_id: null, notes: null,
    is_active: true, pos: 'noun', translation_nl: null, translation_en: null, usage_note: null, created_at: '', updated_at: '',
    ...overrides,
  }
}

function makeMeaning(text: string, lang: 'nl' | 'en' = 'nl', isPrimary = true): ItemMeaning {
  return { id: `m-${text}`, learning_item_id: 'item-1', translation_language: lang, translation_text: text, sense_label: null, usage_note: null, is_primary: isPrimary }
}

function makeContext(source_text: string, context_type: ItemContext['context_type'] = 'cloze'): ItemContext {
  return {
    id: `ctx-${source_text}`, learning_item_id: 'item-1',
    context_type, source_text, translation_text: 'translation',
    difficulty: null, topic_tag: null, is_anchor_context: false,
    source_lesson_id: null, source_section_id: null,
  }
}

function makeAnswerVariant(text: string): ItemAnswerVariant {
  return { id: `v-${text}`, learning_item_id: 'item-1', variant_text: text, variant_type: 'alternative_translation', language: 'id', is_accepted: true, notes: null }
}

function makeBlock(): SessionBlock {
  return {
    id: 'block-1', kind: 'due_review',
    capabilityId: 'cap-1', canonicalKeySnapshot: 'cap:v1:item:learning_items/item-1:text_recognition:id_to_l1:text:nl',
    renderPlan: {
      capabilityKey: 'cap:v1:item:learning_items/item-1:text_recognition:id_to_l1:text:nl',
      sourceRef: 'learning_items/item-1',
      exerciseType: 'recognition_mcq',
      capabilityType: 'text_recognition',
      skillType: 'recognition',
      requiredArtifacts: [],
    },
    reviewContext: {
      schedulerSnapshot: {} as never,
      currentStateVersion: 0,
      artifactVersionSnapshot: {},
      capabilityReadinessStatus: 'ready',
      capabilityPublicationStatus: 'published',
    },
  }
}

function makePoolItems(size: number): { items: LearningItem[]; meaningsByItem: Map<string, ItemMeaning[]> } {
  const items: LearningItem[] = []
  const meaningsByItem = new Map<string, ItemMeaning[]>()
  for (let i = 0; i < size; i++) {
    const id = `pool-${i}`
    items.push(makeItem({ id, base_text: `pool-base-${i}`, normalized_text: `pool-base-${i}` }))
    meaningsByItem.set(id, [{ id: `m-${id}`, learning_item_id: id, translation_language: 'nl', translation_text: `pool-meaning-${i}`, sense_label: null, usage_note: null, is_primary: true }])
  }
  return { items, meaningsByItem }
}

function baseInput(overrides: Partial<RawProjectorInput> = {}): RawProjectorInput {
  const pool = makePoolItems(5)
  return {
    block: makeBlock(),
    learningItem: makeItem(),
    dialogueLine: null,
    affixedFormPair: null,
    patternExercise: null,
    meanings: [makeMeaning('einde')],
    contexts: [],
    answerVariants: [],
    artifactsByKind: new Map(),
    poolItems: pool.items,
    poolMeaningsByItem: pool.meaningsByItem,
    userLanguage: 'nl',
    curatedRecognitionDistractors: new Map(),
    curatedCuedRecallDistractors: new Map(),
    ...overrides,
  }
}

// ─── typed grammar-exercise row fixtures (PR 4) ───

function contrastRow(overrides: Partial<ContrastPairExercisesRow> = {}): ContrastPairExercisesRow {
  return {
    id: 'cpe-1', grammar_pattern_id: 'gp-1', lesson_id: 'l-1',
    prompt_text: 'Kies de juiste', target_meaning: 'this',
    options: [{ id: 'a', text: 'ini' }, { id: 'b', text: 'itu' }],
    correct_option_id: 'a', explanation_text: 'ini = this (near speaker)',
    is_active: true, source_candidate_id: null, created_at: '', updated_at: '',
    ...overrides,
  }
}
function sentenceRow(overrides: Partial<SentenceTransformationExercisesRow> = {}): SentenceTransformationExercisesRow {
  return {
    id: 'ste-1', grammar_pattern_id: 'gp-1', lesson_id: 'l-1',
    source_sentence: 'Saya makan', transformation_instruction: 'Negate',
    hint_text: null, acceptable_answers: ['Saya tidak makan'],
    explanation_text: 'tidak negates verbs',
    is_active: true, source_candidate_id: null, created_at: '', updated_at: '',
    ...overrides,
  }
}
function constrainedRow(overrides: Partial<ConstrainedTranslationExercisesRow> = {}): ConstrainedTranslationExercisesRow {
  return {
    id: 'cte-1', grammar_pattern_id: 'gp-1', lesson_id: 'l-1',
    source_language_sentence: 'I have not eaten', required_target_pattern: 'belum',
    disallowed_shortcut_forms: [], acceptable_answers: ['Saya belum makan'],
    explanation_text: 'belum = not yet',
    is_active: true, source_candidate_id: null, created_at: '', updated_at: '',
    ...overrides,
  }
}
function clozeMcqRow(overrides: Partial<ClozeMcqExercisesRow> = {}): ClozeMcqExercisesRow {
  return {
    id: 'cme-1', grammar_pattern_id: 'gp-1', lesson_id: 'l-1',
    sentence: 'Itu ___ ya!', translation: 'That is ... yes',
    options: ['mahal', 'murah', 'baik', 'buruk'], correct_option_id: 'mahal',
    explanation_text: 'mahal = expensive',
    is_active: true, source_candidate_id: null, created_at: '', updated_at: '',
    ...overrides,
  }
}
function patternEx(p: PatternExerciseInput): Partial<RawProjectorInput> {
  // Pattern caps are not item-rooted: learningItem must be null (bucketing
  // invariant). The projector reads patternExercise + matches exercise_type.
  return { learningItem: null, patternExercise: p }
}

// ─── simple builders ───

describe('buildMeaningRecall', () => {
  it('happy path', () => {
    const r = buildForExerciseType('meaning_recall', baseInput())
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.exerciseType).toBe('meaning_recall')
      expect(r.exerciseItem.skillType).toBe('meaning_recall')
      expect(r.audibleTexts).toContain(normalizeTtsText('akhir'))
    }
  })

  it('fails when no learningItem', () => {
    const r = buildForExerciseType('meaning_recall', baseInput({ learningItem: null }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('item_not_found')
  })

  it('fails when no user-lang meaning', () => {
    const r = buildForExerciseType('meaning_recall', baseInput({ meanings: [makeMeaning('end', 'en')] }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('no_meaning_in_lang')
  })
})

describe('buildTypedRecall', () => {
  it('happy path', () => {
    const r = buildForExerciseType('typed_recall', baseInput({ answerVariants: [makeAnswerVariant('akhir')] }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.exerciseType).toBe('typed_recall')
      expect(r.exerciseItem.answerVariants).toHaveLength(1)
    }
  })

  it('fails when no user-lang meaning', () => {
    const r = buildForExerciseType('typed_recall', baseInput({ meanings: [] }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('no_meaning_in_lang')
  })
})

describe('buildDictation', () => {
  it('happy path', () => {
    const r = buildForExerciseType('dictation', baseInput())
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.exerciseType).toBe('dictation')
      expect(r.exerciseItem.skillType).toBe('form_recall')
    }
  })

  it('fails when no learningItem', () => {
    const r = buildForExerciseType('dictation', baseInput({ learningItem: null }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('item_not_found')
  })
})

describe('buildCloze', () => {
  it('happy path with cloze context', () => {
    const ctx = makeContext('Saya ___ nasi', 'cloze')
    const r = buildForExerciseType('cloze', baseInput({ contexts: [ctx] }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.clozeContext?.sentence).toBe('Saya ___ nasi')
      expect(r.exerciseItem.clozeContext?.targetWord).toBe('akhir')
    }
  })

  it('fails when no cloze context', () => {
    const r = buildForExerciseType('cloze', baseInput({ contexts: [] }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_cloze')
  })

  it('fails when cloze context lacks `___` marker', () => {
    const ctx = makeContext('Saya makan nasi', 'cloze')  // no blank
    const r = buildForExerciseType('cloze', baseInput({ contexts: [ctx] }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_cloze')
  })
})

// ─── cascade-driven builders ───

describe('buildRecognitionMCQ', () => {
  it('happy path with sufficient pool', () => {
    const r = buildForExerciseType('recognition_mcq', baseInput())
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.distractors).toHaveLength(3)
    }
  })

  it('fails with insufficient pool', () => {
    const small = makePoolItems(1)
    const r = buildForExerciseType('recognition_mcq', baseInput({ poolItems: small.items, poolMeaningsByItem: small.meaningsByItem }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('no_distractor_candidates')
  })

  it('uses curated distractors when a row exists for this capability (Task 8 / #99)', () => {
    const capabilityId = 'cap-1'  // matches makeBlock().capabilityId
    const curated = ['wrong-nl-1', 'wrong-nl-2', 'wrong-nl-3']
    const r = buildForExerciseType('recognition_mcq', baseInput({
      curatedRecognitionDistractors: new Map([[capabilityId, curated]]),
    }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.distractors).toEqual(curated)
    }
  })

  it('falls back to pool when no curated row exists (empty map)', () => {
    // Pool path with sufficient items → succeeds; distractors come from pool
    const r = buildForExerciseType('recognition_mcq', baseInput({
      curatedRecognitionDistractors: new Map(),
    }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      // Pool distractors are pool-meaning-N strings, not curated strings
      expect(r.exerciseItem.distractors?.every((d: string) => d.startsWith('pool-meaning-'))).toBe(true)
    }
  })
})

describe('buildCuedRecall', () => {
  it('happy path', () => {
    const r = buildForExerciseType('cued_recall', baseInput())
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.cuedRecallData?.options).toHaveLength(4)  // 1 correct + 3 distractors
      expect(r.exerciseItem.cuedRecallData?.correctOptionId).toBe('akhir')
    }
  })

  it('fails with insufficient pool', () => {
    const small = makePoolItems(2)
    const r = buildForExerciseType('cued_recall', baseInput({ poolItems: small.items, poolMeaningsByItem: small.meaningsByItem }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('no_distractor_candidates')
  })

  it('uses curated distractors when a row exists for this capability (Task 8 / #99)', () => {
    const capabilityId = 'cap-1'  // matches makeBlock().capabilityId
    const curated = ['salah-id-1', 'salah-id-2', 'salah-id-3']
    const r = buildForExerciseType('cued_recall', baseInput({
      curatedCuedRecallDistractors: new Map([[capabilityId, curated]]),
    }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      // All 4 options = correct (base_text) + 3 curated Indonesian wrong-options
      expect(r.exerciseItem.cuedRecallData?.options).toHaveLength(4)
      expect(r.exerciseItem.cuedRecallData?.options).toContain('akhir')
      expect(r.exerciseItem.cuedRecallData?.options).toContain('salah-id-1')
      expect(r.exerciseItem.cuedRecallData?.options).toContain('salah-id-2')
      expect(r.exerciseItem.cuedRecallData?.options).toContain('salah-id-3')
    }
  })

  it('falls back to pool when no curated row exists (empty map)', () => {
    const r = buildForExerciseType('cued_recall', baseInput({
      curatedCuedRecallDistractors: new Map(),
    }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      // Pool path: options include the correct answer + pool base_texts
      expect(r.exerciseItem.cuedRecallData?.options).toHaveLength(4)
      expect(r.exerciseItem.cuedRecallData?.correctOptionId).toBe('akhir')
    }
  })
})

describe('buildListeningMCQ', () => {
  it('happy path', () => {
    const r = buildForExerciseType('listening_mcq', baseInput())
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.exerciseType).toBe('listening_mcq')
      expect(r.exerciseItem.distractors).toHaveLength(3)
    }
  })
})

// ─── cloze_mcq dual path ───

describe('buildClozeMcq', () => {
  it('pattern path — typed cloze_mcq_exercises row', () => {
    const r = buildForExerciseType('cloze_mcq', baseInput(patternEx({ exerciseType: 'cloze_mcq', row: clozeMcqRow() })))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.learningItem).toBeNull()
      expect(r.exerciseItem.clozeMcqData?.sentence).toBe('Itu ___ ya!')
      expect(r.exerciseItem.clozeMcqData?.correctOptionId).toBe('mahal')
    }
  })

  it('runtime (item) path with cloze context + sufficient pool', () => {
    const ctx = makeContext('Saya ___ nasi', 'cloze')
    const r = buildForExerciseType('cloze_mcq', baseInput({ contexts: [ctx] }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.clozeMcqData?.sentence).toBe('Saya ___ nasi')
      expect(r.exerciseItem.clozeMcqData?.options).toHaveLength(4)
      expect(r.exerciseItem.clozeMcqData?.correctOptionId).toBe('akhir')
    }
  })

  it('item path fails when no cloze context AND no pattern exercise', () => {
    const r = buildForExerciseType('cloze_mcq', baseInput({ contexts: [] }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_cloze')
  })

  it('pattern path fails on malformed typed row', () => {
    const r = buildForExerciseType('cloze_mcq', baseInput(patternEx({
      exerciseType: 'cloze_mcq', row: clozeMcqRow({ sentence: '', options: [], correct_option_id: '' }),
    })))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_payload')
  })
})

// ─── typed grammar-exercise builders (pattern source kind, PR 4) ───

describe('buildContrastPair', () => {
  it('happy path with [{id,text}] options', () => {
    const r = buildForExerciseType('contrast_pair', baseInput(patternEx({ exerciseType: 'contrast_pair', row: contrastRow() })))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.learningItem).toBeNull()
      expect(r.exerciseItem.contrastPairData?.options).toEqual(['ini', 'itu'])
      expect(r.exerciseItem.contrastPairData?.correctOptionId).toBe('ini')  // resolved from id 'a'
    }
  })

  it('fails when no pattern exercise', () => {
    // learningItem present + patternExercise null exercises the projector's
    // needsPatternExercise guard (production never has a learningItem here).
    const r = buildForExerciseType('contrast_pair', baseInput())
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('pattern_typed_row_missing')
  })

  it('fails when option count != 2', () => {
    const r = buildForExerciseType('contrast_pair', baseInput(patternEx({
      exerciseType: 'contrast_pair',
      row: contrastRow({ options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }, { id: 'c', text: 'z' }] }),
    })))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_payload')
  })
})

describe('buildSentenceTransformation', () => {
  it('happy path', () => {
    const r = buildForExerciseType('sentence_transformation', baseInput(patternEx({ exerciseType: 'sentence_transformation', row: sentenceRow() })))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.sentenceTransformationData?.sourceSentence).toBe('Saya makan')
    }
  })

  it('fails when no pattern exercise', () => {
    const r = buildForExerciseType('sentence_transformation', baseInput())
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('pattern_typed_row_missing')
  })

  it('fails on missing acceptable_answers', () => {
    const r = buildForExerciseType('sentence_transformation', baseInput(patternEx({
      exerciseType: 'sentence_transformation', row: sentenceRow({ acceptable_answers: [] }),
    })))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_payload')
  })
})

describe('buildConstrainedTranslation', () => {
  it('happy path', () => {
    const r = buildForExerciseType('constrained_translation', baseInput(patternEx({ exerciseType: 'constrained_translation', row: constrainedRow() })))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.constrainedTranslationData?.acceptableAnswers).toEqual(['Saya belum makan'])
    }
  })

  it('fails when no pattern exercise', () => {
    const r = buildForExerciseType('constrained_translation', baseInput())
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('pattern_typed_row_missing')
  })
})

describe('buildSpeaking', () => {
  it('item-anchored (model utterance = base_text)', () => {
    const r = buildForExerciseType('speaking', baseInput())
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.speakingData?.targetPatternOrScenario).toBe('akhir')
    }
  })
})

// ─── dispatcher ───

describe('buildForExerciseType', () => {
  it('routes to the right builder', () => {
    const r = buildForExerciseType('typed_recall', baseInput())
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') expect(r.exerciseItem.exerciseType).toBe('typed_recall')
  })

  it('returns unsupported_exercise_type for an unknown type', () => {
    // Cast around the type system to simulate a future ExerciseType.
    const r = buildForExerciseType('unknown_future_type' as never, baseInput())
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('unsupported_exercise_type')
  })
})

// ─── dialogue_line cloze ───
//
// PR-B of the lib/exercise-content fold adds a parallel input shape: cloze
// (typed only — cloze_mcq still item-only) accepts a dialogueLine instead
// of a learningItem. The adapter assembles dialogueLine from artifact rows
// the publish pipeline writes; the byType packager reads it directly.

describe('buildCloze — dialogue_line source kind', () => {
  function dialogueInput(overrides: Partial<RawProjectorInput> = {}): RawProjectorInput {
    return baseInput({
      learningItem: null,
      dialogueLine: {
        text: 'Aku tidak suka tinggal di rumah terus',
        speaker: 'Titin',
        sourceRef: 'lesson-9/section-1/line-10',
        targetWord: 'suka',
        translation: 'Ik vind het niet leuk om de hele tijd thuis te blijven',
        sourceText: 'Aku tidak ___ tinggal di rumah terus',
      },
      ...overrides,
    })
  }

  it('produces a cloze exerciseItem with dialogueLine fields populated and learningItem=null', () => {
    const r = buildForExerciseType('cloze', dialogueInput())
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.exerciseItem.exerciseType).toBe('cloze')
    expect(r.exerciseItem.learningItem).toBeNull()
    expect(r.exerciseItem.clozeContext?.sentence).toBe('Aku tidak ___ tinggal di rumah terus')
    expect(r.exerciseItem.clozeContext?.targetWord).toBe('suka')
    expect(r.exerciseItem.clozeContext?.translation).toBe('Ik vind het niet leuk om de hele tijd thuis te blijven')
    expect(r.exerciseItem.clozeContext?.speaker).toBe('Titin')
  })

  it('fails malformed_cloze when sourceText lacks the ___ marker', () => {
    const r = buildForExerciseType('cloze', dialogueInput({
      dialogueLine: {
        text: 'Aku tidak suka tinggal di rumah terus',
        speaker: 'Titin',
        sourceRef: 'lesson-9/section-1/line-10',
        targetWord: 'suka',
        translation: 'irrelevant',
        sourceText: 'Aku tidak suka tinggal di rumah terus',  // no ___
      },
    }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_cloze')
  })

  it('exerciseItem.clozeContext.speaker is null when the dialogue line has no speaker', () => {
    const r = buildForExerciseType('cloze', dialogueInput({
      dialogueLine: {
        text: 'Apa kabar?',
        speaker: null,
        sourceRef: 'lesson-9/section-1/line-3',
        targetWord: 'kabar',
        translation: 'Hoe gaat het?',
        sourceText: 'Apa ___?',
      },
    }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') expect(r.exerciseItem.clozeContext?.speaker).toBeNull()
  })

  it('cloze_mcq still requires learningItem (the dialogue_line widening did not extend to it)', () => {
    const r = buildForExerciseType('cloze_mcq', dialogueInput({
      // Even with a dialogueLine populated, cloze_mcq's contract still
      // requires a learningItem. The projector emits item_not_found.
    }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('item_not_found')
  })
})

// ─── affixed_form_pair typed_recall ───
//
// The affixed-form-pair PR (2026-05-21) extends typed_recall to accept the
// affixed_form_pair source kind: the input carries an AffixedFormPairInput
// instead of a LearningItem + ItemMeaning, the builder branches on which
// field is populated, and the exerciseItem grows an `affixedFormPairData`
// slot the UI reads. cued_recall stays item-only per D4.

describe('buildTypedRecall — affixed_form_pair source kind', () => {
  function affixedInput(overrides: Partial<RawProjectorInput> = {}): RawProjectorInput {
    return baseInput({
      learningItem: null,
      meanings: [],
      affixedFormPair: {
        root: 'baca',
        derived: 'membaca',
        direction: 'root_to_derived',
        allomorphRule: 'meN- becomes mem- before roots beginning with b: baca -> membaca.',
        sourceRef: 'lesson-9/morphology/meN-baca-membaca',
      },
      ...overrides,
    })
  }

  it('produces a typed_recall exerciseItem with affixedFormPairData populated and learningItem=null (root→derived)', () => {
    const r = buildForExerciseType('typed_recall', affixedInput())
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.exerciseItem.exerciseType).toBe('typed_recall')
    expect(r.exerciseItem.learningItem).toBeNull()
    expect(r.exerciseItem.affixedFormPairData).toEqual({
      promptText: 'Form the meN- form of: baca',
      acceptedAnswer: 'membaca',
      direction: 'root_to_derived',
      allomorphRule: 'meN- becomes mem- before roots beginning with b: baca -> membaca.',
      root: 'baca',
      derived: 'membaca',
    })
    expect(r.exerciseItem.skillType).toBe('form_recall')
  })

  it('flips prompt + answer for derived→root direction (recognition)', () => {
    const r = buildForExerciseType('typed_recall', affixedInput({
      affixedFormPair: {
        root: 'baca',
        derived: 'membaca',
        direction: 'derived_to_root',
        allomorphRule: 'meN- becomes mem- before roots beginning with b.',
        sourceRef: 'lesson-9/morphology/meN-baca-membaca',
      },
    }))
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.exerciseItem.affixedFormPairData?.promptText).toBe('What is the root of: membaca')
    expect(r.exerciseItem.affixedFormPairData?.acceptedAnswer).toBe('baca')
    expect(r.exerciseItem.skillType).toBe('recognition')
  })

  it('audibleTexts harvest includes both root and derived (Indonesian-language)', () => {
    const r = buildForExerciseType('typed_recall', affixedInput())
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.audibleTexts).toEqual(expect.arrayContaining(['baca', 'membaca']))
  })

  it('cued_recall stays item-only (the affixed-form-pair widening did not extend to it per D4)', () => {
    const r = buildForExerciseType('cued_recall', affixedInput())
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('item_not_found')
  })

  it('dictation rejects affixed_form_pair input (typed_recall is the only exercise that accepts it)', () => {
    const r = buildForExerciseType('dictation', affixedInput())
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('item_not_found')
  })
})
