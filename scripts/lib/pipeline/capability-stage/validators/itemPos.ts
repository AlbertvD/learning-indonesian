/**
 * CS14 — Item POS validator (post-write, item kind).
 *
 * Relocates `checkLearningItemsPos` from `lint-staging.ts` (item kind, Slice 1,
 * ADR 0013 §6) into the Capability Gate post-write layer.
 *
 * Runs against the DB rows that were JUST written by the item projector so the
 * check is always over the authoritative persisted state, not a staging-file
 * snapshot. The Capability Gate's DB-state-aware asymmetry (ADR 0013 §4 inverted)
 * allows this — it is safe and correct to query across the full pool post-write.
 *
 * Rules (mirroring lint-staging.ts checkLearningItemsPos ~:925):
 *   - word/phrase item with null/absent pos → WARNING (distractor quality degrades)
 *   - word/phrase item with invalid pos value → error (DB CHECK constraint will reject)
 *
 * The validator is PURE (no DB, no I/O) — it takes the just-written item rows
 * directly from the projector output, avoiding a redundant DB round-trip.
 */

import type { ValidationFinding } from '../model'
import { VALID_POS } from '../../../validate-pos'

export interface ItemForPosCheck {
  normalized_text: string
  item_type: string
  pos?: string | null
}

/**
 * Validates POS tags on the just-written item rows for the current lesson.
 *
 * @param items - item rows as written/projected for this lesson (word/phrase only
 *                are checked; dialogue_chunk rows are ignored).
 */
export function validateItemPos(items: ItemForPosCheck[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const item of items) {
    if (item.item_type !== 'word' && item.item_type !== 'phrase') continue

    const ref = item.normalized_text.slice(0, 40)

    if (item.pos == null) {
      findings.push({
        gate: 'CS14',
        severity: 'warning',
        message:
          `Item "${item.normalized_text}" (${item.item_type}) has no POS — ` +
          `distractor quality degrades for this item (same-class filtering cannot apply).`,
        context: { itemSlug: ref },
      })
    } else if (!VALID_POS.has(item.pos)) {
      findings.push({
        gate: 'CS14',
        severity: 'error',
        message:
          `Item "${item.normalized_text}" (${item.item_type}) has invalid ` +
          `pos="${item.pos}" — not in the 12-value taxonomy. ` +
          `DB CHECK constraint will reject this value on next write.`,
        context: { itemSlug: ref },
      })
    }
  }

  return findings
}
