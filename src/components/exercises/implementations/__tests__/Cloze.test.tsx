// Cloze.tsx — component-level tests focused on the speaker prefix added in
// PR-C of the lib/exercise-content fold (docs/plans/2026-05-21-dialogue-line-
// contextual-cloze.md PR 6). Dialogue_line-sourced clozes carry a
// `clozeContext.speaker` field which the UI renders as a "Name: " prefix;
// item-sourced clozes leave `speaker` null and render unchanged.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import Cloze from '../Cloze'
import type { ExerciseItem, LearningItem } from '@/types/learning'

function makeItem(): LearningItem {
  return {
    id: 'item-1', item_type: 'word', base_text: 'suka', normalized_text: 'suka',
    language: 'id', level: 'A1', source_type: 'lesson',
    source_vocabulary_id: null, source_card_id: null, notes: null,
    is_active: true, pos: 'verb', translation_nl: null, translation_en: null, usage_note: null, created_at: '', updated_at: '',
  }
}

function makeExerciseItem(overrides: Partial<ExerciseItem['clozeContext']> = {}): ExerciseItem {
  return {
    learningItem: makeItem(),
    meanings: [],
    contexts: [],
    answerVariants: [],
    skillType: 'form_recall',
    exerciseType: 'type_missing_word_ex',
    clozeContext: {
      sentence: 'Aku tidak ___ tinggal di rumah terus',
      targetWord: 'suka',
      translation: 'Ik vind het niet leuk om de hele tijd thuis te blijven',
      ...overrides,
    },
  }
}

function renderCloze(item: ExerciseItem) {
  return render(
    <MantineProvider>
      <Cloze
        exerciseItem={item}
        userLanguage="nl"
        onAnswer={vi.fn()}
        onEvent={vi.fn()}
        adminOverlay={null}
      />
    </MantineProvider>
  )
}

describe('Cloze — speaker prefix (dialogue_line source kind)', () => {
  it('renders speaker as a bold "Name: " prefix when set', () => {
    renderCloze(makeExerciseItem({ speaker: 'Titin' }))
    // The speaker name appears in the rendered output. The colon after it is
    // included in the bold span so the visual is "Titin: " before the sentence.
    expect(screen.getByText(/Titin:/)).toBeInTheDocument()
  })

  it('omits the speaker prefix when speaker is null', () => {
    renderCloze(makeExerciseItem({ speaker: null }))
    expect(screen.queryByText(/Titin/)).not.toBeInTheDocument()
    // Sanity: the sentence prefix before ___ still renders.
    expect(screen.getByText(/Aku tidak/)).toBeInTheDocument()
  })

  it('omits the speaker prefix when speaker is undefined (item-sourced path)', () => {
    renderCloze(makeExerciseItem({}))  // no speaker field → undefined
    expect(screen.queryByText(/:/)).not.toBeInTheDocument()
  })

  it('renders the cloze sentence around the input regardless of speaker presence', () => {
    renderCloze(makeExerciseItem({ speaker: 'Titin' }))
    // The sentence is split on ___ into parts[0] = "Aku tidak " and
    // parts[1] = " tinggal di rumah terus". Both render around the input.
    expect(screen.getByText(/Aku tidak/)).toBeInTheDocument()
    expect(screen.getByText(/tinggal di rumah terus/)).toBeInTheDocument()
  })
})
