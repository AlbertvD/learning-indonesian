import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { SpeakingExercise } from '@/components/exercises/SpeakingExercise'
import type { ExerciseItem } from '@/types/learning'

describe('SpeakingExercise defensive no-op', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('clicking the record button never invokes onAnswer, even after the legacy 1500ms timeout', () => {
    const onAnswer = vi.fn()
    const exerciseItem: ExerciseItem = {
      learningItem: null,
      meanings: [],
      contexts: [],
      answerVariants: [],
      skillType: 'spoken_production',
      exerciseType: 'speaking',
      speakingData: {
        promptText: 'Zeg "Selamat pagi"',
      },
    }

    render(
      <MantineProvider>
        <SpeakingExercise exerciseItem={exerciseItem} userLanguage="nl" onAnswer={onAnswer} />
      </MantineProvider>
    )

    // Use fireEvent to bypass userEvent's fake-timer interaction issues.
    fireEvent.click(screen.getByRole('button'))

    // Advance past the legacy 1500ms setTimeout that the old implementation used.
    vi.advanceTimersByTime(3000)

    expect(onAnswer).not.toHaveBeenCalled()
  })
})
