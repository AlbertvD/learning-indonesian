// src/__tests__/Register.test.tsx
//
// Invite-gated signup (pre-cloud-hardening item 1). Register.tsx no longer
// calls supabase.auth.signUp directly — it invokes the signup-with-invite
// edge function, then signs in on success. Mock at the
// supabase.functions.invoke boundary and assert the friendly error mapping
// for each edge-function error code.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { Register } from '@/pages/Register'

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))

const { mockNavigate, mockSignIn, mockInvoke } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSignIn: vi.fn(),
  mockInvoke: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: any) => any) => selector({ signIn: mockSignIn })),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: mockInvoke } },
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
  await user.type(screen.getByPlaceholderText('Je uitnodigingscode'), 'welcome-1')
  await user.click(screen.getByRole('button', { name: 'Account aanmaken' }))
}

// Mirrors the shape FunctionsClient constructs for a non-2xx response:
// error.context is the raw Response, read via error.context.json().
function httpError(code: string): FunctionsHttpError {
  return new FunctionsHttpError({ json: async () => ({ error: code }) })
}

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signs up successfully, signs the user in, and navigates to /welkom onboarding', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null })
    mockSignIn.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderRegister()

    await fillAndSubmit(user)

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('jan@example.com', 'password123'))
    expect(mockInvoke).toHaveBeenCalledWith('signup-with-invite', {
      body: {
        email: 'jan@example.com',
        password: 'password123',
        fullName: 'Jan de Vries',
        inviteCode: 'welcome-1',
      },
    })
    const { notifications } = await import('@mantine/notifications')
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'green' }))
    // Bet-1 §3.4: post-signup lands on the loanword-bridge onboarding, not the dashboard.
    expect(mockNavigate).toHaveBeenCalledWith('/welkom')
  })

  it('shows a friendly message for an invalid or already-used invite code', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('invalid_invite_code') })
    const user = userEvent.setup()
    renderRegister()

    await fillAndSubmit(user)

    const { notifications } = await import('@mantine/notifications')
    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          message: 'Deze uitnodigingscode is ongeldig of al gebruikt.',
        }),
      )
    })
    expect(mockSignIn).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  // 2026-07-11 prod-ready audit ("SIGNUP ENUMERATION"): the edge function
  // deliberately collapses "email already registered" and every other
  // post-redeem failure into the same generic signup_failed/500 response —
  // a distinct "that email is taken" message would let an attacker probe
  // arbitrary addresses and learn which ones already have an account.
  // invalid_invite_code (tested above) stays distinct on purpose: it reveals
  // nothing about any particular email.
  it('shows the same generic message for signup_failed as any other post-redeem error (no email-enumeration signal)', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('signup_failed') })
    const user = userEvent.setup()
    renderRegister()

    await fillAndSubmit(user)

    const { notifications } = await import('@mantine/notifications')
    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          message: 'Er ging iets mis. Probeer het opnieuw.',
        }),
      )
    })
    expect(mockSignIn).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows a friendly message when rate limited', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('rate_limited') })
    const user = userEvent.setup()
    renderRegister()

    await fillAndSubmit(user)

    const { notifications } = await import('@mantine/notifications')
    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          message: 'Te veel pogingen. Probeer het later opnieuw.',
        }),
      )
    })
  })
})
