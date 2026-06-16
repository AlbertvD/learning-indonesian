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
      skillType: 'meaning_recall',
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
    skillType: 'meaning_recall',
    exerciseType,
    cuedRecallData: exerciseType === 'cued_recall' ? { promptMeaningText: 'eten', options: ['makan', 'minum'], correctOptionId: 'makan' } : undefined,
    clozeMcqData: exerciseType === 'cloze_mcq' ? { sentence: 'Saya ___ nasi', translation: 'I eat rice', options: ['makan', 'minum'], correctOptionId: 'makan' } : undefined,
    clozeContext: exerciseType === 'cloze' ? { sentence: 'Saya ___ nasi', targetWord: 'makan', translation: null } : undefined,
    contrastPairData: exerciseType === 'contrast_pair' ? { promptText: 'makan vs minum', targetMeaning: 'eten', options: ['makan', 'minum'], correctOptionId: 'makan', explanationText: 'makan is eat' } : undefined,
    sentenceTransformationData: exerciseType === 'sentence_transformation' ? { sourceSentence: 'Saya makan', transformationInstruction: 'negate', acceptableAnswers: ['Saya tidak makan'], explanationText: 'use tidak' } : undefined,
    constrainedTranslationData: exerciseType === 'constrained_translation' ? { sourceLanguageSentence: 'I eat', requiredTargetPattern: 'me-', patternName: 'active prefix', acceptableAnswers: ['Saya makan'], explanationText: 'active prefix' } : undefined,
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
  'recognition_mcq', 'cued_recall', 'typed_recall', 'meaning_recall',
  'cloze', 'cloze_mcq', 'contrast_pair', 'sentence_transformation',
  'constrained_translation', 'speaking', 'listening_mcq', 'dictation',
]

describe('16. buildFeedbackInput adapter', () => {
  it('isGrammar=false for vocab capability types', () => {
    const vocabTypes: ExerciseType[] = ['meaning_recall', 'recognition_mcq', 'typed_recall', 'cued_recall']
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

  it('isGrammar=true for recognise_grammar_pattern_cap and contrast_grammar_pattern_cap capability types', () => {
    for (const capType of ['recognise_grammar_pattern_cap', 'contrast_grammar_pattern_cap'] as const) {
      const result = buildFeedbackInput({
        block: makeBlock('cloze_mcq', capType),
        context: makeContext('cloze_mcq'),
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
      block: makeBlock('meaning_recall'),
      context: makeContext('meaning_recall'),
      response: 'eten',
      outcome: 'wrong',
      userLanguage: 'nl',
      audioMap,
      commitFailed: false,
    })
    expect(result.acceptedVariants).toEqual(['eetje'])
  })

  it('promptAudioUrl set for listening_mcq using audioMap lookup', () => {
    const result = buildFeedbackInput({
      block: makeBlock('listening_mcq'),
      context: makeContext('listening_mcq'),
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
      block: makeBlock('dictation'),
      context: makeContext('dictation'),
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
      'recognition_mcq', 'cued_recall', 'typed_recall', 'meaning_recall',
      'cloze', 'cloze_mcq', 'contrast_pair', 'sentence_transformation',
      'constrained_translation', 'speaking',
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
      block: makeBlock('meaning_recall'),
      context: makeContext('meaning_recall'),
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
