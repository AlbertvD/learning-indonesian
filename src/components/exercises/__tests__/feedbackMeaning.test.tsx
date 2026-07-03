// Feedback meaning line for dictation (2026-07-02 owner request): the Doorgaan
// card for type_form_from_audio_ex now carries the L1 meaning, and the
// vocab-pair layout renders the meaning line (previously grammar-reveal only).

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { feedbackPropsFor } from '../feedbackMapping'
import { ExerciseFeedback } from '../primitives'
import { feedbackCopyFor } from '@/components/experience/feedbackCopy'
import type { ExerciseItem } from '@/types/learning'

function makeDictationItem(): ExerciseItem {
  return {
    learningItem: {
      id: 'i1', item_type: 'word', base_text: 'makan', normalized_text: 'makan',
      language: 'id', level: 'A1', source_type: 'lesson',
      source_vocabulary_id: null, source_card_id: null, notes: null,
      is_active: true, pos: null, translation_nl: null, translation_en: null, usage_note: null, created_at: '', updated_at: '',
    },
    meanings: [
      { id: 'm1', learning_item_id: 'i1', translation_language: 'nl', translation_text: 'eten', sense_label: null, usage_note: null, is_primary: true },
    ],
    contexts: [],
    answerVariants: [],
    skillType: 'produce_mode',
    exerciseType: 'type_form_from_audio_ex',
  }
}

describe('feedbackPropsFor — dictation meaning', () => {
  it('passes the L1 meaning for type_form_from_audio_ex', () => {
    const props = feedbackPropsFor({
      item: makeDictationItem(),
      response: 'salah',
      outcome: 'wrong',
      userLanguage: 'nl',
    })
    expect(props.meaning).toBe('eten')
  })

  it('meaning is undefined when the item has no L1 meaning', () => {
    const item = makeDictationItem()
    item.meanings = []
    const props = feedbackPropsFor({
      item,
      response: 'salah',
      outcome: 'wrong',
      userLanguage: 'nl',
    })
    expect(props.meaning).toBeUndefined()
  })
})

describe('ExerciseFeedback — accepted-variants display dedup', () => {
  it('omits the variant identical to the correct answer from "Ook goed"', () => {
    const { copy, continueLabel } = feedbackCopyFor('nl')
    render(
      <MantineProvider>
        <ExerciseFeedback
          outcome="correct"
          layout="vocab-pair"
          direction="audio→ID"
          promptShown={{ text: 'makan', lang: 'ID', role: 'heard' }}
          correctAnswer={{ text: 'makan', lang: 'ID', role: 'said' }}
          acceptedVariants={['makan', 'makanan']}
          copy={copy}
          continueLabel={continueLabel}
          onContinue={vi.fn()}
        />
      </MantineProvider>
    )
    expect(screen.getByText(/Ook goed/).textContent).toBe('Ook goed: makanan')
  })

  it('hides the "Ook goed" row entirely when the only variant equals the answer', () => {
    const { copy, continueLabel } = feedbackCopyFor('nl')
    render(
      <MantineProvider>
        <ExerciseFeedback
          outcome="correct"
          layout="vocab-pair"
          direction="audio→ID"
          promptShown={{ text: 'makan', lang: 'ID', role: 'heard' }}
          correctAnswer={{ text: 'makan', lang: 'ID', role: 'said' }}
          acceptedVariants={['makan']}
          copy={copy}
          continueLabel={continueLabel}
          onContinue={vi.fn()}
        />
      </MantineProvider>
    )
    expect(screen.queryByText(/Ook goed/)).not.toBeInTheDocument()
  })
})

describe('ExerciseFeedback — fuzzy diff-pair with identical texts', () => {
  it('skips the diff pair when the typed answer equals the correct answer (retried-correct)', () => {
    // A correct answer after a failed retry commits as fuzzy — user text and
    // correct answer are identical, so an X → X diff pair would be nonsense.
    const { copy, continueLabel } = feedbackCopyFor('nl')
    render(
      <MantineProvider>
        <ExerciseFeedback
          outcome="fuzzy"
          layout="grammar-reveal"
          direction="ID→ID"
          promptShown={{ text: 'Di pasar ada banyak sayur.', lang: 'ID', role: 'shown' }}
          correctAnswer={{ text: 'Di pasar ada banyak sayuran.', lang: 'ID', role: 'target' }}
          userAnswer={{ text: 'Di pasar ada banyak sayuran.', lang: 'ID', role: 'typed' }}
          copy={copy}
          continueLabel={continueLabel}
          onContinue={vi.fn()}
        />
      </MantineProvider>
    )
    expect(screen.queryByText('→')).not.toBeInTheDocument()
    expect(screen.getByText('Bijna goed')).toBeInTheDocument()
  })
})

describe('ExerciseFeedback — meaning line in vocab-pair layout', () => {
  it('renders the meaning line when meaning is set on a vocab-pair card', () => {
    const { copy, continueLabel } = feedbackCopyFor('nl')
    render(
      <MantineProvider>
        <ExerciseFeedback
          outcome="wrong"
          layout="vocab-pair"
          direction="audio→ID"
          promptShown={{ text: 'makan', lang: 'ID', role: 'heard' }}
          correctAnswer={{ text: 'makan', lang: 'ID', role: 'target' }}
          userAnswer={{ text: 'salah', lang: 'ID', role: 'typed' }}
          meaning="eten"
          copy={copy}
          continueLabel={continueLabel}
          onContinue={vi.fn()}
        />
      </MantineProvider>
    )
    expect(screen.getByText(/eten/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(copy.roleLabelMeaning))).toBeInTheDocument()
  })
})
