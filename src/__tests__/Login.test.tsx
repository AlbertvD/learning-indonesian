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
import { Login } from '@/pages/Login'

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
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
})
