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
  it('renders the achievement headline as strengthening + mastered', () => {
    renderLadder()
    expect(screen.getByText('Je kunt al 306 woorden begrijpen en gebruiken')).toBeInTheDocument()
  })

  it('renders the subline as learning + introduced practising, and mastered', () => {
    renderLadder()
    // 109 learning + 9 introduced = 118 practising; asserted via the sub-line's
    // own text node (the ladder's "Zit erin" rung repeats the same mastered
    // number elsewhere in the DOM, so a bare getByText('0') would be ambiguous).
    expect(screen.getByText(/nog aan het oefenen/)).toHaveTextContent('118 nog aan het oefenen')
    expect(screen.getByText(/beheers je al volledig/)).toHaveTextContent('0 beheers je al volledig')
  })

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
