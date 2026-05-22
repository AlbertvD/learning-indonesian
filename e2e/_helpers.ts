import { type Page } from '@playwright/test'

export const TEST_EMAIL = 'testuser@duin.home'
export const TEST_PASSWORD = 'TestUser123!'
export const ADMIN_EMAIL = 'albertvduijn@proton.me'

// Playwright runs from localhost:5175 but Supabase (Kong) only allows
// CORS from .duin.home origins. Intercept all Supabase requests and
// inject the required CORS response headers so auth calls succeed.
export async function bypassSupabaseCors(page: Page) {
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

export interface LoginOptions {
  /** Set to true to log in with the admin account (ADMIN_EMAIL). Defaults to test user. */
  admin?: boolean
}

export async function login(page: Page, options: LoginOptions = {}) {
  await bypassSupabaseCors(page)
  const email = options.admin ? ADMIN_EMAIL : TEST_EMAIL
  const password = options.admin ? process.env.ADMIN_PASSWORD ?? TEST_PASSWORD : TEST_PASSWORD
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /^login$/i }).click()
  // Wait for redirect away from login
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 })
}
