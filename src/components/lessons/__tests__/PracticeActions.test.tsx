import { render, screen, waitFor } from '@testing-library/react'
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
})
