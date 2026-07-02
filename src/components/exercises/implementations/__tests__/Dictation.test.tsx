// Dictation.tsx — component tests for the post-answer meaning reveal
// (2026-07-02 owner request): dictation is the only typed-Indonesian exercise
// where the learner never saw the L1 meaning; after answering, the reveal now
// shows the NL meaning under the Indonesian transcript.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import Dictation from '../Dictation'
import { SessionAudioProvider } from '@/contexts/SessionAudioContext'
import type { ExerciseItem, LearningItem } from '@/types/learning'

function makeItem(): LearningItem {
  return {
    id: 'item-1', item_type: 'word', base_text: 'makan', normalized_text: 'makan',
    language: 'id', level: 'A1', source_type: 'lesson',
    source_vocabulary_id: null, source_card_id: null, notes: null,
    is_active: true, pos: 'verb', translation_nl: null, translation_en: null, usage_note: null, created_at: '', updated_at: '',
  }
}

function makeExerciseItem(overrides: Partial<ExerciseItem> = {}): ExerciseItem {
  return {
    learningItem: makeItem(),
    meanings: [
      { id: 'm1', learning_item_id: 'item-1', translation_language: 'nl', translation_text: 'eten', sense_label: null, usage_note: null, is_primary: true },
    ],
    contexts: [],
    // Real-world shape: variants include NL/EN alternative translations of the
    // item alongside ID spellings — the grader must only accept the ID ones.
    answerVariants: [
      { id: 'v1', learning_item_id: 'item-1', variant_text: 'makanan', variant_type: 'informal', language: 'id', is_accepted: true, notes: null },
      { id: 'v2', learning_item_id: 'item-1', variant_text: 'food', variant_type: 'alternative_translation', language: 'en', is_accepted: true, notes: null },
      { id: 'v3', learning_item_id: 'item-1', variant_text: 'eten', variant_type: 'alternative_translation', language: 'nl', is_accepted: true, notes: null },
    ],
    skillType: 'produce_mode',
    exerciseType: 'type_form_from_audio_ex',
    ...overrides,
  }
}

const audioMap = new Map([['makan|__default__', 'tts/x/makan.mp3']])

function renderDictation(item: ExerciseItem = makeExerciseItem()) {
  return render(
    <MantineProvider>
      <SessionAudioProvider audioMap={audioMap}>
        <Dictation
          exerciseItem={item}
          userLanguage="nl"
          onAnswer={vi.fn()}
          onEvent={vi.fn()}
        />
      </SessionAudioProvider>
    </MantineProvider>
  )
}

async function playAndAnswer(answer: string) {
  const user = userEvent.setup()
  // The submit gate opens only after the clip has played once.
  await user.click(screen.getByRole('button', { name: /speel audio af/i }))
  await user.type(screen.getByRole('textbox'), answer)
  await user.click(screen.getByRole('button', { name: /controleer/i }))
  return user
}

describe('Dictation — post-answer meaning reveal', () => {
  it('shows no transcript or meaning before answering', () => {
    renderDictation()
    expect(screen.queryByText('makan')).not.toBeInTheDocument()
    expect(screen.queryByText('eten')).not.toBeInTheDocument()
  })

  it('shows the NL meaning under the transcript after a wrong answer', async () => {
    renderDictation()
    await playAndAnswer('salah')
    expect(await screen.findByText('makan')).toBeInTheDocument()
    expect(await screen.findByText('eten')).toBeInTheDocument()
  })

  it('shows the NL meaning after a correct answer', async () => {
    renderDictation()
    await playAndAnswer('makan')
    expect(await screen.findByText('eten')).toBeInTheDocument()
  })

  it('falls back to any NL meaning when none is primary', async () => {
    renderDictation(makeExerciseItem({
      meanings: [
        { id: 'm1', learning_item_id: 'item-1', translation_language: 'nl', translation_text: 'voedsel', sense_label: null, usage_note: null, is_primary: false },
      ],
    }))
    await playAndAnswer('salah')
    expect(await screen.findByText('voedsel')).toBeInTheDocument()
  })

  it('renders the transcript without a meaning row when no meaning exists', async () => {
    renderDictation(makeExerciseItem({ meanings: [] }))
    await playAndAnswer('salah')
    expect(await screen.findByText('makan')).toBeInTheDocument()
    expect(screen.queryByText('eten')).not.toBeInTheDocument()
  })
})

describe('Dictation — variant grading is Indonesian-only', () => {
  it('rejects the Dutch translation as a typed answer', async () => {
    const onAnswer = vi.fn()
    render(
      <MantineProvider>
        <SessionAudioProvider audioMap={audioMap}>
          <Dictation exerciseItem={makeExerciseItem()} userLanguage="nl" onAnswer={onAnswer} onEvent={vi.fn()} />
        </SessionAudioProvider>
      </MantineProvider>
    )
    await playAndAnswer('eten')
    await waitFor(() => expect(onAnswer).toHaveBeenCalled())
    expect(onAnswer.mock.calls[0][0].wasCorrect).toBe(false)
  })

  it('accepts an Indonesian spelling variant', async () => {
    const onAnswer = vi.fn()
    render(
      <MantineProvider>
        <SessionAudioProvider audioMap={audioMap}>
          <Dictation exerciseItem={makeExerciseItem()} userLanguage="nl" onAnswer={onAnswer} onEvent={vi.fn()} />
        </SessionAudioProvider>
      </MantineProvider>
    )
    await playAndAnswer('makanan')
    await waitFor(() => expect(onAnswer).toHaveBeenCalled(), { timeout: 3000 })
    expect(onAnswer.mock.calls[0][0].wasCorrect).toBe(true)
  })
})
