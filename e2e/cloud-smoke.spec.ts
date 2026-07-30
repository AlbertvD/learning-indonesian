// Cloud end-to-end smoke — the first real exercise of the Supabase Cloud
// environment (project wodpkxsmildtgndnbraa). Run against a dev server started
// in `cloud` mode:
//
//   bunx vite --mode cloud --port 5174
//   E2E_BASE_URL=http://localhost:5174 E2E_EMAIL=... E2E_PASSWORD=... \
//     bunx playwright test e2e/cloud-smoke.spec.ts
//
// Targets LESSON 3 deliberately: it is inside the free tier (lessons 1-3, so no
// entitlement row or Stripe needed) and it is the only lesson whose audio
// copied to cloud completely (the other four had files over the 50 MB free-tier
// upload cap).
//
// The load-bearing assertion is SIGNED AUDIO: cloud buckets are private
// (public=false) and the homelab's are still public, so signed-URL resolution
// has never actually run anywhere before this spec.
import { test, expect } from '@playwright/test'
import { login } from './_helpers'

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

// Lesson 3 "Di Bandar Udara" on the cloud project — free tier, audio complete.
const LESSON_3_ID = 'bb44d8ba-f5b1-48d6-83de-fb30f0425768'

test.describe('cloud smoke', () => {
  test.skip(!EMAIL || !PASSWORD, 'needs E2E_EMAIL / E2E_PASSWORD for the cloud test user')

  test('logs in, lists lessons, opens a free-tier lesson, and signs audio', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })

    // Capture storage signing calls — proves private-bucket access works —
    // and every non-2xx response, so a silent failure can't hide.
    const signRequests: { url: string; status: number }[] = []
    const failedResponses: { url: string; status: number }[] = []
    page.on('response', async res => {
      if (res.url().includes('/storage/v1/object/sign')) {
        signRequests.push({ url: res.url().slice(0, 120), status: res.status() })
      }
      if (res.status() >= 400) {
        failedResponses.push({ url: res.url().slice(0, 140), status: res.status() })
      }
    })

    await login(page, { email: EMAIL, password: PASSWORD })

    // 1. Authenticated content read under real RLS. The lesson list lives at
    //    /leren (App.tsx:154), not /lessons.
    await page.goto('/leren')
    // Tiles render the number and the short title as separate nodes, so there
    // is no literal "Les 3" string — match the title instead.
    await expect(page.getByText(/Di Bandar Udara/i).first()).toBeVisible({ timeout: 20000 })

    // 2. Open lesson 3 directly by id — clicking the tile depends on activation
    //    state, and this spec is about content + audio, not navigation.
    await page.goto(`/lesson/${LESSON_3_ID}`)
    await page.waitForLoadState('networkidle')
    const bodyText = await page.locator('body').innerText()
    expect(bodyText, 'reader must not 404').not.toMatch(/niet gevonden|not found/i)
    expect(bodyText.length).toBeGreaterThan(200)

    // 3. Audio lives on the Dialoog / Grammatica tabs, not the default Inhoud
    //    tab — visit them so the signer actually runs.
    for (const tab of [/Dialoog/i, /Grammatica/i]) {
      const btn = page.getByRole('button', { name: tab }).first()
      if (await btn.isVisible().catch(() => false)) {
        await btn.click()
        await page.waitForTimeout(2500)
      }
    }
    await page.waitForTimeout(2000)
    const audioSrcs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('audio')).map(a => a.getAttribute('src') ?? '')
    )
    const anySigned =
      signRequests.some(r => r.status === 200) ||
      audioSrcs.some(s => s.includes('token=') || s.includes('/object/sign/'))
    const anyPublicUrl = audioSrcs.some(s => s.includes('/object/public/'))

    console.log('[cloud-smoke] sign requests:', JSON.stringify(signRequests.slice(0, 5), null, 2))
    console.log('[cloud-smoke] audio srcs:', JSON.stringify(audioSrcs.slice(0, 5), null, 2))
    console.log('[cloud-smoke] failed responses:', JSON.stringify(failedResponses.slice(0, 10), null, 2))
    console.log('[cloud-smoke] console errors:', JSON.stringify(consoleErrors.slice(0, 10), null, 2))

    expect(anyPublicUrl, 'audio must not use /object/public/ — buckets are private on cloud').toBe(false)
    expect(anySigned, 'expected at least one successful storage sign call or signed audio src').toBe(true)
  })
})
