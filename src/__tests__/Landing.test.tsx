// src/__tests__/Landing.test.tsx
//
// Desktop program slice 1: `/` is the public marketing landing page for
// logged-out visitors and Home (Dashboard) for authenticated users. The
// route gate lives in App.tsx; the landing page itself must forward the
// `?next=` return-to param (attached by ProtectedRoute) to /login, and offer
// NL/EN copy without a profile to read the language from.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Landing } from '@/pages/Landing'
import App from '@/App'

const mockState = vi.hoisted(() => ({
  user: null as any,
  profile: null as any,
  loading: false,
}))

vi.mock('@/stores/authStore', () => {
  const useAuthStore: any = vi.fn((selector?: (s: any) => any) =>
    selector ? selector(mockState) : mockState,
  )
  useAuthStore.setState = vi.fn()
  useAuthStore.getState = vi.fn(() => mockState)
  return { useAuthStore }
})

// The App-level tests only verify the `/` route gate — stub out the heavy
// surfaces on both sides of it.
vi.mock('@/pages/Dashboard', () => ({ Dashboard: () => <div>dashboard-stub</div> }))
vi.mock('@/components/Layout', () => ({ Layout: () => <div>layout-stub<Outlet /></div> }))
vi.mock('@/components/PwaUpdatePrompt', () => ({ PwaUpdatePrompt: () => null }))

function renderLanding(initialEntry = '/') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Landing />
      </MemoryRouter>
    </MantineProvider>,
  )
}

function renderApp(initialEntry = '/') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('Landing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockState.user = null
    mockState.profile = null
    mockState.loading = false
  })

  it('renders the invite-first marketing page with register CTAs and a plain /login link', () => {
    renderLanding()

    expect(screen.getByText(/Leer Indonesisch dat/)).toBeInTheDocument()
    const registerCtas = screen.getAllByRole('link', { name: 'Ik heb een uitnodigingscode' })
    expect(registerCtas.length).toBeGreaterThanOrEqual(2)
    registerCtas.forEach(cta => expect(cta).toHaveAttribute('href', '/register'))
    expect(screen.getByRole('link', { name: 'Inloggen' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
  })

  it('forwards a safe ?next= param to the login links (return-to-where-I-was)', () => {
    renderLanding(`/?next=${encodeURIComponent('/progress?tab=woordenschat')}`)

    expect(screen.getByRole('link', { name: 'Inloggen' })).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent('/progress?tab=woordenschat')}`,
    )
  })

  it('drops a protocol-relative ?next= param (no open redirect)', () => {
    renderLanding(`/?next=${encodeURIComponent('//evil.example.com')}`)

    expect(screen.getByRole('link', { name: 'Inloggen' })).toHaveAttribute('href', '/login')
  })

  it('switches copy to English and persists the choice for the next visit', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByText(/Learn Indonesian that/)).toBeInTheDocument()
    expect(localStorage.getItem('landing-lang')).toBe('en')
  })
})

describe('App route gate at /', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockState.user = null
    mockState.profile = null
    mockState.loading = false
  })

  it('renders the landing page for a logged-out visitor', async () => {
    renderApp('/')

    expect(await screen.findByText(/Leer Indonesisch dat/)).toBeInTheDocument()
    expect(screen.queryByText('dashboard-stub')).not.toBeInTheDocument()
  })

  it('renders Home for an authenticated user', async () => {
    mockState.user = { id: 'user-1', email: 'learner@example.test' }
    renderApp('/')

    expect(await screen.findByText('dashboard-stub')).toBeInTheDocument()
    expect(screen.queryByText(/Leer Indonesisch dat/)).not.toBeInTheDocument()
  })

  it('never flashes the landing page while auth state is still resolving', () => {
    mockState.loading = true
    renderApp('/')

    expect(screen.queryByText(/Leer Indonesisch dat/)).not.toBeInTheDocument()
    expect(screen.queryByText('dashboard-stub')).not.toBeInTheDocument()
  })
})
