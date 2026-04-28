import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { useAuthStore } from '@/stores/authStore'
import type { ReactElement } from 'react'

vi.mock('@/lib/supabase')

function renderWithProviders(ui: ReactElement) {
  return render(
    <MemoryRouter>
      <MantineProvider>{ui}</MantineProvider>
    </MemoryRouter>
  )
}

describe('DesignLab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders headline when admin', async () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'admin@test.com' } as never,
      profile: { id: 'u1', email: 'admin@test.com', fullName: 'Admin', language: 'nl', isAdmin: true } as never,
      loading: false,
    } as never)
    const { DesignLab } = await import('@/pages/admin/DesignLab')
    renderWithProviders(<DesignLab />)
    expect(await screen.findByRole('heading', { name: /design lab/i, level: 1 })).toBeInTheDocument()
  }, 10000)

  it('redirects when non-admin', async () => {
    useAuthStore.setState({
      user: { id: 'u2', email: 'user@test.com' } as never,
      profile: { id: 'u2', email: 'user@test.com', fullName: 'User', language: 'nl', isAdmin: false } as never,
      loading: false,
    } as never)
    const { DesignLab } = await import('@/pages/admin/DesignLab')
    renderWithProviders(<DesignLab />)
    expect(screen.queryByRole('heading', { name: /design lab/i, level: 1 })).not.toBeInTheDocument()
  })

  it('shows loader while auth is initializing', async () => {
    useAuthStore.setState({
      user: null as never,
      profile: null as never,
      loading: true,
    } as never)
    const { DesignLab } = await import('@/pages/admin/DesignLab')
    renderWithProviders(<DesignLab />)
    expect(screen.queryByRole('heading', { name: /design lab/i, level: 1 })).not.toBeInTheDocument()
  })
})
