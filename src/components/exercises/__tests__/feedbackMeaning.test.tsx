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
