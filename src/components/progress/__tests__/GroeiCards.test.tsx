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

  it('renders the 4-rung stacked area with its right-edge counts, and the total delta', async () => {
    vi.mocked(getFunnelSeries).mockResolvedValue([
      // total = 5 + 3 + 0 + 3 = 11
      week('2026-06-01', { introduced: 5, learning: 3, mastered: 3 }),
      // total = 4 + 6 + 2 + 8 = 20
      week('2026-06-08', { introduced: 4, learning: 6, strengthening: 2, mastered: 8 }),
    ])

    wrap(<GrowthCurveCard userId="user-1" bucket="vocabulary" unitLabel="woorden" />)

    // Hero is the latest total across all 4 rungs; delta is the snapshot diff
    // vs ~4 weeks back (here, the only prior point: 20 − 11 = +9).
    expect(await screen.findByText('20')).toBeInTheDocument()
    expect(screen.getByText('▲ +9')).toBeInTheDocument()
    // The caption names the total, not a single-rung "usable" claim.
    expect(screen.getByText('Woorden in totaal')).toBeInTheDocument()

    // All 4 rung names render in the compact legend row below the chart.
    expect(screen.getByText('Net ontmoet')).toBeInTheDocument()
    expect(screen.getByText('Aan het oefenen')).toBeInTheDocument()
    expect(screen.getByText('Kun je gebruiken')).toBeInTheDocument()
    expect(screen.getByText('Zit erin')).toBeInTheDocument()

    // The chart's right-edge labels show each rung's latest count (from the
    // 2026-06-08 week): introduced=4, learning=6, strengthening=2, mastered=8.
    // "4" and "6" also appear elsewhere (e.g. week counts), so scope to text
    // nodes inside the chart svg only.
    const svg = document.querySelector('svg[aria-label="Trend"]')
    expect(svg).toBeTruthy()
    const labelTexts = Array.from(svg!.querySelectorAll('text')).map((t) => t.textContent)
    expect(labelTexts.sort()).toEqual(['2', '4', '6', '8'])
  })

  it('shows the empty state when no week has any rung data', async () => {
    vi.mocked(getFunnelSeries).mockResolvedValue([week('2026-06-01', {}), week('2026-06-08', {})])
    wrap(<GrowthCurveCard userId="user-1" bucket="vocabulary" unitLabel="woorden" />)
    expect(await screen.findByText(/Nog niet genoeg geschiedenis/)).toBeInTheDocument()
  })
})

describe('DurabilityCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the plain-language memory-strength headline with the prior-month delta (single-series TrendChart path)', async () => {
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

    // Single-line mode still renders the top-left max label, not stack labels.
    const svg = document.querySelector('svg[aria-label="Trend"]')
    expect(svg?.querySelector('text')?.textContent).toContain('32')
  })

  it('shows the empty state before the first review', async () => {
    vi.mocked(memory.stabilitySeries).mockResolvedValue([
      { weekStart: '2026-06-01', avgStabilityDays: null, sampleSize: 0 },
    ])
    wrap(<DurabilityCard userId="user-1" timezone="UTC" />)
    expect(await screen.findByText(/Nog geen geheugendata/)).toBeInTheDocument()
  })
})
