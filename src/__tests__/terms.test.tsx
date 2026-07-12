// src/__tests__/terms.test.tsx
//
// /terms (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3.4).
// Mirrors privacy.test.tsx: public, pre-auth-reachable, no useT()/profile
// dependency, NL default with an EN toggle. Every section is explicitly
// PLACEHOLDER copy — the owner supplies final legal text later.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import { Terms } from '@/pages/Terms'
import { nl, en } from '@/lib/i18n'

function renderTerms() {
  return render(
    <MantineProvider>
      <Terms />
    </MantineProvider>,
  )
}

describe('Terms page', () => {
  it('renders without auth, with NL copy shown by default, and a visible placeholder notice', () => {
    renderTerms()
    expect(screen.getByRole('heading', { name: nl.terms.title, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(nl.terms.placeholderNotice)).toBeInTheDocument()
    expect(screen.getByText(nl.terms.section1Body)).toBeInTheDocument()
  })

  it('toggling the SegmentedControl to EN swaps the copy', async () => {
    const user = userEvent.setup()
    renderTerms()

    await user.click(screen.getByText(en.terms.languageEn))

    expect(screen.getByRole('heading', { name: en.terms.title, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(en.terms.placeholderNotice)).toBeInTheDocument()
    expect(screen.queryByText(nl.terms.section1Body)).not.toBeInTheDocument()
  })
})
