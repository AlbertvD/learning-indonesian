// src/pages/__tests__/Progress.test.tsx
//
// Voortgang hub render test (voortgang-hub-redesign,
// docs/plans/2026-07-09-voortgang-hub-redesign.md): mobile with no `?tab=`
// renders the four-card hub, each linking to its own `?tab=` detail with a
// live-summary subtitle derived from the mocked readers. We pin useMediaQuery
// to mobile — desktop always lands on a detail instead (exercised by the
// detail-vs-hub coverage in MasteryFunnelPanel/ProgressNav tests).
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Progress } from '@/pages/Progress'
import { getMasteryFunnel } from '@/lib/analytics/mastery/masteryModel'
import { engagement } from '@/lib/analytics/engagement'

vi.mock('@/lib/analytics/mastery/masteryModel', () => ({
  getMasteryFunnel: vi.fn(),
}))
vi.mock('@/lib/analytics/engagement', () => ({
  engagement: { practiceTime: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'user-1' }, profile: { language: 'nl' } }),
  ),
}))

// Pin the viewport to mobile so <Progress/> renders the four-card hub (its
// mobile landing with no ?tab=) rather than the Woordenschat detail.
vi.mock('@mantine/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/hooks')>()
  return { ...actual, useMediaQuery: () => true }
})

function renderHub() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/progress']}>
        <Progress />
      </MemoryRouter>
    </MantineProvider>,
  )
}

const emptyFunnel = () => ({
  not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0,
})

describe('Progress hub', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders four topic cards linking to their own ?tab= detail, with live-summary subtitles', async () => {
    vi.mocked(getMasteryFunnel).mockResolvedValue({
      vocabulary: { ...emptyFunnel(), strengthening: 200, mastered: 106 },
      grammar: { ...emptyFunnel(), strengthening: 10, mastered: 8 },
      morphology: { ...emptyFunnel(), strengthening: 5, mastered: 4 },
    })
    vi.mocked(engagement.practiceTime).mockResolvedValue({
      streakDays: 8, minutesToday: 0, minutesThisWeek: 42, minutesLastWeek: 0,
      minutesThisMonth: 0, minutesLastMonth: 0, avgSessionMinutes: 0,
      activeDaysThisWeek: 0, lastPracticeAgeDays: null,
    })

    renderHub()

    expect(screen.getByRole('link', { name: /Woordenschat/ })).toHaveAttribute('href', '/progress?tab=woorden')
    expect(screen.getByRole('link', { name: /Grammatica/ })).toHaveAttribute('href', '/progress?tab=grammar')
    expect(screen.getByRole('link', { name: /Morfologie/ })).toHaveAttribute('href', '/progress?tab=morfologie')
    expect(screen.getByRole('link', { name: /Tijd/ })).toHaveAttribute('href', '/progress?tab=time')

    // Live summaries (strengthening + mastered per bucket).
    expect(await screen.findByText('je kunt 306 woorden gebruiken')).toBeInTheDocument()
    expect(screen.getByText('18 patronen onder de knie')).toBeInTheDocument()
    expect(screen.getByText('9 affixen kun je toepassen')).toBeInTheDocument()
    expect(screen.getByText('8 dagen op rij · 42 min deze week')).toBeInTheDocument()
  })

  it('degrades a card to no subtitle when its reader fails, without losing the hub', async () => {
    vi.mocked(getMasteryFunnel).mockRejectedValue(new Error('boom'))
    vi.mocked(engagement.practiceTime).mockResolvedValue({
      streakDays: 3, minutesToday: 0, minutesThisWeek: 12, minutesLastWeek: 0,
      minutesThisMonth: 0, minutesLastMonth: 0, avgSessionMinutes: 0,
      activeDaysThisWeek: 0, lastPracticeAgeDays: null,
    })

    renderHub()

    // The funnel-derived cards still render (title only, no subtitle); the
    // Tijd card (a different reader) still gets its summary.
    expect(screen.getByRole('link', { name: /Woordenschat/ })).toBeInTheDocument()
    expect(await screen.findByText('3 dagen op rij · 12 min deze week')).toBeInTheDocument()
    expect(screen.queryByText(/je kunt \d+ woorden gebruiken/)).not.toBeInTheDocument()
  })
})
