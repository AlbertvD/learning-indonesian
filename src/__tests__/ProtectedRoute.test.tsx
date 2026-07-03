// src/__tests__/ProtectedRoute.test.tsx
//
// CRIT-1 fix (2026-07-02 UX audit): ProtectedRoute used to bounce every
// logged-out visit to the homelab SSO (`https://auth.duin.home/login`), a
// login form that structurally cannot authenticate a paying customer's own
// email. It must stay inside the app via a declarative <Navigate> — since the
// desktop program's slice 1, to the public landing page at `/` — carrying a
// `next` param the landing page forwards to /login so the learner still lands
// back where they were headed.

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProtectedRoute } from '@/components/ProtectedRoute'

const mockState = vi.hoisted(() => ({ user: null as any, loading: false }))

vi.mock('@/stores/authStore', () => {
  const useAuthStore: any = vi.fn((selector?: (s: any) => any) =>
    selector ? selector(mockState) : mockState,
  )
  useAuthStore.setState = vi.fn()
  return { useAuthStore }
})

// Renders the in-app location it lands on so tests can assert both "we
// stayed inside the app" and the `next` return-to param, without depending
// on Landing.tsx internals or touching window.location (jsdom's window.location
// is not safely mockable across environments).
function LandingProbe() {
  const location = useLocation()
  return <div data-testid="landing-probe">{location.pathname}{location.search}</div>
}

function renderAt(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<LandingProbe />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.user = null
    mockState.loading = false
  })

  it('sends a logged-out visitor to the public landing page (not the homelab SSO), preserving where they were headed', () => {
    renderAt('/dashboard?tab=woordenlijsten')

    const probe = screen.getByTestId('landing-probe')
    expect(probe.textContent).toMatch(/^\/\?next=/)
    expect(probe.textContent).toContain(encodeURIComponent('/dashboard?tab=woordenlijsten'))
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('lets a logged-in user through to the protected content', () => {
    mockState.user = { id: 'user-1', email: 'learner@example.test' }
    renderAt('/dashboard')

    expect(screen.getByText('Protected content')).toBeInTheDocument()
    expect(screen.queryByTestId('landing-probe')).not.toBeInTheDocument()
  })

  it('shows a loader instead of redirecting while auth state is still resolving', () => {
    mockState.loading = true
    renderAt('/dashboard')

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('landing-probe')).not.toBeInTheDocument()
  })
})
