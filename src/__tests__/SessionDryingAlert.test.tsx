import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Session } from '@/pages/Session'
import * as sessionBuilder from '@/lib/session-builder'
import type { SessionPlan } from '@/lib/session-builder'

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

vi.mock('@/services/audioService', () => ({
  fetchSessionAudioMap: vi.fn(async () => new Map()),
}))

vi.mock('@/lib/exercise-content', () => ({
  resolveCapabilityBlocks: vi.fn(async () => new Map()),
}))

// ExperiencePlayer renders heavy chrome we do not exercise here; stub it.
vi.mock('@/components/experience/ExperiencePlayer', () => ({
  ExperiencePlayer: () => <div data-testid="experience-player">player</div>,
}))

const dryingDiagnostic = {
  severity: 'warn' as const,
  reason: 'learning_pipeline_drying_up',
  details: 'session.pipelineDryingUp',
}

function planWith(diagnostics: SessionPlan['diagnostics']): SessionPlan {
  return {
    id: 'session-1',
    mode: 'standard',
    title: 'Dagelijkse Indonesische oefening',
    blocks: [],
    recapPolicy: 'standard',
    diagnostics,
    backlogDueCount: 0,
  }
}

function renderSession() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/session?mode=standard"]}>
        <Routes>
          <Route path="/session" element={<Session />} />
          <Route path="/" element={<div>home</div>} />
          <Route path="/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('Session — queue-drying alert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the drying alert when the plan carries the diagnostic', async () => {
    vi.spyOn(sessionBuilder, 'buildSession').mockResolvedValue(planWith([dryingDiagnostic]))
    renderSession()

    const alert = await screen.findByTestId('drying-alert')
    expect(alert).toHaveTextContent(/Je bent bijna klaar met de huidige les/)
    expect(screen.getByTestId('experience-player')).toBeInTheDocument()
  })

  it('does not render the alert when the diagnostic is absent', async () => {
    vi.spyOn(sessionBuilder, 'buildSession').mockResolvedValue(planWith([]))
    renderSession()

    await screen.findByTestId('experience-player')
    expect(screen.queryByTestId('drying-alert')).not.toBeInTheDocument()
  })

  it('dismisses the alert for the rest of the session when the close button is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(sessionBuilder, 'buildSession').mockResolvedValue(planWith([dryingDiagnostic]))
    renderSession()

    await screen.findByTestId('drying-alert')
    const closeButton = screen.getByRole('button', { name: 'Sluiten' })
    await user.click(closeButton)

    await waitFor(() => {
      expect(screen.queryByTestId('drying-alert')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('experience-player')).toBeInTheDocument()
  })
})
