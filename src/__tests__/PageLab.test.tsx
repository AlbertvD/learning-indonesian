import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { useAuthStore } from '@/stores/authStore'
import { PageLab } from '@/pages/admin/PageLab'

vi.mock('@/lib/supabase')

function renderPageLab() {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <PageLab />
      </MantineProvider>
    </MemoryRouter>,
  )
}

describe('PageLab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: { id: 'u1', email: 'admin@test.com' } as never,
      profile: { id: 'u1', email: 'admin@test.com', fullName: 'Admin', language: 'nl', isAdmin: true } as never,
      loading: false,
    } as never)
  })

  it('does not link visual examples to the retired practice route', () => {
    renderPageLab()

    const links = screen.getAllByRole('link')
    expect(links.map(link => link.getAttribute('href'))).not.toContain('/practice?mode=weak')
  })
})
