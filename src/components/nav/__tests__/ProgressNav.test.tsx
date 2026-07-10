// src/components/nav/__tests__/ProgressNav.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import { ProgressNav } from '../ProgressNav'

function renderNav(initialEntry: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ProgressNav />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('ProgressNav', () => {
  it('renders all four topics linking to their own ?tab= on the same /progress route', () => {
    renderNav('/progress?tab=woorden')

    expect(screen.getByRole('link', { name: /Woordenschat/ })).toHaveAttribute('href', '/progress?tab=woorden')
    expect(screen.getByRole('link', { name: /Grammatica/ })).toHaveAttribute('href', '/progress?tab=grammar')
    expect(screen.getByRole('link', { name: /Morfologie/ })).toHaveAttribute('href', '/progress?tab=morfologie')
    expect(screen.getByRole('link', { name: /Tijd/ })).toHaveAttribute('href', '/progress?tab=time')
  })

  it('marks the active item from the ?tab= search param, not the pathname', () => {
    renderNav('/progress?tab=grammar')
    expect(screen.getByRole('link', { name: /Grammatica/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Woordenschat/ })).not.toHaveAttribute('aria-current')
  })

  it('defaults the active item to Woordenschat when there is no ?tab= (desktop landing)', () => {
    renderNav('/progress')
    expect(screen.getByRole('link', { name: /Woordenschat/ })).toHaveAttribute('aria-current', 'page')
  })

  it('renders a back-to-Voortgang link', () => {
    renderNav('/progress?tab=time')
    expect(screen.getByRole('link', { name: /Voortgang/ })).toHaveAttribute('href', '/progress')
  })
})
