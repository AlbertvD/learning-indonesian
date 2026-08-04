// src/__tests__/terms.test.tsx
//
// /voorwaarden (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3.4).
// Mirrors privacy.test.tsx: public, pre-auth-reachable, no useT()/profile
// dependency, NL default with an EN toggle.
//
// Real approved copy since 2026-08-03, so the assertions pin the trader
// identification an EU distance sale requires (entity, KVK, contact address)
// rather than merely that some text rendered.

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
  it('renders without auth, with NL copy shown by default', () => {
    renderTerms()
    expect(screen.getByRole('heading', { name: nl.terms.title, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(nl.terms.section1Body)).toBeInTheDocument()
  })

  it('identifies the trader and carries no placeholder copy', () => {
    renderTerms()
    // KVK appears in both §1 (the service) and §7 (contact) — getAllByText,
    // since a single-match assertion would break on that duplication alone.
    expect(screen.getAllByText(/88627950/).length).toBeGreaterThan(0)
    expect(screen.getByText(/support@kamoebisa\.nl/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/PLACEHOLDER|USER TO FILL/i)
  })

  it('toggling the SegmentedControl to EN swaps the copy', async () => {
    const user = userEvent.setup()
    renderTerms()

    await user.click(screen.getByText(en.terms.languageEn))

    expect(screen.getByRole('heading', { name: en.terms.title, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(en.terms.section1Body)).toBeInTheDocument()
    expect(screen.queryByText(nl.terms.section1Body)).not.toBeInTheDocument()
  })
})
