#!/usr/bin/env bun
// scripts/check-cloud-config.ts
//
// Asserts that the LIVE Supabase Cloud project matches what this repo declares,
// and that the Cloudflare-served app still behaves correctly.
//
// WHY THIS EXISTS: on 2026-08-02 every auth setting on the cloud project —
// site_url, the redirect allowlist, SMTP, the Google provider — was applied by
// hand via raw PATCH calls and existed NOWHERE in the repo. Two consequences
// showed up the same day:
//
//   - site_url had sat at Supabase's default "http://localhost:3000" since the
//     project was created. Every password-reset and OAuth return would have
//     landed on a machine that is not ours. Nothing noticed for weeks.
//   - mailer_autoconfirm differed from the homelab, which made signup show
//     "Account created!" and then silently eject the visitor.
//
// Neither was a code bug and no test could have caught either: they were
// CONFIGURATION, and configuration had no declaration to be checked against.
//
// The rule this enforces: supabase/config.toml is the source of truth. Drift is
// defined as "live differs from the file" — so a dashboard edit, an ad-hoc curl,
// or a half-finished migration all fail the same way.
//
// Two kinds of assertion, deliberately different:
//   DECLARED  — compared field-by-field against config.toml.
//   BEHAVIOUR — for surfaces with no sane repo representation (DNS, Email
//               Routing, custom domains). Terraform for six resources would cost
//               more than it saves, so we assert that they WORK rather than
//               declaring how they are built.
//
// Usage:  bun scripts/check-cloud-config.ts     (also runs inside `make pre-deploy`)
// Needs:  SUPABASE_ACCESS_TOKEN in .env.local

import { readFileSync } from 'node:fs'
import config from '../supabase/config.toml'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN missing from .env.local — cannot read project config')
  process.exit(1)
}

const cfg = config as any
const PROJECT_REF: string = cfg.project_id
const APP_ORIGIN = 'https://kamoebisa.nl'

let passed = 0
const failures: string[] = []
const pass = (name: string) => { passed++; console.log(`  ✓ ${name}`) }
const fail = (name: string, detail: string) => {
  failures.push(name)
  console.log(`  ✗ ${name}\n      ${detail}`)
}

/** Compare one declared value against its live counterpart. */
function expect(name: string, declared: unknown, live: unknown) {
  if (String(declared) === String(live)) pass(name)
  else fail(name, `repo declares ${JSON.stringify(declared)}, live project has ${JSON.stringify(live)} — run: make config-push`)
}

console.log(`\nCloud config drift check — project ${PROJECT_REF}`)
console.log(`Source of truth: supabase/config.toml\n`)

// ── DECLARED: Supabase auth ─────────────────────────────────────────────────
const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  headers: { Authorization: `Bearer ${token}` },
})
if (!res.ok) {
  console.error(`  ✗ cannot read live auth config: HTTP ${res.status}`)
  process.exit(1)
}
const live = (await res.json()) as Record<string, unknown>
const auth = cfg.auth ?? {}

console.log('DECLARED — supabase/config.toml [auth]')
expect('site_url', auth.site_url, live.site_url)

// config.toml lists an array; the API returns one comma-joined string. Compare
// as SETS: ordering is not meaningful and a reordering is not drift.
const declaredUrls = new Set<string>(auth.additional_redirect_urls ?? [])
const liveUrls = new Set(String(live.uri_allow_list ?? '').split(',').filter(Boolean))
const missing = [...declaredUrls].filter(u => !liveUrls.has(u))
const extra = [...liveUrls].filter(u => !declaredUrls.has(u))
if (!missing.length && !extra.length) pass('redirect allowlist')
else fail('redirect allowlist', `missing on live: ${missing.join(', ') || 'none'} | not declared: ${extra.join(', ') || 'none'}`)

expect('jwt_expiry', auth.jwt_expiry, live.jwt_exp)
expect('signup enabled', auth.enable_signup, !live.disable_signup)

// enable_confirmations TRUE ⇔ mailer_autoconfirm FALSE. Inverted names, and the
// exact pair that broke signup — worth asserting explicitly rather than trusting.
expect('email confirmations required', auth.email?.enable_confirmations, !live.mailer_autoconfirm)

const smtp = auth.email?.smtp ?? {}
expect('smtp host', smtp.host, live.smtp_host)
expect('smtp port', smtp.port, live.smtp_port)
expect('smtp user', smtp.user, live.smtp_user)
expect('smtp sender', smtp.admin_email, live.smtp_admin_email)
expect('smtp sender name', smtp.sender_name, live.smtp_sender_name)
// The password is an env() reference in the file — assert only that the live
// project HAS one. Comparing values would mean reading a secret in here.
if (live.smtp_pass) pass('smtp password set (value not compared)')
else fail('smtp password set', 'live project has no SMTP password — confirmation mail is undeliverable')

expect('google provider enabled', cfg.auth?.external?.google?.enabled, live.external_google_enabled)
if (live.external_google_client_id) pass('google client id set')
else fail('google client id set', 'provider is enabled but no client_id — the sign-in button will error')

// ── BEHAVIOUR: Cloudflare-served app ────────────────────────────────────────
// No repo declaration for DNS / custom domains / Email Routing. Assert that the
// observable outcome still holds instead.
console.log('\nBEHAVIOUR — Cloudflare (no repo declaration by design)')

async function status(url: string): Promise<number> {
  try { return (await fetch(url, { redirect: 'manual' })).status } catch { return 0 }
}

const appStatus = await status(APP_ORIGIN + '/')
if (appStatus === 200) pass(`${APP_ORIGIN} serves the app`)
else fail(`${APP_ORIGIN} serves the app`, `HTTP ${appStatus}`)

const deep = await status(APP_ORIGIN + '/leren')
if (deep === 200) pass('SPA deep link resolves (not_found_handling)')
else fail('SPA deep link resolves', `HTTP ${deep} on /leren — assets.not_found_handling may have been lost`)

const headers = (await fetch(APP_ORIGIN + '/')).headers
const csp = headers.get('content-security-policy') ?? ''
if (csp.includes(`${PROJECT_REF}.supabase.co`)) pass('CSP served and names the cloud project')
else fail('CSP served', 'public/_headers missing from the deployment, or CSP names the wrong Supabase origin')

// workers_dev is declared false in wrangler.jsonc. A second public hostname
// serving the same app is an SEO and branding problem, and it silently comes
// back if someone re-enables it in the dashboard.
const wdev = await status('https://learning-indonesian.avduijn.workers.dev/')
if (wdev === 404 || wdev === 0) pass('workers.dev hostname is disabled')
else fail('workers.dev disabled', `HTTP ${wdev} — a second public hostname is serving the app (wrangler.jsonc declares workers_dev = false)`)

// ── result ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.error(`\nFAILED: ${failures.join(', ')}`)
  console.error('The repo and the live project disagree. Either apply the repo')
  console.error('(make config-push) or update the repo to match a deliberate change.')
  process.exit(1)
}
console.log('Live project matches the repo.\n')
