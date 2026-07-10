// src/components/dashboard/__tests__/FirstRunChecklist.test.tsx
//
// The "Aan de slag" first-run stepper — now four items (Task R2-B, review UP6,
// docs/plans/2026-07-09-uitspraak-round2.md §2): lesson, session, uitspraak
// (new — the day-one Uitspraak hook), ontdek. Presentational: step state is
// passed in via `steps`; this suite only exercises rendering + the two
// dismissable actions (uitspraak, ontdek).

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect } from 'vitest'
import { FirstRunChecklist, type ChecklistSteps } from '../FirstRunChecklist'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: any) => any) =>
    selector({ profile: { language: 'nl' } }),
  ),
}))

function renderChecklist(steps: ChecklistSteps, overrides: Partial<{ onSkipUitspraak: () => void; onSkipOntdek: () => void }> = {}) {
  const onSkipUitspraak = overrides.onSkipUitspraak ?? vi.fn()
  const onSkipOntdek = overrides.onSkipOntdek ?? vi.fn()
  render(
    <MemoryRouter>
      <MantineProvider>
        <FirstRunChecklist steps={steps} onSkipUitspraak={onSkipUitspraak} onSkipOntdek={onSkipOntdek} />
      </MantineProvider>
    </MemoryRouter>,
  )
  return { onSkipUitspraak, onSkipOntdek }
}

const ALL_UNDONE: ChecklistSteps = {
  lessonOpened: false,
  sessionDone: false,
  uitspraakVisited: false,
  ontdekVisited: false,
}

describe('FirstRunChecklist — four steps (Task R2-B)', () => {
  it('renders all 4 items, in order: lesson, session, uitspraak, ontdek', () => {
    renderChecklist(ALL_UNDONE)
    expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(4)
    expect(screen.getByText('Bekijk je eerste les')).toBeInTheDocument()
    expect(screen.getByText('Doe je eerste sessie')).toBeInTheDocument()
    expect(screen.getByText('Lees de uitspraakgids (2 minuten)')).toBeInTheDocument()
    expect(screen.getByText('Ontdek podcasts & verhalen')).toBeInTheDocument()
  })

  it('shows the uitspraak step’s read+skip actions when it is the current step', () => {
    renderChecklist({
      lessonOpened: true,
      sessionDone: true,
      uitspraakVisited: false,
      ontdekVisited: false,
    })

    const readLink = screen.getByRole('link', { name: 'Lezen' })
    expect(readLink).toHaveAttribute('href', '/pronunciation')
    expect(screen.getByRole('button', { name: 'Overslaan' })).toBeInTheDocument()
    // Not-yet-current steps show no action row.
    expect(screen.queryByRole('link', { name: 'Ontdek' })).not.toBeInTheDocument()
  })

  it('marks the uitspraak step done via onSkipUitspraak without navigating away', async () => {
    const user = userEvent.setup()
    const { onSkipUitspraak } = renderChecklist({
      lessonOpened: true,
      sessionDone: true,
      uitspraakVisited: false,
      ontdekVisited: false,
    })

    await user.click(screen.getByRole('button', { name: 'Overslaan' }))
    expect(onSkipUitspraak).toHaveBeenCalledTimes(1)
  })

  it('advances the current step to ontdek once uitspraak is done', () => {
    renderChecklist({
      lessonOpened: true,
      sessionDone: true,
      uitspraakVisited: true,
      ontdekVisited: false,
    })

    // Uitspraak is done — its subtitle and action row are gone (checkmark node only).
    expect(screen.queryByText('De klanken die Nederlandstaligen het vaakst fout doen — één keer lezen scheelt maanden.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ontdek' })).toHaveAttribute('href', '/ontdek')
    expect(screen.getByRole('button', { name: 'Overslaan' })).toBeInTheDocument()
  })
})
