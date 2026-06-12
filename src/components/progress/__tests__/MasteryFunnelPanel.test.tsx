import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { MasteryFunnelPanel } from '../MasteryFunnelPanel'
import { getMasteryFunnels, type MasteryFunnel } from '@/lib/analytics/mastery/masteryModel'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getMasteryFunnels: vi.fn(),
}))

function funnel(over: Partial<MasteryFunnel> = {}): MasteryFunnel {
  return { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0, ...over }
}

describe('MasteryFunnelPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the all-lessons funnel by default, a lesson filter, and the footer', async () => {
    vi.mocked(getMasteryFunnels).mockResolvedValue({
      all: { vocabulary: funnel({ mastered: 12, introduced: 3 }), grammar: funnel() },
      byLesson: new Map([[2, { vocabulary: funnel({ mastered: 4 }), grammar: funnel() }]]),
    })

    render(
      <MantineProvider>
        <MasteryFunnelPanel
          userId="user-1"
          kind="vocabulary"
          unitLabel="woorden"
          footer={() => <div>FOOTER-SLOT</div>}
        />
      </MantineProvider>,
    )

    // funnel headline for the all-lessons vocab funnel
    expect(await screen.findByText('woorden beheerst')).toBeInTheDocument()
    // the scope-aware footer renders
    expect(screen.getByText('FOOTER-SLOT')).toBeInTheDocument()
    expect(getMasteryFunnels).toHaveBeenCalledWith('user-1')
  })
})
