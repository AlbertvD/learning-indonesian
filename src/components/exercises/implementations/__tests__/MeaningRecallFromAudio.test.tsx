// MeaningRecallFromAudio.tsx — four-card ladder PR-B (#3' conversion): ear-only
// typed meaning recall. Pins (a) no Indonesian text before answering (the
// whole point — the ear cannot delegate to the eyes), (b) the word may
// reveal AFTER answering, (c) grading replicates MeaningRecall's langMeanings
// accepted-answer path exactly, (d) submit is gated on the clip having played.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import MeaningRecallFromAudio from '../MeaningRecallFromAudio'
import { SessionAudioProvider } from '@/contexts/SessionAudioContext'
import type { ExerciseItem, LearningItem } from '@/types/learning'

function makeItem(): LearningItem {
  return {
    id: 'item-1', item_type: 'word', base_text: 'besar', normalized_text: 'besar',
    language: 'id', level: 'A1', source_type: 'lesson',
    source_vocabulary_id: null, source_card_id: null, notes: null,
    is_active: true, pos: 'adjective', translation_nl: null, translation_en: null, usage_note: null, created_at: '', updated_at: '',
  }
}

function makeExerciseItem(overrides: Partial<ExerciseItem> = {}): ExerciseItem {
  return {
    learningItem: makeItem(),
    meanings: [
      { id: 'm1', learning_item_id: 'item-1', translation_language: 'nl', translation_text: 'groot', sense_label: null, usage_note: null, is_primary: true },
    ],
    contexts: [],
    answerVariants: [],
    skillType: 'recall_mode',
    exerciseType: 'type_meaning_from_audio_ex',
    ...overrides,
  }
}

const audioMap = new Map([['besar|__default__', 'tts/x/besar.mp3']])

function renderCard(item: ExerciseItem = makeExerciseItem(), onAnswer = vi.fn()) {
  render(
    <MantineProvider>
      <SessionAudioProvider audioMap={audioMap}>
        <MeaningRecallFromAudio
          exerciseItem={item}
          userLanguage="nl"
          onAnswer={onAnswer}
          onEvent={vi.fn()}
        />
      </SessionAudioProvider>
    </MantineProvider>
  )
  return onAnswer
}

async function playAndAnswer(answer: string) {
  const user = userEvent.setup()
  // The submit gate opens only after the clip has played once.
  await user.click(screen.getByRole('button', { name: /speel audio af/i }))
  await user.type(screen.getByRole('textbox'), answer)
  await user.click(screen.getByRole('button', { name: /controleer/i }))
  return user
}

describe('MeaningRecallFromAudio — audio-only prompt, no ID text before answering', () => {
  it('shows no Indonesian text before answering', () => {
    renderCard()
    expect(screen.queryByText('besar')).not.toBeInTheDocument()
  })

  it('reveals the Indonesian word after a wrong answer', async () => {
    renderCard()
    await playAndAnswer('klein')
    expect(await screen.findByText('besar')).toBeInTheDocument()
  })

  it('reveals the Indonesian word after a correct answer', async () => {
    renderCard()
    await playAndAnswer('groot')
    expect(await screen.findByText('besar')).toBeInTheDocument()
  })

  it('gates the submit button until the clip has played', () => {
    renderCard()
    expect(screen.getByRole('button', { name: /controleer/i })).toBeDisabled()
  })
})

describe('MeaningRecallFromAudio — grading replicates MeaningRecall.tsx langMeanings exactly', () => {
  it('grades correct against the primary nl meaning', async () => {
    const onAnswer = renderCard()
    await playAndAnswer('groot')
    await waitFor(() => expect(onAnswer).toHaveBeenCalled())
    expect(onAnswer.mock.calls[0][0].wasCorrect).toBe(true)
  })

  it('grades correct against a non-primary nl meaning (langMeanings, not just the primary)', async () => {
    const onAnswer = renderCard(makeExerciseItem({
      meanings: [
        { id: 'm1', learning_item_id: 'item-1', translation_language: 'nl', translation_text: 'groot', sense_label: null, usage_note: null, is_primary: true },
        { id: 'm2', learning_item_id: 'item-1', translation_language: 'nl', translation_text: 'omvangrijk', sense_label: null, usage_note: null, is_primary: false },
      ],
    }))
    await playAndAnswer('omvangrijk')
    await waitFor(() => expect(onAnswer).toHaveBeenCalled())
    expect(onAnswer.mock.calls[0][0].wasCorrect).toBe(true)
  })

  it('grades wrong for an unrelated answer', async () => {
    const onAnswer = renderCard()
    await playAndAnswer('klein')
    await waitFor(() => expect(onAnswer).toHaveBeenCalled())
    expect(onAnswer.mock.calls[0][0].wasCorrect).toBe(false)
  })

  it('falls back to any nl meaning when none is primary', async () => {
    const onAnswer = renderCard(makeExerciseItem({
      meanings: [
        { id: 'm1', learning_item_id: 'item-1', translation_language: 'nl', translation_text: 'reusachtig', sense_label: null, usage_note: null, is_primary: false },
      ],
    }))
    await playAndAnswer('reusachtig')
    await waitFor(() => expect(onAnswer).toHaveBeenCalled())
    expect(onAnswer.mock.calls[0][0].wasCorrect).toBe(true)
  })
})
