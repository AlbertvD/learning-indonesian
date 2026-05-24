// PR 4 E2E guard: pattern source_kind end-to-end (first-ever live grammar
// rendering).
//
// Verifies that after the PR 4 migration (4 typed grammar-exercise tables +
// renderContracts routing widening) pattern caps render via the
// ?force_capability bypass. TDD guard: the new reader (byKind/pattern.ts) uses
// a fail-loud query against the typed tables, so these specs only pass once the
// bridge + re-publish populate them AND the caps promote to ready/published.
// Against the empty typed tables they surface `pattern_typed_row_missing`;
// before the catalog change the caps stay draft and the bypass errors.
//
// How to run before bridge/re-publish (expected to fail):
//   bun playwright test e2e/grammar-exercises.spec.ts
//
// How to run after bridge + re-publish (expected to pass):
//   ADMIN_PASSWORD=... bun playwright test e2e/grammar-exercises.spec.ts
//
// Exercise-type granularity note: the rendered exercise_type is chosen by
// resolveCandidate, not by the URL. A `pattern_contrast` cap deterministically
// renders contrast_pair (2-option MCQ). A `pattern_recognition` cap renders one
// of sentence_transformation / constrained_translation / cloze_mcq — so the
// recognition spec asserts "a grammar exercise renders" (input OR option
// buttons), not which of the three.
//
// Keys below are L1 `belum-vs-tidak` (sibling recognition + contrast caps).
// Override per env to target another pattern.

import { test, expect } from '@playwright/test'
import { login } from './_helpers'

const FORCE_CONTRAST_KEY =
  process.env.FORCE_PATTERN_CONTRAST_KEY ??
  'cap:v1:pattern:lesson-1/pattern-belum-vs-tidak:pattern_contrast:none:text:none'

const FORCE_RECOGNITION_KEY =
  process.env.FORCE_PATTERN_RECOGNITION_KEY ??
  'cap:v1:pattern:lesson-1/pattern-belum-vs-tidak:pattern_recognition:none:text:none'

// Admin login uses the homelab admin account (per _helpers.ts) and the
// ?force_capability bypass only works for admins (gated in
// src/lib/session-builder/builder.ts). Locally: `export ADMIN_PASSWORD=...`.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

async function waitForCardOrError(page: import('@playwright/test').Page) {
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
  const emptyVisible = await page.getByText(/geen oefeningen|niets te oefenen/i).isVisible().catch(() => false)
  expect(emptyVisible, 'Empty state must not show — force_capability should always produce a card').toBe(false)
  const errorAlert = await page.getByText(/sessiefout/i).isVisible().catch(() => false)
  expect(errorAlert, 'Session error must not appear').toBe(false)
}

test.describe('pattern — typed grammar-exercise readers (PR 4)', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env var required — the ?force_capability bypass only works for admins')

  test('pattern_contrast cap renders a contrast_pair (2-option MCQ) from the typed table', async ({ page }) => {
    await login(page, { admin: true })
    await page.goto(`/session?force_capability=${encodeURIComponent(FORCE_CONTRAST_KEY)}`)
    await waitForCardOrError(page)

    // contrast_pair renders two option buttons to choose between.
    const optionButtons = page.locator('button.mantine-Button-root')
    await expect(optionButtons.first()).toBeVisible({ timeout: 10000 })
  })

  test('pattern_recognition cap renders a grammar exercise from a typed table', async ({ page }) => {
    await login(page, { admin: true })
    await page.goto(`/session?force_capability=${encodeURIComponent(FORCE_RECOGNITION_KEY)}`)
    await waitForCardOrError(page)

    // recognition renders sentence_transformation / constrained_translation
    // (typed input) OR cloze_mcq (option buttons). Assert at least one appears.
    const renderable = page.locator('input[type="text"], button.mantine-Button-root')
    await expect(renderable.first()).toBeVisible({ timeout: 10000 })
  })
})
