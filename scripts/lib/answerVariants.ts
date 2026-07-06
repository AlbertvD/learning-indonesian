// scripts/lib/answerVariants.ts
//
// The PURE core of `enrich-answer-variants.ts` (APPLY step) — collision-drop
// against the item's curated MCQ distractors, normalization, and DB-row
// shaping. No I/O here (docs/plans/2026-07-06-answer-variant-coverage.md
// §Part 1 step 3): the CLI script (the impure shell) fetches from the DB and
// calls into this module, mirroring the `scripts/collections/projection.ts` +
// `seed-collection.ts` split.
//
// Distractor resolution reuses the PURE `resolveDistractorMaps` from
// `src/lib/exercise-content/byKind/item.ts` — the runtime's OWN distractor
// resolver — so this script can never disagree with what the grader/MCQ
// renderer treats as a wrong option. One-directional: `item_answer_variants`
// is never itself a distractor source, so there is no reverse risk.
import { resolveDistractorMaps } from '@/lib/exercise-content/byKind/item'
import { splitAlternatives } from '@/lib/capabilities'

/** Matches `resolveDistractorMaps`'s inline itemById parameter shape
 *  (byKind/item.ts:76) — not separately exported there, so mirrored here. */
export interface ItemForDistractorResolution {
  base_text: string
  translation_nl: string | null
  translation_en: string | null
}

/** The variant_type values this script may insert. NEVER 'paraphrase' —
 *  reuses the existing CHECK values (migration.sql ~line 271); 'with_prefix' /
 *  'without_prefix' are morphology-pair values, out of scope here. */
export type AcceptedVariantType = 'alternative_translation' | 'informal'
export const ACCEPTED_VARIANT_TYPES: readonly AcceptedVariantType[] = ['alternative_translation', 'informal']

/** One LLM-authored candidate answer for one learning_item, as read from the
 *  committed generate-step artifact. */
export interface CandidateVariant {
  learningItemId: string
  language: string
  variantText: string
  variantType: AcceptedVariantType
}

/** Lowercase-trim normalization applied to every stored variant_text (plan
 *  §Part 1 step 4). Applied identically at insert time and at collision-check
 *  time so a candidate can never dodge the collision check via casing/whitespace. */
export function normalizeVariantText(text: string): string {
  return text.trim().toLowerCase()
}

/**
 * Validate a raw parsed artifact row into a CandidateVariant, or null if it
 * fails validation (defensive — the artifact is LLM-authored, reviewed by a
 * human before apply, but apply must never trust it blindly: a malformed
 * variant_type or empty text must never reach the DB).
 */
export function toCandidateVariant(raw: {
  learningItemId?: unknown
  language?: unknown
  variantText?: unknown
  variantType?: unknown
}): CandidateVariant | null {
  const learningItemId = typeof raw.learningItemId === 'string' ? raw.learningItemId : null
  const language = typeof raw.language === 'string' ? raw.language : null
  const variantText = typeof raw.variantText === 'string' ? raw.variantText.trim() : null
  const variantType = typeof raw.variantType === 'string' ? raw.variantType : null

  if (!learningItemId || !language || !variantText || variantText.length === 0) return null
  if (!variantType || !ACCEPTED_VARIANT_TYPES.includes(variantType as AcceptedVariantType)) return null

  return { learningItemId, language, variantText, variantType: variantType as AcceptedVariantType }
}

/**
 * Drop candidates whose normalized text collides with any of that item's
 * curated MCQ distractor strings — a string that is a wrong answer option
 * must never also grade as correct (plan §Part 1 step 3). `distractorTextsByItem`
 * values must already be normalized the same way (`normalizeVariantText`).
 */
export function dropDistractorCollisions(
  candidates: readonly CandidateVariant[],
  distractorTextsByItem: ReadonlyMap<string, ReadonlySet<string>>,
): { kept: CandidateVariant[]; dropped: CandidateVariant[] } {
  const kept: CandidateVariant[] = []
  const dropped: CandidateVariant[] = []
  for (const c of candidates) {
    const distractors = distractorTextsByItem.get(c.learningItemId)
    const norm = normalizeVariantText(c.variantText)
    if (distractors?.has(norm)) {
      dropped.push(c)
    } else {
      kept.push(c)
    }
  }
  return { kept, dropped }
}

/**
 * Deduplicate candidates that would collapse to the same (item, text,
 * language) after normalization — keeps the first occurrence. Cross-run
 * de-dup is the DB's job (`ON CONFLICT DO NOTHING` on the new unique index);
 * this is just intra-batch tidiness so dry-run counts and INSERT payloads
 * don't carry redundant rows.
 */
export function dedupeCandidates(candidates: readonly CandidateVariant[]): CandidateVariant[] {
  const seen = new Set<string>()
  const out: CandidateVariant[] = []
  for (const c of candidates) {
    const key = `${c.learningItemId} ${normalizeVariantText(c.variantText)} ${c.language}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

/** The exact shape `item_answer_variants` INSERT rows take (plan §Part 1 step 4). */
export interface InsertVariantRow {
  learning_item_id: string
  variant_text: string
  variant_type: AcceptedVariantType
  language: string
  is_accepted: true
}

export function toInsertRow(candidate: CandidateVariant): InsertVariantRow {
  return {
    learning_item_id: candidate.learningItemId,
    variant_text: normalizeVariantText(candidate.variantText),
    variant_type: candidate.variantType,
    language: candidate.language,
    is_accepted: true,
  }
}

/**
 * Compose `resolveDistractorMaps`'s per-capability output into a per-TARGET-item
 * set of normalized distractor strings, for `dropDistractorCollisions` above.
 *
 * `capabilityRows` are the target items' OWN capabilities (id + capability_type +
 * which target item they belong to); `distractorRows` + `distractorItemById` are
 * exactly `resolveDistractorMaps`'s inputs (the pointer table rows resolved to
 * the wrong-option items' renderable text). A capability belongs to exactly one
 * target item, so both curated-distractor maps it returns are re-keyed here from
 * capability_id -> targetItemId and unioned (an item can carry both a recognition
 * cap and a cued-recall cap; a candidate must dodge neither).
 */
export function buildDistractorTextsByItem(
  capabilityRows: ReadonlyArray<{ id: string; capability_type: string; targetItemId: string }>,
  distractorRows: ReadonlyArray<{ capability_id: string; item_id: string }>,
  distractorItemById: ReadonlyMap<string, ItemForDistractorResolution>,
  userLanguage: 'nl' | 'en',
): Map<string, Set<string>> {
  const capTypeById = new Map(capabilityRows.map((r) => [r.id, r.capability_type]))
  const { curatedRecognitionDistractors, curatedCuedRecallDistractors } = resolveDistractorMaps(
    distractorRows, capTypeById, distractorItemById, userLanguage,
  )
  const targetItemByCapId = new Map(capabilityRows.map((r) => [r.id, r.targetItemId]))

  const out = new Map<string, Set<string>>()
  const addAll = (m: Map<string, string[]>) => {
    for (const [capId, strings] of m) {
      const targetId = targetItemByCapId.get(capId)
      if (!targetId) continue
      const set = out.get(targetId) ?? new Set<string>()
      for (const s of strings) set.add(normalizeVariantText(s))
      out.set(targetId, set)
    }
  }
  addAll(curatedRecognitionDistractors)
  addAll(curatedCuedRecallDistractors)
  return out
}

/**
 * Build a corpus map: normalized accepted-answer text -> the set of
 * learning_item ids for which that text is an accepted answer (their primary
 * gloss for ONE language, plus any `/`;`-split alternatives — the same split
 * the runtime grader applies, so this sees exactly what would grade correct).
 * Pass the per-language gloss (translation_nl OR translation_en) as `text`;
 * build one map per language and check same-language candidates against it.
 */
export function buildAnswerOwnersByText(
  items: ReadonlyArray<{ id: string; text: string | null }>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const { id, text } of items) {
    if (!text) continue
    for (const alt of splitAlternatives(text)) {
      const norm = normalizeVariantText(alt)
      if (norm.length === 0) continue
      const set = out.get(norm) ?? new Set<string>()
      set.add(id)
      out.set(norm, set)
    }
  }
  return out
}

/**
 * Drop candidates whose normalized text is already an accepted answer of a
 * DIFFERENT item in the corpus — a false-accept the per-item distractor check
 * (`dropDistractorCollisions`) structurally cannot catch, because it only sees
 * one item's own MCQ distractors. Example: `lapangan -> "square"` when a
 * separate item `alun-alun` means "square" — accepting it would credit the
 * learner for another word's meaning. EXACT-match only: near-synonyms (e.g.
 * "square" vs "town square") are NOT caught here and remain a human-review
 * concern per the generate->review->apply gate (plan §Part 1). A candidate
 * whose text is owned ONLY by its own item is kept (harmless redundancy with
 * the primary gloss). `answerOwnersByText` MUST be built from the same language
 * as the candidates (NL candidates against the NL owners map, etc.).
 */
export function dropCorpusCollisions(
  candidates: readonly CandidateVariant[],
  answerOwnersByText: ReadonlyMap<string, ReadonlySet<string>>,
): { kept: CandidateVariant[]; dropped: CandidateVariant[] } {
  const kept: CandidateVariant[] = []
  const dropped: CandidateVariant[] = []
  for (const c of candidates) {
    const owners = answerOwnersByText.get(normalizeVariantText(c.variantText))
    let collidesOther = false
    if (owners) {
      for (const id of owners) {
        if (id !== c.learningItemId) { collidesOther = true; break }
      }
    }
    if (collidesOther) dropped.push(c)
    else kept.push(c)
  }
  return { kept, dropped }
}
