// src/__tests__/dashboard-redesign.test.tsx
//
// Home launchpad (desktop program slice 3,
// docs/plans/2026-07-03-desktop-program-design.md §Slice 3):
// - "Vandaag" session-preview panel from a buildSession pure read (established
//   accounts), with the Start CTA routing to /session
// - "Aan de slag" first-run checklist replaces the panel until the account has
//   its first completed session (account-level signal — never the per-device
//   flags, which only drive the step ticks); the buildSession preview is NOT
//   fetched while it shows
// - continue-reading shortcut to the highest activated lesson (sanctioned by
//   slice 3 — supersedes the older "no lesson links on Home" launchpad rule)
// - right column: streak + time pulse + woordenschat pulse → Voortgang
//
// Mock at the service layer per project convention.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/analytics/engagement')
vi.mock('@/lib/analytics/mastery/masteryModel')
vi.mock('@/lib/lessons/adapter')
vi.mock('@/lib/lessons/activation')
vi.mock('@/lib/mnemonics')
vi.mock('@/lib/supabase')
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
vi.mock('@/lib/firstRun', () => ({
  FIRST_LESSON_OPENED_KEY: 'first_lesson_opened',
  ONTDEK_VISITED_KEY: 'ontdek_visited',
  PRONUNCIATION_VISITED_KEY: 'pronunciation_visited',
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
import { getWeeklyMovement, getTroublesomeWords } from '@/lib/analytics/mastery/masteryModel'
import { fetchMnemonicsForRefs } from '@/lib/mnemonics'
import * as lessonsAdapter from '@/lib/lessons/adapter'
import { listActivatedLessons } from '@/lib/lessons/activation'
import { readFirstRunFlag, hasCompletedSession } from '@/lib/firstRun'
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
  vi.mocked(getTroublesomeWords).mockResolvedValue([])
  vi.mocked(fetchMnemonicsForRefs).mockResolvedValue(new Map())
  vi.mocked(lessonsAdapter.getLessonsBasic).mockResolvedValue([])
  vi.mocked(listActivatedLessons).mockResolvedValue(new Set<string>())
  vi.mocked(readFirstRunFlag).mockReturnValue(false)
  vi.mocked(hasCompletedSession).mockResolvedValue(false)
  vi.mocked(buildSession).mockResolvedValue({
    id: 'plan-1', mode: 'standard', title: '', recapPolicy: 'standard', diagnostics: [], backlogDueCount: 3,
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

  it('hides for an account with a completed session even when the device flags are absent', async () => {
    // Regression (live report 2026-07-04): an established learner on a fresh
    // device has sessionDone=true from the DB but no localStorage flags. The
    // card must NOT come back — on mobile it replaced the session hero with
    // no session entry and no way to dismiss.
    vi.mocked(hasCompletedSession).mockResolvedValue(true)
    vi.mocked(readFirstRunFlag).mockReturnValue(false)
    renderDashboard()

    await screen.findByText('Vandaag')
    expect(screen.queryByTestId('first-run-checklist')).not.toBeInTheDocument()
  })

  it('keeps the session step as the current CTA once the lesson step is ticked', async () => {
    vi.mocked(readFirstRunFlag).mockImplementation((key: string) => key === 'first_lesson_opened')
    vi.mocked(hasCompletedSession).mockResolvedValue(false)
    renderDashboard()

    await screen.findByTestId('first-run-checklist')
    // step ② is current → its Start CTA is the session entry on every viewport
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('is absent for established accounts', async () => {
    establishedAccount()
    renderDashboard()

    await screen.findByText('Vandaag')
    expect(screen.queryByTestId('first-run-checklist')).not.toBeInTheDocument()
  })

  it('reads PRONUNCIATION_VISITED_KEY into the uitspraak step (Task R2-B wiring)', async () => {
    vi.mocked(readFirstRunFlag).mockImplementation((key: string) => key === 'first_lesson_opened')
    vi.mocked(hasCompletedSession).mockResolvedValue(false)
    renderDashboard()

    await screen.findByTestId('first-run-checklist')
    expect(readFirstRunFlag).toHaveBeenCalledWith('pronunciation_visited')
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

describe('Dashboard — review-backlog insight', () => {
  it('surfaces the consistency nudge when the session is all reviews and the backlog exceeds a session', async () => {
    establishedAccount()
    // Saturated: no new_introduction block (newItems === 0) and a backlog well
    // above the 15-card session size → new material is budget-starved.
    vi.mocked(buildSession).mockResolvedValue({
      id: 'plan-1', mode: 'standard', title: '', recapPolicy: 'standard', diagnostics: [], backlogDueCount: 200,
      blocks: [
        { kind: 'due_review', renderPlan: { capabilityType: 'recognise_meaning_cap' } },
        { kind: 'due_review', renderPlan: { capabilityType: 'recognise_grammar_pattern_cap' } },
      ],
    } as any)
    renderDashboard()

    expect(await screen.findByText('Nieuw materiaal komt eraan')).toBeInTheDocument()
    // The backlog count is woven into the body (secondary), not a scary headline.
    expect(screen.getByText(/200 herhalingen/)).toBeInTheDocument()
  })

  it('stays hidden when new material is already flowing (open slots)', async () => {
    establishedAccount()
    // Default mock has a new_introduction block → newItems > 0 → not saturated.
    renderDashboard()

    await screen.findByText('Vandaag')
    expect(screen.queryByText('Nieuw materiaal komt eraan')).not.toBeInTheDocument()
  })
})

describe('Dashboard — troublesome words nudge', () => {
  it('shows the nudge card sized to the un-hooked subset (one denominator for count and sheet)', async () => {
    establishedAccount()
    vi.mocked(getTroublesomeWords).mockResolvedValue([
      { sourceRef: 'learning_items/pintar', sourceKind: 'vocabulary_src' },
      { sourceRef: 'learning_items/becak', sourceKind: 'vocabulary_src' },
      { sourceRef: 'learning_items/rumah', sourceKind: 'vocabulary_src' },
    ])
    // 'rumah' already has a hook — it must not count towards the card's number.
    vi.mocked(fetchMnemonicsForRefs).mockResolvedValue(new Map([['learning_items/rumah', 'my mnemonic']]))
    renderDashboard()

    expect(await screen.findByText('2 moeilijke woorden')).toBeInTheDocument()
  })

  it('stays hidden when every troublesome word already has a hook', async () => {
    establishedAccount()
    vi.mocked(getTroublesomeWords).mockResolvedValue([
      { sourceRef: 'learning_items/pintar', sourceKind: 'vocabulary_src' },
    ])
    vi.mocked(fetchMnemonicsForRefs).mockResolvedValue(new Map([['learning_items/pintar', 'my mnemonic']]))
    renderDashboard()

    await screen.findByText('Vandaag')
    expect(screen.queryByText(/moeilijke woorden/)).not.toBeInTheDocument()
  })

  it('stays hidden when there are no troublesome words at all', async () => {
    establishedAccount()
    renderDashboard()

    await screen.findByText('Vandaag')
    expect(screen.queryByText(/moeilijke woorden/)).not.toBeInTheDocument()
  })

  it('opens the picker sheet on tap, scoped to the same un-hooked words', async () => {
    establishedAccount()
    vi.mocked(getTroublesomeWords).mockResolvedValue([
      { sourceRef: 'learning_items/pintar', sourceKind: 'vocabulary_src' },
    ])
    const user = userEvent.setup()
    renderDashboard()

    const card = await screen.findByText('1 moeilijke woorden')
    await user.click(card)
    expect(await screen.findByText('Moeilijke woorden')).toBeInTheDocument()
  })
})
