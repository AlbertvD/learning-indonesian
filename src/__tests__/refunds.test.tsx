// src/__tests__/refunds.test.tsx
//
// /refunds (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3.4).
// Mirrors terms.test.tsx / privacy.test.tsx. The EU 14-day withdrawal
// disclosure (section 3) must be present — its heading is load-bearing even
// though the body is still placeholder copy.

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
  it('renders without auth, with NL copy shown by default, and a visible placeholder notice', () => {
    renderRefunds()
    expect(screen.getByRole('heading', { name: nl.refunds.title, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(nl.refunds.placeholderNotice)).toBeInTheDocument()
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
