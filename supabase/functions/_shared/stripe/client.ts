// supabase/functions/_shared/stripe/client.ts
//
// Stripe client construction for the Deno edge runtime
// (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3). Deno has no
// Node `http`/`https` module, so the SDK's default Node HTTP client can't
// run here — `Stripe.createFetchHttpClient()` is the SDK's documented Deno
// workaround (github.com/stripe/stripe-node#usage-with-deno).

import Stripe from 'npm:stripe@22.3.1'

// Pin the API version explicitly rather than trusting the SDK's built-in
// default. Without a pin, `subscription.current_period_end` reads `null`
// for every subscriber (CONFIRMED in integration review) — Stripe moved
// billing-cycle fields onto each subscription ITEM in newer API versions,
// and an unpinned client silently rides whatever version Stripe's dashboard
// account default happens to be, which drifts independently of this code.
// '2026-06-24.dahlia' is the version `npm:stripe@22.3.1` ships as its
// default (verified via `Stripe.ApiVersion` in the installed package) — the
// pin makes that version an explicit, reviewable fact instead of an
// implicit one.
const STRIPE_API_VERSION = '2026-06-24.dahlia'

export function getStripeClient(): Stripe {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!secretKey) {
    throw new Error('stripe_not_configured')
  }
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  })
}
