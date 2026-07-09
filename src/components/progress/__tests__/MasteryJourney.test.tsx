import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi } from 'vitest'
import { MasteryJourney } from '../MasteryJourney'
import type { MasteryFunnel } from '@/lib/analytics/mastery/masteryModel'

function funnel(over: Partial<MasteryFunnel> = {}): MasteryFunnel {
  return { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0, ...over }
}

function renderJourney(props: Partial<Parameters<typeof MasteryJourney>[0]> = {}) {
  return render(
    <MantineProvider>
      <MasteryJourney funnel={funnel({ mastered: 4, at_risk: 2 })} unitLabel="woorden" {...props} />
    </MantineProvider>,
  )
}

describe('MasteryJourney at-risk box (slice 2)', () => {
  it('renders as an inert <div> when onAtRiskClick is not supplied', () => {
    renderJourney()
    // The count still shows, but there is no button to click.
    expect(screen.getByText(/2\s+woorden/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /aandacht nodig/i })).not.toBeInTheDocument()
  })

  it('renders as a keyboard-accessible <button> and fires onAtRiskClick when supplied', async () => {
    const user = userEvent.setup()
    const onAtRiskClick = vi.fn()
    renderJourney({ onAtRiskClick })

    const button = screen.getByRole('button', { name: /aandacht nodig/i })
    await user.click(button)
    expect(onAtRiskClick).toHaveBeenCalledTimes(1)
  })

  it('renders neither the div nor the button when there are no at-risk words', () => {
    renderJourney({ funnel: funnel({ mastered: 4, at_risk: 0 }), onAtRiskClick: vi.fn() })
    expect(screen.queryByRole('button', { name: /aandacht nodig/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/aandacht nodig/i)).not.toBeInTheDocument()
  })
})
