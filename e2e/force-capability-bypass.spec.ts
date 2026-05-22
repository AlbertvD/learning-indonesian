import { test, expect } from '@playwright/test'
import { login } from './_helpers'

// Per-PR post-deploy E2E gate (plan §3.8). Drives a real session through the
// ?force_capability bypass and confirms the renderer mounts. The full DB
// round-trip verification (capability_review_events row lands) lives in
// scripts/force-capability-answer.ts which has direct psql access; this spec
// proves the UI plumbing.
//
// Requires a known canonical_key for an item:text_recognition capability.
// Read FORCE_CAPABILITY_KEY from env so the spec stays portable across deploys
// where the seeded key set may differ. CI sets this from a service-role psql
// query in the deploy pipeline.

const FORCE_CAPABILITY_KEY = process.env.FORCE_CAPABILITY_KEY

test.describe('force-capability bypass', () => {
  test.skip(
    !FORCE_CAPABILITY_KEY,
    'FORCE_CAPABILITY_KEY env var required — query learning_capabilities for a known item:text_recognition key',
  )

  test('admin can render a single-card session for a named capability', async ({ page }) => {
    await login(page, { admin: true })
    await page.goto(`/session?force_capability=${encodeURIComponent(FORCE_CAPABILITY_KEY!)}`)

    // Either the experience player mounted (option buttons appear) or an
    // explicit error state surfaced. The bypass is fail-loud — silent empty
    // session would be a regression.
    await page.waitForFunction(
      () => {
        const body = document.body.textContent ?? ''
        const buttons = document.querySelectorAll('button.mantine-Button-root')
        const errored = /sessiefout|capabilitynotfound/i.test(body)
        // Heuristic: if 2+ Mantine buttons are visible we have an MCQ-like card.
        // If an error message is visible, the test fails below.
        return buttons.length >= 2 || errored
      },
      { timeout: 20000 },
    )

    // No empty-state "Geen oefeningen" — the bypass should always produce a card
    // for a real canonical_key.
    const emptyVisible = await page.getByText(/geen oefeningen|niets te oefenen/i).isVisible().catch(() => false)
    expect(emptyVisible).toBe(false)

    // No session-error alert.
    const errorAlert = await page.getByText(/sessiefout/i).isVisible().catch(() => false)
    expect(errorAlert).toBe(false)
  })

  test('non-admin gets normal session (bypass ignored)', async ({ page }) => {
    await login(page, { admin: false })
    await page.goto(`/session?force_capability=${encodeURIComponent(FORCE_CAPABILITY_KEY!)}`)
    // Either renders normally or shows the empty-state — but never an error
    // about the forced capability since the param is ignored for non-admins.
    await page.waitForFunction(
      () => {
        const body = document.body.textContent ?? ''
        const buttons = document.querySelectorAll('button.mantine-Button-root')
        return buttons.length >= 1 || /geen oefeningen|niets te oefenen/i.test(body)
      },
      { timeout: 20000 },
    )
    const errorAlert = await page.getByText(/capabilitynotfound/i).isVisible().catch(() => false)
    expect(errorAlert).toBe(false)
  })
})
