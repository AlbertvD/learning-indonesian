import { describe, it, expect } from 'vitest'
import { buildFeedbackInput, attachFeedbackAudio } from '../buildFeedbackInput'
import type { SessionBlock } from '@/lib/session-builder'
import type { CapabilityRenderContext } from '@/lib/capabilities'
import type { ExerciseItem, ExerciseType } from '@/types/learning'
import type { FeedbackProps } from '@/components/exercises/feedbackMapping'

function makeBlock(exerciseType: ExerciseType, capabilityType = 'meaning_recall'): SessionBlock {
  return {
    id: 'b1',
    kind: 'due_review',
    capabilityId: 'cap-1',
    canonicalKeySnapshot: `item:x:${exerciseType}:id_to_l1`,
    stateVersion: 1,
    reviewContext: {
      schedulerSnapshot: {
        stateVersion: 1, activationState: 'active', reviewCount: 1, lapseCount: 0,
        consecutiveFailureCount: 0, stability: 1, difficulty: 5,
      },
      currentStateVersion: 1,
      artifactVersionSnapshot: { artifactFingerprint: 'v1' },
      capabilityReadinessStatus: 'ready',
      capabilityPublicationStatus: 'published',
    },
    renderPlan: {
      capabilityKey: `item:x:${exerciseType}:id_to_l1`,
      sourceRef: 'learning_items/x',
      exerciseType,
      capabilityType: capabilityType as never,
      skillType: 'recall_mode',
    },
  }
}

function makeItem(exerciseType: ExerciseType): ExerciseItem {
  return {
    learningItem: {
      id: 'i1', item_type: 'word', base_text: 'makan', normalized_text: 'makan',
      language: 'id', level: 'A1', source_type: 'lesson',
      source_vocabulary_id: null, source_card_id: null, notes: null,
      is_active: true, pos: null, translation_nl: null, translation_en: null, usage_note: null, created_at: '', updated_at: '',
    },
    meanings: [
      { id: 'm1', learning_item_id: 'i1', translation_language: 'nl', translation_text: 'eten', sense_label: null, usage_note: null, is_primary: true },
    ],
    contexts: [],
    answerVariants: [
      { id: 'v1', learning_item_id: 'i1', variant_text: 'eetje', variant_type: 'informal', language: 'nl', is_accepted: true, notes: null },
      { id: 'v2', learning_item_id: 'i1', variant_text: 'verboden', variant_type: 'alternative_translation', language: 'nl', is_accepted: false, notes: null },
    ],
    skillType: 'recall_mode',
    exerciseType,
    cuedRecallData: exerciseType === 'choose_form_ex' ? { promptMeaningText: 'eten', options: ['makan', 'minum'], correctOptionId: 'makan' } : undefined,
    clozeMcqData: exerciseType === 'choose_missing_word_ex' ? { sentence: 'Saya ___ nasi', translation: 'I eat rice', options: ['makan', 'minum'], correctOptionId: 'makan' } : undefined,
    clozeContext: exerciseType === 'type_missing_word_ex' ? { sentence: 'Saya ___ nasi', targetWord: 'makan', translation: null } : undefined,
    contrastPairData: exerciseType === 'choose_correct_form_ex' ? { promptText: 'makan vs minum', targetMeaning: 'eten', options: ['makan', 'minum'], correctOptionId: 'makan', explanationText: 'makan is eat' } : undefined,
    sentenceTransformationData: exerciseType === 'transform_sentence_ex' ? { sourceSentence: 'Saya makan', transformationInstruction: 'negate', acceptableAnswers: ['Saya tidak makan'], explanationText: 'use tidak' } : undefined,
    constrainedTranslationData: exerciseType === 'translate_sentence_ex' ? { sourceLanguageSentence: 'I eat', requiredTargetPattern: 'me-', patternName: 'active prefix', acceptableAnswers: ['Saya makan'], explanationText: 'active prefix' } : undefined,
    speakingData: exerciseType === 'speaking' ? { promptText: 'Greet someone', targetPatternOrScenario: 'halo' } : undefined,
  }
}

function makeContext(exerciseType: ExerciseType): CapabilityRenderContext {
  return {
    blockId: 'b1', capabilityId: 'cap-1',
    exerciseItem: makeItem(exerciseType),
    audibleTexts: [], diagnostic: null,
  }
}

const audioMap = new Map([['makan|__default__', '/audio/makan.mp3']])

const ALL_TYPES: ExerciseType[] = [
  'choose_meaning_ex', 'choose_form_ex', 'type_form_ex', 'type_meaning_ex',
  'type_missing_word_ex', 'choose_missing_word_ex', 'choose_correct_form_ex', 'transform_sentence_ex',
  'translate_sentence_ex', 'speaking', 'choose_meaning_from_audio_ex', 'type_form_from_audio_ex',
]

describe('16. buildFeedbackInput adapter', () => {
  it('isGrammar=false for vocab capability types', () => {
    const vocabTypes: ExerciseType[] = ['type_meaning_ex', 'choose_meaning_ex', 'type_form_ex', 'choose_form_ex']
    for (const type of vocabTypes) {
      const result = buildFeedbackInput({
        block: makeBlock(type, 'meaning_recall'),
        context: makeContext(type),
        response: 'eten',
        outcome: 'wrong',
        userLanguage: 'nl',
        audioMap,
        commitFailed: false,
      })
      expect(result.isGrammar, `expected isGrammar=false for ${type}`).toBe(false)
    }
  })

  it('isGrammar=true for recognise/contrast/produce grammar pattern capability types (ADR 0017)', () => {
    for (const capType of ['recognise_grammar_pattern_cap', 'contrast_grammar_pattern_cap', 'produce_grammar_pattern_cap'] as const) {
      const result = buildFeedbackInput({
        block: makeBlock('transform_sentence_ex', capType),
        context: makeContext('transform_sentence_ex'),
        response: 'makan',
        outcome: 'wrong',
        userLanguage: 'nl',
        audioMap,
        commitFailed: false,
      })
      expect(result.isGrammar, `expected isGrammar=true for capType=${capType}`).toBe(true)
    }
  })

  it('acceptedVariants includes only is_accepted=true variants', () => {
    const result = buildFeedbackInput({
      block: makeBlock('type_meaning_ex'),
      context: makeContext('type_meaning_ex'),
      response: 'eten',
      outcome: 'wrong',
      userLanguage: 'nl',
      audioMap,
      commitFailed: false,
    })
    expect(result.acceptedVariants).toEqual(['eetje'])
  })

  it('promptAudioUrl set for choose_meaning_from_audio_ex using audioMap lookup', () => {
    const result = buildFeedbackInput({
      block: makeBlock('choose_meaning_from_audio_ex'),
      context: makeContext('choose_meaning_from_audio_ex'),
      response: 'eten',
      outcome: 'wrong',
      userLanguage: 'nl',
      audioMap,
      commitFailed: false,
    })
    expect(result.promptAudioUrl).toContain('makan')
  })

  it('promptAudioUrl set for dictation', () => {
    const result = buildFeedbackInput({
      block: makeBlock('type_form_from_audio_ex'),
      context: makeContext('type_form_from_audio_ex'),
      response: 'makan',
      outcome: 'wrong',
      userLanguage: 'nl',
      audioMap,
      commitFailed: false,
    })
    expect(result.promptAudioUrl).toContain('makan')
  })

  it('promptAudioUrl undefined for non-audio exercise types', () => {
    const nonAudioTypes: ExerciseType[] = [
      'choose_meaning_ex', 'choose_form_ex', 'type_form_ex', 'type_meaning_ex',
      'type_missing_word_ex', 'choose_missing_word_ex', 'choose_correct_form_ex', 'transform_sentence_ex',
      'translate_sentence_ex', 'speaking',
    ]
    for (const type of nonAudioTypes) {
      const result = buildFeedbackInput({
        block: makeBlock(type),
        context: makeContext(type),
        response: 'ans',
        outcome: 'wrong',
        userLanguage: 'nl',
        audioMap,
        commitFailed: false,
      })
      expect(result.promptAudioUrl, `expected undefined promptAudioUrl for ${type}`).toBeUndefined()
    }
  })

  it('commitFailed passes through', () => {
    const result = buildFeedbackInput({
      block: makeBlock('type_meaning_ex'),
      context: makeContext('type_meaning_ex'),
      response: null,
      outcome: 'wrong',
      userLanguage: 'nl',
      audioMap,
      commitFailed: true,
    })
    expect(result.commitFailed).toBe(true)
  })

  it('all 12 exercise types produce a defined FeedbackMapInput', () => {
    for (const type of ALL_TYPES) {
      const result = buildFeedbackInput({
        block: makeBlock(type),
        context: makeContext(type),
        response: null,
        outcome: 'wrong',
        userLanguage: 'nl',
        audioMap,
        commitFailed: false,
      })
      expect(result, `should produce result for ${type}`).toBeDefined()
      expect(result.item, `item should be defined for ${type}`).toBeDefined()
    }
  })
})

describe('attachFeedbackAudio', () => {
  // audioMap keyed by `${normalizedText}|__default__` → storage path.
  const map = new Map([['makan|__default__', 'tts/x/makan.mp3']])

  function props(over: Partial<FeedbackProps>): FeedbackProps {
    return {
      outcome: 'wrong',
      layout: 'vocab-pair',
      direction: 'L1→ID',
      promptShown: { text: 'eten', lang: 'NL', role: 'shown' },
      correctAnswer: { text: 'makan', lang: 'ID', role: 'target' },
      ...over,
    } as FeedbackProps
  }

  it('adds answerAudio when the correct answer is Indonesian and has a clip', () => {
    const out = attachFeedbackAudio(props({}), map)
    expect(out.answerAudio?.url).toContain('makan.mp3')
  })

  it('no answerAudio when the correct answer is the L1 (Dutch) text', () => {
    const out = attachFeedbackAudio(
      props({ promptShown: { text: 'makan', lang: 'ID', role: 'shown' }, correctAnswer: { text: 'eten', lang: 'NL', role: 'target' } }),
      map,
    )
    expect(out.answerAudio).toBeUndefined()
  })

  it('no answerAudio when no clip exists for the Indonesian answer', () => {
    const out = attachFeedbackAudio(props({ correctAnswer: { text: 'belum ada', lang: 'ID', role: 'target' } }), map)
    expect(out.answerAudio).toBeUndefined()
  })

  it('dedups: no answerAudio when the correct answer equals the prompt (e.g. dictation)', () => {
    const out = attachFeedbackAudio(
      props({ direction: 'audio→ID', promptShown: { text: 'makan', lang: 'ID', role: 'heard' }, correctAnswer: { text: 'makan', lang: 'ID', role: 'target' } }),
      map,
    )
    expect(out.answerAudio).toBeUndefined()
  })
})
