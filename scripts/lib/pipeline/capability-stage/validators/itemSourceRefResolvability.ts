/**
 * validators/itemSourceRefResolvability.ts — issue #59.
 *
 * Defensive guard against slug-normalization drift between the cap
 * source_ref generator and the DB learning_items.normalized_text writer.
 * Every item-source-kind capability's source_ref must resolve to a
 * learning_items row in the same staging snapshot, where "resolves" means
 * the slug component matches `itemSlug(item.base_text)` for some item.
 *
 * The runtime resolver (src/services/capabilityContentService.ts:107-114)
 * is strict: a mismatch silently skips the exercise rather than failing
 * loudly. Pre-2026-05-17 the production pipeline used a hyphenating slug
 * generator (scripts/lib/content-pipeline-output.ts:stableSlug) while the
 * DB writer preserved spaces — ~113 multi-word items were unreachable.
 *
 * This validator throws synchronously before upsertCapabilities writes
 * to the DB. Mirror of validators/lessonId.ts (Decision 3b PR-1).
 *
 * See ADR 0006 (the validator pattern), issue #59 (the bug), and the
 * `itemSlug` helper at src/lib/capabilities/itemSlug.ts (the canonical
 * slug derivation).
 */

import { itemSlug } from '@/lib/capabilities'

// Minimal structural types — decoupled from CapabilityInput / LearningItemInput
// so the runner can pass `staging.learningItems` (LearningItemStagingRow[])
// without an unsound cast.
type CapForValidation = {
  canonicalKey: string
  sourceKind: string
  sourceRef: string
}
type ItemForValidation = { base_text: string }

const ITEM_REF_PREFIX = 'learning_items/'

function extractItemSlug(sourceRef: string): string | null {
  if (!sourceRef.startsWith(ITEM_REF_PREFIX)) return null
  return sourceRef.slice(ITEM_REF_PREFIX.length)
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  const curr = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    prev = curr.slice()
  }
  return prev[n]
}

function closestSlug(target: string, slugs: ReadonlyArray<string>): string | null {
  if (slugs.length === 0) return null
  let best = slugs[0]
  let bestScore = Number.POSITIVE_INFINITY
  for (const s of slugs) {
    const score = levenshtein(target, s)
    if (score < bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

export function validateItemSourceRefResolvability(
  capabilities: ReadonlyArray<CapForValidation>,
  learningItems: ReadonlyArray<ItemForValidation>,
): void {
  const itemSlugs = new Set(learningItems.map((it) => itemSlug(it.base_text)))
  const slugList = [...itemSlugs]
  const violations: { sourceRef: string; slug: string; closest: string | null }[] = []
  for (const c of capabilities) {
    if (c.sourceKind !== 'vocabulary_src') continue
    const slug = extractItemSlug(c.sourceRef)
    if (slug == null) continue
    if (itemSlugs.has(slug)) continue
    violations.push({
      sourceRef: c.sourceRef,
      slug,
      closest: closestSlug(slug, slugList),
    })
  }
  if (violations.length === 0) return
  const sample = violations
    .slice(0, 5)
    .map((v) => `${v.sourceRef} (closest item: ${v.closest ?? 'none'})`)
    .join('; ')
  throw new Error(
    `[itemSourceRefResolvability validator] ${violations.length} item-source-kind ` +
      `capability/ies have source_ref slugs that do not match any learning_item in ` +
      `the staging snapshot. Sample: ${sample}. ` +
      `Either declare the missing item in learning-items.ts or fix the slug. ` +
      `See issue #59.`,
  )
}
