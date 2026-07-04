// src/__tests__/Ontdek.test.tsx
//
// Desktop program slice 4: the Discover hub's two entries became featured
// showcase cards. The page's behavior contract is small and must survive the
// visual rebuild: both destinations link out correctly, and visiting the page
// still sets the first-run checklist step-③ flag (slice 3 relies on it).

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Ontdek } from '@/pages/Ontdek'
import { ONTDEK_VISITED_KEY } from '@/lib/firstRun'

vi.mock('@/stores/authStore', () => {
  const state = { profile: { language: 'nl' } }
  const useAuthStore: any = (selector?: (s: any) => any) => (selector ? selector(state) : state)
  useAuthStore.getState = () => state
  return { useAuthStore }
})

function renderOntdek() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/ontdek']}>
        <Ontdek />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('Ontdek', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the two discover entries linking to podcasts and the story reader', () => {
    renderOntdek()

    expect(screen.getByRole('link', { name: /Podcasts/ })).toHaveAttribute('href', '/podcasts')
    expect(screen.getByRole('link', { name: /Verhalen lezen/ })).toHaveAttribute('href', '/lezen')
  })

  it('marks the first-run checklist step ③ on visit', () => {
    expect(localStorage.getItem(ONTDEK_VISITED_KEY)).toBeNull()
    renderOntdek()
    expect(localStorage.getItem(ONTDEK_VISITED_KEY)).toBe('true')
  })
})
