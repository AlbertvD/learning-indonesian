import { defineConfig, devices } from '@playwright/test'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

// This config loads as an ES module (package.json "type": "module") — no
// CommonJS __dirname available; import.meta.dirname is Node's ESM equivalent
// (stable since Node 20.11 / 21.2).
const __dirname = import.meta.dirname

// Playwright's own process does not go through Vite's env-loading pipeline —
// load .env.local directly (if present) so E2E_EMAIL / E2E_PASSWORD /
// E2E_CAPABILITY_KEY / SUPABASE_SERVICE_KEY / VITE_SUPABASE_URL are visible
// to spec files without the owner having to `export` them by hand. Minimal
// hand-rolled parser — no new dependency for a few lines of KEY=VALUE
// parsing. Never overwrites a variable already set in the environment.
const envLocalPath = path.resolve(__dirname, '.env.local')
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

// Defaults to the local dev server; the owner points E2E_BASE_URL at a
// preview deploy to run the same spec against a real deployment instead.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
// Only auto-start a local dev server when targeting the default localhost
// baseURL — E2E_BASE_URL pointing at a preview deploy must never spin up a
// competing local dev server.
const isLocalDefault = !process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(isLocalDefault
    ? {
        webServer: {
          command: 'bun run dev',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 30000,
        },
      }
    : {}),
})
