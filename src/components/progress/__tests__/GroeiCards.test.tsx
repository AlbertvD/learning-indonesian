import { render, screen } from '@testing-library/react'
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

  it('renders the single climbing usable-words area (strengthening + mastered) and its delta', async () => {
    vi.mocked(getFunnelSeries).mockResolvedValue([
      // usable = strengthening + mastered = 0 + 3 = 3
      week('2026-06-01', { introduced: 5, learning: 3, mastered: 3 }),
      // usable = 2 + 8 = 10
      week('2026-06-08', { introduced: 4, learning: 6, strengthening: 2, mastered: 8 }),
    ])

    wrap(<GrowthCurveCard userId="user-1" bucket="vocabulary" unitLabel="woorden" />)

    // Hero is the latest usable count; delta is the snapshot diff vs ~4 weeks
    // back (here, the only prior point: 10 − 3 = +7).
    expect(await screen.findByText('10')).toBeInTheDocument()
    expect(screen.getByText('▲ +7')).toBeInTheDocument()
    // The caption names what "usable" means for this bucket's unit.
    expect(screen.getByText('Woorden die je kunt gebruiken')).toBeInTheDocument()
  })

  it('shows the empty state when no week has any usable words', async () => {
    vi.mocked(getFunnelSeries).mockResolvedValue([week('2026-06-01', {}), week('2026-06-08', {})])
    wrap(<GrowthCurveCard userId="user-1" bucket="vocabulary" unitLabel="woorden" />)
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
