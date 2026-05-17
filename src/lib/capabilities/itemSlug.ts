/**
 * Canonical slug derivation for learning-item base_text.
 *
 * Every callsite that builds a slug from base_text — cap source_refs, DB
 * normalized_text, lint dedup, projector lookups — routes through here.
 * Divergent local implementations historically caused silent runtime
 * mismatches (issue #59: ~113 multi-word items unreachable because cap
 * source_refs hyphenated internal spaces while DB normalized_text
 * preserved them).
 *
 * Convention: `learning_items.normalized_text = itemSlug(base_text)`,
 * mirrored by `scripts/lib/pipeline/capability-stage/adapter.ts:upsertLearningItem`
 * and `scripts/lib/content-pipeline-output.ts:sourceRefForLearningItem`.
 *
 * Internal spaces (multi-word phrases) and hyphens (reduplications like
 * `oleh-oleh`) are preserved. Only case and boundary whitespace are
 * normalized. Accent annotations, asterisks, and trailing punctuation are
 * part of the canonical form and pass through unchanged.
 *
 * Not to be confused with `projectors/slugs.ts:candidateSlugs` which
 * handles cloze-context suffix variants (different problem).
 */
export function itemSlug(baseText: string): string {
  return baseText.toLowerCase().trim()
}
