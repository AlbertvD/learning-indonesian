import { describe, it, expect } from 'vitest'
import type { ExerciseItem } from '@/types/learning'

describe('ConstrainedTranslationExercise types', () => {
  it('compiles ExerciseItem with constrained_translation data', () => {
    const exerciseItem: ExerciseItem = {
      learningItem: {
        id: 'item-1',
        item_type: 'sentence',
        base_text: 'I eat rice using chopsticks',
        normalized_text: 'i eat rice using chopsticks',
        language: 'en',
        level: 'A2',
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
      skillType: 'meaning_recall',
      exerciseType: 'constrained_translation',
      constrainedTranslationData: {
        sourceLanguageSentence: 'I eat rice using chopsticks',
        requiredTargetPattern: 'Use -dengan (with) for the instrument',
        patternName: 'Dengan — instrument',
        acceptableAnswers: ['Saya makan nasi dengan sumpit'],
        disallowedShortcutForms: ['Saya makan nasi sumpit'],
        explanationText: 'The -dengan construction expresses instruments or accompaniment',
      },
    }

    expect(exerciseItem.exerciseType).toBe('constrained_translation')
    expect(exerciseItem.constrainedTranslationData?.acceptableAnswers.length).toBeGreaterThan(0)
    expect(exerciseItem.constrainedTranslationData?.disallowedShortcutForms?.length).toBeGreaterThan(0)
  })
})
