// supabase/functions/_shared/stripe/client.ts
//
// Stripe client construction for the Deno edge runtime
// (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3). Deno has no
// Node `http`/`https` module, so the SDK's default Node HTTP client can't
// run here — `Stripe.createFetchHttpClient()` is the SDK's documented Deno
// workaround (github.com/stripe/stripe-node#usage-with-deno).

import Stripe from 'npm:stripe@22.3.1'

export function getStripeClient(): Stripe {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!secretKey) {
    throw new Error('stripe_not_configured')
  }
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}
