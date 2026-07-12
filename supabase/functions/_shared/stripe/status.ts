// supabase/functions/_shared/stripe/status.ts
//
// Pure Stripe-subscription-state → indonesian.entitlements.status derivation
// (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3.2/§3.4). Zero
// Deno imports on purpose — importable by both the edge runtime and Vitest
// (see src/__tests__/stripeEntitlementStatus.test.ts), so the mapping is
// unit-tested without a Deno/Stripe test harness.

export type StripeEntitlementStatus = 'active' | 'past_due' | 'canceled'

// Deliberately narrower than Stripe.Subscription — this function only ever
// reads `.status`, so callers (including tests) can pass a plain object
// instead of pulling in the full `npm:stripe` SDK type.
export interface SubscriptionStatusInput {
  status: string
}

/**
 * Maps a Stripe subscription's lifecycle status to the entitlement status
 * stored in `indonesian.entitlements` (CHECK constraint: source='stripe' ⇒
 * status in ('active','past_due','canceled') — see migration §1).
 *
 * - `active` | `trialing` → `active` (no trials at launch per §3 owner
 *   decision, but `trialing` is mapped defensively — the CHECK constraint
 *   only has three stripe-branch buckets, and a trialing subscriber has
 *   access).
 * - `past_due` → `past_due` (Stripe dunning window; access stays on per
 *   the §1 "past_due grants access" design note).
 * - Everything else — the named terminal states (`canceled`, `unpaid`,
 *   `incomplete_expired`), `paused` (explicitly "treat paused as canceled"
 *   per spec), and any other/unknown Stripe status (e.g. pre-payment
 *   `incomplete`) — collapses to `canceled`. There is no fourth bucket in
 *   the CHECK constraint to fall back to.
 */
export function deriveEntitlementStatus(subscription: SubscriptionStatusInput): StripeEntitlementStatus {
  switch (subscription.status) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
      return 'past_due'
    default:
      return 'canceled'
  }
}
