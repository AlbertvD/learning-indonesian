// src/types/auth.ts
export interface UserProfile {
  id: string
  email: string
  fullName: string | null
  language: 'nl' | 'en'
  preferredSessionSize: number
  timezone: string | null
  isAdmin: boolean
  // Auth-owned authorization state (docs/plans/2026-07-12-oauth-stripe-
  // entitlement-design.md §5): admin OR an active-set entitlement row. Drives
  // the paywall mirror; the server-side gate is set_lesson_activation /
  // can_read_media, this is UX only.
  isEntitled: boolean
}
