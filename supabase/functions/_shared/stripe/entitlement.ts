// supabase/functions/_shared/stripe/entitlement.ts
//
// The convergent fetch-fresh entitlement upsert
// (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3.2/§3.4) —
// reused verbatim by stripe-webhook (checkout.session.completed,
// customer.subscription.updated/deleted) and verify-checkout. Every writer
// passes an already-fresh Stripe.Subscription (retrieved from the Stripe API
// immediately before calling this), so applying the same event twice, or two
// events out of order, both converge on Stripe's current truth — no ordering
// guarantees are required of the caller.
//
// PostgREST fetch pattern follows commit-capability-answer-report/index.ts:
// service-role bearer + apikey, Accept-Profile/Content-Profile: indonesian.

import type Stripe from 'npm:stripe@22.3.1'
import { deriveEntitlementStatus, type StripeEntitlementStatus } from './status.ts'

interface UpsertEntitlementParams {
  supabaseUrl: string
  serviceRoleKey: string
  userId: string
  stripeCustomerId: string
  subscription: Stripe.Subscription
}

/**
 * Upserts `indonesian.entitlements` keyed on the primary key (`user_id`)
 * with the full Stripe-derived state: customer id, subscription id, derived
 * status, and current_period_end. `source` is always written as `'stripe'`
 * — the only two writers of this helper are the checkout-completion and
 * subscription-lifecycle paths, both Stripe-sourced (§3.2 step 3: "and the
 * derived status … a new subscriber must come out of this handler active").
 */
export async function upsertEntitlementFromSubscription(
  params: UpsertEntitlementParams,
): Promise<StripeEntitlementStatus> {
  const { supabaseUrl, serviceRoleKey, userId, stripeCustomerId, subscription } = params
  const status = deriveEntitlementStatus(subscription)
  const currentPeriodEnd = typeof subscription.current_period_end === 'number'
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null

  const response = await fetch(`${supabaseUrl}/rest/v1/entitlements?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      'Accept-Profile': 'indonesian',
      'Content-Profile': 'indonesian',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([{
      user_id: userId,
      status,
      source: 'stripe',
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscription.id,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    }]),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`entitlement_upsert_failed:${response.status}:${detail}`)
  }

  return status
}

interface EntitlementRow {
  user_id: string
}

async function fetchEntitlementUserId(
  supabaseUrl: string,
  serviceRoleKey: string,
  filter: string,
): Promise<string | null> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/entitlements?${filter}&select=user_id&limit=1`,
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
  const row = Array.isArray(rows) ? (rows[0] as EntitlementRow | undefined) : undefined
  return row?.user_id ?? null
}

/**
 * Resolves the owning user_id for a `customer.subscription.updated|deleted`
 * event: match by `stripe_subscription_id` first, falling back to
 * `stripe_customer_id` (§3.2 step 3). Both filters are plain `eq.` equality
 * against a NOT NULL-at-match-time column — a comp row with both Stripe id
 * columns still null can never satisfy either filter, so an untouched comp
 * row is structurally unreachable here (§3.2 "Comp rows and the webhook").
 */
export async function findEntitlementUserIdForSubscription(
  supabaseUrl: string,
  serviceRoleKey: string,
  { subscriptionId, customerId }: { subscriptionId: string; customerId: string },
): Promise<string | null> {
  const bySubscription = await fetchEntitlementUserId(
    supabaseUrl,
    serviceRoleKey,
    `stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
  )
  if (bySubscription) return bySubscription

  return fetchEntitlementUserId(
    supabaseUrl,
    serviceRoleKey,
    `stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
  )
}
