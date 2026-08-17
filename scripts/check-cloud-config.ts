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
import { createHash } from 'node:crypto'
import config from '../supabase/config.toml'
import { nl, en } from '../src/lib/i18n'
import { landingCopy } from '../src/pages/Landing.copy'

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

// ── The pricing declaration ─────────────────────────────────────────────────
// ONE place in the repo that says what a plan costs and which Stripe Price
// sells it. Everything else — the paywall, /voorwaarden §2, the landing page,
// the JSON-LD offer, the live function secrets — is asserted against THIS.
//
// Why it exists: docs/marketing/pricing.md names the gap in its own words —
// "A price parity check (copy vs Stripe) does not exist." The €7/€56 → €9/€79
// reprice touched six surfaces by hand, and the runbook's Phase 5 warning
// ("live checkout sells at €7/€56 while every page says €9/€79") describes
// exactly the failure this closes. A page advertising €9 while Stripe charges
// something else is a consumer-law problem, not just a bug — /voorwaarden §2
// is a contract term.
//
// Price IDs are identifiers, not secrets (launch-runbook Phase 5), so they are
// safe in a public repo — unlike the keys. Sanity: a LIVE id on this account
// carries `FDKKKBKGTH`; every sandbox price carries `FHQPtw4Bcl`. The digest
// comparison below would catch a sandbox id, but the eyeball check is free.
const PRICING = {
  monthly: {
    secret: 'STRIPE_PRICE_MONTHLY',
    priceId: 'price_1U17TLFDKKKBKGTHpkx0LM6J',
    display: '€9',
    jsonLd: '9.00',
  },
  annual: {
    secret: 'STRIPE_PRICE_ANNUAL',
    priceId: 'price_1U17TbFDKKKBKGTHvjWlMInR',
    display: '€79',
    jsonLd: null, // schema.org Offer carries a single price — the monthly one.
  },
} as const

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

// ── DECLARED: edge-function secrets ─────────────────────────────────────────
// Function secrets are the one production surface that CANNOT live in the repo,
// so they used to have no declaration and therefore no drift check. That gap
// cost us APP_BASE_URL: it was set to `http://localhost:5174` on 2026-07-31 to
// run the checkout E2E against a dev server, and stayed there. Every Checkout
// Session the live function created carried
// `success_url: http://localhost:5174/checkout/success` — so any buyer who was
// not sitting at this laptop would have paid Stripe and then landed on a dead
// URL, with verify-checkout never running to write their entitlement. Stripe
// confirmed it on the three most recent sessions before the fix.
//
// The check is possible because /v1/projects/{ref}/secrets returns each value
// as a **plain sha256 digest**, never the secret itself (verified 2026-08-03:
// the digest for the old value equalled sha256("http://localhost:5174")). So a
// secret whose correct value is public knowledge — the app's own origin — can
// be compared exactly without this file ever holding or printing a secret.
//
// The same digest trick extends to STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL:
// a Stripe Price id is an identifier, not a secret, so its correct value can be
// declared in PRICING above and compared exactly. That turns "a price secret is
// set" into "the RIGHT price is set" — the difference between catching and
// missing a live account still pointing at the archived €7/€56 pair.
//
// STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET have genuinely private values, so
// presence is all that can be asserted for those two. Absence is still worth
// catching: create-checkout-session returns `server_not_configured` and nobody
// can buy anything.
console.log('\nDECLARED — edge-function secrets (compared by digest, never read)')

const secretsRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, {
  headers: { Authorization: `Bearer ${token}` },
})
if (!secretsRes.ok) {
  fail('read function secrets', `HTTP ${secretsRes.status} from /v1/projects/${PROJECT_REF}/secrets`)
} else {
  const secrets = (await secretsRes.json()) as Array<{ name: string; value: string }>
  const digestOf = new Map(secrets.map(s => [s.name, s.value]))

  const wantDigest = createHash('sha256').update(APP_ORIGIN).digest('hex')
  const liveDigest = digestOf.get('APP_BASE_URL')
  if (!liveDigest) {
    fail('APP_BASE_URL secret', 'not set — checkout and the customer portal both 500 with server_not_configured')
  } else if (liveDigest === wantDigest) {
    pass(`APP_BASE_URL is ${APP_ORIGIN}`)
  } else {
    fail(
      'APP_BASE_URL secret',
      `digest does not match sha256(${APP_ORIGIN}) — Stripe redirects point somewhere else (localhost, a preview URL, the homelab). ` +
        `Fix: bunx supabase secrets set APP_BASE_URL=${APP_ORIGIN} --project-ref ${PROJECT_REF}`,
    )
  }

  for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
    if (digestOf.has(name)) pass(`${name} set (value not compared)`)
    else fail(`${name} set`, 'missing — create-checkout-session returns server_not_configured, so no one can subscribe')
  }

  for (const [plan, p] of Object.entries(PRICING)) {
    const liveDigest = digestOf.get(p.secret)
    const wantDigest = createHash('sha256').update(p.priceId).digest('hex')
    if (!liveDigest) {
      fail(`${p.secret} set`, 'missing — create-checkout-session returns server_not_configured, so no one can subscribe')
    } else if (liveDigest === wantDigest) {
      pass(`${p.secret} is the declared ${plan} price (${p.display})`)
    } else {
      fail(
        `${p.secret} matches the declared ${plan} price`,
        `digest does not match sha256(${p.priceId}) — the live function is selling a DIFFERENT price than every page advertises ` +
          `(an archived price, or a sandbox id). Fix: bunx supabase secrets set ${p.secret}=${p.priceId} --project-ref ${PROJECT_REF}`,
      )
    }
  }
}

// ── DECLARED: pricing copy ↔ the declaration ────────────────────────────────
// Every surface that quotes a price, checked against PRICING. These are cheap
// string comparisons, but they are the half of price parity that a digest
// cannot reach: the secrets could be perfect while /voorwaarden still promises
// last month's price. §2 of the terms is a contract term, so this is the
// surface where a mismatch costs more than embarrassment.
console.log('\nDECLARED — pricing copy (every surface that quotes a price)')

const priceSurfaces: Array<{ name: string; text: string; needs: string[] }> = [
  { name: 'paywall panel (nl)', text: `${nl.paywall.monthlyPrice} ${nl.paywall.annualPrice}`, needs: [PRICING.monthly.display, PRICING.annual.display] },
  { name: 'paywall panel (en)', text: `${en.paywall.monthlyPrice} ${en.paywall.annualPrice}`, needs: [PRICING.monthly.display, PRICING.annual.display] },
  { name: '/voorwaarden §2 (nl)', text: nl.terms.section2Body, needs: [PRICING.monthly.display, PRICING.annual.display] },
  { name: '/voorwaarden §2 (en)', text: en.terms.section2Body, needs: [PRICING.monthly.display, PRICING.annual.display] },
  { name: 'landing pricing band (nl)', text: landingCopy.nl.pricingBody, needs: [PRICING.monthly.display, PRICING.annual.display] },
  { name: 'landing pricing band (en)', text: landingCopy.en.pricingBody, needs: [PRICING.monthly.display, PRICING.annual.display] },
  { name: 'index.html JSON-LD offer', text: readFileSync('index.html', 'utf8'), needs: [`"price": "${PRICING.monthly.jsonLd}"`] },
]

for (const s of priceSurfaces) {
  const absent = s.needs.filter(n => !s.text.includes(n))
  if (absent.length === 0) pass(`${s.name} quotes the declared price`)
  else fail(`${s.name} quotes the declared price`, `does not mention ${absent.join(' / ')} — copy and the Stripe price have drifted apart`)
}

// The annual savings badge is derived, not independent: it must stay true
// against the two declared prices or it is a false advertising claim.
const monthlyNum = Number(PRICING.monthly.display.replace(/[^\d.]/g, ''))
const annualNum = Number(PRICING.annual.display.replace(/[^\d.]/g, ''))
const savingsPct = Math.round((1 - annualNum / (monthlyNum * 12)) * 100)
const badgePct = Number((nl.paywall.annualBadge.match(/(\d+)\s*%/) ?? [])[1])
if (badgePct === savingsPct) pass(`annual savings badge is true (${savingsPct}% against ${monthlyNum}×12)`)
else fail('annual savings badge is true', `badge claims ${badgePct}%, the declared prices give ${savingsPct}% — recompute nl/en paywall.annualBadge and annualHint`)

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

// The public explainer for the activation model. It is linked from the landing
// page's "hoe het werkt" band AND its footer, and it is listed in sitemap.xml
// and robots.txt — so losing the route in a refactor breaks a link a
// prospective buyer follows mid-argument, and leaves a submitted URL 404ing.
// Cheap to assert, and the failure is otherwise silent.
const explainer = await status(APP_ORIGIN + '/hoe-het-werkt')
if (explainer === 200) pass('/hoe-het-werkt serves (public explainer)')
else fail('/hoe-het-werkt serves', `HTTP ${explainer} — the route may have been dropped from App.tsx, but the landing page and sitemap.xml still point at it`)

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

// ── CONTENT: does every audio path the DB advertises actually resolve? ──────
// The invariant that was broken for MONTHS without anyone noticing: 26 of 30
// lessons had an audio_path pointing at an object that did not exist, because
// the sources exceeded Supabase's 50 MB per-object cap and those uploads had
// silently failed. It is invisible from the app — signStoredAudioUrl returns
// null for a missing object and callers treat that as "no audio", so the player
// simply does not render. No error, no log, no test.
//
// Expectations are derived from the DB rather than hardcoded to 30: the DB is
// the declaration for content, and a lesson added later should be covered
// automatically rather than needing this file edited.
const serviceKey = process.env.CLOUD_SUPABASE_SERVICE_KEY
console.log('\nCONTENT — storage objects backing lessons.audio_path')

if (!serviceKey) {
  console.log('  – skipped (CLOUD_SUPABASE_SERVICE_KEY not set)')
} else {
  const sbHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const base = `https://${PROJECT_REF}.supabase.co`

  const rowsRes = await fetch(
    `${base}/rest/v1/lessons?select=order_index,audio_path&audio_path=not.is.null&order=order_index`,
    { headers: { ...sbHeaders, 'Accept-Profile': 'indonesian' } },
  )
  const rows = rowsRes.ok ? ((await rowsRes.json()) as Array<{ order_index: number; audio_path: string }>) : []

  const listRes = await fetch(`${base}/storage/v1/object/list/indonesian-lessons`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: 'grammar/', limit: 1000 }),
  })
  const objects = listRes.ok
    ? ((await listRes.json()) as Array<{ name: string; metadata: { size?: number } | null }>).filter(o => o.metadata)
    : []
  const sizes = new Map(objects.map(o => [`grammar/${o.name}`, o.metadata!.size ?? 0]))

  const orphans = rows.filter(r => !sizes.has(r.audio_path))
  if (rows.length === 0) {
    fail('lessons advertise audio', 'no lesson has an audio_path — content may not be seeded')
  } else if (orphans.length === 0) {
    pass(`every advertised audio path resolves (${rows.length} lessons)`)
  } else {
    fail(
      'every advertised audio path resolves',
      `${orphans.length}/${rows.length} point at missing objects, e.g. lesson ${orphans[0].order_index} → ${orphans[0].audio_path}. ` +
        'Re-run: bun scripts/migrate-audio-to-cloud.ts',
    )
  }

  // An object at or over the cap means an UNCOMPRESSED upload slipped past the
  // pipeline — the condition that caused the silent failures in the first place.
  const CAP = 50_000_000
  const oversized = [...sizes.entries()].filter(([, s]) => s >= CAP)
  if (oversized.length === 0) pass(`no object at the 50 MB cap (largest ${Math.max(0, ...sizes.values()) / 1e6 | 0} MB)`)
  else fail('no object at the 50 MB cap', `${oversized.length} at/over cap, e.g. ${oversized[0][0]} at ${(oversized[0][1] / 1e6).toFixed(1)} MB — it will fail to upload`)
}

// ── result ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.error(`\nFAILED: ${failures.join(', ')}`)
  console.error('The repo and the live project disagree. Either apply the repo')
  console.error('(make config-push) or update the repo to match a deliberate change.')
  process.exit(1)
}
console.log('Live project matches the repo.\n')
