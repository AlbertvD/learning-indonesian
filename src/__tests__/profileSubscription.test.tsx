// src/__tests__/profileSubscription.test.tsx
//
// Profile subscription block (docs/plans/2026-07-12-oauth-stripe-
// entitlement-design.md §5/§9): "Manage subscription" is gated purely on
// `stripe_customer_id` presence — independent of active/inactive status
// (a canceled row keeps its Stripe customer so resubscribing/portal access
// still works, §1 design notes). No entitlement row at all renders the
// free-plan paywall CTA (PaywallPanel) inline.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { Profile } from '@/pages/Profile'

// Mirrors the shape FunctionsClient constructs for a non-2xx response
// (delete-account.test.tsx's httpError helper).
function httpError(code: string): FunctionsHttpError {
  return new FunctionsHttpError({ json: async () => ({ error: code }) })
}

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
vi.mock('@/lib/analytics/engagement', () => ({
  engagement: { practiceTime: vi.fn().mockResolvedValue({ streakDays: 0, minutesThisWeek: 0 }) },
}))

const mockState = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'jan@example.com', created_at: '2026-01-01T00:00:00Z' } as any,
  profile: {
    id: 'user-1', fullName: 'Jan', language: 'nl', preferredSessionSize: 15,
    timezone: 'Europe/Amsterdam', isAdmin: false, isEntitled: true,
  } as any,
  updateDisplayName: vi.fn(),
  updateLanguage: vi.fn(),
  updatePreferredSessionSize: vi.fn(),
  updateTimezone: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: any) => any) => selector(mockState),
}))

const mockChain = vi.hoisted(() => {
  const chain: any = {}
  for (const method of ['from', 'select', 'eq']) chain[method] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn()
  return chain
})
const mockInvoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn(() => mockChain),
    functions: { invoke: mockInvoke },
  },
}))

function renderProfile() {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <Profile />
      </MantineProvider>
    </MemoryRouter>,
  )
}

describe('Profile — subscription block', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Manage subscription" when the entitlement row has a stripe_customer_id', async () => {
    mockChain.maybeSingle.mockResolvedValue({
      data: {
        user_id: 'user-1', status: 'active', source: 'stripe',
        stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
        current_period_end: '2026-08-01T00:00:00Z',
      },
      error: null,
    })
    renderProfile()
    expect(await screen.findByRole('button', { name: 'Abonnement beheren' })).toBeInTheDocument()
  })

  it('hides "Manage subscription" and shows the free-plan paywall when there is no entitlement row', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    renderProfile()
    await screen.findByTestId('paywall-panel')
    expect(screen.queryByRole('button', { name: 'Abonnement beheren' })).not.toBeInTheDocument()
  })

  // ── Admins (2026-08-16) ───────────────────────────────────────────────────
  // indonesian.has_active_entitlement() grants access on an admin role with no
  // entitlements row, and authStore's isEntitledFrom() mirrors that — so an
  // admin already has full access everywhere in the app. This block read the
  // entitlements row directly and ignored isAdmin, which made the page that
  // REPORTS your status the one place that disagreed with the rest of the
  // product: an admin was shown "Gratis niveau" plus a subscribe CTA for
  // access they already had. Reported by the owner account 2026-08-16; the
  // cloud owner account relies on the same admin arm.
  it('shows admin access, not the free plan, for an admin with no entitlement row', async () => {
    mockState.profile = { ...mockState.profile, isAdmin: true, isEntitled: true }
    mockChain.maybeSingle.mockResolvedValue({ data: null, error: null })

    renderProfile()

    expect(await screen.findByText('Volledige toegang (beheerder)')).toBeInTheDocument()
    expect(screen.queryByTestId('paywall-panel')).not.toBeInTheDocument()
    // The status pill was fixed first and the body copy was NOT, so the card
    // read "Volledige toegang (beheerder)" directly above "Je gebruikt de
    // gratis versie — les 1." Assert the whole card agrees, not just the pill.
    expect(screen.queryByText(/gratis versie/i)).not.toBeInTheDocument()
    mockState.profile = { ...mockState.profile, isAdmin: false }
  })

  // A real paid row still wins the label — admin must not mask what someone is
  // actually paying for, or the page stops being a truthful account statement.
  it('still reports a real active subscription for an admin who also has one', async () => {
    mockState.profile = { ...mockState.profile, isAdmin: true, isEntitled: true }
    mockChain.maybeSingle.mockResolvedValue({
      data: {
        user_id: 'user-1', status: 'active', source: 'stripe',
        stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
        current_period_end: '2026-09-01T00:00:00Z',
      },
      error: null,
    })

    renderProfile()

    expect(await screen.findByText('Actief')).toBeInTheDocument()
    expect(screen.queryByTestId('paywall-panel')).not.toBeInTheDocument()
    mockState.profile = { ...mockState.profile, isAdmin: false }
  })

  it('hides "Manage subscription" for a comped row with no stripe_customer_id (active-set, but not Stripe-backed)', async () => {
    mockChain.maybeSingle.mockResolvedValue({
      data: {
        user_id: 'user-1', status: 'comped', source: 'comp',
        stripe_customer_id: null, stripe_subscription_id: null, current_period_end: null,
      },
      error: null,
    })
    renderProfile()
    await screen.findByText('Gratis toegang (cadeau)')
    expect(screen.queryByRole('button', { name: 'Abonnement beheren' })).not.toBeInTheDocument()
    // Comped is active-set — no need to resubscribe, so no paywall panel either.
    expect(screen.queryByTestId('paywall-panel')).not.toBeInTheDocument()
  })

  it('shows "Manage subscription" AND the paywall for a canceled row that kept its stripe_customer_id', async () => {
    mockChain.maybeSingle.mockResolvedValue({
      data: {
        user_id: 'user-1', status: 'canceled', source: 'stripe',
        stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', current_period_end: null,
      },
      error: null,
    })
    renderProfile()
    expect(await screen.findByRole('button', { name: 'Abonnement beheren' })).toBeInTheDocument()
    expect(await screen.findByTestId('paywall-panel')).toBeInTheDocument()
  })

  it('handleManageSubscription: shows the paywall session-expired message (not the generic one) on a 401', async () => {
    mockChain.maybeSingle.mockResolvedValue({
      data: {
        user_id: 'user-1', status: 'active', source: 'stripe',
        stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
        current_period_end: '2026-08-01T00:00:00Z',
      },
      error: null,
    })
    mockInvoke.mockResolvedValue({ data: null, error: httpError('invalid_user_jwt') })
    const user = userEvent.setup()
    renderProfile()

    await user.click(await screen.findByRole('button', { name: 'Abonnement beheren' }))

    const { notifications } = await import('@mantine/notifications')
    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          message: 'Je sessie is verlopen. Log opnieuw in en probeer het nog eens.',
        }),
      )
    })
  })

  it('handleManageSubscription: shows the generic error message for an unrecognised failure', async () => {
    mockChain.maybeSingle.mockResolvedValue({
      data: {
        user_id: 'user-1', status: 'active', source: 'stripe',
        stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
        current_period_end: '2026-08-01T00:00:00Z',
      },
      error: null,
    })
    mockInvoke.mockResolvedValue({ data: null, error: httpError('portal_session_failed') })
    const user = userEvent.setup()
    renderProfile()

    await user.click(await screen.findByRole('button', { name: 'Abonnement beheren' }))

    const { notifications } = await import('@mantine/notifications')
    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          message: 'Er ging iets mis. Probeer het opnieuw.',
        }),
      )
    })
  })
})
