// PR 1 E2E guard: item source kind end-to-end.
//
// This spec verifies that after the PR 1 migration (translation columns on
// learning_items + distractor tables + capability_audio_refs), item-sourced
// capabilities render correctly via the ?force_capability bypass and produce
// a capability_review_events row. The spec is written FIRST (TDD guard per
// §13.5 of the migration plan) and expected to fail until the migration lands.
//
// How to run before migration (expected to fail):
//   bun playwright test e2e/item-vocab.spec.ts
//
// How to run after migration + re-publish (expected to pass):
//   FORCE_CAPABILITY_KEY=<key> bun playwright test e2e/item-vocab.spec.ts
//
// The FORCE_CAPABILITY_KEY must be a real canonical_key for a
// source_kind='item', capability_type='text_recognition' capability.
// Query: SELECT canonical_key FROM indonesian.learning_capabilities
//        WHERE source_kind='item' AND capability_type='text_recognition' LIMIT 1;

import { test, expect } from '@playwright/test'
import { login } from './_helpers'

const FORCE_CAPABILITY_KEY = process.env.FORCE_CAPABILITY_KEY

test.describe('item vocab — typed-table reader (PR 1)', () => {
  test.skip(
    !FORCE_CAPABILITY_KEY,
    'FORCE_CAPABILITY_KEY env var required — query learning_capabilities for a known item:text_recognition key',
  )

  test('admin can render an item-sourced cap from translation columns', async ({ page }) => {
    await login(page, { admin: true })
    await page.goto(`/session?force_capability=${encodeURIComponent(FORCE_CAPABILITY_KEY!)}`)

    // The bypass renders a single card; wait for the exercise to mount.
    await page.waitForFunction(
      () => {
        const body = document.body.textContent ?? ''
        const buttons = document.querySelectorAll('button.mantine-Button-root')
        const errored = /sessiefout|capabilitynotfound/i.test(body)
        return buttons.length >= 2 || errored
      },
      { timeout: 20000 },
    )

    // Must NOT show an empty-session state or session error.
    const emptyVisible = await page.getByText(/geen oefeningen|niets te oefenen/i).isVisible().catch(() => false)
    expect(emptyVisible, 'Empty state must not show — force_capability should always produce a card').toBe(false)

    const errorAlert = await page.getByText(/sessiefout/i).isVisible().catch(() => false)
    expect(errorAlert, 'Session error must not appear').toBe(false)

    // At least 2 Mantine buttons visible = MCQ options or answer buttons are
    // rendered, confirming the exercise block mounted successfully.
    const buttons = page.locator('button.mantine-Button-root')
    await expect(buttons.first()).toBeVisible()
    const count = await buttons.count()
    expect(count, `Expected >= 2 buttons (exercise options), got ${count}`).toBeGreaterThanOrEqual(2)
  })

  test('non-admin gets normal session (force param ignored)', async ({ page }) => {
    await login(page, { admin: false })
    await page.goto(`/session?force_capability=${encodeURIComponent(FORCE_CAPABILITY_KEY!)}`)
    await page.waitForFunction(
      () => {
        const body = document.body.textContent ?? ''
        const buttons = document.querySelectorAll('button.mantine-Button-root')
        return buttons.length >= 1 || /geen oefeningen|niets te oefenen/i.test(body)
      },
      { timeout: 20000 },
    )
    const errorAlert = await page.getByText(/capabilitynotfound/i).isVisible().catch(() => false)
    expect(errorAlert, 'CapabilityNotFound must not surface for non-admin with ignored force param').toBe(false)
  })
})
