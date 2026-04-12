import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { RecognitionMCQ } from '@/components/exercises/RecognitionMCQ'
import { ContrastPairExercise } from '@/components/exercises/ContrastPairExercise'
import { ClozeMcq } from '@/components/exercises/ClozeMcq'
import type { ExerciseItem } from '@/types/learning'

// Shared learning item fixture
const learningItem: ExerciseItem['learningItem'] = {
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
}

function wrap(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

describe('MCQ exercises — wrong answer triggers onAnswer immediately', () => {
  it('RecognitionMCQ: calls onAnswer(false) on first wrong pick', async () => {
    const onAnswer = vi.fn()
    const exerciseItem: ExerciseItem = {
      learningItem,
      meanings: [
        {
          id: 'm-1',
          learning_item_id: 'item-1',
          translation_language: 'nl',
          translation_text: 'eten',
          sense_label: null,
          usage_note: null,
          is_primary: true,
        },
      ],
      distractors: ['drinken', 'lopen', 'slapen'],
      contexts: [],
      answerVariants: [],
      skillType: 'recognition',
      exerciseType: 'recognition_mcq',
    }

    wrap(<RecognitionMCQ exerciseItem={exerciseItem} userLanguage="nl" onAnswer={onAnswer} />)

    // Click the first option that is NOT the correct answer ("eten")
    const buttons = screen.getAllByRole('button')
    const wrongButton = buttons.find(b => b.textContent !== 'eten')!
    await userEvent.click(wrongButton)

    // onAnswer should be called with wasCorrect=false immediately (via setTimeout 0)
    await vi.waitFor(() => {
      expect(onAnswer).toHaveBeenCalledWith(false, expect.any(Number))
    })
  })

  it('ContrastPairExercise: calls onAnswer(false) on first wrong pick', async () => {
    const onAnswer = vi.fn()
    const exerciseItem: ExerciseItem = {
      learningItem,
      meanings: [],
      contexts: [],
      answerVariants: [],
      skillType: 'recognition',
      exerciseType: 'contrast_pair',
      contrastPairData: {
        promptText: 'Kies de juiste vorm',
        targetMeaning: 'eten',
        options: ['makan', 'minum'],
        correctOptionId: 'makan',
        explanationText: 'Makan = eten, minum = drinken',
      },
    }

    wrap(<ContrastPairExercise exerciseItem={exerciseItem} userLanguage="nl" onAnswer={onAnswer} />)

    // Click the wrong option
    const wrongButton = screen.getByRole('button', { name: 'minum' })
    await userEvent.click(wrongButton)

    await vi.waitFor(() => {
      expect(onAnswer).toHaveBeenCalledWith(false, expect.any(Number))
    })
  })

  it('ClozeMcq: calls onAnswer(false) on first wrong pick', async () => {
    const onAnswer = vi.fn()
    const exerciseItem: ExerciseItem = {
      learningItem,
      meanings: [],
      contexts: [],
      answerVariants: [],
      skillType: 'recognition',
      exerciseType: 'cloze_mcq',
      clozeMcqData: {
        sentence: 'Saya ___ nasi.',
        translation: 'Ik eet rijst.',
        options: ['makan', 'minum', 'tidur'],
        correctOptionId: 'makan',
      },
    }

    wrap(<ClozeMcq exerciseItem={exerciseItem} userLanguage="nl" onAnswer={onAnswer} />)

    // Click a wrong option
    const wrongButton = screen.getByRole('button', { name: 'minum' })
    await userEvent.click(wrongButton)

    await vi.waitFor(() => {
      expect(onAnswer).toHaveBeenCalledWith(false, expect.any(Number))
    })
  })
})
