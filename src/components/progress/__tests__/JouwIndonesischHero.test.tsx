import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JouwIndonesischHero } from '../JouwIndonesischHero'
import { getMasteryFunnel } from '@/lib/analytics/mastery/masteryModel'
import { getCollectionsOverview } from '@/lib/collections'
import { engagement } from '@/lib/analytics/engagement'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getMasteryFunnel: vi.fn(),
}))
vi.mock('@/lib/collections', () => ({
  getCollectionsOverview: vi.fn(),
}))
vi.mock('@/lib/analytics/engagement', () => ({
  engagement: { practiceTime: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

function renderHero() {
  return render(
    <MantineProvider>
      <JouwIndonesischHero userId="u1" />
    </MantineProvider>,
  )
}

describe('JouwIndonesischHero', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the three tiles from the mocked reader values', async () => {
    vi.mocked(getMasteryFunnel).mockResolvedValue({
      vocabulary: { not_assessed: 0, introduced: 5, learning: 2, strengthening: 400, mastered: 212, at_risk: 0 },
      grammar: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
      morphology: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
    })
    vi.mocked(getCollectionsOverview).mockResolvedValue([
      { collectionId: 'c1', slug: 'top-1000', name: 'Top 1000', kind: 'frequency', rankCutoff: 1000, isActivated: true, totalWords: 1000, knownWords: 612, eligibleNow: 612, gain: 388 },
    ])
    vi.mocked(engagement.practiceTime).mockResolvedValue({
      streakDays: 8, minutesToday: 0, minutesThisWeek: 0, minutesLastWeek: 0,
      minutesThisMonth: 0, minutesLastMonth: 0, avgSessionMinutes: 0,
      activeDaysThisWeek: 0, lastPracticeAgeDays: null,
    })

    renderHero()

    // 400 strengthening + 212 mastered = 612 "words known"
    expect(await screen.findByText('612')).toBeInTheDocument()
    expect(screen.getByText('612 / 1000')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('shows a genuine 0-day streak honestly (not hidden)', async () => {
    // wordsKnown deliberately non-zero (5) so the bare "0" assertion below can
    // only match the streak tile, not an ambiguous second "0" tile.
    vi.mocked(getMasteryFunnel).mockResolvedValue({
      vocabulary: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 5, at_risk: 0 },
      grammar: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
      morphology: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
    })
    vi.mocked(getCollectionsOverview).mockResolvedValue([])
    vi.mocked(engagement.practiceTime).mockResolvedValue({
      streakDays: 0, minutesToday: 0, minutesThisWeek: 0, minutesLastWeek: 0,
      minutesThisMonth: 0, minutesLastMonth: 0, avgSessionMinutes: 0,
      activeDaysThisWeek: 0, lastPracticeAgeDays: null,
    })

    renderHero()

    expect(await screen.findByText('5')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('shows the coverage empty-state (—/1000) when no frequency collection exists', async () => {
    vi.mocked(getMasteryFunnel).mockResolvedValue({
      vocabulary: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
      grammar: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
      morphology: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
    })
    // Only a theme collection, no frequency collection.
    vi.mocked(getCollectionsOverview).mockResolvedValue([
      { collectionId: 'c2', slug: 'food-drink', name: 'Eten & drinken', kind: 'theme', rankCutoff: null, isActivated: false, totalWords: 40, knownWords: 5, eligibleNow: 5, gain: 35 },
    ])
    vi.mocked(engagement.practiceTime).mockResolvedValue({
      streakDays: 3, minutesToday: 0, minutesThisWeek: 0, minutesLastWeek: 0,
      minutesThisMonth: 0, minutesLastMonth: 0, avgSessionMinutes: 0,
      activeDaysThisWeek: 0, lastPracticeAgeDays: null,
    })

    renderHero()

    expect(await screen.findByText('— / 1000')).toBeInTheDocument()
  })
})
