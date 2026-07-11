// src/__tests__/Login.test.tsx
//
// CRIT-1 companion test: Login.tsx must honour the `?next=` param
// ProtectedRoute now attaches when it bounces a logged-out visitor here, so
// the learner lands back where they were headed instead of always at `/`.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuthApiError } from '@supabase/supabase-js'
import { Login } from '@/pages/Login'
import { logError } from '@/lib/logger'

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))

const { mockNavigate, mockSignIn } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSignIn: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: any) => any) => selector({ signIn: mockSignIn })),
}))

function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MantineProvider>
        <Login />
      </MantineProvider>
    </MemoryRouter>,
  )
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('jij@voorbeeld.com'), 'jan@example.com')
  await user.type(screen.getByPlaceholderText('Je wachtwoord'), 'password123')
  await user.click(screen.getByRole('button', { name: 'Inloggen' }))
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates to / after a successful login with no next param', async () => {
    mockSignIn.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderLogin('/login')

    await fillAndSubmit(user)

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('navigates to the next param after a successful login (return-to-where-I-was)', async () => {
    mockSignIn.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderLogin(`/login?next=${encodeURIComponent('/progress?tab=woordenschat')}`)

    await fillAndSubmit(user)

    expect(mockNavigate).toHaveBeenCalledWith('/progress?tab=woordenschat')
  })

  it('ignores a protocol-relative next param and falls back to / (no open redirect)', async () => {
    mockSignIn.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderLogin(`/login?next=${encodeURIComponent('//evil.example.com')}`)

    await fillAndSubmit(user)

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('shows a friendly error and does not navigate on failed login', async () => {
    mockSignIn.mockRejectedValue(new Error('invalid'))
    const user = userEvent.setup()
    renderLogin('/login')

    await fillAndSubmit(user)

    const { notifications } = await import('@mantine/notifications')
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red' }),
    )
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows "incorrect credentials" only for a real invalid_credentials AuthApiError, and logs it', async () => {
    const authError = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')
    mockSignIn.mockRejectedValue(authError)
    const user = userEvent.setup()
    renderLogin('/login')

    await fillAndSubmit(user)

    const { notifications } = await import('@mantine/notifications')
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red', message: 'Onjuist e-mailadres of wachtwoord.' }),
    )
    expect(logError).toHaveBeenCalledWith({ page: 'Login', action: 'signIn', error: authError })
  })

  it('shows a generic failure message (not "incorrect credentials") for a network/outage error, and logs it', async () => {
    const networkError = new TypeError('Failed to fetch')
    mockSignIn.mockRejectedValue(networkError)
    const user = userEvent.setup()
    renderLogin('/login')

    await fillAndSubmit(user)

    const { notifications } = await import('@mantine/notifications')
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red', message: 'Er ging iets mis. Probeer het opnieuw.' }),
    )
    expect(notifications.show).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Onjuist e-mailadres of wachtwoord.' }),
    )
    expect(logError).toHaveBeenCalledWith({ page: 'Login', action: 'signIn', error: networkError })
  })
})
