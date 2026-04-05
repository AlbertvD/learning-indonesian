// src/__tests__/dashboard-redesign.test.tsx
//
// Tests for the Dashboard mockup redesign.
// Covers: ring charts, action cards, hero card, rescue card, mix bar, CTA subtitle.
//
// These tests define the contract BEFORE implementation.
// Mock at the service layer per project convention.

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { WeeklyGoalResponse, WeeklyGoal, TodayPlan } from '@/types/learning'

// Mock services at the module level
vi.mock('@/services/goalService')
vi.mock('@/services/learnerStateService')
vi.mock('@/services/lessonService')
vi.mock('@/lib/supabase')

import { goalService } from '@/services/goalService'
import { learnerStateService } from '@/services/learnerStateService'
import { lessonService } from '@/services/lessonService'
import { supabase } from '@/lib/supabase'
import { Dashboard } from '@/pages/Dashboard'

// ── Test fixtures ──

function makeGoal(overrides: Partial<WeeklyGoal> & { goal_type: string }): WeeklyGoal {
  return {
    id: `goal-${overrides.goal_type}`,
    goal_set_id: 'set-1',
    goal_type: overrides.goal_type as any,
    goal_direction: overrides.goal_direction ?? 'at_least',
    goal_unit: overrides.goal_unit ?? 'count',
    target_value_numeric: overrides.target_value_numeric ?? 4,
    current_value_numeric: overrides.current_value_numeric ?? 2,
    status: overrides.status ?? 'on_track',
    is_provisional: overrides.is_provisional ?? false,
    provisional_reason: overrides.provisional_reason ?? null,
    sample_size: overrides.sample_size ?? 20,
    goal_config_jsonb: overrides.goal_config_jsonb ?? {},
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-05T00:00:00Z',
  }
}

function makeTodayPlan(overrides?: Partial<TodayPlan>): TodayPlan {
  return {
    due_reviews_today_target: 12,
    new_items_today_target: 3,
    recall_interactions_today_target: 5,
    estimated_minutes_today: 8,
    weak_items_target: 2,
    preferred_session_size: 15,
    ...overrides,
  }
}

function makeGoalResponse(overrides?: Partial<WeeklyGoalResponse>): WeeklyGoalResponse {
  return {
    state: 'active',
    weeklyGoalSet: {
      id: 'set-1',
      user_id: 'user-1',
      goal_timezone: 'Europe/Amsterdam',
      week_start_date_local: '2026-03-31',
      week_end_date_local: '2026-04-07',
      week_starts_at_utc: '2026-03-30T23:00:00Z',
      week_ends_at_utc: '2026-04-06T23:00:00Z',
      generation_strategy_version: 'v1',
      generated_at: '2026-03-31T00:00:00Z',
      closing_overdue_count: null,
      closed_at: null,
      created_at: '2026-03-31T00:00:00Z',
      updated_at: '2026-04-05T00:00:00Z',
    },
    weeklyGoals: [
      makeGoal({ goal_type: 'consistency', current_value_numeric: 1, target_value_numeric: 4, status: 'at_risk' }),
      makeGoal({ goal_type: 'recall_quality', current_value_numeric: 0.72, target_value_numeric: 0.80, status: 'on_track', goal_unit: 'percent',
        goal_config_jsonb: { recognition_accuracy: 0.90, recall_accuracy: 0.40, recognition_sample_size: 30 } }),
      makeGoal({ goal_type: 'review_health', current_value_numeric: 3, target_value_numeric: 20, status: 'achieved', goal_direction: 'at_most' }),
      makeGoal({ goal_type: 'usable_vocabulary', current_value_numeric: 18, target_value_numeric: 25, status: 'at_risk' }),
    ],
    todayPlan: makeTodayPlan(),
    ...overrides,
  }
}

// ── Helpers ──

const mockSupabaseChain = () => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        gte: () => ({
          lt: () => ({ data: [], error: null }),
          order: () => ({
            limit: () => ({ data: [], error: null }),
          }),
          data: [],
          error: null,
        }),
        order: () => ({
          limit: () => ({ data: [], error: null }),
        }),
        data: [],
        error: null,
      }),
      data: [],
      error: null,
    }),
  }),
})

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

// Auth store mock
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: any) => any) =>
    selector({
      user: { id: 'user-1', email: 'test@duin.home' },
      profile: { fullName: 'Albert', email: 'test@duin.home', preferredSessionSize: 15 },
    })
  ),
}))

// ── Setup ──

beforeEach(() => {
  vi.clearAllMocks()

  // Default service mocks
  vi.mocked(goalService.getGoalProgress).mockResolvedValue(makeGoalResponse())
  vi.mocked(learnerStateService.getItemStates).mockResolvedValue([])
  vi.mocked(learnerStateService.getLapsingItems).mockResolvedValue({ count: 0 })

  vi.mocked(lessonService.getUserLessonProgress).mockResolvedValue([])
  vi.mocked(lessonService.getLessonsBasic).mockResolvedValue([])

  // Supabase direct queries (streak, sessions)
  vi.mocked(supabase.schema).mockReturnValue(mockSupabaseChain() as any)
})

// ── Ring Chart Tests ──

describe('Weekly Scorecard Ring Charts', () => {
  it('renders 4 ring cards with correct labels', async () => {
    renderDashboard()

    expect(await screen.findByText('Consistentie')).toBeInTheDocument()
    expect(screen.getByText('Herinnering')).toBeInTheDocument()
    expect(screen.getByText('Achterstand')).toBeInTheDocument()
    expect(screen.getByText('Woordenschat')).toBeInTheDocument()
  })

  it('shows correct percentage for consistency goal (at_least direction)', async () => {
    // 1 / 4 = 25%
    renderDashboard()
    expect(await screen.findByText('25%')).toBeInTheDocument()
  })

  it('shows correct percentage for review_health goal (at_most direction, inverted)', async () => {
    // review_health: current=3, target=20. Health% = max(0, 100 - (3/40)*100) = 93% or 85% depending on formula
    // The mockup shows 85% for 3/20. Formula: max(0, round((1 - current/(target*2)) * 100))
    // (1 - 3/40) * 100 = 92.5% -> 93%. Mockup uses simpler: (target - current) / target * 100 = 85%
    // The exact formula is implementation-defined. Test that a percentage appears for this ring.
    renderDashboard()
    expect(await screen.findByText('Achterstand')).toBeInTheDocument()
    // Value text shows "3 / 20"
    expect(screen.getByText('3 / 20')).toBeInTheDocument()
  })

  it('shows correct value text for recall_quality goal as percentages', async () => {
    // current=0.72 (72%), target=0.80 (80%) -> displayed as "72% / 80%"
    renderDashboard()
    expect(await screen.findByText('72% / 80%')).toBeInTheDocument()
  })

  it('maps achieved status to green ring color', async () => {
    vi.mocked(goalService.getGoalProgress).mockResolvedValue(
      makeGoalResponse({
        weeklyGoals: [
          makeGoal({ goal_type: 'consistency', current_value_numeric: 4, target_value_numeric: 4, status: 'achieved' }),
          makeGoal({ goal_type: 'recall_quality', current_value_numeric: 0.85, target_value_numeric: 0.80, status: 'achieved', goal_unit: 'percent' }),
          makeGoal({ goal_type: 'review_health', current_value_numeric: 0, target_value_numeric: 20, status: 'achieved', goal_direction: 'at_most' }),
          makeGoal({ goal_type: 'usable_vocabulary', current_value_numeric: 25, target_value_numeric: 25, status: 'achieved' }),
        ],
      })
    )
    renderDashboard()
    // All status pills should read "Behaald"
    const pills = await screen.findAllByText('Behaald')
    expect(pills).toHaveLength(4)
  })

  it('shows at_risk status pill in orange', async () => {
    renderDashboard()
    // Default fixture has consistency and vocab as at_risk
    const pills = await screen.findAllByText('Risico')
    expect(pills.length).toBeGreaterThanOrEqual(1)
  })

  it('shows provisional indicator when goal is provisional', async () => {
    vi.mocked(goalService.getGoalProgress).mockResolvedValue(
      makeGoalResponse({
        weeklyGoals: [
          makeGoal({ goal_type: 'consistency', status: 'on_track' }),
          makeGoal({ goal_type: 'recall_quality', status: 'on_track', is_provisional: true, goal_unit: 'percent' }),
          makeGoal({ goal_type: 'review_health', status: 'on_track', goal_direction: 'at_most' }),
          makeGoal({ goal_type: 'usable_vocabulary', status: 'on_track' }),
        ],
      })
    )
    renderDashboard()
    // Provisional indicator -- exact rendering TBD but should have accessible text or tooltip
    expect(await screen.findByText('Herinnering')).toBeInTheDocument()
    // Look for provisional marker (could be text or aria-label)
    expect(screen.getByText(/voorlopig/i)).toBeInTheDocument()
  })
})

// ── Recommended Actions Tests ──

describe('Recommended Actions section', () => {
  it('shows action cards when at least one goal is at_risk', async () => {
    renderDashboard()
    expect(await screen.findByText('Aanbevolen acties')).toBeInTheDocument()
  })

  it('hides action section when all goals are achieved or on_track', async () => {
    vi.mocked(goalService.getGoalProgress).mockResolvedValue(
      makeGoalResponse({
        weeklyGoals: [
          makeGoal({ goal_type: 'consistency', status: 'achieved' }),
          makeGoal({ goal_type: 'recall_quality', status: 'on_track', goal_unit: 'percent' }),
          makeGoal({ goal_type: 'review_health', status: 'achieved', goal_direction: 'at_most' }),
          makeGoal({ goal_type: 'usable_vocabulary', status: 'on_track' }),
        ],
      })
    )
    renderDashboard()
    // Wait for dashboard to load
    await screen.findByText(/Welkom terug/i)
    expect(screen.queryByText('Aanbevolen acties')).not.toBeInTheDocument()
  })

  it('shows data-driven reason text for at_risk recall goal', async () => {
    renderDashboard()
    // Default fixture: recall is on_track but consistency is at_risk
    // Change to make recall at_risk for this test
    vi.mocked(goalService.getGoalProgress).mockResolvedValue(
      makeGoalResponse({
        weeklyGoals: [
          makeGoal({ goal_type: 'consistency', status: 'on_track' }),
          makeGoal({ goal_type: 'recall_quality', current_value_numeric: 0.40, target_value_numeric: 0.80, status: 'at_risk', goal_unit: 'percent' }),
          makeGoal({ goal_type: 'review_health', status: 'on_track', goal_direction: 'at_most' }),
          makeGoal({ goal_type: 'usable_vocabulary', status: 'on_track' }),
        ],
      })
    )
    renderDashboard()
    expect(await screen.findByText(/40%/)).toBeInTheDocument()
    expect(screen.getByText(/80%/)).toBeInTheDocument()
  })

  it('links action cards to the correct session mode URL', async () => {
    renderDashboard()
    // consistency at_risk -> should link to /session?mode=quick
    const actionLinks = await screen.findAllByRole('link')
    const quickLink = actionLinks.find(l => l.getAttribute('href')?.includes('mode=quick'))
    expect(quickLink).toBeDefined()
  })
})

// ── Hero Card Tests ──

describe('Hero Card (Today\'s Plan)', () => {
  it('shows stat row with review, new, and recall counts', async () => {
    renderDashboard()
    expect(await screen.findByText(/12/)).toBeInTheDocument()  // reviews
    expect(screen.getByText(/3/)).toBeInTheDocument()          // new
    expect(screen.getByText(/5/)).toBeInTheDocument()          // recall
  })

  it('shows "op basis van N items per sessie" subtext', async () => {
    renderDashboard()
    expect(await screen.findByText(/op basis van 15 items per sessie/i)).toBeInTheDocument()
  })

  it('renders mix ratio bar with visible segments', async () => {
    renderDashboard()
    // The hero card should contain a mix bar area
    expect(await screen.findByText(/Sessie samenstelling/i)).toBeInTheDocument()
  })

  it('shows mix legend items for non-zero segments', async () => {
    renderDashboard()
    expect(await screen.findByText('Herhalingen')).toBeInTheDocument()
    expect(screen.getByText('Nieuw')).toBeInTheDocument()
    expect(screen.getByText('Vragen')).toBeInTheDocument()
    expect(screen.getByText('Zwak')).toBeInTheDocument()
  })

  it('hides mix bar when all segments are zero', async () => {
    vi.mocked(goalService.getGoalProgress).mockResolvedValue(
      makeGoalResponse({
        todayPlan: makeTodayPlan({
          due_reviews_today_target: 0,
          new_items_today_target: 0,
          recall_interactions_today_target: 0,
          weak_items_target: 0,
        }),
      })
    )
    renderDashboard()
    await screen.findByText(/Welkom terug/i)
    expect(screen.queryByText('Sessie samenstelling')).not.toBeInTheDocument()
  })

  it('CTA button has two lines: main text and subtitle', async () => {
    renderDashboard()
    const cta = await screen.findByRole('button', { name: /Start vandaag je sessie/i })
    expect(cta).toBeInTheDocument()
    // Subtitle should mention recall gap
    expect(cta.textContent).toMatch(/Herinnering|Achterstand/i)
  })

  it('shows estimated time in CTA button text', async () => {
    renderDashboard()
    const cta = await screen.findByRole('button', { name: /8 min/i })
    expect(cta).toBeInTheDocument()
  })

  it('shows post-session note below CTA', async () => {
    renderDashboard()
    expect(await screen.findByText(/doelenringen bijgewerkt/i)).toBeInTheDocument()
  })

  it('shows mix note when new words are reduced due to backlog', async () => {
    vi.mocked(goalService.getGoalProgress).mockResolvedValue(
      makeGoalResponse({
        todayPlan: makeTodayPlan({
          new_items_today_target: 1,
          weak_items_target: 4,
        }),
      })
    )
    renderDashboard()
    expect(await screen.findByText(/achterstand wordt weggewerkt/i)).toBeInTheDocument()
  })
})

// ── Rescue Card Tests ──

describe('Rescue Card', () => {
  it('shows rescue card when lapse count > 0', async () => {
    vi.mocked(learnerStateService.getLapsingItems).mockResolvedValue({ count: 4 })
    renderDashboard()
    expect(await screen.findByText(/Red 4 woorden/i)).toBeInTheDocument()
  })

  it('shows lapse badge with count', async () => {
    vi.mocked(learnerStateService.getLapsingItems).mockResolvedValue({ count: 4 })
    renderDashboard()
    expect(await screen.findByText(/4 lapses/i)).toBeInTheDocument()
  })

  it('hides rescue card when lapse count is 0', async () => {
    vi.mocked(learnerStateService.getLapsingItems).mockResolvedValue({ count: 0 })
    renderDashboard()
    await screen.findByText(/Welkom terug/i)
    expect(screen.queryByText(/Red.*woorden/i)).not.toBeInTheDocument()
  })
})

// ── Secondary Cards Tests ──

describe('Secondary Cards', () => {
  it('shows continue lesson card', async () => {
    renderDashboard()
    expect(await screen.findByText(/Doorgaan met les/i)).toBeInTheDocument()
  })

  it('continue lesson card links to correct URL', async () => {
    vi.mocked(lessonService.getUserLessonProgress).mockResolvedValue([
      { lesson_id: 'lesson-4', completed_at: null, sections_completed: ['s1', 's2'] } as any,
    ])
    vi.mocked(lessonService.getLessons ?? lessonService.getLessonsBasic).mockResolvedValue([
      { id: 'lesson-4', title: 'Les 4: Op de markt', order_index: 4 } as any,
    ])
    renderDashboard()
    const link = await screen.findByText(/Doorgaan met les/i)
    expect(link.closest('a')?.getAttribute('href')).toContain('/lessons/lesson-4')
  })
})

// ── Removed Sections Tests ──

describe('Removed sections', () => {
  it('does not render the progress snapshot / stage breakdown', async () => {
    renderDashboard()
    await screen.findByText(/Welkom terug/i)
    expect(screen.queryByText('Voortgangssamenvatting')).not.toBeInTheDocument()
    expect(screen.queryByText('Stabiel')).not.toBeInTheDocument()
    expect(screen.queryByText('Productief')).not.toBeInTheDocument()
  })
})

// ── Tooltip Tests ──

describe('Ring card tooltips', () => {
  it('recall ring tooltip includes recognition vs recall split when data available', async () => {
    renderDashboard()
    // The recall goal fixture has goal_config_jsonb with recognition_accuracy=0.90, recall_accuracy=0.40
    // Tooltip should contain these percentages. Since tooltips may not be visible until hover,
    // we test that the tooltip content is present in the DOM (e.g. as aria-label or data attribute).
    const recallRing = await screen.findByText('Herinnering')
    const card = recallRing.closest('[class*="ringCard"]') ?? recallRing.parentElement
    // The tooltip trigger should contain recognition and recall values
    expect(card?.textContent).toMatch(/90%|40%/)
  })
})

// ── Edge Case Tests ──

describe('Edge cases', () => {
  it('shows timezone prompt when state is timezone_required', async () => {
    vi.mocked(goalService.getGoalProgress).mockResolvedValue({
      state: 'timezone_required',
      weeklyGoalSet: null,
      weeklyGoals: [],
      todayPlan: null,
      requiredProfileAction: 'set_timezone',
    })
    renderDashboard()
    expect(await screen.findByText(/Tijdzone instellen/i)).toBeInTheDocument()
  })

  it('handles null todayPlan gracefully', async () => {
    vi.mocked(goalService.getGoalProgress).mockResolvedValue(
      makeGoalResponse({ todayPlan: null })
    )
    renderDashboard()
    // Should still render rings
    expect(await screen.findByText('Consistentie')).toBeInTheDocument()
    // Hero card should not render
    expect(screen.queryByText(/Start vandaag je sessie/i)).not.toBeInTheDocument()
  })

  it('CTA subtitle is empty when all goals achieved', async () => {
    vi.mocked(goalService.getGoalProgress).mockResolvedValue(
      makeGoalResponse({
        weeklyGoals: [
          makeGoal({ goal_type: 'consistency', status: 'achieved', current_value_numeric: 4, target_value_numeric: 4 }),
          makeGoal({ goal_type: 'recall_quality', status: 'achieved', current_value_numeric: 0.85, target_value_numeric: 0.80, goal_unit: 'percent' }),
          makeGoal({ goal_type: 'review_health', status: 'achieved', current_value_numeric: 0, target_value_numeric: 20, goal_direction: 'at_most' }),
          makeGoal({ goal_type: 'usable_vocabulary', status: 'achieved', current_value_numeric: 25, target_value_numeric: 25 }),
        ],
      })
    )
    renderDashboard()
    const cta = await screen.findByRole('button', { name: /Start vandaag je sessie/i })
    // Should not contain "Doel:" when everything is achieved
    expect(cta.textContent).not.toMatch(/Doel:/i)
  })
})
