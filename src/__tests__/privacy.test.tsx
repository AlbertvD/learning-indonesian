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

  it('keeps the <<USER TO FILL>> contact placeholders verbatim (spec-mandated, not launch-ready copy)', () => {
    renderPrivacy()
    const placeholders = screen.getAllByText(/<<USER TO FILL>>/)
    expect(placeholders.length).toBeGreaterThanOrEqual(2)
  })
})
