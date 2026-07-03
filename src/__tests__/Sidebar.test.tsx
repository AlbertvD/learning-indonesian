// src/__tests__/Sidebar.test.tsx
//
// Desktop program slice 2: the persistent rail. Five destinations (Home ·
// Leren · Ontdek · Voortgang · Profiel — Profiel promoted to a primary nav
// item, foundation plan §7.1), a Start-sessie CTA, admin links behind the
// admin role, and no trace of the deleted ProfileMenu / pin machinery.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from '@/components/Sidebar'

const mockState = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'learner@example.test' } as any,
  profile: { id: 'user-1', email: 'learner@example.test', isAdmin: false, language: 'nl' } as any,
  loading: false,
}))

const mockPracticeTime = vi.hoisted(() => vi.fn())

vi.mock('@/stores/authStore', () => {
  const useAuthStore: any = vi.fn((selector?: (s: any) => any) =>
    selector ? selector(mockState) : mockState,
  )
  useAuthStore.setState = vi.fn()
  useAuthStore.getState = vi.fn(() => mockState)
  return { useAuthStore }
})

vi.mock('@/lib/analytics/engagement', () => ({
  engagement: { practiceTime: mockPracticeTime },
}))

const mockNavigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderSidebar() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('Sidebar (rail)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.profile = { id: 'user-1', email: 'learner@example.test', isAdmin: false, language: 'nl' }
    mockPracticeTime.mockResolvedValue({
      streakDays: 12, minutesToday: 8, minutesThisWeek: 40, minutesLastWeek: 30,
    })
  })

  it('renders the Kamoe Bisa wordmark, the Start-sessie CTA and all five destinations', () => {
    renderSidebar()

    expect(screen.getByText('Kamoe Bisa')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start sessie/ })).toBeInTheDocument()
    for (const [label, path] of [
      ['Home', '/'], ['Leren', '/leren'], ['Ontdek', '/ontdek'],
      ['Voortgang', '/progress'], ['Profiel', '/profile'],
    ] as const) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', path)
    }
  })

  it('routes the CTA to the session', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByRole('button', { name: /Start sessie/ }))

    expect(mockNavigate).toHaveBeenCalledWith('/session')
  })

  it('hides admin links for regular users and shows them for admins', () => {
    const { unmount } = renderSidebar()
    expect(screen.queryByText('Contentcontrole')).not.toBeInTheDocument()
    unmount()

    mockState.profile = { ...mockState.profile, isAdmin: true }
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Contentcontrole' })).toHaveAttribute('href', '/admin/content-review')
    expect(screen.getByRole('link', { name: 'Secties' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Oefeningen' })).toBeInTheDocument()
  })

  it('shows the streak + goal glance from the engagement read, linking to Home', async () => {
    renderSidebar()

    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument())
    expect(screen.getByText(/doel ✓/)).toBeInTheDocument()
  })

  it('keeps the glance hidden when the engagement read fails (decorative surface)', async () => {
    mockPracticeTime.mockRejectedValue(new Error('offline'))
    renderSidebar()

    await waitFor(() => expect(mockPracticeTime).toHaveBeenCalled())
    expect(screen.queryByText(/doel/)).not.toBeInTheDocument()
    // the rail itself still renders
    expect(screen.getByText('Kamoe Bisa')).toBeInTheDocument()
  })
})
