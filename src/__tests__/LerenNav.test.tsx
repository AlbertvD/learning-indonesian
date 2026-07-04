// LerenNav — the persistent desktop switcher for the four Leren surfaces.
// The one piece of logic worth pinning is active-surface derivation from the
// location (pathname + ?v=), plus that all four surfaces are reachable links.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import { LerenNav } from '@/components/lessons/LerenNav'

function renderAt(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <LerenNav />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('LerenNav', () => {
  it('links every surface to its addressable destination', () => {
    renderAt('/leren')
    expect(screen.getByRole('link', { name: /Lessen/ })).toHaveAttribute('href', '/leren')
    expect(screen.getByRole('link', { name: /Affix/ })).toHaveAttribute('href', '/morphology')
    expect(screen.getByRole('link', { name: /Uitspraak/ })).toHaveAttribute('href', '/pronunciation')
    // Woordenlijsten is a ?v= sub-view of /leren, not its own route.
    const woorden = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/leren?v=woorden')
    expect(woorden).toBeDefined()
  })

  it('marks Lessen active on bare /leren', () => {
    renderAt('/leren')
    expect(screen.getByRole('link', { name: /Lessen/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Affix/ })).not.toHaveAttribute('aria-current')
  })

  it('marks Woordenlijsten active on /leren?v=woorden', () => {
    renderAt('/leren?v=woorden')
    const woorden = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/leren?v=woorden')
    expect(woorden).toHaveAttribute('aria-current', 'page')
  })

  it('marks the Affix trainer active on /morphology (incl. an ?affix= deep link)', () => {
    renderAt('/morphology?affix=meN')
    expect(screen.getByRole('link', { name: /Affix/ })).toHaveAttribute('aria-current', 'page')
  })

  it('marks the Uitspraak trainer active on /pronunciation', () => {
    renderAt('/pronunciation')
    expect(screen.getByRole('link', { name: /Uitspraak/ })).toHaveAttribute('aria-current', 'page')
  })
})
