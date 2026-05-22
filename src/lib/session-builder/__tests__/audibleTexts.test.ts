// Tests for the audibleTextFieldsOf TTS harvest helper.
//
// Coverage focus is on the affixed_form_pair slot added 2026-05-21 (PR 1 of
// docs/plans/2026-05-21-affixed-form-pair-runtime.md). Three sanity rows
// cover existing slots (item base_text, clozeContext, clozeMcqData) to make
// this file a proper unit of coverage for the helper.

import { describe, it, expect } from 'vitest'
import { audibleTextFieldsOf } from '../audibleTexts'
import type { ExerciseItem, LearningItem } from '@/types/learning'

function makeItem(base_text: string): LearningItem {
  return {
    id: 'item-1', item_type: 'word', base_text, normalized_text: base_text,
    language: 'id', level: 'A1', source_type: 'lesson',
    source_vocabulary_id: null, source_card_id: null, notes: null,
    is_active: true, pos: 'verb', translation_nl: null, translation_en: null, usage_note: null, created_at: '', updated_at: '',
  }
}

function baseExerciseItem(overrides: Partial<ExerciseItem> = {}): ExerciseItem {
  return {
    learningItem: null,
    meanings: [],
    contexts: [],
    answerVariants: [],
    skillType: 'form_recall',
    exerciseType: 'typed_recall',
    ...overrides,
  }
}

describe('audibleTextFieldsOf — affixed_form_pair', () => {
  it('includes both root and derived from affixedFormPairData', () => {
    const item = baseExerciseItem({
      affixedFormPairData: {
        promptText: 'Form the meN- form of: baca',
        acceptedAnswer: 'membaca',
        direction: 'root_to_derived',
        allomorphRule: 'meN- becomes mem- before roots beginning with b.',
        root: 'baca',
        derived: 'membaca',
      },
    })
    const result = audibleTextFieldsOf(item)
    expect(result).toEqual(expect.arrayContaining(['baca', 'membaca']))
  })

  it('excludes promptText and allomorphRule (user-language meta-text)', () => {
    const item = baseExerciseItem({
      affixedFormPairData: {
        promptText: 'Form the meN- form of: baca',
        acceptedAnswer: 'membaca',
        direction: 'root_to_derived',
        allomorphRule: 'meN- becomes mem- before roots beginning with b.',
        root: 'baca',
        derived: 'membaca',
      },
    })
    const result = audibleTextFieldsOf(item)
    expect(result).not.toContain('Form the meN- form of: baca')
    expect(result).not.toContain('meN- becomes mem- before roots beginning with b.')
  })
})

describe('audibleTextFieldsOf — existing slots (sanity coverage)', () => {
  it('includes learningItem.base_text', () => {
    const item = baseExerciseItem({ learningItem: makeItem('pasar') })
    expect(audibleTextFieldsOf(item)).toContain('pasar')
  })

  it('includes clozeContext.sentence and targetWord', () => {
    const item = baseExerciseItem({
      exerciseType: 'cloze',
      clozeContext: {
        sentence: 'Saya tidak ___ tinggal di rumah',
        targetWord: 'suka',
        translation: 'I do not like staying home',
        speaker: null,
      },
    })
    const result = audibleTextFieldsOf(item)
    expect(result).toEqual(expect.arrayContaining([
      // normalizeTtsText lowercases/trims; assert via substring presence.
      expect.stringContaining('saya tidak'),
      'suka',
    ]))
  })

  it('includes clozeMcqData filled sentence and options', () => {
    const item = baseExerciseItem({
      exerciseType: 'cloze_mcq',
      clozeMcqData: {
        sentence: 'Saya ___ buku',
        translation: 'I have a book',
        options: ['punya', 'mau', 'ada', 'beli'],
        correctOptionId: 'punya',
      },
    })
    const result = audibleTextFieldsOf(item)
    expect(result).toEqual(expect.arrayContaining(['punya', 'mau', 'ada', 'beli']))
  })

  it('returns deduplicated sorted output', () => {
    const item = baseExerciseItem({
      affixedFormPairData: {
        promptText: 'x', acceptedAnswer: 'x', direction: 'root_to_derived',
        allomorphRule: 'x', root: 'baca', derived: 'baca',  // dup
      },
    })
    const result = audibleTextFieldsOf(item)
    expect(result).toEqual(['baca'])
  })
})
