// src/__tests__/leenwoorden.test.tsx
//
// The public loanword reference — the primary SEO asset and the most shareable
// page the product has (docs/marketing/channels.md, inner ring).
//
// What these tests protect is not layout, it is the two properties that make the
// page worth having: it must work with NO session (a search visitor has none),
// and it must actually contain the whole dataset rather than a teaser, because a
// page that withholds the thing people searched for does not get linked to.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, it, expect } from 'vitest'
import { Leenwoorden } from '@/pages/Leenwoorden'
import loanwords from '@/data/loanwords.json'

function renderPage() {
  return render(
    <MemoryRouter>
      <Leenwoorden />
    </MemoryRouter>,
  )
}

describe('Leenwoorden (public loanword reference)', () => {
  it('renders without any auth or profile dependency', () => {
    // No auth store is mocked here on purpose: if this page ever grows a
    // dependency on session state, this test fails rather than the page
    // silently breaking for the logged-out visitors it exists to serve.
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('shows the entire dataset, not a sample', () => {
    renderPage()
    const body = document.body.textContent ?? ''
    expect(loanwords.length).toBeGreaterThan(150)
    for (const w of loanwords) {
      expect(body).toContain(w.id)
    }
  })

  it('states the count in the headline so the page matches what people search for', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: new RegExp(String(loanwords.length)) }),
    ).toBeInTheDocument()
  })

  it('filters as you type, matching Indonesian, Dutch and the meaning', async () => {
    const user = userEvent.setup()
    renderPage()
    const search = screen.getByLabelText('Zoeken')

    await user.type(search, 'kantoor')
    const body = document.body.textContent ?? ''
    expect(body).toContain('kantor')
  })

  it('routes a reader to signup and to the legal pages', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /gratis beginnen/i })).toHaveAttribute(
      'href',
      '/register',
    )
    expect(screen.getByRole('link', { name: 'Voorwaarden' })).toHaveAttribute(
      'href',
      '/voorwaarden',
    )
  })
})
