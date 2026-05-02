import { describe, it, expect } from 'vitest'
import { audibleTextFieldsOf, collectAudibleTextsFromExerciseItems, collectAudibleTexts } from '../collectAudibleTexts'
import type { ExerciseItem, LearningItem, ItemContext } from '@/types/learning'
import type { CapabilityRenderContext } from '@/services/capabilityContentService'
import { normalizeTtsText } from '@/lib/ttsNormalize'

function makeLearningItem(base_text: string): LearningItem {
  return {
    id: 'item-1', item_type: 'word', base_text,
    normalized_text: base_text, language: 'id', level: 'A1',
    source_type: 'lesson', source_vocabulary_id: null, source_card_id: null,
    notes: null, is_active: true, pos: null,
    created_at: '', updated_at: '',
  }
}

function makeContext(source_text: string): ItemContext {
  return {
    id: 'ctx-1', learning_item_id: 'item-1',
    context_type: 'example_sentence', source_text,
    translation_text: null, difficulty: null, topic_tag: null,
    is_anchor_context: false, source_lesson_id: null, source_section_id: null,
  }
}

function baseExerciseItem(overrides: Partial<ExerciseItem> = {}): ExerciseItem {
  return {
    learningItem: makeLearningItem('akhir'),
    meanings: [],
    contexts: [],
    answerVariants: [],
    skillType: 'recognition',
    exerciseType: 'recognition_mcq',
    ...overrides,
  }
}

describe('audibleTextFieldsOf', () => {
  it('returns base_text from learningItem', () => {
    const result = audibleTextFieldsOf(baseExerciseItem())
    expect(result).toContain(normalizeTtsText('akhir'))
  })

  it('returns normalized variant (lower-cased / trimmed) of texts', () => {
    const result = audibleTextFieldsOf(baseExerciseItem({
      learningItem: makeLearningItem('  Akhir  '),
    }))
    expect(result).toContain(normalizeTtsText('  Akhir  '))
  })

  it('includes contexts[].source_text', () => {
    const result = audibleTextFieldsOf(baseExerciseItem({
      contexts: [makeContext('Saya pergi ke pasar'), makeContext('Setiap hari')],
    }))
    expect(result).toContain(normalizeTtsText('Saya pergi ke pasar'))
    expect(result).toContain(normalizeTtsText('Setiap hari'))
  })

  it('includes clozeContext sentence and target word', () => {
    const result = audibleTextFieldsOf(baseExerciseItem({
      clozeContext: { sentence: 'Saya ___ nasi', targetWord: 'makan', translation: null },
    }))
    expect(result).toContain(normalizeTtsText('Saya ___ nasi'))
    expect(result).toContain(normalizeTtsText('makan'))
  })

  it('includes clozeMcqData filled sentence + every option', () => {
    const result = audibleTextFieldsOf(baseExerciseItem({
      clozeMcqData: {
        sentence: 'Itu ___ ya!',
        translation: null,
        options: ['murah', 'mahal', 'baik', 'buruk'],
        correctOptionId: 'mahal',
      },
    }))
    expect(result).toContain(normalizeTtsText('Itu mahal ya!'))
    for (const opt of ['murah', 'mahal', 'baik', 'buruk']) {
      expect(result).toContain(normalizeTtsText(opt))
    }
  })

  it('includes cuedRecallData ALL options (correct + distractors)', () => {
    const result = audibleTextFieldsOf(baseExerciseItem({
      cuedRecallData: {
        promptMeaningText: 'eind',
        options: ['akhir', 'mulai', 'tengah'],
        correctOptionId: 'akhir',
      },
    }))
    for (const opt of ['akhir', 'mulai', 'tengah']) {
      expect(result).toContain(normalizeTtsText(opt))
    }
  })

  it('includes contrastPairData both options', () => {
    const result = audibleTextFieldsOf(baseExerciseItem({
      contrastPairData: {
        promptText: 'Kies de juiste',
        targetMeaning: 'meaning',
        options: ['ini', 'itu'],
        correctOptionId: 'ini',
        explanationText: '',
      },
    }))
    expect(result).toContain(normalizeTtsText('ini'))
    expect(result).toContain(normalizeTtsText('itu'))
  })

  it('includes sentenceTransformationData source + acceptableAnswers', () => {
    const result = audibleTextFieldsOf(baseExerciseItem({
      sentenceTransformationData: {
        sourceSentence: 'Saya makan',
        transformationInstruction: '',
        acceptableAnswers: ['Saya tidak makan', 'Aku tidak makan'],
        explanationText: '',
      },
    }))
    expect(result).toContain(normalizeTtsText('Saya makan'))
    expect(result).toContain(normalizeTtsText('Saya tidak makan'))
    expect(result).toContain(normalizeTtsText('Aku tidak makan'))
  })

  it('includes constrainedTranslationData acceptableAnswers + cloze fields', () => {
    const result = audibleTextFieldsOf(baseExerciseItem({
      constrainedTranslationData: {
        sourceLanguageSentence: 'I have not eaten',
        requiredTargetPattern: 'belum',
        patternName: 'negation_belum',
        acceptableAnswers: ['Saya belum makan'],
        explanationText: '',
        targetSentenceWithBlank: 'Saya ___ makan',
        blankAcceptableAnswers: ['belum'],
      },
    }))
    expect(result).toContain(normalizeTtsText('Saya belum makan'))
    expect(result).toContain(normalizeTtsText('Saya ___ makan'))
    expect(result).toContain(normalizeTtsText('belum'))
  })

  it('includes speakingData targetPatternOrScenario', () => {
    const result = audibleTextFieldsOf(baseExerciseItem({
      speakingData: { promptText: 'EN prompt', targetPatternOrScenario: 'Selamat pagi' },
    }))
    expect(result).toContain(normalizeTtsText('Selamat pagi'))
  })

  it('does NOT include Dutch/English meanings or prompts', () => {
    const result = audibleTextFieldsOf(baseExerciseItem({
      meanings: [{ id: 'm-1', learning_item_id: 'item-1', translation_language: 'nl', translation_text: 'einde', sense_label: null, usage_note: null, is_primary: true }],
      cuedRecallData: { promptMeaningText: 'einde', options: [], correctOptionId: '' },
      contrastPairData: { promptText: 'Kies', targetMeaning: 'meaning', options: ['x', 'y'], correctOptionId: 'x', explanationText: '' },
      speakingData: { promptText: 'Say hello', targetPatternOrScenario: 'halo' },
    }))
    expect(result).not.toContain(normalizeTtsText('einde'))
    expect(result).not.toContain(normalizeTtsText('Kies'))
    expect(result).not.toContain(normalizeTtsText('Say hello'))
    expect(result).toContain(normalizeTtsText('halo'))  // sanity: target is included
  })

  it('deduplicates and sorts lexicographically', () => {
    const result = audibleTextFieldsOf(baseExerciseItem({
      learningItem: makeLearningItem('z'),
      contexts: [makeContext('a'), makeContext('z'), makeContext('m')],
    }))
    expect(result).toEqual([normalizeTtsText('a'), normalizeTtsText('m'), normalizeTtsText('z')])
  })

  it('returns empty array for an item with no Indonesian text', () => {
    const result = audibleTextFieldsOf({
      learningItem: null,
      meanings: [], contexts: [], answerVariants: [],
      skillType: 'recognition',
      exerciseType: 'recognition_mcq',
    })
    expect(result).toEqual([])
  })

  it('legacy-collector parity: matches the six fields Session.tsx:378-398 covers', () => {
    // The legacy collector covers: base_text, contrastPair.options, filled
    // clozeMcq.sentence, sentenceTransformation.sourceSentence,
    // constrainedTranslation.acceptableAnswers, cuedRecallData.correctOptionId.
    // Verify each is in the new helper's output.
    const item = baseExerciseItem({
      contrastPairData: { promptText: '', targetMeaning: '', options: ['cp-a', 'cp-b'], correctOptionId: 'cp-a', explanationText: '' },
      clozeMcqData: { sentence: 'X ___ Y', translation: null, options: [], correctOptionId: 'CMC' },
      sentenceTransformationData: { sourceSentence: 'ST-source', transformationInstruction: '', acceptableAnswers: [], explanationText: '' },
      constrainedTranslationData: { sourceLanguageSentence: '', requiredTargetPattern: '', patternName: '', acceptableAnswers: ['CT-1'], explanationText: '' },
      cuedRecallData: { promptMeaningText: '', options: ['CR-correct'], correctOptionId: 'CR-correct' },
    })
    const result = audibleTextFieldsOf(item)
    expect(result).toEqual(expect.arrayContaining([
      normalizeTtsText('akhir'),       // base_text
      normalizeTtsText('cp-a'),        // contrast_pair option
      normalizeTtsText('cp-b'),        // contrast_pair option (extension: legacy harvested both)
      normalizeTtsText('X CMC Y'),     // cloze_mcq filled sentence
      normalizeTtsText('ST-source'),
      normalizeTtsText('CT-1'),
      normalizeTtsText('CR-correct'),  // cuedRecallData option (extension: legacy only had correctOptionId)
    ]))
  })
})

describe('collectAudibleTextsFromExerciseItems', () => {
  it('unions and dedups across items', () => {
    const a = baseExerciseItem({ learningItem: makeLearningItem('akhir') })
    const b = baseExerciseItem({ learningItem: makeLearningItem('mulai') })
    const c = baseExerciseItem({ learningItem: makeLearningItem('akhir') })  // dup
    const result = collectAudibleTextsFromExerciseItems([a, b, c])
    expect(result).toEqual([normalizeTtsText('akhir'), normalizeTtsText('mulai')])
  })
})

describe('collectAudibleTexts (capability path)', () => {
  it('skips contexts whose exerciseItem is null', () => {
    const ctxA: CapabilityRenderContext = {
      blockId: 'b-1', capabilityId: 'c-1',
      exerciseItem: baseExerciseItem({ learningItem: makeLearningItem('akhir') }),
      audibleTexts: [normalizeTtsText('akhir')],
      diagnostic: null,
    }
    const ctxB: CapabilityRenderContext = {
      blockId: 'b-2', capabilityId: 'c-2',
      exerciseItem: null,
      audibleTexts: [],
      diagnostic: { reasonCode: 'item_inactive', message: '', capabilityKey: '', capabilityId: 'c-2', exerciseType: 'recognition_mcq', blockId: 'b-2' },
    }
    const result = collectAudibleTexts([ctxA, ctxB])
    expect(result).toEqual([normalizeTtsText('akhir')])
  })

  it('unions audibleTexts across multiple resolved blocks', () => {
    const ctxA: CapabilityRenderContext = {
      blockId: 'b-1', capabilityId: 'c-1',
      exerciseItem: baseExerciseItem(),
      audibleTexts: [normalizeTtsText('akhir'), normalizeTtsText('saya')],
      diagnostic: null,
    }
    const ctxB: CapabilityRenderContext = {
      blockId: 'b-2', capabilityId: 'c-2',
      exerciseItem: baseExerciseItem(),
      audibleTexts: [normalizeTtsText('saya'), normalizeTtsText('makan')],
      diagnostic: null,
    }
    const result = collectAudibleTexts([ctxA, ctxB])
    expect(result.sort()).toEqual([normalizeTtsText('akhir'), normalizeTtsText('makan'), normalizeTtsText('saya')].sort())
  })
})
