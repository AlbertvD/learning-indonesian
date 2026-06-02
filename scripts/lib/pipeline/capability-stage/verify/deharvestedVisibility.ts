/**
 * CS21 — de-harvested reader-visibility net (mid-write, DB-aware; ADR 0014 §M4).
 *
 * When Fix 1a drops a sentence/dialogue_chunk's item caps, ADR 0014 promises the
 * text still REMAINS VISIBLE to the learner in the lesson reader (as the grammar
 * example, dialogue line, or book exercise it always was — Lesson-Stage content).
 * This net asserts that promise: a dropped item's text must be present in the
 * lesson's TYPED content tables —
 *   - `lesson_dialogue_lines.text`            (dialogue lines, the reader source);
 *   - grammar example `indonesian` strings     (example sentences);
 *   - `lesson_section_item_rows.indonesian_text` (vocab/expression rows).
 * NOT the `lesson_sections.content` jsonb blob, which post-PR-5/6 is a round-trip
 * snapshot, not the canonical render source (loadFromDb.ts:114).
 *
 * If the text is absent → WARN ("item text not found in typed lesson content"):
 * either a reader gap or a spurious harvest, surfaced rather than silently
 * vaporised. Worded distinctly from the L5 dialogue-cloze projection gap (a
 * separate, out-of-scope bug) so the two are never conflated (architect N5).
 */

import type { ValidationFinding } from '../model'
import type { CapabilitySupabaseClient } from '../adapter'

export interface DeharvestedItem {
  base_text: string
  item_type: string
}

/** Lowercase, trim, drop trailing sentence punctuation, collapse whitespace —
 *  so "Selamat pagi, apa kabar?" (dialogue line) matches a harvested chunk
 *  "selamat pagi, apa kabar". Internal commas are preserved (they distinguish
 *  distinct lines), only the trailing .?!… is dropped. */
function normalizeForVisibility(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.?!…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Pure: the subset of `deharvested` whose normalized text is NOT present in
 * `typedContentTexts`.
 */
export function findInvisibleDeharvestedItems(
  deharvested: DeharvestedItem[],
  typedContentTexts: string[],
): DeharvestedItem[] {
  if (deharvested.length === 0) return []
  const set = new Set(typedContentTexts.map(normalizeForVisibility))
  return deharvested.filter((it) => !set.has(normalizeForVisibility(it.base_text)))
}

export interface DeharvestedVisibilityInput {
  lessonId: string
  /** Items dropped by the harvest filter (sentence/dialogue_chunk). */
  deharvestedItems: DeharvestedItem[]
  /** Indonesian texts already loaded in-runner: grammar example sentences +
   *  lesson_section_item_rows indonesian_text. Combined with the dialogue lines
   *  this function fetches. */
  knownTypedTexts: string[]
}

/**
 * Fetch the lesson's dialogue-line texts, combine with the in-runner typed
 * texts, and warn (CS21) for every de-harvested item whose text is absent.
 * DB-aware: one read of `lesson_dialogue_lines` scoped to the lesson.
 */
export async function runDeharvestedVisibility(
  supabase: CapabilitySupabaseClient,
  input: DeharvestedVisibilityInput,
): Promise<ValidationFinding[]> {
  if (input.deharvestedItems.length === 0) return []

  const { data, error } = await supabase
    .schema('indonesian')
    .from('lesson_dialogue_lines')
    .select('text')
    .eq('lesson_id', input.lessonId)
  if (error) {
    throw new Error(`CS21: failed to fetch lesson_dialogue_lines for lesson_id=${input.lessonId}: ${error.message}`)
  }
  const dialogueTexts = ((data ?? []) as Array<{ text: string }>).map((r) => r.text)

  const invisible = findInvisibleDeharvestedItems(
    input.deharvestedItems,
    [...input.knownTypedTexts, ...dialogueTexts],
  )

  return invisible.map((it) => ({
    gate: 'CS21',
    severity: 'warning',
    message:
      `De-harvested ${it.item_type} "${it.base_text.slice(0, 60)}${it.base_text.length > 60 ? '…' : ''}" ` +
      `— item text not found in typed lesson content (lesson_dialogue_lines / grammar examples / ` +
      `lesson_section_item_rows). Its item caps were dropped (ADR 0014 productive ceiling) but the ` +
      `text is no longer visible to the learner: verify it is a genuine reader gap or a spurious ` +
      `harvest. (NOT the L5 dialogue-cloze projection gap — a separate issue.)`,
    context: { itemSlug: it.base_text.slice(0, 40) },
  }))
}
