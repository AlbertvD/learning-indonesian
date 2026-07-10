import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import { MasteryLadder } from '../MasteryLadder'
import type { MasteryFunnel } from '@/lib/analytics/mastery/masteryModel'

function funnel(over: Partial<MasteryFunnel> = {}): MasteryFunnel {
  return { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0, ...over }
}

function renderLadder(props: Partial<Parameters<typeof MasteryLadder>[0]> = {}) {
  return render(
    <MantineProvider>
      <MasteryLadder
        funnel={funnel({ introduced: 9, learning: 109, strengthening: 306, mastered: 0 })}
        unitLabel="woorden"
        {...props}
      />
    </MantineProvider>,
  )
}

describe('MasteryLadder', () => {
  // The achievement headline was dropped (it duplicated the ladder rungs, which
  // already carry the same numbers with their real-life labels — owner call
  // 2026-07-10); the ladder card + eyebrow are now the single representation.
  it('renders the four real-life-ability rung labels with their own counts', () => {
    renderLadder()

    expect(screen.getByText('Net ontmoet')).toBeInTheDocument()
    expect(screen.getByText('Aan het oefenen')).toBeInTheDocument()
    expect(screen.getByText('Kun je gebruiken')).toBeInTheDocument()
    expect(screen.getByText('Zit erin')).toBeInTheDocument()
  })

  it('renders the eyebrow with the unit label', () => {
    renderLadder()
    expect(screen.getByText('Je reis met deze woorden')).toBeInTheDocument()
  })

  it('renders no at-risk affordance — that moved to a sibling ListCard', () => {
    renderLadder({ funnel: funnel({ mastered: 4, at_risk: 7 }) })
    expect(screen.queryByText(/aandacht nodig/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
