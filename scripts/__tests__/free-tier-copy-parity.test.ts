// scripts/__tests__/free-tier-copy-parity.test.ts
//
// The free-tier boundary is advertised in prose across nine places (marketing
// meta tags, the landing page, the terms/profile copy, the public loanword
// page) and enforced in exactly two (indonesian.is_free_tier_lesson and
// FREE_TIER_MAX_LESSON). HC55 pins the two enforcement points to each other.
// NOTHING pinned the prose — so narrowing the tier from lessons 1-3 to lesson 1
// on 2026-08-08 left "Les 1 t/m 3 gratis" live on the landing page, the social
// preview and the SEO page until a grep caught them. A ninth site was missed on
// the first pass entirely.
//
// Advertising a larger free tier than the gate actually grants is a consumer
// claim, not a typo — same class as the price parity check in
// check-cloud-config.ts, and closed the same way: derive the forbidden strings
// from the constant so this test re-aims itself whenever the boundary moves.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FREE_TIER_MAX_LESSON } from '@/services/entitlementService'

const root = resolve(__dirname, '../..')

/** Every file that states the free-tier boundary in user-facing prose. */
const COPY_SURFACES = [
  'index.html',
  'src/pages/Landing.copy.ts',
  'src/lib/i18n.ts',
  'src/pages/Leenwoorden.tsx',
]

/**
 * Phrasings that would claim MORE free lessons than the gate grants, generated
 * from the constant. Covers the NL and EN shapes actually used in this repo
 * ("Les 1 t/m 3", "Les 1 tot en met 3", "Lessons 1-3", "lessons 1 through 3").
 * Checked up to 30 — the full course — so any inflated claim is caught, not
 * just an off-by-one.
 */
function forbiddenClaims(): string[] {
  const out: string[] = []
  for (let n = FREE_TIER_MAX_LESSON + 1; n <= 30; n++) {
    out.push(
      `les 1 t/m ${n}`,
      `les 1 tot en met ${n}`,
      `lessen 1 tot en met ${n}`,
      `lessons 1-${n}`,
      `lessons 1–${n}`,
      `lessons 1 to ${n}`,
      `lessons 1 through ${n}`,
    )
  }
  return out
}

describe('free-tier copy matches the enforced boundary', () => {
  it('generates a non-empty forbidden set (guards the guard)', () => {
    // If FREE_TIER_MAX_LESSON were ever >= 30 this test would silently pass on
    // an empty set and assert nothing.
    expect(forbiddenClaims().length).toBeGreaterThan(0)
  })

  it.each(COPY_SURFACES)('%s advertises no more than the free tier grants', (file) => {
    const text = readFileSync(resolve(root, file), 'utf8').toLowerCase()
    const violations = forbiddenClaims().filter(claim => text.includes(claim))
    expect(
      violations,
      `${file} advertises a free tier wider than FREE_TIER_MAX_LESSON=${FREE_TIER_MAX_LESSON}: ${violations.join(', ')}`,
    ).toEqual([])
  })
})
