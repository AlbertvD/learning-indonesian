// src/__tests__/Register.test.tsx
//
// Open signup (payment is the gate, not an invite code — docs/plans/
// 2026-07-12-oauth-stripe-entitlement-design.md, owner decision #2).
// Register.tsx calls authStore.signUp directly; the invite-code field and the
// signup-with-invite edge function are retired.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuthApiError } from '@supabase/supabase-js'
import { Register } from '@/pages/Register'

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))

const { mockNavigate, mockSignUp, mockSignInWithGoogle, mockResendConfirmation } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignInWithGoogle: vi.fn(),
  mockResendConfirmation: vi.fn(),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: any) => any) => selector({
    signUp: mockSignUp,
    signInWithGoogle: mockSignInWithGoogle,
    resendConfirmation: mockResendConfirmation,
  })),
}))

function renderRegister() {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <Register />
      </MantineProvider>
    </MemoryRouter>,
  )
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('Jan de Vries'), 'Jan de Vries')
  await user.type(screen.getByPlaceholderText('jij@voorbeeld.com'), 'jan@example.com')
  await user.type(screen.getByPlaceholderText('Je wachtwoord'), 'password123')
  await user.click(screen.getByRole('button', { name: 'Account aanmaken' }))
}

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has no invite-code field', () => {
    renderRegister()
    expect(screen.queryByPlaceholderText('Je uitnodigingscode')).not.toBeInTheDocument()
    expect(screen.queryByText('Uitnodigingscode')).not.toBeInTheDocument()
  })

  it('shows a "Continue with Google" button', () => {
    renderRegister()
    expect(screen.getByRole('button', { name: 'Doorgaan met Google' })).toBeInTheDocument()
  })

  it('signs up via authStore.signUp and navigates to /welkom onboarding', async () => {
    mockSignUp.mockResolvedValue({ needsConfirmation: false })
    const user = userEvent.setup()
    renderRegister()

    await fillAndSubmit(user)

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith('jan@example.com', 'password123', 'Jan de Vries'))
    const { notifications } = await import('@mantine/notifications')
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'green' }))
    // Bet-1 §3.4: post-signup lands on the loanword-bridge onboarding, not the dashboard.
    expect(mockNavigate).toHaveBeenCalledWith('/welkom')
  })

  // The silent-ejection regression: signUp resolves without error but withholds
  // a session. Navigating to /welkom here would bounce the visitor straight back
  // out, after telling them registration succeeded.
  describe('when the project requires email confirmation', () => {
    beforeEach(() => {
      mockSignUp.mockResolvedValue({ needsConfirmation: true })
    })

    it('shows the check-your-inbox panel with the address, and does NOT navigate', async () => {
      const user = userEvent.setup()
      renderRegister()

      await fillAndSubmit(user)

      expect(await screen.findByText('Bevestig je e-mailadres')).toBeInTheDocument()
      expect(screen.getByText('jan@example.com')).toBeInTheDocument()
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('does not show a green success toast that would imply the account is usable', async () => {
      const user = userEvent.setup()
      renderRegister()

      await fillAndSubmit(user)

      await screen.findByText('Bevestig je e-mailadres')
      const { notifications } = await import('@mantine/notifications')
      expect(notifications.show).not.toHaveBeenCalledWith(expect.objectContaining({ color: 'green' }))
    })

    it('resends the confirmation mail on request', async () => {
      mockResendConfirmation.mockResolvedValue(undefined)
      const user = userEvent.setup()
      renderRegister()

      await fillAndSubmit(user)
      await user.click(await screen.findByRole('button', { name: 'Stuur de link opnieuw' }))

      expect(mockResendConfirmation).toHaveBeenCalledWith('jan@example.com')
      const { notifications } = await import('@mantine/notifications')
      await waitFor(() => {
        expect(notifications.show).toHaveBeenCalledWith(
          expect.objectContaining({ color: 'green', title: 'Verstuurd' }),
        )
      })
    })

    it('surfaces a failure to resend rather than failing silently', async () => {
      mockResendConfirmation.mockRejectedValue(new Error('over_email_send_rate_limit'))
      const user = userEvent.setup()
      renderRegister()

      await fillAndSubmit(user)
      await user.click(await screen.findByRole('button', { name: 'Stuur de link opnieuw' }))

      const { notifications } = await import('@mantine/notifications')
      const { logError } = await import('@/lib/logger')
      await waitFor(() => {
        expect(notifications.show).toHaveBeenCalledWith(
          expect.objectContaining({ color: 'red', title: 'Versturen mislukt' }),
        )
      })
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ page: 'Register', action: 'resendConfirmation' }),
      )
    })
  })

  it('shows a friendly message when the email is already registered, and does not navigate', async () => {
    const authError = new AuthApiError('User already registered', 422, 'user_already_exists')
    mockSignUp.mockRejectedValue(authError)
    const user = userEvent.setup()
    renderRegister()

    await fillAndSubmit(user)

    const { notifications } = await import('@mantine/notifications')
    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          message: 'Dit e-mailadres is al geregistreerd. Probeer in te loggen.',
        }),
      )
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows a generic failure message for an unrecognised error, and logs it', async () => {
    const networkError = new TypeError('Failed to fetch')
    mockSignUp.mockRejectedValue(networkError)
    const user = userEvent.setup()
    renderRegister()

    await fillAndSubmit(user)

    const { notifications } = await import('@mantine/notifications')
    const { logError } = await import('@/lib/logger')
    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          message: 'Er ging iets mis. Probeer het opnieuw.',
        }),
      )
    })
    expect(logError).toHaveBeenCalledWith({ page: 'Register', action: 'signUp', error: networkError })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('calls signInWithGoogle when "Continue with Google" is clicked', async () => {
    mockSignInWithGoogle.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderRegister()

    await user.click(screen.getByRole('button', { name: 'Doorgaan met Google' }))

    expect(mockSignInWithGoogle).toHaveBeenCalled()
  })

  it('shows registration-specific OAuth failure copy (not the login copy) when signInWithGoogle rejects', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('oauth_failed'))
    const user = userEvent.setup()
    renderRegister()

    await user.click(screen.getByRole('button', { name: 'Doorgaan met Google' }))

    const { notifications } = await import('@mantine/notifications')
    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          title: 'Registratie mislukt',
          message: 'Registreren met Google is mislukt. Probeer het opnieuw.',
        }),
      )
    })
  })
})
