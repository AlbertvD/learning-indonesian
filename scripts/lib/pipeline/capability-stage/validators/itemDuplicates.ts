/**
 * CS17 — Cross-lesson item duplicate validator (post-write, item kind).
 *
 * Relocates `findDuplicateItems` from `lint-staging.ts` (item kind, Slice 1,
 * ADR 0013 §6) into the Capability Gate post-write layer.
 *
 * The original lint-staging check loaded ALL lessons' staging files and compared
 * base_text values for cross-lesson and within-lesson duplicates. The DB-resident
 * re-expression queries `learning_capabilities` for item-kind capabilities (keyed
 * by `source_ref`) that are linked to MORE THAN ONE `lesson_id`. When an item
 * exists in two lessons' vocabulary lists, the capability system's skip-if-exists
 * upsert preserves whichever lesson published it first. The second lesson's
 * publish silently leaves the capability owned by the first lesson, but the
 * author still has an authoring error that should be flagged.
 *
 * Query shape: for each item written by this lesson, build its source_ref
 * (`learning_items/<normalized_text>`) and query `learning_capabilities` where
 * `source_kind='item'` AND `source_ref IN (sourceRefs)` AND `lesson_id IS NOT
 * NULL`. Any capability row whose `lesson_id` differs from this lesson's
 * `lesson_id` means that item's capability was first claimed by another lesson.
 *
 * Note: `learning_items` has NO `lesson_id` column — items are globally deduped
 * by `normalized_text`. Lesson ownership lives entirely on the capability row.
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
 * Checks `learning_capabilities` for item capabilities whose lesson_id differs
 * from the current lesson's lesson_id. Such a mismatch means the item was first
 * claimed by another lesson.
 *
 * source_ref for an item capability = `learning_items/<normalized_text>`,
 * matching `content-pipeline-output.ts:sourceRefForLearningItem`.
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

  // Build source_refs: learning_items/<normalized_text>
  // This matches sourceRefForLearningItem in content-pipeline-output.ts.
  const sourceRefs = writtenNormalizedTexts.map((nt) => `learning_items/${nt}`)

  // Query learning_capabilities (NOT learning_items — items have no lesson_id).
  // Item capabilities have source_kind='item' and source_ref='learning_items/<nt>'.
  // Any row with lesson_id != this lesson's lesson_id was first published by
  // another lesson — that is the cross-lesson duplicate the author must fix.
  const { data, error } = await (supabase as any)
    .schema('indonesian')
    .from('learning_capabilities')
    .select('source_ref, lesson_id')
    .eq('source_kind', 'item')
    .in('source_ref', sourceRefs)
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

  const rows = (data ?? []) as Array<{ source_ref: string; lesson_id: string }>

  for (const row of rows) {
    if (row.lesson_id !== lessonId) {
      // Map source_ref back to normalized_text for the finding message.
      const normalizedText = row.source_ref.replace(/^learning_items\//, '')
      findings.push({
        gate: 'CS17',
        severity: 'error',
        message:
          `Item "${normalizedText}" was written for lesson ${lessonNumber} ` +
          `but already belongs to a different lesson (lesson_id=${row.lesson_id}). ` +
          `An item may only be declared in one lesson's vocabulary. ` +
          `Remove the duplicate declaration from lesson ${lessonNumber}'s staging files ` +
          `(the first-published lesson owns the capability; the second publish is a no-op).`,
        context: { itemSlug: normalizedText },
      })
    }
  }

  return findings
}
