// src/__tests__/Ontdek.test.tsx
//
// The Discover hub's two entries are the shared hub card (ListCard `feature`).
// The page's behavior contract is small and must survive the visual rebuild:
// both destinations link out correctly, and visiting the page still sets the
// first-run checklist step-③ flag (slice 3 relies on it).
//
// The two-card hub is the MOBILE landing; on desktop the page lands on its first
// surface (Podcasts) with the persistent switcher instead. We pin useMediaQuery
// to mobile so this exercises the hub itself.

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

// Pin the viewport to mobile so <Ontdek/> renders the two-card hub (its mobile
// landing) rather than delegating to <Podcasts/> on desktop.
vi.mock('@mantine/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/hooks')>()
  return { ...actual, useMediaQuery: () => true }
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
