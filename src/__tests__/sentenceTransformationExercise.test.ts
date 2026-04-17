import { describe, it, expect } from 'vitest'
import type { ExerciseItem } from '@/types/learning'

describe('SentenceTransformationExercise types', () => {
  it('compiles ExerciseItem with sentence_transformation data', () => {
    const exerciseItem: ExerciseItem = {
      learningItem: {
        id: 'item-1',
        item_type: 'sentence',
        base_text: 'Saya makan nasi',
        normalized_text: 'saya makan nasi',
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
      skillType: 'form_recall',
      exerciseType: 'sentence_transformation',
      sentenceTransformationData: {
        sourceSentence: 'Saya makan nasi',
        transformationInstruction: 'Change to past tense',
        acceptableAnswers: ['Saya makan nasi', 'saya makan nasi'],
        hintText: 'Use past tense marker',
        explanationText: 'Past tense in Indonesian is formed with specific markers',
      },
    }

    expect(exerciseItem.exerciseType).toBe('sentence_transformation')
    expect(exerciseItem.sentenceTransformationData?.acceptableAnswers.length).toBeGreaterThan(0)
  })
})
