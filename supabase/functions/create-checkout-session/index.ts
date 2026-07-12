// supabase/functions/create-checkout-session/index.ts
//
// §3.1 of docs/plans/2026-07-12-oauth-stripe-entitlement-design.md.
// User-JWT-required. Creates (or reuses) the caller's Stripe Customer, then
// a subscription-mode Checkout Session for one of the two configured prices.
//
// Modeled on commit-capability-answer-report/index.ts — same
// jsonResponse/publicReject/isRecord idioms, JWT verify via
// GET /auth/v1/user, and service-role PostgREST fetch pattern.

import { getStripeClient } from '../_shared/stripe/index.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function publicReject(status: number, error: string): Response {
  return jsonResponse({ error }, status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

interface EntitlementRow {
  stripe_customer_id: string | null
}

async function fetchEntitlementRow(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<EntitlementRow | null> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Accept-Profile': 'indonesian',
      },
    },
  )
  if (!response.ok) throw new Error(`entitlement_lookup_failed:${response.status}`)
  const rows = await response.json().catch(() => null)
  return Array.isArray(rows) ? (rows[0] as EntitlementRow | undefined) ?? null : null
}

// Persists a freshly-created Stripe customer id on the caller's entitlement
// row. §3.1 step 2: an existing row (e.g. a comp user starting a checkout)
// keeps its status/source untouched — this is a partial PATCH, never a full
// upsert. A brand-new row is `source='stripe', status='canceled'` — both
// required explicitly by the entitlements CHECK constraint (migration §1).
async function persistStripeCustomerId(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  stripeCustomerId: string,
  hadExistingRow: boolean,
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json',
    'Accept-Profile': 'indonesian',
    'Content-Profile': 'indonesian',
    Prefer: 'return=minimal',
  }

  const response = hadExistingRow
    ? await fetch(`${supabaseUrl}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() }),
      })
    : await fetch(`${supabaseUrl}/rest/v1/entitlements`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{
          user_id: userId,
          status: 'canceled',
          source: 'stripe',
          stripe_customer_id: stripeCustomerId,
        }]),
      })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`entitlement_customer_persist_failed:${response.status}:${detail}`)
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok')
  }
  if (request.method !== 'POST') {
    return publicReject(405, 'method_not_allowed')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const priceMonthly = Deno.env.get('STRIPE_PRICE_MONTHLY')
  const priceAnnual = Deno.env.get('STRIPE_PRICE_ANNUAL')
  const appBaseUrl = Deno.env.get('APP_BASE_URL')
  if (!supabaseUrl || !serviceRoleKey || !priceMonthly || !priceAnnual || !appBaseUrl) {
    return publicReject(500, 'server_not_configured')
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return publicReject(401, 'missing_user_jwt')
  }

  const body = await request.json().catch(() => null)
  const priceId = isRecord(body) && typeof body.priceId === 'string' ? body.priceId : null
  if (!priceId || (priceId !== priceMonthly && priceId !== priceAnnual)) {
    return publicReject(400, 'invalid_price')
  }

  // 1. Verify the caller's JWT.
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: serviceRoleKey },
  })
  if (!userResponse.ok) {
    return publicReject(401, 'invalid_user_jwt')
  }
  const user = await userResponse.json()
  const userId = typeof user?.id === 'string' ? user.id : null
  const userEmail = typeof user?.email === 'string' ? user.email : undefined
  if (!userId) {
    return publicReject(401, 'invalid_user_jwt')
  }

  try {
    const stripe = getStripeClient()

    // 2. Reuse or create the Stripe Customer.
    const existingRow = await fetchEntitlementRow(supabaseUrl, serviceRoleKey, userId)
    let stripeCustomerId = existingRow?.stripe_customer_id ?? null
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabase_user_id: userId },
      })
      stripeCustomerId = customer.id
      await persistStripeCustomerId(supabaseUrl, serviceRoleKey, userId, stripeCustomerId, existingRow !== null)
    }

    // 3. Create the Checkout Session.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${appBaseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}/checkout/cancel`,
    })

    if (!session.url) {
      throw new Error('checkout_session_missing_url')
    }

    // 4. Return the redirect URL.
    return jsonResponse({ url: session.url })
  } catch (error) {
    console.error('create_checkout_session_failed', error)
    return publicReject(500, 'checkout_session_failed')
  }
})
