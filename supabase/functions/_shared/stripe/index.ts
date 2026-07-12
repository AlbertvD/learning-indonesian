// supabase/functions/_shared/stripe/index.ts
//
// Barrel for the Stripe shared module (cf. the established `_shared/`
// pattern for cross-function code). Consumers:
// create-checkout-session, stripe-webhook, customer-portal, verify-checkout,
// delete-account.

export { getStripeClient } from './client.ts'
export { deriveEntitlementStatus } from './status.ts'
export type { StripeEntitlementStatus, SubscriptionStatusInput } from './status.ts'
export {
  upsertEntitlementFromSubscription,
  findEntitlementUserIdForSubscription,
  fetchEntitlementColumns,
} from './entitlement.ts'
