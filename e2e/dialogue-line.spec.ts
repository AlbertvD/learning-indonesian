// PR 2 E2E guard: dialogue_line source kind end-to-end.
//
// Verifies that after the PR 2 migration (typed dialogue_clozes +
// lesson_dialogue_lines tables) dialogue_line caps render via the
// ?force_capability bypass. TDD guard: spec is written FIRST and is
// expected to fail until the reader rewrite + bridge populate the typed
// tables, since the new reader uses a fail-loud JOIN that returns nothing
// from the empty typed tables.
//
// How to run before migration (expected to fail):
//   bun playwright test e2e/dialogue-line.spec.ts
//
// How to run after migration + bridge + re-publish (expected to pass):
//   FORCE_DIALOGUE_CAPABILITY_KEY=<key> bun playwright test e2e/dialogue-line.spec.ts
//
// The key must be a real canonical_key for a source_kind='dialogue_line'
// cap. Query (L9 is currently the only lesson with dialogue_line caps):
//   SELECT canonical_key FROM indonesian.learning_capabilities
//   WHERE source_kind='dialogue_line' LIMIT 1;
//
// Default below is the first L9 dialogue cloze the planning baseline used.

import { test, expect } from '@playwright/test'
import { login } from './_helpers'

const FORCE_DIALOGUE_CAPABILITY_KEY =
  process.env.FORCE_DIALOGUE_CAPABILITY_KEY ??
  'cap:v1:dialogue_line:lesson-9/section-1/line-10:contextual_cloze:id_to_l1:text:none'

// Same pattern as e2e/item-vocab.spec.ts (PR 1): admin login uses the
// homelab admin account (per _helpers.ts:42-45) and the ?force_capability
// bypass only works for admins (gated in src/lib/session-builder/builder.ts).
// Locally: `export ADMIN_PASSWORD=...`; in CI: gated secret.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

test.describe('dialogue_line — typed-table reader (PR 2)', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env var required — the ?force_capability bypass only works for admins')

  test('admin can render a dialogue_line cap from the typed tables', async ({ page }) => {
    await login(page, { admin: true })
    await page.goto(`/session?force_capability=${encodeURIComponent(FORCE_DIALOGUE_CAPABILITY_KEY)}`)

    // The bypass renders a single card; the dialogue cloze packager produces
    // a typed-input field, so we wait for an input or buttons to appear.
    await page.waitForFunction(
      () => {
        const body = document.body.textContent ?? ''
        const inputs = document.querySelectorAll('input[type="text"]')
        const buttons = document.querySelectorAll('button.mantine-Button-root')
        const errored = /sessiefout|capabilitynotfound/i.test(body)
        return inputs.length >= 1 || buttons.length >= 1 || errored
      },
      { timeout: 20000 },
    )

    // Must NOT show empty-session state or session error.
    const emptyVisible = await page.getByText(/geen oefeningen|niets te oefenen/i).isVisible().catch(() => false)
    expect(emptyVisible, 'Empty state must not show — force_capability should always produce a card').toBe(false)

    const errorAlert = await page.getByText(/sessiefout/i).isVisible().catch(() => false)
    expect(errorAlert, 'Session error must not appear').toBe(false)

    // A typed-cloze exercise renders an input (the blank to type in).
    const textInputs = page.locator('input[type="text"]')
    await expect(textInputs.first()).toBeVisible({ timeout: 10000 })
  })
})
