// SentenceTransformationExercise — retry-attempt feedback (2026-07-03 owner
// report: a wrong attempt cleared the input and showed nothing, reading as
// "the grader does not work") + retried-correct commits as fuzzy.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import SentenceTransformationExercise from '../SentenceTransformationExercise'
import type { ExerciseItem } from '@/types/learning'

function makeExerciseItem(): ExerciseItem {
  return {
    learningItem: null,
    meanings: [],
    contexts: [],
    answerVariants: [],
    skillType: 'produce_mode',
    exerciseType: 'transform_sentence_ex',
    sentenceTransformationData: {
      sourceSentence: 'Ini tamu. Tamu itu tinggal di hotel.',
      transformationInstruction: 'Maak één zin met een betrekkelijke bijzin.',
      acceptableAnswers: ['Ini tamu yang tinggal di hotel.'],
      explanationText: 'Yang verbindt de bijzin.',
    },
  }
}

function renderExercise(onAnswer = vi.fn()) {
  render(
    <MantineProvider>
      <SentenceTransformationExercise
        exerciseItem={makeExerciseItem()}
        userLanguage="nl"
        onAnswer={onAnswer}
        onEvent={vi.fn()}
      />
    </MantineProvider>
  )
  return onAnswer
}

async function submitAnswer(user: ReturnType<typeof userEvent.setup>, text: string) {
  const input = screen.getByRole('textbox')
  await user.clear(input)
  await user.type(input, text)
  await user.click(screen.getByRole('button', { name: /controleer|antwoord/i }))
}

describe('SentenceTransformation — retry attempt feedback', () => {
  it('keeps the typed answer and shows a try-again notice after a wrong attempt', async () => {
    const user = userEvent.setup()
    renderExercise()
    await submitAnswer(user, 'helemaal fout')

    expect(screen.getByRole('textbox')).toHaveValue('helemaal fout')
    expect(screen.getByText(/probeer het opnieuw/i)).toBeInTheDocument()
  })

  it('commits as fuzzy when the correct answer follows a failed attempt', async () => {
    const user = userEvent.setup()
    const onAnswer = renderExercise()
    await submitAnswer(user, 'helemaal fout')
    await submitAnswer(user, 'Ini tamu yang tinggal di hotel.')

    await waitFor(() => expect(onAnswer).toHaveBeenCalled())
    expect(onAnswer.mock.calls[0][0]).toMatchObject({ wasCorrect: true, isFuzzy: true })
  })

  it('shows no notice before any attempt', () => {
    renderExercise()
    expect(screen.queryByText(/probeer het opnieuw/i)).not.toBeInTheDocument()
  })
})
