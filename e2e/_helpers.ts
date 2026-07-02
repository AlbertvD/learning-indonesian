import { type Page } from '@playwright/test'

export const TEST_EMAIL = 'testuser@duin.home'
export const TEST_PASSWORD = 'TestUser123!'
// The admin account is the only row in indonesian.user_roles (role=admin),
// verified 2026-05-24: albert@duin.home. The previous value
// (albertvduijn@proton.me) is not an auth user, so admin-gated specs only ever
// ran skipped. profile.isAdmin (which gates ?force_capability) is true for this
// account only.
export const ADMIN_EMAIL = 'albert@duin.home'

// Playwright typically runs against a localhost dev server, but Supabase
// (Kong) only allows CORS from configured .duin.home origins. Intercept all
// Supabase requests and inject the required CORS response headers so auth
// calls succeed. Echoes the request's own Origin header rather than a
// hardcoded port so this works regardless of which port/host the config's
// baseURL points at (localhost dev server, or E2E_BASE_URL pointing at a
// .duin.home preview deploy — where Kong already allows the origin and this
// is a harmless no-op).
export async function bypassSupabaseCors(page: Page) {
  const SUPABASE_URL = 'https://api.supabase.duin.home'
  await page.route(`${SUPABASE_URL}/**`, async route => {
    const request = route.request()
    const origin = request.headers()['origin'] ?? new URL(page.url()).origin
    // Handle CORS preflight OPTIONS requests
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
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
    headers['access-control-allow-origin'] = origin
    headers['access-control-allow-credentials'] = 'true'
    await route.fulfill({ response, headers })
  })
}

export interface LoginOptions {
  /** Set to true to log in with the admin account (ADMIN_EMAIL). Defaults to test user. */
  admin?: boolean
  /** Explicit email — takes precedence over `admin`. Used by e2e/smoke.spec.ts (E2E_EMAIL). */
  email?: string
  /** Explicit password — takes precedence over `admin`. Used by e2e/smoke.spec.ts (E2E_PASSWORD). */
  password?: string
}

export async function login(page: Page, options: LoginOptions = {}) {
  await bypassSupabaseCors(page)
  const email = options.email ?? (options.admin ? ADMIN_EMAIL : TEST_EMAIL)
  const password = options.password ?? (options.admin ? process.env.ADMIN_PASSWORD ?? TEST_PASSWORD : TEST_PASSWORD)
  await page.goto('/login')
  // Selectors are language-agnostic: the app defaults to NL (E-mail / Wachtwoord
  // / Inloggen) but may be EN (Email / Password / Log in).
  // Placeholder-based: unambiguous across NL (jij@voorbeeld.com / Je wachtwoord)
  // and EN (you@example.com / Your password), and avoids Mantine's
  // PasswordInput visibility-toggle button (which has no placeholder).
  await page.getByPlaceholder(/voorbeeld|example/i).fill(email)
  await page.getByPlaceholder(/wachtwoord|password/i).fill(password)
  await page.getByRole('button', { name: /^(inloggen|log\s*in)$/i }).click()
  // Wait for redirect away from login
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 })
}
