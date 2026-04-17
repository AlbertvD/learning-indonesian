import { describe, it, expect } from 'vitest'
import type { ExerciseItem } from '@/types/learning'

describe('ContrastPairExercise types', () => {
  it('compiles ExerciseItem with contrast_pair data', () => {
    const exerciseItem: ExerciseItem = {
      learningItem: {
        id: 'item-1',
        item_type: 'word',
        base_text: 'di',
        normalized_text: 'di',
        language: 'id',
        level: 'A1',
        source_type: 'lesson',
        source_vocabulary_id: null,
        source_card_id: null,
        notes: null,
        is_active: true,
        pos: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      meanings: [],
      contexts: [],
      answerVariants: [],
      skillType: 'recognition',
      exerciseType: 'contrast_pair',
      contrastPairData: {
        promptText: 'Choose the locative preposition',
        targetMeaning: 'at/in',
        options: ['di', 'ke'],
        correctOptionId: 'di',
        explanationText: 'Di indicates location; ke indicates direction',
      },
    }

    expect(exerciseItem.exerciseType).toBe('contrast_pair')
    expect(exerciseItem.contrastPairData?.options.length).toBe(2)
  })
})
