/**
 * verify/countParity.ts — LV1 post-write verification.
 *
 * The lesson-stage analogue of the capability stage's CS7 (countParity). For
 * each table the Lesson Stage writes, asserts the rows the runner claimed it
 * wrote are actually present in the DB, read back by THIS lesson's lesson_id.
 *
 * Comparison is `db_count >= declared`, not strict equality — matching CS7's
 * rationale (per fold §11 #21): a re-publish that picks up stale rows from a
 * prior run (e.g. an upserted section that a later publish no longer emits)
 * must not flake. The check answers "did the rows we wrote land", which `>=`
 * captures exactly. A declared count of 0 (a table this lesson has no content
 * for — no grammar, no dialogue, no morphology) passes trivially, so the same
 * check doubles as the "every lesson-stage table populated-or-zero" assertion.
 *
 * Self-contained to the lesson (ADR 0013 §4): reads only rows where
 * lesson_id = this lesson — never a cross-lesson pool. Mismatches produce an
 * LV1 `error` finding; the runner returns `status: 'partial'` (no rollback).
 *
 * Known limitation (recorded, not a slice-1 bug): because the replace-writers
 * delete section-scoped (`.in('section_id', …)`) but LV1 counts lesson-wide,
 * stale rows from a section dropped in a re-publish survive and pad the count.
 * So LV1 is a "did the rows we wrote land" lower-bound check, not strict
 * per-section parity. Counting by `section_id` (matching the delete scope)
 * would close that gap; deferred — `>=` is the right non-flaky choice for now.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { countLessonTableRows } from '../adapter'
import type { ValidationFinding } from '../model'

export interface LessonCountParityInput {
  lessonId: string
  declared: {
    sections: number
    dialogueLines: number
    itemRows: number
    grammarCategories: number
    grammarTopics: number
    affixedPairs: number
  }
}

/** Maps each declared-count key to its backing table. */
const TABLE_BY_KEY: Record<keyof LessonCountParityInput['declared'], string> = {
  sections: 'lesson_sections',
  dialogueLines: 'lesson_dialogue_lines',
  itemRows: 'lesson_section_item_rows',
  grammarCategories: 'lesson_section_grammar_categories',
  grammarTopics: 'lesson_section_grammar_topics',
  affixedPairs: 'lesson_section_affixed_pairs',
}

export async function runLessonCountParity(
  supabase: SupabaseClient,
  input: LessonCountParityInput,
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = []

  for (const key of Object.keys(TABLE_BY_KEY) as Array<keyof typeof TABLE_BY_KEY>) {
    const declared = input.declared[key]
    if (declared <= 0) continue // declared 0 → table has no content for this lesson; nothing to verify.
    const table = TABLE_BY_KEY[key]
    const actual = await countLessonTableRows(supabase, table, input.lessonId)
    if (actual < declared) {
      findings.push(parityFinding(table, declared, actual))
    }
  }

  return findings
}

function parityFinding(table: string, declared: number, actual: number): ValidationFinding {
  return {
    gate: 'LV1',
    severity: 'error',
    message:
      `Post-write count parity failed for ${table}: runner wrote ${declared}, ` +
      `DB has ${actual} for this lesson (expected db_count >= ${declared}).`,
    context: { table },
  }
}
