// Drives a REAL practice session as the test user against Supabase Cloud, and
// asserts the review actually landed in indonesian.capability_review_events.
//
//   bunx vite --mode cloud --port 5174
//   E2E_BASE_URL=http://localhost:5174 E2E_EMAIL=... E2E_PASSWORD=... \
//     bunx playwright test e2e/cloud-session-fixture.spec.ts
//
// TWO jobs, deliberately in one spec:
//
//  1. It is the only end-to-end proof of the WRITE path on cloud. cloud-smoke
//     covers reads (content under RLS, signed audio) and cloud-checkout covers
//     payment, but nothing had ever exercised a learner writing their own
//     FSRS state through commit_capability_review under real authenticated-role
//     RLS on the cloud project. That is the app's single most precious write.
//
//  2. It creates the fixture HC53 needs. The cloud project was seeded with
//     content only — no learner history was migrated — so testuser had zero
//     capability_review_events and HC53 ("mastery evidence RPC parity under
//     real authenticated-role RLS") could not discriminate. Running a genuine
//     session is the honest way to produce that fixture: the rows are real
//     reviews written through the real path, not hand-inserted rows that would
//     make the health check assert against something no user ever produced.
//
// Answers are given honestly-but-arbitrarily (first option / a plausible typed
// answer). Whether they are right does not matter — a wrong answer commits a
// review just as a correct one does, and grading is not what this spec is
// pinning.
import { test, expect, type Page } from '@playwright/test'
import { login } from './_helpers'

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
const SUPABASE_URL = 'https://wodpkxsmildtgndnbraa.supabase.co'
const SERVICE_KEY = process.env.CLOUD_SUPABASE_SERVICE_KEY ?? ''

/** Review-event count for one user, read with the service key (bypasses RLS). */
async function reviewEventCount(userId: string): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/capability_review_events?select=id&user_id=eq.${userId}&limit=2000`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Accept-Profile': 'indonesian',
      },
    },
  )
  if (!res.ok) throw new Error(`count read failed: HTTP ${res.status}`)
  return ((await res.json()) as unknown[]).length
}

async function userIdFor(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!body?.user?.id) throw new Error(`could not resolve user id: ${JSON.stringify(body).slice(0, 200)}`)
  return body.user.id as string
}

/** True once the session surface has settled into either exercises or empty. */
async function sessionSettled(page: Page): Promise<boolean> {
  await page.waitForFunction(
    () => {
      const progress = document.querySelector('.mantine-Progress-root')
      const body = document.body.textContent ?? ''
      return !!progress || /geen oefeningen|no exercises|niets te oefenen/i.test(body)
    },
    { timeout: 30000 },
  )
  return (await page.locator('.mantine-Progress-root').count()) > 0
}

/**
 * Answers whatever exercise is on screen and clicks through the feedback
 * screen. Returns false when nothing recognisable is present (session over).
 */
async function answerOne(page: Page): Promise<boolean> {
  await page.waitForTimeout(400)

  // ExerciseOption.tsx:54 stamps data-testid="exercise-option" on every choice.
  // Do NOT match on `.mantine-Button-root` — the options are bespoke <button>s
  // from the exercise primitives, not Mantine Buttons, so a class-based
  // selector silently finds nothing and the session reads as "no exercises".
  const options = page.locator('[data-testid="exercise-option"]:not([disabled])')
  if ((await options.count()) >= 2) {
    await options.first().click()
  } else {
    const input = page
      .locator('input[type="text"]:not([disabled]), input:not([type]):not([disabled])')
      .first()
    if (!(await input.isVisible().catch(() => false))) return false
    await input.fill('saya')
    await input.press('Enter')
    const submit = page.getByRole('button', { name: /controleer|check|submit/i })
    if (await submit.isVisible().catch(() => false)) await submit.click()
  }

  // The commit happens on answer, not on Doorgaan — but click through anyway so
  // the next exercise renders.
  await page.waitForTimeout(1800)
  const doorgaan = page.getByRole('button', { name: /doorgaan|continue/i })
  if (await doorgaan.isVisible().catch(() => false)) {
    await doorgaan.click()
    await page.waitForTimeout(600)
  }
  return true
}

test.describe('cloud session — real learner write path', () => {
  test.skip(!EMAIL || !PASSWORD || !SERVICE_KEY, 'needs E2E_EMAIL / E2E_PASSWORD / CLOUD_SUPABASE_SERVICE_KEY')
  test.setTimeout(240_000)

  test('completes exercises and writes capability_review_events under real RLS', async ({ page }) => {
    const userId = await userIdFor(EMAIL!, PASSWORD!)
    const before = await reviewEventCount(userId)
    console.log(`[fixture] user ${userId} has ${before} review events before`)

    const failed: { url: string; status: number }[] = []
    page.on('response', r => {
      if (r.status() >= 400) failed.push({ url: r.url().slice(0, 140), status: r.status() })
    })

    await login(page, { email: EMAIL, password: PASSWORD })

    await page.goto('/session')
    let hasExercises = await sessionSettled(page)

    // A fresh cloud account may have no activated lessons, which yields an empty
    // session. Activate lesson 1 through the UI (the same switch a learner
    // uses) rather than inserting an activation row behind the app's back.
    if (!hasExercises) {
      console.log('[fixture] empty session — activating lesson 1 via the reader')
      await page.goto('/leren')
      await page.waitForLoadState('networkidle')
      const firstLesson = page.locator('a[href^="/lesson/"]').first()
      await firstLesson.click()
      await page.waitForLoadState('networkidle')

      const activate = page.getByRole('switch').first()
      if (await activate.isVisible().catch(() => false)) {
        if (!(await activate.isChecked().catch(() => false))) await activate.click()
        await page.waitForTimeout(2500)
      }

      await page.goto('/session')
      hasExercises = await sessionSettled(page)
    }

    expect(hasExercises, 'expected a non-empty session after activating a lesson').toBe(true)

    let answered = 0
    let stuck = 0
    for (let i = 0; i < 24 && stuck < 3; i++) {
      const summary = await page
        .getByText(/samenvatting|summary|goed gedaan/i)
        .isVisible()
        .catch(() => false)
      if (summary) break
      if (await answerOne(page)) {
        answered++
        stuck = 0
      } else {
        // An unrecognised exercise type must not end the run — the session
        // mixes kinds, and one unhandled shape would otherwise truncate the
        // fixture (it stopped at 2 of 20 the first time). Log what was on
        // screen, try to step past it, and only give up after 3 in a row.
        stuck++
        const snippet = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 180)
        console.log(`[fixture] unrecognised exercise (${stuck}/3): ${snippet}`)
        const next = page.getByRole('button', { name: /doorgaan|continue|volgende|overslaan|skip/i })
        if (await next.isVisible().catch(() => false)) {
          await next.click()
          await page.waitForTimeout(800)
        }
      }
    }
    console.log(`[fixture] answered ${answered} exercises`)
    expect(answered, 'expected to answer at least one exercise').toBeGreaterThan(0)

    // The commit is an RPC round-trip; give the last one room to land.
    await page.waitForTimeout(3000)
    const after = await reviewEventCount(userId)
    console.log(`[fixture] review events: ${before} → ${after}`)
    console.log('[fixture] failed responses:', JSON.stringify(failed.slice(0, 10), null, 2))

    expect(after, 'the session must have written review events').toBeGreaterThan(before)
  })
})
