import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Session } from '@/pages/Session'
import { logError } from '@/lib/logger'
import { getLessonSourceRefsByLessonId } from '@/lib/lessons'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'user-1', email: 'learner@example.test' },
    profile: { language: 'nl', preferredSessionSize: 15 },
  })),
}))

vi.mock('@/lib/lessons', () => ({
  getLessonSourceRefsByLessonId: vi.fn(),
}))

// Distinguishing the error-vs-empty branch happens before the builder /
// content-resolution calls, so these can stay simple no-ops for this file.
vi.mock('@/lib/session-builder', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session-builder')>('@/lib/session-builder')
  return {
    ...actual,
    buildSession: vi.fn(async () => ({
      id: 'session-1',
      mode: 'lesson_practice',
      title: 'Les',
      blocks: [],
      recapPolicy: 'standard',
      diagnostics: [],
      backlogDueCount: 0,
    })),
  }
})

vi.mock('@/services/audioService', () => ({
  fetchSessionAudioMap: vi.fn(async () => new Map()),
}))

vi.mock('@/lib/exercise-content', () => ({
  resolveCapabilityBlocks: vi.fn(async () => new Map()),
}))

vi.mock('@/components/experience/ExperiencePlayer', () => ({
  ExperiencePlayer: () => <div data-testid="experience-player">player</div>,
}))

function renderSession() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/session?mode=lesson_practice&lesson=lesson-1']}>
        <Routes>
          <Route path="/session" element={<Session />} />
          <Route path="/" element={<div>home</div>} />
          <Route path="/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('Session — lesson scope error vs empty distinction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the friendly "not ready" copy (no retry) when the lesson genuinely has no ready content', async () => {
    vi.mocked(getLessonSourceRefsByLessonId).mockResolvedValue([])
    renderSession()

    expect(await screen.findByText('Deze les is nog niet klaar om te oefenen.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Probeer opnieuw' })).not.toBeInTheDocument()
    expect(logError).not.toHaveBeenCalled()
  })

  it('logs the error and shows a retryable error state on a genuine fetch failure, then recovers on retry', async () => {
    vi.mocked(getLessonSourceRefsByLessonId)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(['ref-1'])
    renderSession()

    await screen.findByText('Sessie kon niet worden geladen. Probeer het opnieuw.')
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ page: 'session', action: 'initialize' }),
    )

    const retryButton = screen.getByRole('button', { name: 'Probeer opnieuw' })
    const user = userEvent.setup()
    await user.click(retryButton)

    expect(await screen.findByTestId('experience-player')).toBeInTheDocument()
    expect(getLessonSourceRefsByLessonId).toHaveBeenCalledTimes(2)
  })
})
