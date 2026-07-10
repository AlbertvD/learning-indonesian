// src/__tests__/recapSummary.test.tsx
//
// The completed-session recap shows a summary (accuracy + first-try + slips) and
// a per-capability breakdown, NOT the old flat per-item list. Accuracy is scored
// on FIRST attempts only.

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import { RecapScreen, type FirstAttemptOutcome } from '@/components/experience/RecapScreen'
import type { SessionBlock } from '@/lib/session-builder'
import type { CapabilityType } from '@/lib/capabilities'

function block(id: string, capabilityType: CapabilityType, kind: SessionBlock['kind'] = 'due_review'): SessionBlock {
  return {
    id,
    kind,
    capabilityId: `cap-${id}`,
    canonicalKeySnapshot: `key-${id}`,
    renderPlan: { capabilityType } as SessionBlock['renderPlan'],
    reviewContext: {} as SessionBlock['reviewContext'],
  } as SessionBlock
}

function renderRecap(
  blocks: SessionBlock[],
  outcomes: Array<[string, FirstAttemptOutcome]>,
) {
  const answered = new Set(outcomes.map(([id]) => id))
  return render(
    <MantineProvider>
      <MemoryRouter>
        <RecapScreen
          renderableBlocks={blocks}
          answeredBlocks={answered}
          skippedBlocks={new Set()}
          commitFailedBlocks={new Set()}
          firstAttemptOutcomes={new Map(outcomes)}
          onExit={vi.fn()}
          userLanguage="nl"
        />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('RecapScreen — completed session summary', () => {
  it('scores accuracy on first attempts and counts slips', () => {
    const blocks = [
      block('a', 'recognise_meaning_from_text_cap'),
      block('b', 'recognise_meaning_from_text_cap'),
      block('c', 'recognise_meaning_from_text_cap'),
      block('d', 'recognise_meaning_from_text_cap'),
    ]
    // 3 correct, 1 wrong → 75% accuracy, 3/4 first try, 1 slip.
    renderRecap(blocks, [
      ['a', 'correct'],
      ['b', 'correct'],
      ['c', 'correct'],
      ['d', 'wrong'],
    ])

    expect(screen.getByText('Nauwkeurigheid')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('Foutjes')).toBeInTheDocument()
  })

  it('renders one breakdown row per capability with its card count', () => {
    const blocks = [
      block('a', 'recognise_meaning_from_text_cap'),
      block('b', 'recognise_meaning_from_text_cap'),
      block('c', 'recognise_grammar_pattern_cap'),
    ]
    renderRecap(blocks, [
      ['a', 'correct'],
      ['b', 'wrong'],
      ['c', 'correct'],
    ])

    // Both capability labels appear (Dutch display copy).
    expect(screen.getByText('Betekenis herkennen')).toBeInTheDocument()
    expect(screen.getByText('Patroon herkennen')).toBeInTheDocument()
    // The larger group (2 cards) shows "2 kaarten"; the single shows "1 kaart".
    expect(screen.getByText('2 kaarten')).toBeInTheDocument()
    expect(screen.getByText('1 kaart')).toBeInTheDocument()
  })

  it('does not render the retired per-item kicker list', () => {
    const blocks = [block('a', 'recognise_meaning_from_text_cap')]
    renderRecap(blocks, [['a', 'correct']])
    expect(screen.queryByText('Herhaling opgeslagen')).not.toBeInTheDocument()
    expect(screen.queryByText('Introductie gestart')).not.toBeInTheDocument()
  })

  it('a skipped-only session (no attempts) shows a dash accuracy, not NaN', () => {
    const blocks = [block('a', 'recognise_meaning_from_text_cap')]
    renderRecap(blocks, []) // nothing answered
    const recap = screen.getByTestId('session-recap')
    expect(within(recap).getByText('—')).toBeInTheDocument()
    expect(within(recap).queryByText(/NaN/)).not.toBeInTheDocument()
  })
})
