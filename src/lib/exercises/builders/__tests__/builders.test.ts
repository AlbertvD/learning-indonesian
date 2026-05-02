// Tests for the 12 type-specific builders. Cover happy path + each failure
// mode in spec §6.2. Audio playability isn't a builder concern; we just check
// audibleTexts contains the right Indonesian fields.

import { describe, it, expect } from 'vitest'
import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant, ExerciseVariant,
} from '@/types/learning'
import type { SessionBlock } from '@/lib/session/sessionPlan'
import type { BuilderInput } from '../types'
import { normalizeTtsText } from '@/lib/ttsNormalize'

import { buildMeaningRecall } from '../MeaningRecall'
import { buildTypedRecall } from '../TypedRecall'
import { buildDictation } from '../Dictation'
import { buildCloze } from '../Cloze'
import { buildRecognitionMCQ } from '../RecognitionMCQ'
import { buildCuedRecall } from '../CuedRecall'
import { buildListeningMCQ } from '../ListeningMCQ'
import { buildClozeMcq } from '../ClozeMcq'
import { buildContrastPair } from '../ContrastPair'
import { buildSentenceTransformation } from '../SentenceTransformation'
import { buildConstrainedTranslation } from '../ConstrainedTranslation'
import { buildSpeaking } from '../Speaking'
import { buildForExerciseType } from '../index'

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

function baseInput(overrides: Partial<BuilderInput> = {}): BuilderInput {
  const pool = makePoolItems(5)
  return {
    block: makeBlock(),
    learningItem: makeItem(),
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
    const r = buildMeaningRecall(baseInput())
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.exerciseType).toBe('meaning_recall')
      expect(r.exerciseItem.skillType).toBe('meaning_recall')
      expect(r.audibleTexts).toContain(normalizeTtsText('akhir'))
    }
  })

  it('fails when no learningItem', () => {
    const r = buildMeaningRecall(baseInput({ learningItem: null }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('item_not_found')
  })

  it('fails when no user-lang meaning', () => {
    const r = buildMeaningRecall(baseInput({ meanings: [makeMeaning('end', 'en')] }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('no_meaning_in_lang')
  })
})

describe('buildTypedRecall', () => {
  it('happy path', () => {
    const r = buildTypedRecall(baseInput({ answerVariants: [makeAnswerVariant('akhir')] }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.exerciseType).toBe('typed_recall')
      expect(r.exerciseItem.answerVariants).toHaveLength(1)
    }
  })

  it('fails when no user-lang meaning', () => {
    const r = buildTypedRecall(baseInput({ meanings: [] }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('no_meaning_in_lang')
  })
})

describe('buildDictation', () => {
  it('happy path', () => {
    const r = buildDictation(baseInput())
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.exerciseType).toBe('dictation')
      expect(r.exerciseItem.skillType).toBe('form_recall')
    }
  })

  it('fails when no learningItem', () => {
    const r = buildDictation(baseInput({ learningItem: null }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('item_not_found')
  })
})

describe('buildCloze', () => {
  it('happy path with cloze context', () => {
    const ctx = makeContext('Saya ___ nasi', 'cloze')
    const r = buildCloze(baseInput({ contexts: [ctx] }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.clozeContext?.sentence).toBe('Saya ___ nasi')
      expect(r.exerciseItem.clozeContext?.targetWord).toBe('akhir')
    }
  })

  it('fails when no cloze context', () => {
    const r = buildCloze(baseInput({ contexts: [] }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_cloze')
  })

  it('fails when cloze context lacks `___` marker', () => {
    const ctx = makeContext('Saya makan nasi', 'cloze')  // no blank
    const r = buildCloze(baseInput({ contexts: [ctx] }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('malformed_cloze')
  })
})

// ─── cascade-driven builders ───

describe('buildRecognitionMCQ', () => {
  it('happy path with sufficient pool', () => {
    const r = buildRecognitionMCQ(baseInput())
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.distractors).toHaveLength(3)
    }
  })

  it('fails with insufficient pool', () => {
    const small = makePoolItems(1)
    const r = buildRecognitionMCQ(baseInput({ poolItems: small.items, poolMeaningsByItem: small.meaningsByItem }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('no_distractor_candidates')
  })
})

describe('buildCuedRecall', () => {
  it('happy path', () => {
    const r = buildCuedRecall(baseInput())
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.cuedRecallData?.options).toHaveLength(4)  // 1 correct + 3 distractors
      expect(r.exerciseItem.cuedRecallData?.correctOptionId).toBe('akhir')
    }
  })

  it('fails with insufficient pool', () => {
    const small = makePoolItems(2)
    const r = buildCuedRecall(baseInput({ poolItems: small.items, poolMeaningsByItem: small.meaningsByItem }))
    expect(r.kind).toBe('fail')
    if (r.kind === 'fail') expect(r.reasonCode).toBe('no_distractor_candidates')
  })
})

describe('buildListeningMCQ', () => {
  it('happy path', () => {
    const r = buildListeningMCQ(baseInput())
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
    const r = buildClozeMcq(baseInput({ variant }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.clozeMcqData?.sentence).toBe('Itu ___ ya!')
      expect(r.exerciseItem.clozeMcqData?.correctOptionId).toBe('mahal')
    }
  })

  it('runtime path with cloze context + sufficient pool', () => {
    const ctx = makeContext('Saya ___ nasi', 'cloze')
    const r = buildClozeMcq(baseInput({ contexts: [ctx] }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.clozeMcqData?.sentence).toBe('Saya ___ nasi')
      expect(r.exerciseItem.clozeMcqData?.options).toHaveLength(4)
      expect(r.exerciseItem.clozeMcqData?.correctOptionId).toBe('akhir')
    }
  })

  it('runtime fails when no cloze context AND no variant', () => {
    const r = buildClozeMcq(baseInput({ contexts: [] }))
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
    const r = buildClozeMcq(baseInput({ variant }))
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
    const r = buildContrastPair(baseInput({ variant }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.contrastPairData?.options).toEqual(['ini', 'itu'])
      expect(r.exerciseItem.contrastPairData?.correctOptionId).toBe('ini')  // resolved from id 'a'
    }
  })

  it('fails when no active variant', () => {
    const r = buildContrastPair(baseInput({ variant: null }))
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
    const r = buildContrastPair(baseInput({ variant }))
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
    const r = buildSentenceTransformation(baseInput({ variant }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.sentenceTransformationData?.sourceSentence).toBe('Saya makan')
    }
  })

  it('fails when no active variant', () => {
    const r = buildSentenceTransformation(baseInput({ variant: null }))
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
    const r = buildSentenceTransformation(baseInput({ variant }))
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
    const r = buildConstrainedTranslation(baseInput({ variant }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.constrainedTranslationData?.acceptableAnswers).toEqual(['Saya belum makan'])
    }
  })

  it('fails when no active variant', () => {
    const r = buildConstrainedTranslation(baseInput({ variant: null }))
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
    const r = buildSpeaking(baseInput({ variant }))
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.exerciseItem.speakingData?.targetPatternOrScenario).toBe('Selamat pagi')
    }
  })

  it('item-anchored fallback (no variant)', () => {
    const r = buildSpeaking(baseInput({ variant: null }))
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
