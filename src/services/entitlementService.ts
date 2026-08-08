// src/services/entitlementService.ts
//
// CRUD-shaped reader for indonesian.entitlements (auth + entitlement spine,
// docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §1/§5). The table
// is owner-RLS-readable only — every authenticated user can read exactly
// their own row (or none), so there is no hidden logic here beyond a status-
// set membership check. Writes are service-role only (Stripe webhook +
// admin comp inserts) and live in the edge functions, not this file.

import { supabase } from '@/lib/supabase'

export type EntitlementStatus = 'active' | 'past_due' | 'canceled' | 'comped'
export type EntitlementSource = 'stripe' | 'comp'

export interface Entitlement {
  user_id: string
  status: EntitlementStatus
  source: EntitlementSource
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
}

// The statuses that grant access. Mirrors indonesian.has_active_entitlement's
// `status in ('active', 'past_due', 'comped')` predicate (scripts/migration.sql)
// — keep these two definitions in sync if the set ever changes.
const ACTIVE_STATUSES: ReadonlySet<EntitlementStatus> = new Set(['active', 'past_due', 'comped'])

export function isActiveStatus(status: EntitlementStatus): boolean {
  return ACTIVE_STATUSES.has(status)
}

// TS twin of indonesian.is_free_tier_lesson(p_order_index) (scripts/migration.sql):
// `select p_order_index <= 1`. Free tier = lesson 1, which is also the set
// auto-activated for every new sign-in (authStore.ts activateStarterLessons
// derives its list from THIS constant — do not re-hardcode it there).
// The SQL function is the load-bearing gate (set_lesson_activation,
// can_read_media); this constant only drives the client paywall mirror and the
// starter activation. Change both sites together — HC55 fails the build if the
// two disagree, and it reads this constant rather than hardcoding a boundary.
export const FREE_TIER_MAX_LESSON = 1

export const entitlementService = {
  // Returns the caller's own entitlement row, or null if they have never had
  // one (free-tier-only user). Owner RLS means this can never return another
  // user's row — passing a different userId than the signed-in caller simply
  // yields the same (own) row or null, never a cross-user read.
  async getEntitlement(userId: string): Promise<Entitlement | null> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('entitlements')
      .select('user_id, status, source, stripe_customer_id, stripe_subscription_id, current_period_end')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },
}
