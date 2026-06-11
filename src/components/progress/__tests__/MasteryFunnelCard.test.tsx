import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MasteryFunnelCard } from '../MasteryFunnelCard'
import { getMasteryFunnel } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getMasteryFunnel: vi.fn(),
}))

const funnels = {
  vocabulary: { not_assessed: 0, introduced: 5, learning: 3, strengthening: 2, mastered: 7, at_risk: 1 },
  grammar: { not_assessed: 0, introduced: 0, learning: 4, strengthening: 0, mastered: 9, at_risk: 0 },
}

function renderCard() {
  return render(
    <MantineProvider>
      <MasteryFunnelCard userId="user-1" />
    </MantineProvider>,
  )
}

describe('MasteryFunnelCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the vocabulary journey by default with its rung counts and a vocab/grammar filter', async () => {
    vi.mocked(getMasteryFunnel).mockResolvedValue(funnels)

    renderCard()

    // vocabulary funnel rung counts (default view); mastered (7) appears twice
    // — once in the headline, once in the segment.
    expect(await screen.findAllByText('7')).not.toHaveLength(0)
    expect(screen.getByText('5')).toBeInTheDocument() // introduced
    expect(screen.getByText('3')).toBeInTheDocument() // learning
    expect(screen.getByText('2')).toBeInTheDocument() // strengthening
    // the filter exposes both content types
    expect(screen.getByText(/woordenschat|vocabulary/i)).toBeInTheDocument()
    expect(screen.getByText(/grammatica|grammar/i)).toBeInTheDocument()
    expect(getMasteryFunnel).toHaveBeenCalledWith('user-1')
  })
})
