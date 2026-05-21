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
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant, ExerciseVariant,
} from '@/types/learning'
import type { SessionBlock } from '@/lib/session-builder'
import { normalizeTtsText } from '@/lib/ttsNormalize'

import { buildForExerciseType, type RawProjectorInput } from '../byType'

// ─── fixtures ───

function makeItem(overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    id: 'item-1', item_type: 'word', base_text: 'akhir', normalized_text: 'akhir',
    language: 'id', level: 'A1', source_type: 'lesson',
    source_vocabulary_id: null, source_card_id: null, notes: null,
    is_active: true, pos: 'noun', created_at: '', updated_at: '',
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
    meanings: [makeMeaning('einde')],
    contexts: [],
    answerVariants: [],
    variant: null,
    artifactsByKind: new Map(),
    poolItems: pool.items,
    poolMeaningsByItem: pool.meaningsByItem,
    userLanguage: 'nl',
    ...overrides,
  }
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
  it('authored path', () => {
    const variant: ExerciseVariant = {
      id: 'var-1', exercise_type: 'cloze_mcq', learning_item_id: 'item-1', context_id: 'ctx-1',
      grammar_pattern_id: null, source_candidate_id: null, is_active: true,
      payload_json: {
        sentence: 'Itu ___ ya!',
        translation: 'That is ... yes',
        options: ['mahal', 'murah', 'baik', 'buruk'],
        correctOptionId: 'mahal',
      },
      answer_key_json: { correctOptionId: 'mahal' },
      created_at: '', updated_at: '',
    }
    const r = buildForExerciseType('cloze_mcq', baseInput({ variant }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.clozeMcqData?.sentence).toBe('Itu ___ ya!')
      expect(r.exerciseItem.clozeMcqData?.correctOptionId).toBe('mahal')
    }
  })

  it('runtime path with cloze context + sufficient pool', () => {
    const ctx = makeContext('Saya ___ nasi', 'cloze')
    const r = buildForExerciseType('cloze_mcq', baseInput({ contexts: [ctx] }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.clozeMcqData?.sentence).toBe('Saya ___ nasi')
      expect(r.exerciseItem.clozeMcqData?.options).toHaveLength(4)
      expect(r.exerciseItem.clozeMcqData?.correctOptionId).toBe('akhir')
    }
  })

  it('runtime fails when no cloze context AND no variant', () => {
    const r = buildForExerciseType('cloze_mcq', baseInput({ contexts: [] }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_cloze')
  })

  it('authored path fails on malformed payload', () => {
    const variant: ExerciseVariant = {
      id: 'var-1', exercise_type: 'cloze_mcq', learning_item_id: 'item-1', context_id: 'ctx-1',
      grammar_pattern_id: null, source_candidate_id: null, is_active: true,
      payload_json: { sentence: '', options: [], correctOptionId: '' },  // empty
      answer_key_json: {},
      created_at: '', updated_at: '',
    }
    const r = buildForExerciseType('cloze_mcq', baseInput({ variant }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_payload')
  })
})

// ─── variant-only builders ───

describe('buildContrastPair', () => {
  it('happy path with [{id,text}] options', () => {
    const variant: ExerciseVariant = {
      id: 'var-1', exercise_type: 'contrast_pair', learning_item_id: 'item-1', context_id: 'ctx-1',
      grammar_pattern_id: null, source_candidate_id: null, is_active: true,
      payload_json: {
        promptText: 'Kies de juiste',
        targetMeaning: 'this',
        options: [{ id: 'a', text: 'ini' }, { id: 'b', text: 'itu' }],
        correctOptionId: 'a',
        explanationText: 'ini = this (near speaker)',
      },
      answer_key_json: { correctOptionId: 'a' },
      created_at: '', updated_at: '',
    }
    const r = buildForExerciseType('contrast_pair', baseInput({ variant }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.contrastPairData?.options).toEqual(['ini', 'itu'])
      expect(r.exerciseItem.contrastPairData?.correctOptionId).toBe('ini')  // resolved from id 'a'
    }
  })

  it('fails when no active variant', () => {
    const r = buildForExerciseType('contrast_pair', baseInput({ variant: null }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('no_active_variant')
  })

  it('fails when option count != 2', () => {
    const variant: ExerciseVariant = {
      id: 'var-1', exercise_type: 'contrast_pair', learning_item_id: 'item-1', context_id: 'ctx-1',
      grammar_pattern_id: null, source_candidate_id: null, is_active: true,
      payload_json: { options: ['a', 'b', 'c'], correctOptionId: 'a' },
      answer_key_json: {},
      created_at: '', updated_at: '',
    }
    const r = buildForExerciseType('contrast_pair', baseInput({ variant }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_payload')
  })
})

describe('buildSentenceTransformation', () => {
  it('happy path', () => {
    const variant: ExerciseVariant = {
      id: 'var-1', exercise_type: 'sentence_transformation', learning_item_id: 'item-1', context_id: 'ctx-1',
      grammar_pattern_id: null, source_candidate_id: null, is_active: true,
      payload_json: {
        sourceSentence: 'Saya makan',
        transformationInstruction: 'Negate',
        acceptableAnswers: ['Saya tidak makan'],
        explanationText: 'tidak negates verbs',
      },
      answer_key_json: { acceptableAnswers: ['Saya tidak makan'] },
      created_at: '', updated_at: '',
    }
    const r = buildForExerciseType('sentence_transformation', baseInput({ variant }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.sentenceTransformationData?.sourceSentence).toBe('Saya makan')
    }
  })

  it('fails when no active variant', () => {
    const r = buildForExerciseType('sentence_transformation', baseInput({ variant: null }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('no_active_variant')
  })

  it('fails on missing acceptableAnswers', () => {
    const variant: ExerciseVariant = {
      id: 'var-1', exercise_type: 'sentence_transformation', learning_item_id: 'item-1', context_id: 'ctx-1',
      grammar_pattern_id: null, source_candidate_id: null, is_active: true,
      payload_json: { sourceSentence: 'Saya makan' },
      answer_key_json: {},
      created_at: '', updated_at: '',
    }
    const r = buildForExerciseType('sentence_transformation', baseInput({ variant }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_payload')
  })
})

describe('buildConstrainedTranslation', () => {
  it('happy path', () => {
    const variant: ExerciseVariant = {
      id: 'var-1', exercise_type: 'constrained_translation', learning_item_id: 'item-1', context_id: 'ctx-1',
      grammar_pattern_id: null, source_candidate_id: null, is_active: true,
      payload_json: {
        sourceLanguageSentence: 'I have not eaten',
        requiredTargetPattern: 'belum',
        acceptableAnswers: ['Saya belum makan'],
        explanationText: 'belum = not yet',
      },
      answer_key_json: { acceptableAnswers: ['Saya belum makan'] },
      created_at: '', updated_at: '',
    }
    const r = buildForExerciseType('constrained_translation', baseInput({ variant }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.constrainedTranslationData?.acceptableAnswers).toEqual(['Saya belum makan'])
    }
  })

  it('fails when no active variant', () => {
    const r = buildForExerciseType('constrained_translation', baseInput({ variant: null }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('no_active_variant')
  })
})

describe('buildSpeaking', () => {
  it('authored path', () => {
    const variant: ExerciseVariant = {
      id: 'var-1', exercise_type: 'speaking', learning_item_id: 'item-1', context_id: 'ctx-1',
      grammar_pattern_id: null, source_candidate_id: null, is_active: true,
      payload_json: { promptText: 'Greet a stranger', targetPatternOrScenario: 'Selamat pagi' },
      answer_key_json: {},
      created_at: '', updated_at: '',
    }
    const r = buildForExerciseType('speaking', baseInput({ variant }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.speakingData?.targetPatternOrScenario).toBe('Selamat pagi')
    }
  })

  it('item-anchored fallback (no variant)', () => {
    const r = buildForExerciseType('speaking', baseInput({ variant: null }))
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
