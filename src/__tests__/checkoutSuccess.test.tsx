// src/__tests__/checkoutSuccess.test.tsx
//
// /checkout/success (docs/plans/2026-07-12-oauth-stripe-entitlement-
// design.md §3.4/§9): calls verify-checkout ONCE with the `session_id` read
// from the URL (wire body key is `sessionId`, camelCase — the URL query
// param name stays `session_id`, Stripe's own template). Success on an
// active-set status; retryable 500s get a Retry button; 400/403 (or a
// missing session_id, checked before ever calling the function) get a
// generic blocked failure with a Profile link, no retry.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { CheckoutSuccess } from '@/pages/CheckoutSuccess'

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

const mockRefreshEntitlement = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: any) => any) =>
    selector({ user: { id: 'user-1' }, profile: { language: 'nl' }, refreshEntitlement: mockRefreshEntitlement }),
}))

const mockInvoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: mockInvoke } },
}))

// Mirrors the shape FunctionsClient constructs for a non-2xx response
// (delete-account.test.tsx's httpError helper).
function httpError(code: string): FunctionsHttpError {
  return new FunctionsHttpError({ json: async () => ({ error: code }) })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MantineProvider>
        <Routes>
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
        </Routes>
      </MantineProvider>
    </MemoryRouter>,
  )
}

describe('CheckoutSuccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRefreshEntitlement.mockResolvedValue(undefined)
  })

  it('calls verify-checkout with the session_id from the URL (body key sessionId) and shows success on an active status', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'active' }, error: null })
    renderAt('/checkout/success?session_id=cs_test_123')

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('verify-checkout', { body: { sessionId: 'cs_test_123' } }),
    )
    expect(await screen.findByText('Welkom! Je abonnement is actief.')).toBeInTheDocument()
    expect(mockRefreshEntitlement).toHaveBeenCalled()
  })

  it('shows a retry button on a transient (500) failure; retry re-calls verify-checkout and can then succeed', async () => {
    mockInvoke
      .mockResolvedValueOnce({ data: null, error: httpError('verify_checkout_failed') })
      .mockResolvedValueOnce({ data: { status: 'active' }, error: null })
    const user = userEvent.setup()
    renderAt('/checkout/success?session_id=cs_test_123')

    const retryButton = await screen.findByRole('button', { name: 'Probeer opnieuw' })
    await user.click(retryButton)

    expect(await screen.findByText('Welkom! Je abonnement is actief.')).toBeInTheDocument()
    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  it('shows a generic blocked failure (no retry) with a link to Profile on a 403 user_mismatch', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('user_mismatch') })
    renderAt('/checkout/success?session_id=cs_test_123')

    expect(await screen.findByRole('button', { name: 'Ga naar profiel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Probeer opnieuw' })).not.toBeInTheDocument()
  })

  it('shows the blocked failure state without ever calling verify-checkout when session_id is missing from the URL', async () => {
    renderAt('/checkout/success')

    expect(await screen.findByRole('button', { name: 'Ga naar profiel' })).toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('shows a session-expired state (not the generic blocked dead end) with a login link on a 401 missing_user_jwt', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('missing_user_jwt') })
    renderAt('/checkout/success?session_id=cs_test_123')

    expect(await screen.findByRole('button', { name: 'Ga naar inloggen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Probeer opnieuw' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ga naar profiel' })).not.toBeInTheDocument()
  })

  it('shows the session-expired state on a 401 invalid_user_jwt too', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('invalid_user_jwt') })
    renderAt('/checkout/success?session_id=cs_test_123')

    expect(await screen.findByRole('button', { name: 'Ga naar inloggen' })).toBeInTheDocument()
  })
})
