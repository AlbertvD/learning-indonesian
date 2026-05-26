/**
 * verify/contentNonEmpty.ts — LV2 post-write verification.
 *
 * The lesson-stage analogue of the capability stage's CS8 (contentNonEmpty),
 * scoped to the retained content snapshot. Walks every `lesson_sections` row
 * for THIS lesson and asserts its `content` jsonb blob is a non-empty object —
 * the round-trippable record the lesson reader renders from (ADR 0013 §1, the
 * blob is one of Stage A's two consumers). An empty `{}` or null blob means the
 * write did not land the section's content even though the row exists.
 *
 * Self-contained to the lesson (ADR 0013 §4): reads only this lesson's rows.
 * Violations produce an LV2 `error` finding; the runner returns
 * `status: 'partial'` (no rollback). Per-bespoke-page field presence is NOT
 * checked here — that is the lesson page's concern, backed by a render smoke
 * (ADR 0013 §1); LV2 asserts generic blob presence only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchLessonSectionContentRows } from '../adapter'
import type { ValidationFinding } from '../model'

export interface LessonContentNonEmptyInput {
  lessonId: string
}

function objectIsNonEmpty(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.keys(value as Record<string, unknown>).length > 0
}

export async function runLessonContentNonEmpty(
  supabase: SupabaseClient,
  input: LessonContentNonEmptyInput,
): Promise<ValidationFinding[]> {
  // LV2 asserts only that the rows that DID land carry a usable blob. The
  // existence half — that every section the runner wrote has a row at all — is
  // LV1's job (count parity on lesson_sections). A section whose row failed to
  // write entirely is caught there, not here; LV2 would simply not iterate it.
  const findings: ValidationFinding[] = []
  const rows = await fetchLessonSectionContentRows(supabase, input.lessonId)

  for (const row of rows) {
    if (!objectIsNonEmpty(row.content)) {
      findings.push({
        gate: 'LV2',
        severity: 'error',
        message:
          `Section ${row.id} (order ${row.order_index}) has an empty retained content blob — ` +
          `the lesson reader has nothing to render for it.`,
        context: {
          table: 'lesson_sections',
          rowId: row.id,
          sectionOrderIndex: row.order_index,
        },
      })
    }
  }

  return findings
}
