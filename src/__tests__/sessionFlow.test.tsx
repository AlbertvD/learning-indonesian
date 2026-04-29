// Integration test: Session page flow (load → exercise → answer → next → summary)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { Session } from '@/pages/Session'
import { useAuthStore } from '@/stores/authStore'
import { learningItemService } from '@/services/learningItemService'
import { loadCapabilitySessionPlanForUser } from '@/lib/session/capabilitySessionLoader'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
const capabilityFlags = vi.hoisted(() => ({
  sessionDiagnostics: false,
  reviewShadow: false,
  reviewCompat: false,
  standardSession: false,
  experiencePlayerV1: false,
  lessonReaderV2: false,
  localContentPreview: false,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: () => ({
      from: () => {
        const chain: any = {
          select: () => chain, eq: () => chain, in: () => chain, gte: () => chain,
          lt: () => chain, lte: () => chain, gt: () => chain, order: () => chain,
          limit: () => chain, maybeSingle: () => chain, single: () => chain,
          is: () => chain, not: () => chain,
          insert: () => ({ ...chain, then: (cb: any) => cb({ data: [{ id: 'r1' }], error: null }) }),
          upsert: () => chain,
          update: () => chain,
          then: (cb: any) => cb({ data: [], error: null }),
        }
        return chain
      },
    }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}))

vi.mock('@/lib/featureFlags', () => ({
  capabilityMigrationFlags: capabilityFlags,
  featureFlags: {
    textbookImport: true,
    aiGeneration: true,
    cuedRecall: true,
    contrastPair: true,
    sentenceTransformation: true,
    constrainedTranslation: true,
    speaking: true,
    listeningMcq: true,
    dictation: true,
  },
  isExerciseTypeEnabled: vi.fn(() => true),
  isContentPipelineEnabled: vi.fn(() => true),
  isTextbookImportEnabled: vi.fn(() => true),
  isAiGenerationEnabled: vi.fn(() => true),
}))

vi.mock('@/lib/session', () => ({
  startSession: vi.fn().mockResolvedValue('session-1'),
  endSession: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/learningItemService', () => ({
  learningItemService: {
    getLearningItems: vi.fn().mockResolvedValue([{
      id: 'item-1', item_type: 'word', base_text: 'rumah', normalized_text: 'rumah',
      language: 'id', level: 'A1', source_type: 'lesson', is_active: true,
      created_at: '', updated_at: '', source_vocabulary_id: null, source_card_id: null, notes: null,
    }]),
    getMeaningsBatch: vi.fn().mockResolvedValue([{
      id: 'm1', learning_item_id: 'item-1', translation_language: 'nl',
      translation_text: 'huis', sense_label: null, usage_note: null, is_primary: true,
    }]),
    getContextsBatch: vi.fn().mockResolvedValue([{
      id: 'ctx1', learning_item_id: 'item-1', context_type: 'vocabulary_list',
      source_text: 'Rumah saya besar', translation_text: 'Mijn huis is groot',
      difficulty: null, topic_tag: null, is_anchor_context: true,
      source_lesson_id: 'lesson-1', source_section_id: null,
    }]),
    getAnswerVariantsBatch: vi.fn().mockResolvedValue([]),
    getExerciseVariantsByContext: vi.fn().mockResolvedValue([]),
    getGrammarPatternsByItem: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/services/learnerStateService', () => ({
  learnerStateService: {
    getItemStates: vi.fn().mockResolvedValue([]),
    getSkillStatesBatch: vi.fn().mockResolvedValue([]),
    upsertItemState: vi.fn().mockImplementation((s: any) => Promise.resolve({ ...s, id: 'is1', updated_at: '' })),
    upsertSkillState: vi.fn().mockImplementation((s: any) => Promise.resolve({ ...s, id: 'ss1', updated_at: '' })),
    getSkillStates: vi.fn().mockResolvedValue([]),
    logStageEvent: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/services/grammarStateService', () => ({
  grammarStateService: {
    getAllGrammarPatterns: vi.fn().mockResolvedValue([]),
    seedGrammarStates: vi.fn().mockResolvedValue(undefined),
    getGrammarStates: vi.fn().mockResolvedValue([]),
    getGrammarVariants: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/services/lessonService', () => ({
  lessonService: {
    getLessonsBasic: vi.fn().mockResolvedValue([{ id: 'lesson-1', order_index: 1 }]),
    getLesson: vi.fn().mockResolvedValue({
      id: 'lesson-4',
      order_index: 4,
      lesson_sections: [],
    }),
    getLessonPageBlocks: vi.fn().mockResolvedValue([
      {
        source_ref: 'lesson-4',
        source_refs: ['lesson-4', 'lesson-4-dialogue'],
      },
    ]),
  },
}))

vi.mock('@/lib/session/capabilitySessionLoader', () => ({
  loadCapabilitySessionPlanForUser: vi.fn().mockResolvedValue({
    id: 'session-1',
    mode: 'lesson_practice',
    title: 'Lesson practice',
    blocks: [],
    recapPolicy: 'standard',
    diagnostics: [],
  }),
}))

vi.mock('@/services/goalService', () => ({
  goalService: {
    getGoalProgress: vi.fn().mockResolvedValue({
      state: 'timezone_required', weeklyGoalSet: null, weeklyGoals: [], todayPlan: null,
    }),
  },
}))

vi.mock('@/services/analyticsService', () => ({
  analyticsService: {
    trackSessionStartedFromToday: vi.fn(),
    trackSessionSummaryViewed: vi.fn(),
  },
}))

vi.mock('@/services/sessionSummaryService', () => ({
  sessionSummaryService: {
    computeSessionImpactMessages: vi.fn().mockResolvedValue({ sessionLocalFacts: [], weeklyImpactChanges: [] }),
  },
}))

vi.mock('@/services/exerciseAvailabilityService', () => ({
  exerciseAvailabilityService: {
    getAllAvailability: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/services/reviewEventService', () => ({
  reviewEventService: {
    logReviewEvent: vi.fn().mockImplementation((e: any) => Promise.resolve({ ...e, id: 'rev1', created_at: '' })),
  },
}))

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderSession(initialEntry = '/session') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MantineProvider>
        <Notifications />
        <Session />
      </MantineProvider>
    </MemoryRouter>
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Session flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    capabilityFlags.standardSession = false
    capabilityFlags.experiencePlayerV1 = false
    useAuthStore.setState({
      user: { id: 'u1', email: 'test@duin.home' } as any,
      profile: { id: 'u1', email: 'test@duin.home', fullName: 'Test', language: 'nl', preferredSessionSize: 15, timezone: 'Europe/Amsterdam', isAdmin: false },
      loading: false,
    })
  })

  it('loads session and displays an exercise', async () => {
    renderSession()

    // Should show loading text initially
    expect(screen.getByText(/sessie laden|loading session/i)).toBeInTheDocument()

    // Wait for exercise to appear — recognition MCQ shows the Indonesian word
    await waitFor(() => {
      expect(screen.getByText('rumah')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('shows error when no learning items available', async () => {
    const { learningItemService } = await import('@/services/learningItemService')
    vi.mocked(learningItemService.getLearningItems).mockResolvedValueOnce([])

    renderSession()

    await waitFor(() => {
      expect(screen.getByText(/geen leeritems|no learning items/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('redirects to login when user is not authenticated', () => {
    useAuthStore.setState({ user: null, profile: null, loading: false })
    renderSession()
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('handles correct answer and advances', async () => {
    renderSession()
    const user = userEvent.setup()

    // Wait for exercise
    await waitFor(() => {
      expect(screen.getByText('rumah')).toBeInTheDocument()
    }, { timeout: 5000 })

    // Click the correct MCQ option — "huis"
    const correctOption = screen.getByText('huis')
    await user.click(correctOption)

    // After correct answer on the only item, session should complete
    // Session summary or completion state should appear
    await waitFor(() => {
      const completed = screen.queryByText(/sessie/i) || screen.queryByText(/session/i) || screen.queryByText(/0\/1|1\/1/i)
      expect(completed).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('passes selected lesson scope to the capability loader for lesson practice', async () => {
    capabilityFlags.standardSession = true
    vi.mocked(loadCapabilitySessionPlanForUser).mockResolvedValueOnce({
      id: 'session-1',
      mode: 'lesson_practice',
      title: 'Lesson practice',
      blocks: [],
      recapPolicy: 'standard',
      diagnostics: [],
    })

    renderSession('/session?lesson=lesson-4&mode=lesson_practice')

    await waitFor(() => {
      expect(loadCapabilitySessionPlanForUser).toHaveBeenCalledWith(expect.objectContaining({
        mode: 'lesson_practice',
        selectedLessonId: 'lesson-4',
        selectedSourceRefs: ['lesson-4', 'lesson-4-dialogue'],
        limit: 15,
        preferredSessionSize: 15,
      }))
    })
  })

  it('passes selected lesson scope to the capability loader for lesson review', async () => {
    capabilityFlags.standardSession = true
    vi.mocked(loadCapabilitySessionPlanForUser).mockResolvedValueOnce({
      id: 'session-1',
      mode: 'lesson_review',
      title: 'Lesson review',
      blocks: [],
      recapPolicy: 'standard',
      diagnostics: [],
    })

    renderSession('/session?lesson=lesson-4&mode=lesson_review')

    await waitFor(() => {
      expect(loadCapabilitySessionPlanForUser).toHaveBeenCalledWith(expect.objectContaining({
        mode: 'lesson_review',
        selectedLessonId: 'lesson-4',
        selectedSourceRefs: ['lesson-4', 'lesson-4-dialogue'],
      }))
    })
  })

  it('fails closed instead of starting a legacy global queue for lesson modes', async () => {
    renderSession('/session?lesson=lesson-4&mode=lesson_practice')

    await waitFor(() => {
      expect(screen.getByText(/lessessie/i)).toBeInTheDocument()
    }, { timeout: 5000 })
    expect(loadCapabilitySessionPlanForUser).not.toHaveBeenCalled()
    expect(learningItemService.getLearningItems).not.toHaveBeenCalled()
  })
})
