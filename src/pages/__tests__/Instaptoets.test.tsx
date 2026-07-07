// src/pages/__tests__/Instaptoets.test.tsx
//
// Exercises the wiring (adapter → staircase → applyPlacementResult → summary),
// not useExerciseScoring's own correct-answer auto-advance delay — that timer
// mechanism already has dedicated coverage in
// src/__tests__/useExerciseScoring.test.ts. Both probe items here are answered
// WRONG (which resolves immediately, no correctDelayMs wait) so the test stays
// synchronous and deterministic.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Instaptoets } from '@/pages/Instaptoets'

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))

const { mockNavigate, mockFetchPool, mockApplyResult } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockFetchPool: vi.fn(),
  mockApplyResult: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/lib/placement/adapter', async () => {
  const actual = await vi.importActual<typeof import('@/lib/placement/adapter')>('@/lib/placement/adapter')
  return { ...actual, fetchPlacementPool: mockFetchPool }
})

vi.mock('@/lib/placement/applyResult', () => ({
  applyPlacementResult: mockApplyResult,
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: any) => any) => selector({ profile: { language: 'nl' } })),
}))

const KANTOR = { normalizedText: 'kantor', bandSlug: 'top-100', baseText: 'kantor', translationNl: 'kantoor' }
const GRATIS = { normalizedText: 'gratis', bandSlug: 'top-100', baseText: 'gratis', translationNl: 'gratis' }

function twoItemPool() {
  return {
    bands: [{ slug: 'top-100', rankCutoff: 100 }],
    itemsByBand: new Map([['top-100', [
      { normalizedText: 'kantor', bandSlug: 'top-100' },
      { normalizedText: 'gratis', bandSlug: 'top-100' },
    ]]]),
    allItems: [KANTOR, GRATIS],
    detailsByNormalizedText: new Map([['kantor', KANTOR], ['gratis', GRATIS]]),
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <Instaptoets />
      </MantineProvider>
    </MemoryRouter>,
  )
}

describe('Instaptoets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApplyResult.mockResolvedValue(undefined)
  })

  it('runs the staircase to convergence and writes the (empty) result before showing the summary', async () => {
    mockFetchPool.mockResolvedValue(twoItemPool())
    const user = userEvent.setup()
    renderPage()

    // Round 1 — prompt is "kantor"; answer wrong ("gratis" ≠ "kantoor").
    expect(await screen.findByText('kantor')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'gratis' }))
    await user.click(await screen.findByRole('button', { name: 'Volgende' }))

    // Round 2 — prompt is "gratis"; answer wrong ("kantoor" ≠ "gratis").
    await user.click(await screen.findByRole('button', { name: 'kantoor' }))
    await user.click(await screen.findByRole('button', { name: 'Volgende' }))

    // Nothing was answered correctly and the only band was never cleared —
    // abandon-safe up to here, then exactly one write on convergence.
    await waitFor(() => expect(mockApplyResult).toHaveBeenCalledWith([], []))
    expect(await screen.findByText('Helemaal klaar!')).toBeInTheDocument()
    expect(screen.getByText(/Geen zorgen/)).toBeInTheDocument()
  })

  it('a quiet Overslaan link navigates home during the active probe', async () => {
    mockFetchPool.mockResolvedValue(twoItemPool())
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('kantor')
    await user.click(screen.getByText('Overslaan'))
    expect(mockNavigate).toHaveBeenCalledWith('/')
    expect(mockApplyResult).not.toHaveBeenCalled()
  })

  it('shows a friendly empty state + logs the error when the pool fails to load', async () => {
    mockFetchPool.mockRejectedValue(new Error('network down'))
    renderPage()

    expect(await screen.findByText('Nog geen instaptoets beschikbaar')).toBeInTheDocument()
    const { notifications } = await import('@mantine/notifications')
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' }))
    const { logError } = await import('@/lib/logger')
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ page: 'Instaptoets', action: 'fetchPlacementPool' }))
  })
})
