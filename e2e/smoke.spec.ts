import { test, expect, type Page } from '@playwright/test'
import { login } from './_helpers'

// Follow-up C (pre-cloud-hardening, epic item "browser e2e smoke test"): one
// deterministic browser e2e test proving the full
// login → session-build → answer → commit chain works against a real dev
// server or preview deploy. This app has 2291+ vitest tests and zero browser
// e2e as of this writing — the historical bug classes here are
// integration-shaped (sessions built with unrenderable cards, RPC commit
// failures masked by optimistic UI) which a mocked Supabase client cannot
// catch. See scripts/e2e/README.md for the one-time owner setup (dedicated
// test account, admin grant, capability key selection, env vars).
//
// Uses the admin-only ?force_capability=<canonical_key> dev bypass
// (src/pages/Session.tsx ~line 71-79) to build a deterministic single-card
// session through the real renderer + real commit path — the only thing
// skipped is the session planner.

const E2E_EMAIL = process.env.E2E_EMAIL
const E2E_PASSWORD = process.env.E2E_PASSWORD
const E2E_CAPABILITY_KEY = process.env.E2E_CAPABILITY_KEY
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL

// Bounded so this never loops forever. Options cycle deterministically
// through index (attempt % optionCount) — see the note on the redrill
// mechanic below — so MAX_ANSWER_ATTEMPTS only needs to exceed the largest
// MCQ option count in the app (small, single digits) plus slack.
const MAX_ANSWER_ATTEMPTS = 6

test.describe('smoke — login, force-capability session, answer, commit', () => {
  test.skip(
    !E2E_EMAIL || !E2E_PASSWORD || !E2E_CAPABILITY_KEY,
    'E2E_EMAIL / E2E_PASSWORD / E2E_CAPABILITY_KEY not set — see scripts/e2e/README.md to configure a dedicated test account',
  )

  test('login, build a forced-capability session, answer, and verify the review commit', async ({ page }) => {
    // ── a. Login → dashboard ──────────────────────────────────────────────
    await login(page, { email: E2E_EMAIL, password: E2E_PASSWORD })
    expect(
      new URL(page.url()).pathname,
      'expected the post-login redirect to land on the dashboard ("/")',
    ).toBe('/')

    // ── b. Build a single-card session via the admin-only force_capability bypass ──
    await page.goto(`/session?force_capability=${encodeURIComponent(E2E_CAPABILITY_KEY!)}`)

    // Fail loud: either a renderable card mounts (MCQ buttons or a text
    // input) or the session surfaces its explicit error alert. A silent
    // empty session is exactly the class of regression this test exists to
    // catch (see e2e/force-capability-bypass.spec.ts for the render-only
    // precedent this extends with a real answer + commit).
    await page.waitForFunction(
      () => {
        // :not([disabled]) — the loading skeleton renders disabled placeholder
        // ExerciseOptions; only an interactive option means the card is real.
        const buttons = document.querySelectorAll('[data-testid="exercise-option"]:not([disabled])')
        const hasInput = document.querySelector('input[type="text"], input:not([type])')
        const errored = /sessiefout/i.test(document.body.textContent ?? '')
        return buttons.length >= 1 || hasInput !== null || errored
      },
      { timeout: 30000 },
    )
    await expect(page.getByText(/sessiefout/i)).not.toBeVisible()
    await expect(page.getByText(/geen oefeningen|niets te oefenen/i)).not.toBeVisible()

    // ── c/d. Answer the card and verify the commit path fires ──────────────
    // A wrong answer is fine — it commits immediately (no 1.5s processing
    // delay; see useExerciseScoring.ts correctDelayMs) and is enough to prove
    // commitCapabilityAnswerReport fires and the UI reaches its post-answer
    // state. MCQ options cycle through index (attempt % optionCount): a
    // single-card force_capability session's redrill mechanic
    // (ExperiencePlayer.tsx handleAnswerReport) re-queues a wrong answer
    // 3–6 cards ahead indefinitely until it is answered correctly, so
    // repeating the same guess would never reach recap — cycling guarantees
    // hitting the correct option within a bounded number of attempts.
    let sawAnsweredState = false
    let reachedRecap = false

    for (let attempt = 0; attempt < MAX_ANSWER_ATTEMPTS; attempt++) {
      const answered = await answerCurrentCard(page, attempt)
      if (!answered) break

      await page
        .waitForFunction(
          () =>
            !!document.querySelector('[data-testid="session-recap"]')
            || Array.from(document.querySelectorAll('button')).some(b => /doorgaan|continue/i.test(b.textContent ?? '')),
          { timeout: 10000 },
        )
        .catch(() => {})

      if (await page.getByTestId('session-recap').isVisible().catch(() => false)) {
        reachedRecap = true
        break
      }

      const doorgaanButton = page.getByRole('button', { name: /doorgaan|continue/i })
      if (await doorgaanButton.isVisible().catch(() => false)) {
        if (!sawAnsweredState) {
          // The explicit "answered state renders" assertion: this feedback
          // screen only mounts after commitCapabilityAnswerReport has
          // resolved (or thrown — logged via logError, never swallowed) for
          // the wrong answer above.
          await expect(doorgaanButton).toBeVisible()
          sawAnsweredState = true
        }
        await doorgaanButton.click()
        continue
      }
      // Neither recap nor feedback yet — the correct-answer processing delay
      // hasn't resolved, or a typed retry-eligible exercise is still gated.
      // Loop again.
    }

    // The recap can mount between a timed-out wait and the next answer attempt
    // (the loop then breaks on "no options found") — re-check before judging.
    if (!reachedRecap) {
      reachedRecap = await page.getByTestId('session-recap').isVisible().catch(() => false)
    }

    expect(
      sawAnsweredState || reachedRecap,
      'expected at least one answer to reach a post-answer state (feedback screen or recap)',
    ).toBe(true)

    // ── e. Recap / queue exhaustion ─────────────────────────────────────────
    expect(
      reachedRecap,
      `session did not reach recap within ${MAX_ANSWER_ATTEMPTS} attempts — for a deterministic smoke test, `
      + 'pick an MCQ-type capability key (see scripts/e2e/README.md); typed/dictation/speaking exercise types '
      + 'cannot be blindly guessed correct',
    ).toBe(true)

    // ── Optional DB-level commit verification ───────────────────────────────
    // Read-only PostgREST check via the service-role key (bypasses RLS) — the
    // write already happened via the app's own commit path above; that IS
    // the thing under test. Skipped with a logged notice when the service
    // key isn't configured, so this test never requires DB credentials to
    // pass — only to strengthen the assertion.
    if (!SUPABASE_SERVICE_KEY || !VITE_SUPABASE_URL) {
      console.log('[e2e] Skipping DB-level commit verification — SUPABASE_SERVICE_KEY / VITE_SUPABASE_URL not set.')
    } else {
      // The homelab API presents a Step-CA (internal) certificate that Node's
      // fetch rejects. Scope the TLS exemption to this one verification call —
      // the browser side already runs with ignoreHTTPSErrors for the same reason.
      const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
      let verified: boolean
      try {
        verified = await verifyReviewEventCommitted(VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY, E2E_EMAIL!)
      } finally {
        if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls
      }
      expect(
        verified,
        'expected a capability_review_events row for the test user created in the last 2 minutes',
      ).toBe(true)
    }
  })
})

// Answers the currently-rendered card. MCQ: clicks option index
// `attempt % optionCount` (see the redrill note above for why cycling, not a
// fixed index, is required). Typed: submits a deliberately wrong string.
// Returns false if neither MCQ options nor a text input are visible — an
// unexpected exercise type (e.g. dictation/speaking), which the caller fails
// loud on via the final `reachedRecap` assertion.
async function answerCurrentCard(page: Page, attempt: number): Promise<boolean> {
  const options = page.locator('[data-testid="exercise-option"]:not([disabled])').filter({
    hasNotText: /doorgaan|continue/i,
  })
  const optionCount = await options.count()
  if (optionCount >= 2) {
    await options.nth(attempt % optionCount).click()
    return true
  }

  const textInput = page.locator('input[type="text"]:not([disabled]), input:not([type]):not([disabled])').first()
  if (await textInput.isVisible().catch(() => false)) {
    await textInput.fill('salah-jawaban-e2e-smoke-test')
    await textInput.press('Enter')
    const submitBtn = page.getByRole('button', { name: /controleer|check|submit/i })
    if (await submitBtn.isVisible().catch(() => false)) await submitBtn.click()
    return true
  }

  return false
}

// Resolves the test user's id from profiles.display_name — set to the test
// account's email as part of the one-time owner setup in
// scripts/e2e/README.md (the app itself sets display_name from OAuth
// user_metadata.full_name, not email, so this is a deliberate test-fixture
// convention, not a production invariant) — then looks for a recent
// capability_review_events row for that user.
async function verifyReviewEventCommitted(supabaseUrl: string, serviceKey: string, email: string): Promise<boolean> {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Accept-Profile': 'indonesian',
  }

  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id&display_name=eq.${encodeURIComponent(email)}`,
    { headers },
  )
  if (!profileRes.ok) return false
  const profiles = (await profileRes.json()) as { id: string }[]
  const userId = profiles[0]?.id
  if (!userId) return false

  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const eventsRes = await fetch(
    `${supabaseUrl}/rest/v1/capability_review_events`
      + `?select=id,created_at&user_id=eq.${userId}&created_at=gte.${encodeURIComponent(cutoff)}`
      + '&order=created_at.desc&limit=1',
    { headers },
  )
  if (!eventsRes.ok) return false
  const events = (await eventsRes.json()) as { id: string }[]
  return events.length > 0
}
