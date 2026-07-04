import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { GrowthCurveCard } from '../GrowthCurveCard'
import { DurabilityCard } from '../DurabilityCard'
import { getFunnelSeries, type FunnelWeek } from '@/lib/analytics/mastery/masteryModel'
import { memory, type StabilityWeek } from '@/lib/analytics/memory'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({ getFunnelSeries: vi.fn() }))
vi.mock('@/lib/analytics/memory', () => ({ memory: { stabilitySeries: vi.fn() } }))

const wrap = (ui: React.ReactElement) => render(<MantineProvider>{ui}</MantineProvider>)

const emptyFunnel = () => ({
  not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0,
})
function week(weekStart: string, vocab: Partial<ReturnType<typeof emptyFunnel>>): FunnelWeek {
  return {
    weekStart,
    vocabulary: { ...emptyFunnel(), ...vocab },
    grammar: emptyFunnel(),
    morphology: emptyFunnel(),
  }
}

describe('GrowthCurveCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a toggleable line per rung and the net-mastered headline', async () => {
    vi.mocked(getFunnelSeries).mockResolvedValue([
      week('2026-06-01', { introduced: 5, learning: 3, mastered: 3 }),
      week('2026-06-08', { introduced: 4, learning: 6, strengthening: 2, mastered: 8 }),
    ])

    wrap(<GrowthCurveCard userId="user-1" bucket="vocabulary" />)

    // One legend chip per rung (the 4 selectable lines).
    const introduced = await screen.findByRole('button', { name: /Geïntroduceerd/ })
    expect(screen.getByRole('button', { name: /Aan het leren/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Versterken/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Beheerst/ })).toBeInTheDocument()

    // Net-mastered delta headline (8 now − 3 prior = +5), a snapshot diff.
    expect(screen.getByText('+5')).toBeInTheDocument()

    // Clicking a legend chip toggles that line off (aria-pressed flips).
    expect(introduced).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(introduced)
    expect(introduced).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the empty state when no rung has data', async () => {
    vi.mocked(getFunnelSeries).mockResolvedValue([week('2026-06-01', {}), week('2026-06-08', {})])
    wrap(<GrowthCurveCard userId="user-1" bucket="vocabulary" />)
    expect(await screen.findByText(/Nog niet genoeg geschiedenis/)).toBeInTheDocument()
  })
})

describe('DurabilityCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the plain-language memory-strength headline with the prior-month delta', async () => {
    const series: StabilityWeek[] = [
      { weekStart: '2026-05-11', avgStabilityDays: 18, sampleSize: 20 },
      { weekStart: '2026-05-18', avgStabilityDays: 20, sampleSize: 24 },
      { weekStart: '2026-05-25', avgStabilityDays: 26, sampleSize: 30 },
      { weekStart: '2026-06-01', avgStabilityDays: 31, sampleSize: 33 },
      { weekStart: '2026-06-08', avgStabilityDays: 32, sampleSize: 40 },
    ]
    vi.mocked(memory.stabilitySeries).mockResolvedValue(series)

    wrap(<DurabilityCard userId="user-1" timezone="Europe/Amsterdam" />)

    // "Je geheugen houdt nu ~32" + "dagen vast", plus "(was 18)" from ~4 weeks back.
    expect(await screen.findByText(/Je geheugen houdt nu ~32/)).toBeInTheDocument()
    expect(screen.getByText(/was 18/)).toBeInTheDocument()
  })

  it('shows the empty state before the first review', async () => {
    vi.mocked(memory.stabilitySeries).mockResolvedValue([
      { weekStart: '2026-06-01', avgStabilityDays: null, sampleSize: 0 },
    ])
    wrap(<DurabilityCard userId="user-1" timezone="UTC" />)
    expect(await screen.findByText(/Nog geen geheugendata/)).toBeInTheDocument()
  })
})
