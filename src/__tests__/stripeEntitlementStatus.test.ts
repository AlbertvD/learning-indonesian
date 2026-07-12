// Unit test for the pure Stripe status-derivation function
// (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3.2/§3.4).
//
// The module under test lives at supabase/functions/_shared/stripe/status.ts
// — Deno-runtime edge-function code, outside `src/` and the `@/` alias on
// purpose (CLAUDE.md's "never relative `../../` imports" rule scopes to
// imports *within* `src/`; this file has zero Deno imports, so it is plain,
// Vitest-importable TypeScript). vitest.config.ts's `include` globs only
// discover test files under src/**/__tests__ and scripts/**/__tests__ — this
// file's *location* satisfies that; its *import* reaches out to the one
// place the derivation function is allowed to live without duplicating it.
import { describe, expect, it } from 'vitest'
import { deriveEntitlementStatus } from '../../supabase/functions/_shared/stripe/status'

describe('deriveEntitlementStatus', () => {
  it.each([
    ['active', 'active'],
    ['trialing', 'active'],
    ['past_due', 'past_due'],
    ['canceled', 'canceled'],
    ['unpaid', 'canceled'],
    ['incomplete_expired', 'canceled'],
    ['paused', 'canceled'],
  ] as const)('maps Stripe status %s to entitlement status %s', (stripeStatus, expected) => {
    expect(deriveEntitlementStatus({ status: stripeStatus })).toBe(expected)
  })

  it('falls back unknown/future Stripe statuses to canceled (no fourth CHECK bucket)', () => {
    expect(deriveEntitlementStatus({ status: 'incomplete' })).toBe('canceled')
    expect(deriveEntitlementStatus({ status: 'some_future_stripe_status' })).toBe('canceled')
  })
})
