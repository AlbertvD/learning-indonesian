// Live Stripe test-mode purchase, end to end, against Supabase Cloud.
//
//   bunx vite --mode cloud --port 5174
//   E2E_BASE_URL=http://localhost:5174 E2E_EMAIL=... E2E_PASSWORD=... \
//     bunx playwright test e2e/cloud-checkout.spec.ts
//
// Not part of the normal suite's expectations: needs a live Stripe sandbox,
// real network, and the four STRIPE_* function secrets. It is the only thing
// exercising what mocks structurally cannot — automatic_tax, the webhook, and
// current_period_end. BOTH bugs found in this integration so far (the
// apiVersion/current_period_end null, and the missing customer_update.address
// that made every checkout 500) were invisible to mocked tests and only
// provable against the real API.
//
// The Checkout URL is fetched OUT of band rather than through page.evaluate:
// the browser only needs to be logged in so the post-payment redirect lands in
// an authenticated context, where verify-checkout runs.
import { test, expect } from '@playwright/test'
import { login } from './_helpers'

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
const SUPABASE_URL = 'https://wodpkxsmildtgndnbraa.supabase.co'
const ANON = process.env.CLOUD_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

const TEST_CARD = '4242424242424242' // Stripe's standard success card

async function checkoutUrlFor(plan: 'monthly' | 'annual'): Promise<string> {
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const { access_token } = await tokenRes.json()
  if (!access_token) throw new Error('could not sign in for a user token')

  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ plan }),
  })
  const body = await res.json()
  if (!body.url) throw new Error(`no checkout url (${res.status}): ${JSON.stringify(body)}`)
  return body.url as string
}

test.describe('cloud checkout (live Stripe test mode)', () => {
  test.skip(!EMAIL || !PASSWORD || !ANON, 'needs E2E_EMAIL / E2E_PASSWORD / anon key')
  test.setTimeout(180_000)

  test('buys a monthly subscription and returns entitled', async ({ page }) => {
    await login(page, { email: EMAIL, password: PASSWORD })

    const url = await checkoutUrlFor('monthly')
    expect(url).toContain('checkout.stripe.com')
    await page.goto(url)

    // ── Stripe's hosted page ────────────────────────────────────────────────
    // Card fields are hidden until "Card" is chosen — the account also offers
    // Klarna and Satispay, so Checkout renders a payment-method list first.
    // The card form is an ACCORDION and starts collapsed: this account also
    // offers Klarna and Satispay, so Checkout renders a payment-method list
    // and no card-number field exists in the DOM until Card is opened.
    //
    // The control that opens it is the BUTTON inside the Card row
    // ("Pay with card"), not the radio and not the label text — checking
    // `radio "Card"` leaves the accordion closed and the fields unrendered
    // (verified from the failure snapshot).
    const payWithCard = page.getByRole('button', { name: /pay with card/i })
    if (await payWithCard.isVisible().catch(() => false)) {
      await payWithCard.click()
    } else {
      await page.getByRole('radio', { name: 'Card' }).check({ force: true })
    }

    const cardNumber = page.getByPlaceholder('1234 1234 1234 1234')
    await cardNumber.waitFor({ state: 'visible', timeout: 30_000 })
    await cardNumber.fill(TEST_CARD)
    await page.getByPlaceholder('MM / YY').fill('12 / 34')
    await page.getByPlaceholder('CVC').fill('123')

    const name = page.getByPlaceholder('Full name on card')
    if (await name.isVisible().catch(() => false)) await name.fill('Cloud Test User')

    // automatic_tax + customer_update.address='auto' makes Checkout collect a
    // billing address here.
    const postal = page.getByPlaceholder('Postal code')
    if (await postal.isVisible().catch(() => false)) await postal.fill('2157NJ')

    // The submit control is named "Pay and subscribe" on a subscription-mode
    // session — there is no hosted-payment-submit-button test id here.
    // Let Stripe finish validating the card fields first; clicking too early
    // focuses the button without submitting.
    await page.waitForTimeout(3000)
    const submit = page.getByRole('button', { name: 'Pay and subscribe' })
    await submit.waitFor({ state: 'visible', timeout: 20_000 })
    await submit.click()
    await page.waitForTimeout(2000)
    // Retry once if we are still on Stripe — a first click can be swallowed
    // while the card element is still initialising.
    if (page.url().includes('checkout.stripe.com')) {
      await submit.click().catch(() => {})
    }

    // ── Back in the app: verify-checkout runs and writes the entitlement ────
    await page.waitForURL(/\/checkout\/success/, { timeout: 120_000 })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(4000)

    const successText = await page.locator('body').innerText()
    console.log('[checkout] success page:\n' + successText.slice(0, 500))
    expect(successText).not.toMatch(/niet gevonden|not found|something went wrong/i)
  })
})
