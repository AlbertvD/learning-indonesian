// scripts/lib/registerPairVariants.ts
//
// Pure reader/mapper feeding `enrich-answer-variants.ts`'s APPLY path as a
// SECOND, deterministic candidate source (docs/plans/2026-07-09-spreektaal
// -lesson-woven-core.md §7, build order step 5) alongside the LLM-authored
// artifact — no LLM call, closed list, sourced from the committed
// `scripts/data/register-pairs-intersection.json` `pairs` key (the
// authoritative scheduled core — CONTRACT fixed by `register-pairs-report.ts`
// and read by `check-supabase-deep.ts`'s HC45/HC47).
//
// Only produces the FORMAL item's row (spec §7): variant_text = informal
// form, language = 'id', variant_type = 'informal'. Never a row on the
// informal item — informal items are receptive-only (spec §4), so a typed-ID
// grader never runs against them; the reader-union at
// `src/lib/exercise-content/byKind/item.ts:140-145` (shipped, PR #414) reads
// the formal item's variant set for the informal item's own recall exercises.
import { itemSlug } from '@/lib/capabilities/itemSlug'
import type { CandidateVariant } from './answerVariants'

export interface RegisterPairEntry {
  formal: string
  informal: string
}

export interface RegisterPairIntersectionReport {
  pairs: RegisterPairEntry[]
}

/**
 * `learning_items` rows carry punctuation as part of the headword for
 * question words (normalized_text = 'bagaimana?', 'apa?', ...), but
 * `register-pairs.ts` authors `formal` without it. Mirrors
 * `register-pairs-report.ts`'s `slugVariants()` exactly — the same
 * resolution that produced the committed intersection report's `pairs` in
 * the first place, so this reader can't diverge from what generated its own
 * input and silently drop a resolvable CORE pair (caught live: 'bagaimana'
 * resolves only via 'bagaimana?').
 */
export function registerPairSlugVariants(word: string): string[] {
  const base = itemSlug(word)
  return [base, `${base}?`, `${base}!`]
}

/**
 * Map the intersection report's `pairs` (the authoritative scheduled core)
 * into `item_answer_variants` candidates, resolved against a formal-item
 * lookup the caller has already fetched from the live DB (keyed by every
 * `registerPairSlugVariants` entry -> learning_items.id). A pair whose
 * formal twin isn't live (schema drift since the intersection report was
 * generated, phrase-anchored rows whose twin is never its own item, or a
 * `--dry-run` before the anchor lesson publishes) is reported in
 * `unresolved`, never fabricated. Pure — no I/O, unit-tested without a DB or
 * filesystem.
 */
export function mapRegisterPairsToCandidates(
  pairs: readonly RegisterPairEntry[],
  formalItemIdBySlug: ReadonlyMap<string, string>,
): { candidates: CandidateVariant[]; unresolved: RegisterPairEntry[] } {
  const candidates: CandidateVariant[] = []
  const unresolved: RegisterPairEntry[] = []
  for (const pair of pairs) {
    let id: string | undefined
    for (const variant of registerPairSlugVariants(pair.formal)) {
      id = formalItemIdBySlug.get(variant)
      if (id) break
    }
    if (!id) {
      unresolved.push(pair)
      continue
    }
    candidates.push({
      learningItemId: id,
      language: 'id',
      variantText: pair.informal,
      variantType: 'informal',
    })
  }
  return { candidates, unresolved }
}
