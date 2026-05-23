// PR 3 E2E guard: affixed_form_pair source kind end-to-end.
//
// Verifies that after the PR 3 migration (typed `affixed_form_pairs` table)
// affixed_form_pair caps render via the ?force_capability bypass. TDD guard:
// the new reader (byKind/affixedFormPair.ts) uses a fail-loud query against the
// typed table, so this spec only passes once the bridge + re-publish populate
// `affixed_form_pairs` — against the empty typed table it surfaces the
// `affixed_form_pair_typed_row_missing` diagnostic.
//
// How to run before bridge/re-publish (expected to fail):
//   bun playwright test e2e/affixed-form-pair.spec.ts
//
// How to run after bridge + re-publish (expected to pass):
//   FORCE_AFFIXED_CAPABILITY_KEY=<key> bun playwright test e2e/affixed-form-pair.spec.ts
//
// The key must be a real canonical_key for a source_kind='affixed_form_pair'
// cap (L9 is currently the only lesson with morphology caps):
//   SELECT canonical_key FROM indonesian.learning_capabilities
//   WHERE source_kind='affixed_form_pair' LIMIT 1;
//
// Default below is the L9 meN-baca→membaca recall cap (root_to_derived):
// the prompt is "Form the meN- form of: baca", the answer is "membaca".

import { test, expect } from '@playwright/test'
import { login } from './_helpers'

const FORCE_AFFIXED_CAPABILITY_KEY =
  process.env.FORCE_AFFIXED_CAPABILITY_KEY ??
  'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recall:root_to_derived:text:none'

// Same pattern as e2e/dialogue-line.spec.ts (PR 2): admin login uses the
// homelab admin account (per _helpers.ts) and the ?force_capability bypass only
// works for admins (gated in src/lib/session-builder/builder.ts).
// Locally: `export ADMIN_PASSWORD=...`; in CI: gated secret.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

test.describe('affixed_form_pair — typed-table reader (PR 3)', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env var required — the ?force_capability bypass only works for admins')

  test('admin can render an affixed_form_pair cap from the typed table', async ({ page }) => {
    await login(page, { admin: true })
    await page.goto(`/session?force_capability=${encodeURIComponent(FORCE_AFFIXED_CAPABILITY_KEY)}`)

    // The bypass renders a single card; the typed_recall packager produces a
    // typed-input field, so we wait for an input or buttons to appear.
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

    // A typed_recall morphology exercise renders an input (the form to type in).
    const textInputs = page.locator('input[type="text"]')
    await expect(textInputs.first()).toBeVisible({ timeout: 10000 })
  })
})
