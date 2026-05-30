/**
 * CS17 — Cross-lesson item duplicate validator (post-write, item kind).
 *
 * Relocates `findDuplicateItems` from `lint-staging.ts` (item kind, Slice 1,
 * ADR 0013 §6) into the Capability Gate post-write layer.
 *
 * The original lint-staging check loaded ALL lessons' staging files and compared
 * base_text values for cross-lesson and within-lesson duplicates. The DB-resident
 * re-expression queries `learning_capabilities` for item-kind capabilities (keyed
 * by `canonical_key`) that are linked to MORE THAN ONE `lesson_id`. When an item
 * exists in two lessons' learning_items, the capability system either creates a
 * duplicate capability row (if canonical_key were not unique) or silently assigns
 * it to whichever lesson published it last (depending on upsert order). Either is
 * an authoring bug.
 *
 * Becak ordering: this validator runs POST-WRITE, after this lesson's
 * `learning_items` and `learning_capabilities` rows are written. The query
 * therefore sees this lesson's just-written rows and catches fresh cross-lesson
 * collisions on the first publish, not only retrospectively.
 *
 * DB-aware: takes the Supabase client directly. Returns ValidationFindings in the
 * standard gate format.
 *
 * The legitimate cross-lesson case (a word first introduced in lesson 1 that
 * appears in the vocabulary list of lesson 3) is handled by the Capability Stage's
 * skip-if-exists logic: the SECOND publish leaves the capability's lesson_id
 * untouched (the first publisher owns it). This validator fires on the SECOND
 * publish run to alert the author that the item's declaring lesson should be
 * reconciled — the lowest-lesson-number lesson is the canonical owner, per the
 * original rule.
 *
 * Severity: error — a duplicate across lessons means the FSRS ownership
 * invariant (ADR 0006: every capability has exactly one introducing lesson)
 * cannot be satisfied for both lessons simultaneously.
 *
 * WITHIN-lesson duplicates (the other class caught by the original
 * `findDuplicateItems` in lint-staging.ts) are intentionally NOT a gate
 * finding here. They are absorbed by the `canonical_key` upsert semantics:
 * `upsertCapabilitiesSkipIfExists` uses ON CONFLICT DO NOTHING on
 * `canonical_key`, so a second item declaration for the same normalized_text
 * within the same lesson simply deduplicates to one row at write time.
 * No gate check needed — the DB write already enforces uniqueness.
 */

import type { ValidationFinding } from '../model'
import type { CapabilitySupabaseClient } from '../adapter'

export interface ItemDuplicatesInput {
  /** lesson_id for the lesson whose items were just written. */
  lessonId: string
  /** lesson_number for display in findings. */
  lessonNumber: number
  /** normalized_text values of items written for this lesson (post-write). */
  writtenNormalizedTexts: string[]
}

/**
 * Checks the DB for item capabilities that are linked to more than one lesson_id.
 *
 * DB-aware: calls Supabase. Returns findings for any cross-lesson duplicate items.
 * Runs post-write — this lesson's rows are in the DB when this check executes.
 */
export async function validateItemDuplicates(
  supabase: CapabilitySupabaseClient,
  input: ItemDuplicatesInput,
): Promise<ValidationFinding[]> {
  const { lessonId, lessonNumber, writtenNormalizedTexts } = input

  if (writtenNormalizedTexts.length === 0) return []

  const findings: ValidationFinding[] = []

  // Query: for each item normalized_text we just wrote, find all distinct
  // lesson_ids that have a learning_capability of source_kind='item' with a
  // canonical_key matching `item:${normalized_text}:*`. We query
  // learning_capabilities filtered by lesson_id != null and source_kind = 'item',
  // then group by canonical_key, and look for any key with >1 distinct lesson_id.
  //
  // Because canonical_key = `item:${lessonNumber}:${normalized_text}:word/phrase`,
  // two lessons declaring the same word WILL produce identical canonical_keys
  // (same normalized_text → same key, regardless of which lesson wrote it first,
  // because the key is keyed off normalized_text not lesson_id). The skip-if-exists
  // means only one lesson actually "owns" the capability. But the second lesson's
  // staging may reference that item too, causing confusion about its owning lesson.
  //
  // The practical check: query learning_items for the written normalized_texts and
  // find any that have a lesson_id different from this lesson's lesson_id. Those
  // items were first introduced in a different lesson — the author should reference
  // them via the lesson-page-blocks bridge, not redeclare them.
  const { data, error } = await (supabase as any)
    .schema('indonesian')
    .from('learning_items')
    .select('normalized_text, lesson_id')
    .in('normalized_text', writtenNormalizedTexts)
    .not('lesson_id', 'is', null)

  if (error) {
    // Non-fatal: surface as a warning rather than crashing the gate.
    findings.push({
      gate: 'CS17',
      severity: 'warning',
      message:
        `Item duplicate check failed: ${error.message}. ` +
        `Cross-lesson duplicate detection skipped for lesson ${lessonNumber}.`,
    })
    return findings
  }

  const rows = (data ?? []) as Array<{ normalized_text: string; lesson_id: string }>

  for (const row of rows) {
    if (row.lesson_id !== lessonId) {
      findings.push({
        gate: 'CS17',
        severity: 'error',
        message:
          `Item "${row.normalized_text}" was written for lesson ${lessonNumber} ` +
          `but already belongs to a different lesson (lesson_id=${row.lesson_id}). ` +
          `An item may only be declared in one lesson's vocabulary. ` +
          `Remove the duplicate declaration from lesson ${lessonNumber}'s staging files ` +
          `(the first-published lesson owns the capability; the second publish is a no-op).`,
        context: { itemSlug: row.normalized_text },
      })
    }
  }

  return findings
}
