import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('renders the mastery ladder for the all-lessons funnel by default, a lesson filter, and the footer', async () => {
    vi.mocked(getMasteryFunnels).mockResolvedValue({
      all: { vocabulary: funnel({ mastered: 12, introduced: 3 }), grammar: funnel(), morphology: funnel() },
      byLesson: new Map([[2, { vocabulary: funnel({ mastered: 4 }), grammar: funnel(), morphology: funnel() }]]),
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

    // The ladder headline for the all-lessons vocab funnel (strengthening + mastered = 12).
    expect(await screen.findByText('Je reis met deze woorden')).toBeInTheDocument()
    // the scope-aware footer renders
    expect(screen.getByText('FOOTER-SLOT')).toBeInTheDocument()
    expect(getMasteryFunnels).toHaveBeenCalledWith('user-1')
  })

  it('renders no at-risk card when there are no at-risk words, even with onAtRiskClick supplied', async () => {
    vi.mocked(getMasteryFunnels).mockResolvedValue({
      all: { vocabulary: funnel({ mastered: 12, at_risk: 0 }), grammar: funnel(), morphology: funnel() },
      byLesson: new Map(),
    })

    render(
      <MantineProvider>
        <MasteryFunnelPanel userId="user-1" kind="vocabulary" unitLabel="woorden" onAtRiskClick={vi.fn()} />
      </MantineProvider>,
    )

    await screen.findByText('Je reis met deze woorden')
    expect(screen.queryByText(/zakken weg/)).not.toBeInTheDocument()
  })

  it('renders no at-risk card when at-risk words exist but no onAtRiskClick is supplied (grammar/morfologie)', async () => {
    vi.mocked(getMasteryFunnels).mockResolvedValue({
      all: { vocabulary: funnel(), grammar: funnel({ mastered: 5, at_risk: 7 }), morphology: funnel() },
      byLesson: new Map(),
    })

    render(
      <MantineProvider>
        <MasteryFunnelPanel userId="user-1" kind="grammar" unitLabel="patronen" />
      </MantineProvider>,
    )

    await screen.findByText('Je reis met deze patronen')
    expect(screen.queryByText(/zakken weg/)).not.toBeInTheDocument()
  })

  it('renders a tappable at-risk ListCard and fires onAtRiskClick when at-risk words exist', async () => {
    const onAtRiskClick = vi.fn()
    vi.mocked(getMasteryFunnels).mockResolvedValue({
      all: { vocabulary: funnel({ mastered: 12, at_risk: 7 }), grammar: funnel(), morphology: funnel() },
      byLesson: new Map(),
    })

    render(
      <MantineProvider>
        <MasteryFunnelPanel userId="user-1" kind="vocabulary" unitLabel="woorden" onAtRiskClick={onAtRiskClick} />
      </MantineProvider>,
    )

    const card = await screen.findByText('7 woorden zakken weg')
    const user = userEvent.setup()
    await user.click(card)
    expect(onAtRiskClick).toHaveBeenCalledTimes(1)
  })

  it('shows an error notice with a retry button on fetch failure, and recovers on retry', async () => {
    vi.mocked(getMasteryFunnels)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        all: { vocabulary: funnel({ mastered: 9 }), grammar: funnel(), morphology: funnel() },
        byLesson: new Map(),
      })

    render(
      <MantineProvider>
        <MasteryFunnelPanel userId="user-1" kind="vocabulary" unitLabel="woorden" />
      </MantineProvider>,
    )

    const retryButton = await screen.findByRole('button', { name: 'Probeer opnieuw' })
    expect(screen.queryByText('Je reis met deze woorden')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(retryButton)

    expect(await screen.findByText('Je reis met deze woorden')).toBeInTheDocument()
    expect(getMasteryFunnels).toHaveBeenCalledTimes(2)
  })
})
