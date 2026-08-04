// src/__tests__/privacy.test.tsx
//
// /privacy (docs/plans/2026-07-02-gdpr-erasure-retention.md §4). Public,
// pre-auth-reachable route — no ProtectedRoute, no useT()/profile
// dependency. NL is the default language; a local SegmentedControl toggles
// to EN. The erasure section must describe the self-serve Profile path and
// must NOT promise an in-app export button (§4.3 item 6 — export is an
// explicit non-goal here).

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { describe, it, expect } from 'vitest'
import { Privacy } from '@/pages/Privacy'
import { nl, en } from '@/lib/i18n'

function renderPrivacy() {
  return render(
    <MantineProvider>
      <Privacy />
    </MantineProvider>,
  )
}

describe('Privacy page', () => {
  it('renders without auth, with NL copy shown by default', () => {
    renderPrivacy()
    expect(screen.getByRole('heading', { name: nl.privacy.title, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(nl.privacy.section1Body)).toBeInTheDocument()
  })

  it('toggling the SegmentedControl to EN swaps the copy', async () => {
    const user = userEvent.setup()
    renderPrivacy()

    await user.click(screen.getByText(en.privacy.languageEn))

    expect(screen.getByRole('heading', { name: en.privacy.title, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(en.privacy.section1Body)).toBeInTheDocument()
    expect(screen.queryByText(nl.privacy.section1Body)).not.toBeInTheDocument()
  })

  it('the erasure section links the self-serve Profile path and does NOT promise an in-app export button', () => {
    renderPrivacy()
    expect(screen.getByText(nl.privacy.section6ErasureBody)).toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.textContent === nl.privacy.section6ErasureBody)).toHaveTextContent('Profiel')
    // Explicit non-goal (spec §4.3 item 6): no export-button promise anywhere on the page.
    expect(document.body.textContent).not.toMatch(/export.*(knop|button)/i)
  })

  // Inverted 2026-08-04. This test used to ASSERT the <<USER TO FILL>>
  // placeholders were still present — correct while the app was pre-launch and
  // homelab-only, actively harmful once /privacy was publicly served and
  // linkable from Stripe Checkout. It survived the paywall work because nobody
  // re-read what it was pinning; the placeholders shipped to production and sat
  // there. Now it pins the opposite.
  it('identifies the controller and carries no placeholder contact', () => {
    renderPrivacy()
    expect(document.body.textContent).not.toMatch(/USER TO FILL|PLACEHOLDER/i)
    expect(screen.getAllByText(/support@kamoebisa\.nl/).length).toBeGreaterThanOrEqual(1)
    // GDPR art. 13(1)(a): the controller must be IDENTIFIED, not described as
    // "the developer". KVK number is the identification that makes it checkable.
    expect(screen.getAllByText(/88627950/).length).toBeGreaterThanOrEqual(1)
  })

  // The sub-processor list was factually FALSE in production: it claimed there
  // were none beyond self-hosted infrastructure, written when the homelab was
  // the only target and left untouched through the entire cloud migration. A
  // definite false statement is worse than an obvious gap, so pin the four that
  // actually process data — a fifth one added without updating this list should
  // break a test, not quietly mislead a reader.
  it('names the real sub-processors rather than claiming there are none', () => {
    renderPrivacy()
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/geen sub-verwerkers|no sub-processors/i)
    for (const processor of ['Supabase', 'Cloudflare', 'Resend', 'Stripe']) {
      expect(body).toContain(processor)
    }
  })
})
