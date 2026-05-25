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
  isLessonActivated,
  buildLessonPracticeActions,
} from '@/lib/lessons'

function renderPracticeActions(lessonId: string) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <PracticeActions lessonId={lessonId} />
      </MemoryRouter>
    </MantineProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isLessonActivated).mockResolvedValue(true)
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

    renderPracticeActions('lesson-abc')

    await waitFor(() => {
      expect(getLessonCapabilityPracticeSummaryByLessonId).toHaveBeenCalledWith('user-uuid', 'lesson-abc')
    })
  })

  it('passes correct practiceReadyCount to buildLessonPracticeActions (ready minus practiced when activated)', async () => {
    vi.mocked(getLessonCapabilityPracticeSummaryByLessonId).mockResolvedValue({
      readyCapabilityCount: 7,
      activePracticedCapabilityCount: 3,
    })
    vi.mocked(isLessonActivated).mockResolvedValue(true)

    renderPracticeActions('lesson-abc')

    await waitFor(() => {
      const calls = vi.mocked(buildLessonPracticeActions).mock.calls
      const lastCallWithCounts = calls.find(([arg]) => arg.state.practiceReadyCount > 0)
      expect(lastCallWithCounts).toBeDefined()
      expect(lastCallWithCounts![0].state.practiceReadyCount).toBe(4)
      expect(lastCallWithCounts![0].state.hasActivePracticedItems).toBe(true)
    })
  })

  it('renders empty-state button when no practice actions are available', async () => {
    renderPracticeActions('lesson-abc')
    expect(await screen.findByText(/Geen oefeningen beschikbaar/i)).toBeInTheDocument()
  })
})
