// src/components/lessons/__tests__/activationGatePaywall.test.tsx
//
// Lesson-activation gating mirror (docs/plans/2026-07-12-oauth-stripe-
// entitlement-design.md §5, §9): for a lesson beyond FREE_TIER_MAX_LESSON
// (3), a non-entitled caller sees a locked-lesson CTA instead of the
// activation checkbox; clicking it opens the full PaywallPanel with both
// prices. An entitled caller (or a free-tier lesson) keeps the ordinary
// toggle. A non-entitled caller who already activated a paid lesson before
// their subscription lapsed keeps the toggle too — deactivation stays
// available.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { ActivationGate } from '../ActivationGate'

vi.mock('@/lib/supabase')
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))

const mockState = vi.hoisted(() => ({
  profile: { isEntitled: false, language: 'nl' } as any,
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: any) => any) => selector(mockState),
}))

function renderGate(orderIndex: number, activated = false) {
  return render(
    <MantineProvider>
      <ActivationGate activated={activated} saving={false} onToggle={vi.fn()} orderIndex={orderIndex} />
    </MantineProvider>,
  )
}

describe('ActivationGate — paywall mirror', () => {
  beforeEach(() => {
    mockState.profile = { isEntitled: false, language: 'nl' }
  })

  it('non-entitled user on a lesson beyond the free tier sees a locked CTA, then both prices after opening it', async () => {
    const user = userEvent.setup()
    renderGate(4)

    expect(screen.getByTestId('lesson-paywall-cta')).toBeInTheDocument()
    expect(screen.queryByTestId('lesson-activation-checkbox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bekijk abonnementen' }))

    expect(await screen.findByTestId('paywall-panel')).toBeInTheDocument()
    expect(screen.getByText('€7')).toBeInTheDocument()
    expect(screen.getByText('€56')).toBeInTheDocument()
  })

  it('entitled user on the same lesson sees the normal activation toggle, not the paywall', () => {
    mockState.profile = { isEntitled: true, language: 'nl' }
    renderGate(4)
    expect(screen.getByTestId('lesson-activation-checkbox')).toBeInTheDocument()
    expect(screen.queryByTestId('lesson-paywall-cta')).not.toBeInTheDocument()
  })

  it('a free-tier lesson (order_index <= 3) shows the toggle regardless of entitlement', () => {
    renderGate(2)
    expect(screen.getByTestId('lesson-activation-checkbox')).toBeInTheDocument()
    expect(screen.queryByTestId('lesson-paywall-cta')).not.toBeInTheDocument()
  })

  it('a non-entitled user who already activated a paid lesson keeps the toggle — deactivation stays available', () => {
    renderGate(4, true)
    expect(screen.getByTestId('lesson-activation-checkbox')).toBeInTheDocument()
    expect(screen.queryByTestId('lesson-paywall-cta')).not.toBeInTheDocument()
  })
})
