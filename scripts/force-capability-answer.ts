#!/usr/bin/env bun
// scripts/force-capability-answer.ts
//
// Per-PR post-deploy E2E gate (plan §3.8).
// Drives a headless Playwright session that hits /session?force_capability=<key>
// as the test (or admin) user, answers one card, and verifies a row landed in
// capability_review_events. Exits with the contracted code.
//
// USAGE: bun scripts/force-capability-answer.ts --key <canonical_key> [--correct|--wrong] [--admin]
// ENV:   DATABASE_URL        — required: service-role DSN for the log query.
//        TEST_USER_EMAIL     — default: testuser@duin.home
//        TEST_USER_PASSWORD  — default: TestUser123!
//        ADMIN_EMAIL         — default: albertvduijn@proton.me
//        ADMIN_PASSWORD      — required when --admin is used.
//        APP_BASE_URL        — default: http://localhost:5175
// EXIT:  0 — bypass URL loaded, card answered, capability_review_events row landed.
//        1 — bypass URL returned an unexpected page (unauth / CapabilityNotFoundError).
//        2 — card rendered but answer submission failed.
//        3 — answer submitted but no capability_review_events row landed within timeout.

import { chromium, type Browser, type Page } from '@playwright/test'
import postgres from 'postgres'
import { bypassSupabaseCors, login } from '../e2e/_helpers'

interface Args {
  canonicalKey: string
  mode: 'correct' | 'wrong'
  admin: boolean
}

function parseArgs(argv: string[]): Args {
  let canonicalKey: string | null = null
  let mode: 'correct' | 'wrong' = 'correct'
  let admin = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--key' || arg === '-k') {
      canonicalKey = argv[i + 1] ?? null
      i += 1
    } else if (arg === '--correct') {
      mode = 'correct'
    } else if (arg === '--wrong') {
      mode = 'wrong'
    } else if (arg === '--admin') {
      admin = true
    }
  }
  if (!canonicalKey) {
    console.error('Missing required --key <canonical_key>')
    process.exit(1)
  }
  return { canonicalKey, mode, admin }
}

async function answerOneCard(page: Page, mode: 'correct' | 'wrong'): Promise<boolean> {
  await page.waitForTimeout(800)
  // MCQ options: ExerciseOption renders a native <button> inside
  // ExerciseOptionGroup (role="group"); item-style exercises use
  // mantine-Button-root. Match both; exclude chrome/submit/login buttons.
  const optionButtons = page.locator(
    '[role="group"] button:not([disabled]), button.mantine-Button-root:not([disabled])',
  ).filter({
    hasNotText: /doorgaan|continue|inloggen|log in/i,
  })
  const buttonCount = await optionButtons.count()
  if (buttonCount >= 2) {
    if (mode === 'correct') {
      await optionButtons.first().click()
    } else {
      await optionButtons.last().click()
    }
    await page.waitForTimeout(1800)
    return true
  }
  const textInput = page.locator('input[type="text"]:not([disabled]), input:not([type]):not([disabled])').first()
  const inputVisible = await textInput.isVisible().catch(() => false)
  if (inputVisible) {
    const answer = mode === 'correct' ? 'saya' : 'xyzwrong123'
    await textInput.fill(answer)
    await textInput.press('Enter')
    await page.waitForTimeout(500)
    const submitBtn = page.getByRole('button', { name: /controleer|check|submit/i })
    const submitVisible = await submitBtn.isVisible().catch(() => false)
    if (submitVisible) await submitBtn.click()
    await page.waitForTimeout(1800)
    return true
  }
  return false
}

async function pollForReviewEvent(
  sql: ReturnType<typeof postgres>,
  canonicalKey: string,
  since: Date,
): Promise<boolean> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const rows = await sql<{ id: string }[]>`
      select id from indonesian.capability_review_events
       where canonical_key_snapshot = ${canonicalKey}
         and created_at > ${since.toISOString()}
       limit 1`
    if (rows.length > 0) return true
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5175'
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL — required for verifying the review-event row.')
    process.exit(1)
  }

  const sql = postgres(databaseUrl, { onnotice: () => undefined })

  let browser: Browser | null = null
  try {
    browser = await chromium.launch({ headless: true })
    // ignoreHTTPSErrors: the homelab Supabase (api.supabase.duin.home) is behind
    // Step-CA (internal CA) — the in-page CORS-shim route.fetch() can't verify
    // the cert otherwise. Harmless against the deployed app (valid chain).
    const context = await browser.newContext({ baseURL: baseUrl, ignoreHTTPSErrors: true })
    const page = await context.newPage()

    await bypassSupabaseCors(page)
    await login(page, { admin: args.admin })

    const url = `/session?force_capability=${encodeURIComponent(args.canonicalKey)}`
    await page.goto(url)

    // Wait for the experience-player to mount or an error to surface
    const ready = await page.waitForFunction(
      () => {
        const body = document.body.textContent ?? ''
        const optionButton = document.querySelector('button.mantine-Button-root')
        const errorText = /sessiefout|capabilitynotfoundError|geen oefeningen/i.test(body)
        return !!optionButton || errorText
      },
      { timeout: 15000 },
    ).catch(() => null)
    if (!ready) {
      console.error('Bypass URL did not produce a card or recognised state.')
      process.exit(1)
    }

    const bodyText = await page.locator('body').textContent() ?? ''
    if (/capabilitynotfoundError|geen oefeningen/i.test(bodyText)) {
      console.error('Bypass URL returned unexpected state:', bodyText.slice(0, 200))
      process.exit(1)
    }

    const since = new Date()
    const answered = await answerOneCard(page, args.mode)
    if (!answered) {
      console.error('Card rendered but no recognised interaction surface found.')
      process.exit(2)
    }

    const landed = await pollForReviewEvent(sql, args.canonicalKey, since)
    if (!landed) {
      console.error('Answer submitted but no capability_review_events row landed within 10s.')
      process.exit(3)
    }

    console.log(`OK — capability_review_events row landed for ${args.canonicalKey} (${args.mode}).`)
    process.exit(0)
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined)
    if (browser) await browser.close().catch(() => undefined)
  }
}

main().catch(err => {
  console.error('force-capability-answer fatal:', err)
  process.exit(1)
})
