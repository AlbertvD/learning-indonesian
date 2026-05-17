import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { RecencyBadge } from '@/components/dashboard/RecencyBadge'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

function renderBadge(ageDays: number | null) {
  return render(
    <MantineProvider>
      <RecencyBadge ageDays={ageDays} />
    </MantineProvider>,
  )
}

describe('RecencyBadge', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'u@test.com' } as never,
      profile: { id: 'u1', email: 'u@test.com', fullName: null, language: 'nl', isAdmin: false } as never,
    })
  })

  it('renders nothing when ageDays is null', () => {
    renderBadge(null)
    expect(screen.queryByTestId('recency-badge')).not.toBeInTheDocument()
  })

  it('renders nothing when ageDays is 0 (same day)', () => {
    renderBadge(0)
    expect(screen.queryByTestId('recency-badge')).not.toBeInTheDocument()
  })

  it('renders nothing when ageDays is 1 (yesterday)', () => {
    renderBadge(1)
    expect(screen.queryByTestId('recency-badge')).not.toBeInTheDocument()
  })

  it('renders nothing when ageDays is exactly 2 (two days ago)', () => {
    renderBadge(2)
    expect(screen.queryByTestId('recency-badge')).not.toBeInTheDocument()
  })

  it('renders the badge with plural copy when ageDays is 3', () => {
    renderBadge(3)
    expect(
      screen.getByText('Je laatste sessie was 3 dagen geleden. Welkom terug.'),
    ).toBeInTheDocument()
  })

  it('renders the badge with plural copy when ageDays is 10', () => {
    renderBadge(10)
    expect(
      screen.getByText('Je laatste sessie was 10 dagen geleden. Welkom terug.'),
    ).toBeInTheDocument()
  })

  it('uses English copy when profile language is en', () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'u@test.com' } as never,
      profile: { id: 'u1', email: 'u@test.com', fullName: null, language: 'en', isAdmin: false } as never,
    })
    renderBadge(5)
    expect(
      screen.getByText('Your last session was 5 days ago. Welcome back.'),
    ).toBeInTheDocument()
  })
})
