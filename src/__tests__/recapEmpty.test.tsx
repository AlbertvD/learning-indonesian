// src/__tests__/recapEmpty.test.tsx
//
// MAJ-3 (ux-failure-modes audit §5, desktop program slice 3): the empty
// "Niets te doen" recap must diagnose WHY — no lesson activated (CTA → Leren)
// vs everything done for today (positive framing → Ontdek). Without a reason
// (scoped modes) the generic copy stays.

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import { RecapScreen } from '@/components/experience/RecapScreen'

function renderEmpty(emptyReason?: 'no_active_lesson' | 'caught_up') {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <RecapScreen
          renderableBlocks={[]}
          answeredBlocks={new Set()}
          skippedBlocks={new Set()}
          commitFailedBlocks={new Set()}
          onExit={vi.fn()}
          userLanguage="nl"
          emptyReason={emptyReason}
        />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('RecapScreen — empty session diagnosis', () => {
  it('shows the activate-a-lesson CTA when nothing is activated', () => {
    renderEmpty('no_active_lesson')

    expect(screen.getByText('Nog geen les actief')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Naar Leren' })).toHaveAttribute('href', '/leren')
    expect(screen.queryByText('Niets te doen')).not.toBeInTheDocument()
  })

  it('shows positive caught-up framing with a link onward to Ontdek when all reviews are done', () => {
    renderEmpty('caught_up')

    expect(screen.getByText('Alles gedaan voor vandaag')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Naar Ontdek' })).toHaveAttribute('href', '/ontdek')
  })

  it('keeps the generic copy when no reason is provided (scoped modes)', () => {
    renderEmpty(undefined)

    expect(screen.getByText('Niets te doen')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
