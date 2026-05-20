// src/__tests__/dashboard-redesign.test.tsx
//
// Tests for the minimal Dashboard placeholder shipped with retirement #4
// (goal subsystem). The polished Dashboard redesign is tracked separately.
//
// Surface under test (per docs/plans/2026-05-07-retire-goal-subsystem.md
// §"Test surgery" + architect-R1 I7 concrete assertions):
// - streak counter sourced from learnerProgressService.getCurrentStreakDays
// - "Today" CTA navigates to /session
// - lapsing alert renders when lapsing count > 0 (and is absent when 0)
// - continue-lesson card with the resolved URL
// - regression: TodaysPlanHero / weekly goal rings are NOT rendered
//
// Mock at the service layer per project convention.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock services at the module level
vi.mock('@/services/learnerStateService')
vi.mock('@/services/learnerProgressService')
vi.mock('@/services/lessonService')
vi.mock('@/lib/lessons/adapter')
vi.mock('@/lib/supabase')

import { learnerStateService } from '@/services/learnerStateService'
import { learnerProgressService } from '@/services/learnerProgressService'
import { lessonService } from '@/services/lessonService'
import * as lessonsAdapter from '@/lib/lessons/adapter'
import { Dashboard } from '@/pages/Dashboard'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: any) => any) =>
    selector({
      user: { id: 'user-1', email: 'test@duin.home' },
      profile: { fullName: 'Albert', email: 'test@duin.home', preferredSessionSize: 15 },
    })
  ),
}))

function renderDashboard() {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <Notifications />
        <Dashboard />
      </MantineProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(learnerStateService.getLapsingItems).mockResolvedValue({ count: 0 })
  vi.mocked(learnerProgressService.getCurrentStreakDays).mockResolvedValue(0)
  vi.mocked(lessonService.getUserLessonProgress).mockResolvedValue([])
  vi.mocked(lessonsAdapter.getLessonsBasic).mockResolvedValue([])
})

describe('Dashboard (minimal placeholder)', () => {
  it('renders the streak counter from learnerProgressService', async () => {
    vi.mocked(learnerProgressService.getCurrentStreakDays).mockResolvedValue(7)
    renderDashboard()
    // The streak count + label render in a single <Text> node; match the combined
    // text rather than the bare number.
    expect(await screen.findByText(/7\s+(dagen achter elkaar|days in a row)/i)).toBeInTheDocument()
  })

  it('renders the Today CTA and navigates to /session on click', async () => {
    renderDashboard()
    const cta = await screen.findByRole('button', { name: /start sessie|start session/i })
    expect(cta).toBeInTheDocument()
    await userEvent.click(cta)
    expect(mockNavigate).toHaveBeenCalledWith('/session')
  })

  it('renders the lapsing-rescue card when count > 0', async () => {
    vi.mocked(learnerStateService.getLapsingItems).mockResolvedValue({ count: 3 })
    renderDashboard()
    // rescueTitle template: "{count} zwakke woorden" / "{count} weak words"
    expect(await screen.findByText(/3 zwakke woorden|3 weak words/i)).toBeInTheDocument()
  })

  it('hides the lapsing-rescue card when count is 0', async () => {
    vi.mocked(learnerStateService.getLapsingItems).mockResolvedValue({ count: 0 })
    renderDashboard()
    // wait for any element so the page has actually rendered
    await screen.findByRole('button', { name: /start sessie|start session/i })
    expect(screen.queryByText(/zwakke woorden|weak words/i)).not.toBeInTheDocument()
  })

  it('renders the continue-lesson card with a /lesson/:id URL', async () => {
    vi.mocked(lessonsAdapter.getLessonsBasic).mockResolvedValue([
      { id: 'lesson-1', order_index: 1, title: 'Lesson 1', level: 'A1', is_published: true } as any,
    ])
    vi.mocked(lessonService.getUserLessonProgress).mockResolvedValue([])
    renderDashboard()
    const link = await screen.findByRole('link', { name: /doorgaan met les|continue lesson/i })
    expect(link).toHaveAttribute('href', '/lesson/lesson-1')
  })

  it('does not render TodaysPlanHero or weekly goal rings (regression check)', async () => {
    renderDashboard()
    await screen.findByRole('button', { name: /start sessie|start session/i })
    // Hardcoded literal NL+EN copy of the retired keys — architect-R1 (v2) N1:
    // referencing T.dashboard.todaysPlan after its drop in the same commit
    // would tsc-fail or trivially pass. Hardcoding anchors regression.
    expect(screen.queryByText(/planning van vandaag|today.?s plan/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/wekelijkse doelen|weekly goals/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/aanbevolen acties|recommended actions/i)).not.toBeInTheDocument()
  })
})
