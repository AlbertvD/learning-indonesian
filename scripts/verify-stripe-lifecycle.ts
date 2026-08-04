#!/usr/bin/env bun
// scripts/verify-stripe-lifecycle.ts
//
// The launch-runbook Phase 3 subscription-lifecycle checks, end to end against
// Supabase Cloud + the Stripe SANDBOX. Covers what mocks structurally cannot:
// the customer portal, cancel-at-period-end, webhook idempotency, signature
// enforcement, and the server-side paywall as a genuinely fresh account
// experiences it.
//
//   make verify-stripe-lifecycle
//
// ⚠ NEVER RUN AGAINST LIVE. This script MUTATES a subscription — it sets
// cancel_at_period_end=true, asserts the entitlement survives, then reverts.
// With live keys that is a real customer's subscription being cancelled and
// uncancelled, plus whatever mail Stripe sends them along the way. The sk_test_
// guard below is a hard stop, and it is why this is NOT in `make pre-deploy`.
//
// It also creates and deletes a throwaway auth user, because the E2E test
// account now HOLDS an entitlement and therefore cannot prove the deny path.
// The user is removed in a finally block.
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

// Hard stop, before anything is read or written.
if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
  console.error(
    'REFUSING TO RUN: STRIPE_SECRET_KEY is not an sk_test_ key.\n' +
    "This script cancels and uncancels a subscription. Against live keys that is a\n" +
    'paying customer. Point it at the sandbox.',
  )
  process.exit(1)
}

const SB = 'https://wodpkxsmildtgndnbraa.supabase.co'
const ANON = process.env.CLOUD_SUPABASE_ANON_KEY!
const SVC = process.env.CLOUD_SUPABASE_SERVICE_KEY!
const SK = process.env.STRIPE_SECRET_KEY!
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET!
const TEST_USER = '747c72fd-abfa-465a-a305-67ecba05ec48'
const SUB_ID = 'sub_1TzFP8FHQPtw4Bclcw0ULaCU'

let pass = 0
const fails: string[] = []
const ok = (n: string, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`) }
const no = (n: string, d: string) => { fails.push(n); console.log(`  ✗ ${n}\n      ${d}`) }

const sbHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Accept-Profile': 'indonesian', 'Content-Profile': 'indonesian' }
const stripeAuth = { Authorization: `Basic ${Buffer.from(SK + ':').toString('base64')}` }

async function stripeGet(path: string) {
  return (await fetch(`https://api.stripe.com/v1/${path}`, { headers: stripeAuth })).json()
}
async function stripePost(path: string, body: Record<string, string>) {
  return (await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST', headers: { ...stripeAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })).json()
}
async function entitlement(userId: string) {
  const r = await fetch(`${SB}/rest/v1/entitlements?user_id=eq.${userId}&select=*`, { headers: sbHeaders })
  return (await r.json())[0] ?? null
}
async function token(email: string, password: string) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await r.json()).access_token as string | undefined
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── 1. Customer portal ──────────────────────────────────────────────────────
console.log('\n1. CUSTOMER PORTAL')
const userTok = await token('testuser@duin.home', 'TestUser123!')
{
  const r = await fetch(`${SB}/functions/v1/customer-portal`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${userTok}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const b = await r.json()
  if (r.ok && typeof b.url === 'string' && b.url.includes('billing.stripe.com')) ok('portal session created', b.url.slice(0, 48) + '…')
  else no('portal session created', `HTTP ${r.status} ${JSON.stringify(b).slice(0, 200)}`)
}

// ── 2. Cancel at period end ─────────────────────────────────────────────────
console.log('\n2. CANCEL AT PERIOD END (the ToS promise: access runs to end of paid period)')
const before = await entitlement(TEST_USER)
{
  const upd = await stripePost(`subscriptions/${SUB_ID}`, { cancel_at_period_end: 'true' })
  if (upd.cancel_at_period_end === true) ok('stripe: cancel_at_period_end set')
  else no('stripe: cancel_at_period_end set', JSON.stringify(upd).slice(0, 200))
  await sleep(6000) // let the webhook land
  const after = await entitlement(TEST_USER)
  if (after?.status === 'active') ok('entitlement stays active after cancel', `status=${after.status}`)
  else no('entitlement stays active after cancel', `status=${after?.status} — access revoked early, contradicts /voorwaarden §3`)
  if (after?.current_period_end === before?.current_period_end) ok('period end unchanged', String(after?.current_period_end))
  else no('period end unchanged', `${before?.current_period_end} -> ${after?.current_period_end}`)
  if (after?.updated_at !== before?.updated_at) ok('webhook actually processed the update', `updated_at moved`)
  else no('webhook actually processed the update', 'updated_at did not move — webhook may not have fired')
}

// ── 3. Webhook replay is a no-op ────────────────────────────────────────────
console.log('\n3. WEBHOOK REPLAY IDEMPOTENCY')
{
  const sub = await stripeGet(`subscriptions/${SUB_ID}`)
  const evtId = `evt_probe_${Date.now()}`
  const payload = JSON.stringify({
    id: evtId, object: 'event', api_version: '2026-06-24.dahlia', created: Math.floor(Date.now() / 1000),
    type: 'customer.subscription.updated', data: { object: sub },
  })
  const send = async () => {
    const t = Math.floor(Date.now() / 1000)
    const sig = createHmac('sha256', WHSEC).update(`${t}.${payload}`).digest('hex')
    const r = await fetch(`${SB}/functions/v1/stripe-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}`, apikey: ANON },
      body: payload,
    })
    return { status: r.status, body: await r.json().catch(() => ({})) }
  }
  const first = await send()
  const second = await send()
  if (first.status === 200 && !first.body.idempotent) ok('first delivery processed', JSON.stringify(first.body))
  else no('first delivery processed', `HTTP ${first.status} ${JSON.stringify(first.body)}`)
  if (second.status === 200 && second.body.idempotent === true) ok('replay is a no-op', JSON.stringify(second.body))
  else no('replay is a no-op', `HTTP ${second.status} ${JSON.stringify(second.body)} — double-processing risk`)

  // and an unsigned POST must be rejected
  const bad = await fetch(`${SB}/functions/v1/stripe-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: payload,
  })
  if (bad.status === 400) ok('unsigned POST rejected', 'HTTP 400')
  else no('unsigned POST rejected', `HTTP ${bad.status} — signature check not enforcing`)
}

// ── 4. Restore the subscription ─────────────────────────────────────────────
console.log('\n4. RESTORE')
{
  const upd = await stripePost(`subscriptions/${SUB_ID}`, { cancel_at_period_end: 'false' })
  if (upd.cancel_at_period_end === false) ok('cancel_at_period_end reverted')
  else no('cancel_at_period_end reverted', JSON.stringify(upd).slice(0, 160))
}

// ── 5. Fresh non-entitled account hits the paywall ──────────────────────────
console.log('\n5. FRESH NON-ENTITLED ACCOUNT')
const probeEmail = `paywall-probe-${Date.now()}@kamoebisa.nl`
let probeId = ''
try {
  const created = await fetch(`${SB}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: probeEmail, password: 'ProbeUser123!', email_confirm: true }),
  })
  const cu = await created.json()
  probeId = cu.id
  if (probeId) ok('probe user created', probeEmail)
  else no('probe user created', JSON.stringify(cu).slice(0, 200))

  const ent = await entitlement(probeId)
  if (!ent) ok('probe user has no entitlement')
  else no('probe user has no entitlement', JSON.stringify(ent).slice(0, 120))

  const ptok = await token(probeEmail, 'ProbeUser123!')
  if (!ptok) throw new Error('probe user could not sign in')

  const lessonsRes = await fetch(`${SB}/rest/v1/lessons?select=id,order_index,audio_path&order=order_index&limit=6`, { headers: sbHeaders })
  const lessons = await lessonsRes.json() as Array<{ id: string; order_index: number; audio_path: string | null }>
  const free = lessons.find(l => l.order_index === 3)!
  const paid = lessons.find(l => l.order_index === 4)!

  const activate = async (lessonId: string) => {
    const r = await fetch(`${SB}/rest/v1/rpc/set_lesson_activation`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ptok}`, 'Content-Type': 'application/json', 'Content-Profile': 'indonesian' },
      body: JSON.stringify({ p_user_id: probeId, p_lesson_id: lessonId, p_activated: true }),
    })
    return { status: r.status, body: await r.text() }
  }
  const a3 = await activate(free.id)
  if (a3.status < 300) ok('free lesson 3 activates', `HTTP ${a3.status}`)
  else no('free lesson 3 activates', `HTTP ${a3.status} ${a3.body.slice(0, 160)}`)

  const a4 = await activate(paid.id)
  if (a4.status >= 400 && /entitlement_required/.test(a4.body)) ok('paid lesson 4 blocked', 'entitlement_required')
  else no('paid lesson 4 blocked', `HTTP ${a4.status} ${a4.body.slice(0, 200)} — PAYWALL NOT ENFORCED SERVER-SIDE`)

  const sign = async (path: string) => {
    const r = await fetch(`${SB}/storage/v1/object/sign/indonesian-lessons/${path}`, {
      method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ptok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 60 }),
    })
    return r.status
  }
  if (free.audio_path) {
    const s = await sign(free.audio_path)
    if (s === 200) ok('free lesson audio signs', `HTTP ${s}`)
    else no('free lesson audio signs', `HTTP ${s} — free tier cannot hear lesson 3`)
  }
  if (paid.audio_path) {
    const s = await sign(paid.audio_path)
    if (s >= 400) ok('paid lesson audio refused', `HTTP ${s}`)
    else no('paid lesson audio refused', `HTTP ${s} — PRIVATE BUCKET LEAKING PAID AUDIO`)
  }
} finally {
  if (probeId) {
    await fetch(`${SB}/auth/v1/admin/users/${probeId}`, { method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } })
    console.log(`  · probe user ${probeId.slice(0, 8)}… deleted`)
  }
}

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { console.error('FAILED: ' + fails.join(', ')); process.exit(1) }
