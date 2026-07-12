// supabase/functions/_shared/stripe/ids.ts
//
// Stripe's expandable reference fields (`session.customer`,
// `session.subscription`, `subscription.customer`, ...) come back as either
// a bare id string or an expanded object with an `id` field, depending on
// whether the caller requested expansion. Shared by stripe-webhook and
// verify-checkout, both of which read these fields without expansion
// (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3.2/§3.4).

export function resolveId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}
