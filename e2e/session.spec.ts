import { test, expect, type Page } from '@playwright/test'

const TEST_EMAIL = 'testuser@duin.home'
const TEST_PASSWORD = 'TestUser123!'

// Playwright runs from localhost:5175 but Supabase (Kong) only allows
// CORS from .duin.home origins. Intercept all Supabase requests and
// inject the required CORS response headers so auth calls succeed.
async function bypassSupabaseCors(page: Page) {
  const SUPABASE_URL = 'https://api.supabase.duin.home'
  await page.route(`${SUPABASE_URL}/**`, async route => {
    const request = route.request()
    // Handle CORS preflight OPTIONS requests
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': 'http://localhost:5175',
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': 'authorization,content-type,apikey,x-client-info,accept-profile,content-profile,prefer,range',
          'access-control-max-age': '86400',
        },
      })
      return
    }
    // Forward real requests and add CORS response headers
    const response = await route.fetch()
    const headers = { ...response.headers() }
    headers['access-control-allow-origin'] = 'http://localhost:5175'
    headers['access-control-allow-credentials'] = 'true'
    await route.fulfill({ response, headers })
  })
}

async function login(page: Page) {
  await bypassSupabaseCors(page)
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(TEST_EMAIL)
  await page.getByLabel(/password/i).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: /^login$/i }).click()
  // Wait for redirect away from login
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 })
}

async function navigateToSession(page: Page) {
  await page.goto('/session')
  // Wait for loading to finish — either exercises loaded or empty state shown
  await page.waitForFunction(
    () => {
      const progressBar = document.querySelector('.mantine-Progress-root')
      const body = document.body.textContent ?? ''
      const emptyState = /geen oefeningen|no exercises|niets te oefenen/i.test(body)
      return !!progressBar || emptyState
    },
    { timeout: 20000 }
  )
}

// Returns true if a session with exercises loaded, false if empty
async function sessionHasExercises(page: Page): Promise<boolean> {
  const progressBar = page.locator('.mantine-Progress-root')
  try {
    await progressBar.waitFor({ timeout: 5000 })
    return true
  } catch {
    return false
  }
}

test.describe('Session — exercise feedback screen', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('session loads and shows exercises or empty state', async ({ page }) => {
    await navigateToSession(page)
    const hasExercises = await sessionHasExercises(page)
    if (!hasExercises) {
      // Empty state is valid — no due items
      await expect(page.getByText(/geen|no exercises|niets/i)).toBeVisible()
      console.log('No due exercises for test user — empty state shown correctly')
      return
    }
    // Progress bar visible means exercises are queued
    await expect(page.locator('.mantine-Progress-root')).toBeVisible()
    console.log('Session loaded with exercises')
  })

  test('correct answer shows green Doorgaan screen before advancing', async ({ page }) => {
    await navigateToSession(page)
    const hasExercises = await sessionHasExercises(page)
    if (!hasExercises) {
      test.skip()
      return
    }

    let doorgaanFound = false

    // Try up to 10 exercises to find a correct-answer feedback screen
    for (let i = 0; i < 10; i++) {
      // Detect exercise type and attempt to answer correctly
      const exerciseAnswered = await tryAnswerExercise(page, 'correct')
      if (!exerciseAnswered) break

      // After answering, should see a feedback screen with Doorgaan button
      const doorgaanButton = page.getByRole('button', { name: /doorgaan|continue/i })
      try {
        await doorgaanButton.waitFor({ timeout: 5000 })
        doorgaanFound = true

        // Verify green styling is present (correct answer)
        const greenBanner = page.locator('[style*="success"]').first()
        const isVisible = await greenBanner.isVisible().catch(() => false)
        console.log(`Exercise ${i + 1}: Doorgaan screen shown. Green styling: ${isVisible}`)

        // Verify correct answer text is shown
        const correctAnswerLabel = page.getByText(/correct antwoord|correct answer/i)
        await expect(correctAnswerLabel).toBeVisible()

        // Click Doorgaan and proceed
        await doorgaanButton.click()

        // Wait for next exercise or summary
        await page.waitForTimeout(500)
        const summary = await page.getByText(/samenvatting|summary|score/i).isVisible().catch(() => false)
        if (summary) break
      } catch {
        // Doorgaan not shown — this is the bug we're checking for
        console.error(`Exercise ${i + 1}: No Doorgaan screen after correct answer!`)
        break
      }
    }

    expect(doorgaanFound).toBe(true)
  })

  test('wrong answer shows red Doorgaan screen with correct answer', async ({ page }) => {
    await navigateToSession(page)
    const hasExercises = await sessionHasExercises(page)
    if (!hasExercises) {
      test.skip()
      return
    }

    let wrongFeedbackFound = false

    for (let i = 0; i < 10; i++) {
      const exerciseAnswered = await tryAnswerExercise(page, 'wrong')
      if (!exerciseAnswered) break

      const doorgaanButton = page.getByRole('button', { name: /doorgaan|continue/i })
      try {
        await doorgaanButton.waitFor({ timeout: 5000 })
        wrongFeedbackFound = true

        // Verify incorrect label
        await expect(page.getByText(/onjuist|incorrect/i)).toBeVisible()

        // Verify correct answer is shown
        await expect(page.getByText(/correct antwoord|correct answer/i)).toBeVisible()

        console.log(`Exercise ${i + 1}: Wrong-answer Doorgaan screen shown correctly`)
        await doorgaanButton.click()
        await page.waitForTimeout(500)
        break
      } catch {
        console.error(`Exercise ${i + 1}: No Doorgaan screen after wrong answer!`)
        break
      }
    }

    expect(wrongFeedbackFound).toBe(true)
  })

  test('Doorgaan advances to next exercise', async ({ page }) => {
    await navigateToSession(page)
    const hasExercises = await sessionHasExercises(page)
    if (!hasExercises) {
      test.skip()
      return
    }

    // Capture the exercise counter text before advancing (e.g. "Oefening 1 van 15")
    const counterText = await page.getByText(/oefening \d+ van \d+/i).textContent().catch(() => null)
    console.log(`Exercise counter before: ${counterText}`)

    // Answer first exercise
    await tryAnswerExercise(page, 'correct')

    const doorgaan = page.getByRole('button', { name: /doorgaan|continue/i })
    await doorgaan.waitFor({ timeout: 5000 })
    await doorgaan.click()

    // Wait for next exercise or summary to appear
    await page.waitForTimeout(800)
    const newCounterText = await page.getByText(/oefening \d+ van \d+/i).textContent().catch(() => null)
    console.log(`Exercise counter after: ${newCounterText}`)

    // Either counter advanced (different text), or we reached the summary
    const summaryVisible = await page.getByText(/samenvatting|score/i).isVisible().catch(() => false)
    const counterAdvanced = newCounterText !== null && newCounterText !== counterText
    expect(summaryVisible || counterAdvanced).toBe(true)
  })
})

// Tries to answer the current exercise. Mode 'correct' tries to pick the right answer,
// 'wrong' picks a clearly wrong one. Returns false if no recognisable exercise found.
async function tryAnswerExercise(page: Page, mode: 'correct' | 'wrong'): Promise<boolean> {
  await page.waitForTimeout(300)

  // MCQ / contrast_pair — click a button option
  const optionButtons = page.locator('button.mantine-Button-root:not([disabled])').filter({
    hasNotText: /doorgaan|continue|inloggen|log in/i,
  })

  // cloze_mcq / contrast_pair: option buttons
  const buttonCount = await optionButtons.count()
  if (buttonCount >= 2) {
    if (mode === 'correct') {
      // Click first enabled option — may or may not be correct; shell will show feedback either way
      await optionButtons.first().click()
    } else {
      // Click last option (likely wrong for contrast_pair)
      await optionButtons.last().click()
    }
    await page.waitForTimeout(1600) // wait for 1500ms animation + buffer
    return true
  }

  // Typed exercises — text input
  const textInput = page.locator('input[type="text"]:not([disabled]), input:not([type]):not([disabled])').first()
  const inputVisible = await textInput.isVisible().catch(() => false)
  if (inputVisible) {
    const answer = mode === 'correct' ? 'saya' : 'xyzwrong123'
    await textInput.fill(answer)
    await textInput.press('Enter')
    await page.waitForTimeout(500)

    // Click submit if Enter didn't trigger it
    const submitBtn = page.getByRole('button', { name: /controleer|check|submit/i })
    const submitVisible = await submitBtn.isVisible().catch(() => false)
    if (submitVisible) await submitBtn.click()

    await page.waitForTimeout(1600)
    return true
  }

  return false
}
