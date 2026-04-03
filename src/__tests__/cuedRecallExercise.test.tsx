import { describe, it, expect } from 'vitest'
import type { ExerciseItem } from '@/types/learning'

describe('CuedRecallExercise types', () => {
  it('compiles ExerciseItem with cued_recall data', () => {
    const exerciseItem: ExerciseItem = {
      learningItem: {
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
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      meanings: [
        {
          id: 'm-1',
          learning_item_id: 'item-1',
          translation_language: 'en',
          translation_text: 'to eat',
          sense_label: null,
          usage_note: null,
          is_primary: true,
        },
      ],
      contexts: [
        {
          id: 'ctx-1',
          learning_item_id: 'item-1',
          context_type: 'example_sentence',
          source_text: 'Saya makan nasi',
          translation_text: 'I eat rice',
          difficulty: null,
          topic_tag: null,
          is_anchor_context: true,
          source_lesson_id: null,
          source_section_id: null,
        },
      ],
      answerVariants: [],
      skillType: 'meaning_recall',
      exerciseType: 'cued_recall',
      cuedRecallData: {
        promptMeaningText: 'to eat',
        cueText: 'action word',
        options: ['makan', 'minum', 'tidur', 'berjalan'],
        correctOptionId: 'makan',
        explanationText: 'Makan means to eat',
      },
    }

    expect(exerciseItem.exerciseType).toBe('cued_recall')
    expect(exerciseItem.cuedRecallData?.promptMeaningText).toBe('to eat')
    expect(exerciseItem.cuedRecallData?.options.length).toBe(4)
  })

  it('allows cued_recall exercise type', () => {
    const type: ExerciseItem['exerciseType'] = 'cued_recall'
    expect(type).toBe('cued_recall')
  })
})
