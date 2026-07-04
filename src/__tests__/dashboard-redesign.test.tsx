// src/__tests__/dashboard-redesign.test.tsx
//
// Home launchpad (desktop program slice 3,
// docs/plans/2026-07-03-desktop-program-design.md §Slice 3):
// - "Vandaag" session-preview panel from a buildSession pure read (established
//   accounts), with the Start CTA routing to /session
// - "Aan de slag" first-run checklist replaces the panel until all three steps
//   are done; the buildSession preview is NOT fetched while it shows
// - continue-reading shortcut to the highest activated lesson (sanctioned by
//   slice 3 — supersedes the older "no lesson links on Home" launchpad rule)
// - right column: streak + time pulse + woordenschat pulse → Voortgang
//
// Mock at the service layer per project convention.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/analytics/engagement')
vi.mock('@/lib/analytics/mastery/masteryModel')
vi.mock('@/lib/lessons/adapter')
vi.mock('@/lib/lessons/activation')
vi.mock('@/lib/supabase')
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
vi.mock('@/lib/firstRun', () => ({
  FIRST_LESSON_OPENED_KEY: 'first_lesson_opened',
  ONTDEK_VISITED_KEY: 'ontdek_visited',
  readFirstRunFlag: vi.fn(() => false),
  setFirstRunFlag: vi.fn(),
  hasCompletedSession: vi.fn(),
}))
vi.mock('@/lib/session-builder', () => ({
  buildSession: vi.fn(),
  sessionBuilderAdapter: {},
}))
vi.mock('@/contexts/ListeningContext', () => ({
  useListening: () => ({ listeningEnabled: true, setListeningEnabled: vi.fn() }),
}))

import { engagement } from '@/lib/analytics/engagement'
import { getWeeklyMovement } from '@/lib/analytics/mastery/masteryModel'
import * as lessonsAdapter from '@/lib/lessons/adapter'
import { listActivatedLessons } from '@/lib/lessons/activation'
import { readFirstRunFlag, setFirstRunFlag, hasCompletedSession } from '@/lib/firstRun'
import { buildSession } from '@/lib/session-builder'
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
      profile: { fullName: 'Albert', email: 'test@duin.home', preferredSessionSize: 15, language: 'nl' },
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

function practiceWith(streakDays: number) {
  return {
    streakDays,
    minutesToday: 0,
    minutesThisWeek: 0,
    minutesLastWeek: 0,
    minutesThisMonth: 0,
    minutesLastMonth: 0,
    avgSessionMinutes: 0,
    activeDaysThisWeek: 0,
    lastPracticeAgeDays: null,
  }
}

function establishedAccount() {
  vi.mocked(readFirstRunFlag).mockReturnValue(true)
  vi.mocked(hasCompletedSession).mockResolvedValue(true)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(engagement.practiceTime).mockResolvedValue(practiceWith(0))
  vi.mocked(engagement.dailyActivity).mockResolvedValue([])
  vi.mocked(getWeeklyMovement).mockResolvedValue({ advancedVocab: 0, advancedGrammar: 0, advancedMorphology: 0, reachedMastered: 0, slipped: 0 })
  vi.mocked(lessonsAdapter.getLessonsBasic).mockResolvedValue([])
  vi.mocked(listActivatedLessons).mockResolvedValue(new Set<string>())
  vi.mocked(readFirstRunFlag).mockReturnValue(false)
  vi.mocked(hasCompletedSession).mockResolvedValue(false)
  vi.mocked(buildSession).mockResolvedValue({
    id: 'plan-1', mode: 'standard', title: '', recapPolicy: 'standard', diagnostics: [],
    blocks: [
      { kind: 'due_review', renderPlan: { capabilityType: 'recognise_meaning_cap' } },
      { kind: 'due_review', renderPlan: { capabilityType: 'recognise_grammar_pattern_cap' } },
      { kind: 'new_introduction', renderPlan: { capabilityType: 'recognise_meaning_from_audio_cap' } },
    ],
  } as any)
})

describe('Dashboard — first-run checklist', () => {
  it('shows the checklist for a new account and does NOT fetch the session preview', async () => {
    renderDashboard()

    expect(await screen.findByTestId('first-run-checklist')).toBeInTheDocument()
    expect(screen.getByText('Je eerste week Indonesisch')).toBeInTheDocument()
    // step 1 is current → its action shows; the preview stays unfetched
    expect(screen.getByRole('link', { name: 'Bekijk' })).toHaveAttribute('href', '/leren')
    expect(buildSession).not.toHaveBeenCalled()
  })

  it('derives step state from account + device flags (session done, lesson current)', async () => {
    vi.mocked(hasCompletedSession).mockResolvedValue(true)
    renderDashboard()

    const checklist = await screen.findByTestId('first-run-checklist')
    expect(checklist).toBeInTheDocument()
    // lesson (step ①) is still the current step → its CTA shows
    expect(screen.getByRole('link', { name: 'Bekijk' })).toBeInTheDocument()
  })

  it('lets the learner skip step ③ (dismissable), persisting the device flag', async () => {
    const user = userEvent.setup()
    // steps ① + ② done, only ontdek open → skip completes the checklist
    vi.mocked(readFirstRunFlag).mockImplementation((key: string) => key === 'first_lesson_opened')
    vi.mocked(hasCompletedSession).mockResolvedValue(true)
    renderDashboard()

    await user.click(await screen.findByRole('button', { name: 'Overslaan' }))

    expect(setFirstRunFlag).toHaveBeenCalledWith('ontdek_visited')
    // checklist replaced by the Vandaag panel
    await waitFor(() => expect(screen.queryByTestId('first-run-checklist')).not.toBeInTheDocument())
  })

  it('is absent for established accounts', async () => {
    establishedAccount()
    renderDashboard()

    await screen.findByText('Vandaag')
    expect(screen.queryByTestId('first-run-checklist')).not.toBeInTheDocument()
  })
})

describe('Dashboard — Vandaag session preview', () => {
  it('renders the preview counts from the buildSession pure read and starts the session', async () => {
    establishedAccount()
    const user = userEvent.setup()
    renderDashboard()

    expect(await screen.findByText('oefeningen staan klaar')).toBeInTheDocument()
    expect(screen.getByText('herhalingen')).toBeInTheDocument()
    expect(screen.getByText('grammatica')).toBeInTheDocument()
    expect(screen.getByText('luisteren')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /start sessie/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/session')
  })

  it('falls back to the plain start hero when the preview read fails', async () => {
    establishedAccount()
    vi.mocked(buildSession).mockRejectedValue(new Error('offline'))
    renderDashboard()

    const cta = await screen.findByRole('button', { name: /start sessie/i })
    expect(cta).toBeInTheDocument()
    expect(screen.queryByText('oefeningen staan klaar')).not.toBeInTheDocument()
  })
})

describe('Dashboard — launchpad chrome', () => {
  it('greets with the Indonesian time-of-day greeting', async () => {
    establishedAccount()
    renderDashboard()

    expect(await screen.findByText(/Selamat (pagi|siang|sore|malam), Albert/)).toBeInTheDocument()
  })

  it('shows the continue-reading shortcut to the highest activated lesson (slice-3 sanctioned)', async () => {
    establishedAccount()
    vi.mocked(lessonsAdapter.getLessonsBasic).mockResolvedValue([
      { id: 'l-3', order_index: 3, title: 'Di Bandar Udara' },
      { id: 'l-7', order_index: 7, title: 'Di Pasar' },
      { id: 'l-9', order_index: 9, title: 'Di Hotel' },
    ])
    vi.mocked(listActivatedLessons).mockResolvedValue(new Set(['l-3', 'l-7']))
    renderDashboard()

    const shortcut = await screen.findByRole('link', { name: /Doorgaan met les 7 · Di Pasar/ })
    expect(shortcut).toHaveAttribute('href', '/lesson/l-7')
  })

  it('shows the woordenschat pulse linking to Voortgang', async () => {
    establishedAccount()
    vi.mocked(getWeeklyMovement).mockResolvedValue({ advancedVocab: 5, advancedGrammar: 1, advancedMorphology: 0, reachedMastered: 2, slipped: 1 })
    renderDashboard()

    expect(await screen.findByText('Je woordenschat')).toBeInTheDocument()
    expect(screen.getByText('+5')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /naar voortgang/i })).toHaveAttribute('href', '/progress?tab=woorden')
  })

  it('renders the streak from analytics.engagement', async () => {
    establishedAccount()
    vi.mocked(engagement.practiceTime).mockResolvedValue(practiceWith(7))
    renderDashboard()

    expect(await screen.findByLabelText(/7\s+(dagen achter elkaar|days in a row)/i)).toBeInTheDocument()
  })

  it('does not resurrect the retired goal-subsystem surfaces (regression check)', async () => {
    establishedAccount()
    renderDashboard()

    await screen.findByText('Vandaag')
    expect(screen.queryByText(/planning van vandaag|today.?s plan/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/wekelijkse doelen|weekly goals/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/zwakke woorden|weak words/i)).not.toBeInTheDocument()
  })
})
