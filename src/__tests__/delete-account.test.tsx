// src/__tests__/delete-account.test.tsx
//
// GDPR erasure (docs/plans/2026-07-02-gdpr-erasure-retention.md §1.7). Profile
// danger-zone "Account verwijderen" flow: type-to-confirm modal (confirmation
// phrase = the account email) -> supabase.functions.invoke('delete-account').
// Mock at the supabase.functions.invoke boundary, mirroring Register.test.tsx.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { Profile } from '@/pages/Profile'

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))

const { mockNavigate, mockSignOut, mockInvoke } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSignOut: vi.fn(),
  mockInvoke: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const testUser = {
  id: 'user-1',
  email: 'jan@example.com',
  created_at: '2026-01-01T00:00:00Z',
}

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: any) => any) => selector({
    user: testUser,
    profile: { fullName: 'Jan', preferredSessionSize: 15, timezone: 'Europe/Amsterdam', language: 'nl' },
    updateDisplayName: vi.fn(),
    updateLanguage: vi.fn(),
    updatePreferredSessionSize: vi.fn(),
    updateTimezone: vi.fn(),
    signOut: mockSignOut,
  })),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: mockInvoke } },
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

// Mirrors the shape FunctionsClient constructs for a non-2xx response:
// error.context is the raw Response, read via error.context.json().
function httpError(code: string): FunctionsHttpError {
  return new FunctionsHttpError({ json: async () => ({ error: code }) })
}

async function openModalAndTypeConfirm(user: ReturnType<typeof userEvent.setup>, text = 'jan@example.com') {
  await user.click(await screen.findByRole('button', { name: 'Account verwijderen' }))
  const input = await screen.findByPlaceholderText('jouw@email.com')
  if (text) await user.type(input, text)
  return input
}

describe('Profile — delete account (danger zone)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the confirm modal and disables the delete button until the email is typed exactly', async () => {
    const user = userEvent.setup()
    renderProfile()

    const input = await openModalAndTypeConfirm(user, '')
    const confirmButton = await screen.findByRole('button', { name: 'Ja, verwijder mijn account' })
    expect(confirmButton).toBeDisabled()

    await user.type(input, 'wrong@example.com')
    expect(confirmButton).toBeDisabled()

    await user.clear(input)
    await user.type(input, 'jan@example.com')
    expect(confirmButton).toBeEnabled()
  })

  it('happy path: invokes delete-account, signs out, and navigates to /login', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null })
    mockSignOut.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderProfile()

    await openModalAndTypeConfirm(user)
    await user.click(screen.getByRole('button', { name: 'Ja, verwijder mijn account' }))

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('delete-account'))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('friendly-error path: session-expired notification shown, logError called, user NOT signed out', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('invalid_user_jwt') })
    const user = userEvent.setup()
    renderProfile()

    await openModalAndTypeConfirm(user)
    await user.click(screen.getByRole('button', { name: 'Ja, verwijder mijn account' }))

    const { notifications } = await import('@mantine/notifications')
    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          message: 'Je sessie is verlopen. Log opnieuw in en probeer het nog eens.',
        }),
      )
    })
    const { logError } = await import('@/lib/logger')
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ page: 'profile', action: 'deleteAccount' }))
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('generic-error path: unknown error code shows the generic message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError('delete_failed') })
    const user = userEvent.setup()
    renderProfile()

    await openModalAndTypeConfirm(user)
    await user.click(screen.getByRole('button', { name: 'Ja, verwijder mijn account' }))

    const { notifications } = await import('@mantine/notifications')
    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          message: 'Er ging iets mis. Probeer het opnieuw.',
        }),
      )
    })
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
