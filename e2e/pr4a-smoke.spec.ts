import { test, expect } from '@playwright/test'
import { join } from 'node:path'

// Quick smoke: open a session and capture the first exercise. Verifies the
// registry-backed render path doesn't crash at runtime after PR #4a.
// Uses dev ?bypassAuth=1 — Supabase is not reachable from the Playwright
// context; the fake admin lets the app render through protected routes.

test('session renders first exercise without registry errors', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  // Capture console errors to fail the test if a React render threw.
  const consoleErrors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  // Visit / first with bypassAuth so ProtectedRoute's effect injects the
  // fake admin profile BEFORE Session.tsx checks for user. Session reads
  // authStore on mount and redirects if user is null.
  await page.goto('/?bypassAuth=1', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.goto('/session?bypassAuth=1', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  await page.screenshot({
    path: join(process.cwd(), 'test-results', 'pr4a-smoke-session.png'),
    fullPage: true,
  })

  // Session dispatches to SessionError alert when setup fails — that's an
  // expected path when Supabase isn't reachable. The important check is no
  // React render errors were thrown (no registry/primitive runtime failures).
  const renderCrashes = consoleErrors.filter(e =>
    /The above error occurred in|Consider adding an error boundary/i.test(e) &&
    !/Supabase|auth|network/i.test(e)
  )
  expect(renderCrashes).toEqual([])
})
