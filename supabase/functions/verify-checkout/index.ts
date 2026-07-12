// supabase/functions/verify-checkout/index.ts
//
// §3.4 of docs/plans/2026-07-12-oauth-stripe-entitlement-design.md.
// User-JWT-required. Called once by the /checkout/success page with the
// session_id from the success URL. Makes activation after payment
// deterministic on the success page itself, instead of a poll racing the
// webhook — the user's own return click is the primary writer; the webhook
// (stripe-webhook/index.ts) covers ongoing lifecycle and the
// user-never-returned case. Both writers call the same convergent
// fetch-fresh upsert (_shared/stripe/entitlement.ts), so either order is
// safe.
//
// Modeled on commit-capability-answer-report/index.ts — same
// jsonResponse/publicReject/isRecord idioms and JWT verify pattern.

import { getStripeClient, upsertEntitlementFromSubscription, fetchEntitlementColumns, resolveId } from '../_shared/stripe/index.ts'

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
  status: string
}

// Not-yet-paid fallback: the row's current status (created no later than
// create-checkout-session §3.1 step 2 — either a fresh 'canceled' row or an
// existing comp/'stripe' row). Defaults to 'canceled' if the row is somehow
// missing, matching the brand-new-row default used elsewhere.
async function fetchCurrentStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<string> {
  const row = await fetchEntitlementColumns<EntitlementRow>(supabaseUrl, serviceRoleKey, userId, 'status')
  return row?.status ?? 'canceled'
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
  if (!supabaseUrl || !serviceRoleKey) {
    return publicReject(500, 'server_not_configured')
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return publicReject(401, 'missing_user_jwt')
  }

  const body = await request.json().catch(() => null)
  const sessionId = isRecord(body) && typeof body.sessionId === 'string' ? body.sessionId : null
  if (!sessionId) {
    return publicReject(400, 'missing_session_id')
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: serviceRoleKey },
  })
  if (!userResponse.ok) {
    return publicReject(401, 'invalid_user_jwt')
  }
  const user = await userResponse.json()
  const userId = typeof user?.id === 'string' ? user.id : null
  if (!userId) {
    return publicReject(401, 'invalid_user_jwt')
  }

  try {
    const stripe = getStripeClient()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.client_reference_id !== userId) {
      return publicReject(403, 'user_mismatch')
    }

    if (session.payment_status !== 'paid') {
      const status = await fetchCurrentStatus(supabaseUrl, serviceRoleKey, userId)
      return jsonResponse({ status })
    }

    const customerId = resolveId(session.customer)
    const subscriptionId = resolveId(session.subscription)
    if (!customerId || !subscriptionId) {
      console.error('verify_checkout_paid_session_missing_subscription', { sessionId, customerId, subscriptionId })
      return publicReject(500, 'checkout_session_incomplete')
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const status = await upsertEntitlementFromSubscription({
      supabaseUrl,
      serviceRoleKey,
      userId,
      stripeCustomerId: customerId,
      subscription,
    })

    return jsonResponse({ status })
  } catch (error) {
    console.error('verify_checkout_failed', error)
    return publicReject(500, 'verify_checkout_failed')
  }
})
