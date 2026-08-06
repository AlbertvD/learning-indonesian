// src/__tests__/refunds.test.tsx
//
// /restitutie (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3.4).
// Mirrors terms.test.tsx / privacy.test.tsx. The EU 14-day withdrawal
// disclosure (section 3) must be present — its heading is load-bearing.
//
// Since 2026-08-03 this is real approved copy, not placeholders, so the
// assertions pin the facts an EU trader must actually surface before purchase
// (contact address, the withdrawal disclosure) rather than merely that some
// text rendered.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import { Refunds } from '@/pages/Refunds'
import { nl, en } from '@/lib/i18n'

function renderRefunds() {
  return render(
    <MantineProvider>
      <Refunds />
    </MantineProvider>,
  )
}

describe('Refunds page', () => {
  it('renders without auth, with NL copy shown by default', () => {
    renderRefunds()
    expect(screen.getByRole('heading', { name: nl.refunds.title, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(nl.refunds.section1Body)).toBeInTheDocument()
  })

  it('carries no placeholder copy and names a contact address', () => {
    renderRefunds()
    // An EU trader must give a contact address before purchase, and the page
    // shipped with `<<USER TO FILL>>` in it for three weeks. Assert the fact,
    // not the absence of an alert component.
    expect(screen.getByText(/support@kamoebisa\.nl/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/PLACEHOLDER|USER TO FILL/i)
  })

  it('discloses the EU 14-day withdrawal right', () => {
    renderRefunds()
    expect(screen.getByText(nl.refunds.section3Title)).toBeInTheDocument()
    expect(screen.getByText(nl.refunds.section3Body)).toBeInTheDocument()
  })

  it('toggling the SegmentedControl to EN swaps the copy', async () => {
    const user = userEvent.setup()
    renderRefunds()

    await user.click(screen.getByText(en.refunds.languageEn))

    expect(screen.getByRole('heading', { name: en.refunds.title, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(en.refunds.section3Title)).toBeInTheDocument()
    expect(screen.queryByText(nl.refunds.section3Title)).not.toBeInTheDocument()
  })
})
