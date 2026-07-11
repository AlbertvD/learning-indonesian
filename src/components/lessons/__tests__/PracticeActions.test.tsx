import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { PracticeActions } from '../PracticeActions'

vi.mock('@/lib/lessons')
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'user-uuid' } }),
}))

import {
  getLessonCapabilityPracticeSummaryByLessonId,
  buildLessonPracticeActions,
} from '@/lib/lessons'
import { logError } from '@/lib/logger'

function renderPracticeActions(lessonId: string, activated: boolean) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <PracticeActions lessonId={lessonId} activated={activated} />
      </MemoryRouter>
    </MantineProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(buildLessonPracticeActions).mockReturnValue([])
  vi.mocked(getLessonCapabilityPracticeSummaryByLessonId).mockResolvedValue({
    readyCapabilityCount: 0,
    activePracticedCapabilityCount: 0,
  })
})

describe('PracticeActions', () => {
  it('fetches practice summary by lesson_id', async () => {
    vi.mocked(getLessonCapabilityPracticeSummaryByLessonId).mockResolvedValue({
      readyCapabilityCount: 5,
      activePracticedCapabilityCount: 2,
    })

    renderPracticeActions('lesson-abc', true)

    await waitFor(() => {
      expect(getLessonCapabilityPracticeSummaryByLessonId).toHaveBeenCalledWith('user-uuid', 'lesson-abc')
    })
  })

  it('passes practiceReadyCount = ready − practiced when activated', async () => {
    vi.mocked(getLessonCapabilityPracticeSummaryByLessonId).mockResolvedValue({
      readyCapabilityCount: 7,
      activePracticedCapabilityCount: 3,
    })

    renderPracticeActions('lesson-abc', true)

    await waitFor(() => {
      const calls = vi.mocked(buildLessonPracticeActions).mock.calls
      const lastCallWithCounts = calls.find(([arg]) => arg.state.practiceReadyCount > 0)
      expect(lastCallWithCounts).toBeDefined()
      expect(lastCallWithCounts![0].state.practiceReadyCount).toBe(4)
      expect(lastCallWithCounts![0].state.hasActivePracticedItems).toBe(true)
    })
  })

  it('forces practiceReadyCount to 0 when the lesson is not activated', async () => {
    vi.mocked(getLessonCapabilityPracticeSummaryByLessonId).mockResolvedValue({
      readyCapabilityCount: 7,
      activePracticedCapabilityCount: 3,
    })

    renderPracticeActions('lesson-abc', false)

    await waitFor(() => {
      expect(getLessonCapabilityPracticeSummaryByLessonId).toHaveBeenCalled()
    })
    const calls = vi.mocked(buildLessonPracticeActions).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(([arg]) => arg.state.practiceReadyCount === 0)).toBe(true)
  })

  it('renders empty-state button when no practice actions are available', async () => {
    renderPracticeActions('lesson-abc', true)
    expect(await screen.findByText(/Geen oefeningen beschikbaar/i)).toBeInTheDocument()
  })

  describe('fetch failure (false "no exercises available" fix)', () => {
    it('shows a load-failed notice with a retry affordance instead of the empty-actions fallthrough, and logs the error', async () => {
      const fetchError = new Error('network error')
      vi.mocked(getLessonCapabilityPracticeSummaryByLessonId).mockRejectedValue(fetchError)

      renderPracticeActions('lesson-abc', true)

      expect(await screen.findByText(/Oefeningen konden niet worden geladen/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Probeer opnieuw/i })).toBeInTheDocument()
      // The stale "no exercises available" fallthrough must not also render.
      expect(screen.queryByText(/Geen oefeningen beschikbaar/i)).not.toBeInTheDocument()
      await waitFor(() => {
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({ page: 'lesson-page', action: 'load-practice-counts', error: fetchError }),
        )
      })
    })

    it('retry re-runs the fetch and renders the real actions once it succeeds', async () => {
      vi.mocked(getLessonCapabilityPracticeSummaryByLessonId).mockRejectedValueOnce(new Error('network error'))
      vi.mocked(getLessonCapabilityPracticeSummaryByLessonId).mockResolvedValueOnce({
        readyCapabilityCount: 3,
        activePracticedCapabilityCount: 0,
      })
      vi.mocked(buildLessonPracticeActions).mockImplementation(({ state }) =>
        state.practiceReadyCount > 0
          ? [{ kind: 'practice', label: `Oefen deze les · ${state.practiceReadyCount} klaar`, href: '/session', priority: 'primary' }]
          : [],
      )

      const user = userEvent.setup()
      renderPracticeActions('lesson-abc', true)

      const retryButton = await screen.findByRole('button', { name: /Probeer opnieuw/i })
      await user.click(retryButton)

      expect(await screen.findByText(/Oefen deze les · 3 klaar/i)).toBeInTheDocument()
      expect(getLessonCapabilityPracticeSummaryByLessonId).toHaveBeenCalledTimes(2)
    })
  })
})
