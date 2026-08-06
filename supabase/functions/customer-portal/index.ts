// supabase/functions/customer-portal/index.ts
//
// §3.3 of docs/plans/2026-07-12-oauth-stripe-entitlement-design.md.
// User-JWT-required. Looks up the caller's stripe_customer_id and creates a
// Stripe Billing Portal session — cancel, payment-method update, and invoice
// history all live in the portal; this app builds no billing UI beyond the
// redirect.
//
// Modeled on commit-capability-answer-report/index.ts — same
// jsonResponse/publicReject idioms, JWT verify via GET /auth/v1/user, and
// service-role PostgREST fetch pattern.

import { getStripeClient, fetchEntitlementColumns } from '../_shared/stripe/index.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function publicReject(status: number, error: string): Response {
  return jsonResponse({ error }, status)
}

interface EntitlementRow {
  stripe_customer_id: string | null
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
  const appBaseUrl = Deno.env.get('APP_BASE_URL')
  if (!supabaseUrl || !serviceRoleKey || !appBaseUrl) {
    return publicReject(500, 'server_not_configured')
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return publicReject(401, 'missing_user_jwt')
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
    const entitlementRow = await fetchEntitlementColumns<EntitlementRow>(supabaseUrl, serviceRoleKey, userId, 'stripe_customer_id')
    const stripeCustomerId = entitlementRow?.stripe_customer_id ?? null
    if (!stripeCustomerId) {
      return publicReject(404, 'no_stripe_customer')
    }

    const stripe = getStripeClient()
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appBaseUrl}/profile`,
    })

    return jsonResponse({ url: portalSession.url })
  } catch (error) {
    console.error('customer_portal_session_failed', error)
    return publicReject(500, 'portal_session_failed')
  }
})
