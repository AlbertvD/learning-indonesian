// src/__tests__/AdminGuard.test.tsx
//
// 2026-07-11 prod-ready audit (LOW #20, "ADMIN ROUTE GATING"): App.tsx now
// wraps the five admin-only routes (SectionCoverage, ExerciseCoverage,
// ContentReview, DesignLab, PageLab) in <AdminGuard> at the route level, in
// addition to each page's own internal wrap — defense in depth so a
// non-admin never even mounts the page component. This locks in the gating
// behaviour that fix depends on; AdminGuard itself previously had no direct
// test coverage (only exercised indirectly via each page's internal wrap).

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminGuard } from '@/pages/admin/AdminGuard'

const mockState = vi.hoisted(() => ({ profile: null as any, loading: false }))

vi.mock('@/stores/authStore', () => {
  const useAuthStore: any = vi.fn((selector?: (s: any) => any) =>
    selector ? selector(mockState) : mockState,
  )
  useAuthStore.setState = vi.fn()
  return { useAuthStore }
})

function HomeProbe() {
  const location = useLocation()
  return <div data-testid="home-probe">{location.pathname}</div>
}

function renderAt(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/admin/content-review"
            element={
              <AdminGuard>
                <div>Admin content</div>
              </AdminGuard>
            }
          />
          <Route path="/" element={<HomeProbe />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('AdminGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.profile = null
    mockState.loading = false
  })

  it('redirects a signed-in non-admin away from the route', () => {
    mockState.profile = { id: 'user-1', isAdmin: false }
    renderAt('/admin/content-review')

    expect(screen.getByTestId('home-probe')).toBeInTheDocument()
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument()
  })

  it('redirects a signed-out visitor (no profile) away from the route', () => {
    mockState.profile = null
    renderAt('/admin/content-review')

    expect(screen.getByTestId('home-probe')).toBeInTheDocument()
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument()
  })

  it('lets an admin through to the route content', () => {
    mockState.profile = { id: 'admin-1', isAdmin: true }
    renderAt('/admin/content-review')

    expect(screen.getByText('Admin content')).toBeInTheDocument()
    expect(screen.queryByTestId('home-probe')).not.toBeInTheDocument()
  })

  it('shows a loader instead of redirecting while auth state is still resolving', () => {
    mockState.loading = true
    renderAt('/admin/content-review')

    expect(screen.queryByText('Admin content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-probe')).not.toBeInTheDocument()
  })
})
