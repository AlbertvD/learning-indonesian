/**
 * capability-stage/gate.ts — the Capability Gate (ADR 0013 §6).
 *
 * TWO exported entry points — one per phase — because the runner physically
 * writes to the DB between the pre-write and post-write validation layers:
 *
 *   runCapabilityGatePreWrite(input, { mode })
 *     — composes CS3/CS4/CS4b/CS5/CS6/CS13 validators; pure, no DB, no network.
 *       Runs before any DB write. Errors short-circuit the publish.
 *
 *   runCapabilityGatePostWrite(supabase, input)
 *     — composes CS7/CS8/CS9 verifiers; DB-state-aware (queries the DB the
 *       runner just wrote). Runs after all adapter writes complete.
 *
 * What flexes with the mode: the same severity-flex pattern as the Lesson
 * Gate (`lesson-stage/gate.ts`). For the Capability Gate's current validators
 * there are no async-LLM-enriched columns whose severity changes between
 * pre-flight and publish — mode is wired so the pattern is in place for
 * Task 7's item-kind validators (distractor quality checks will relax in
 * pre-flight). Both modes run the same checks today.
 *
 * DB-state-aware asymmetry vs the Lesson Gate (ADR 0013 §4 inverted):
 *   - The Lesson Gate is self-contained to one lesson — it NEVER consults the
 *     cross-lesson DB pool. "Self-contained" isolation is its hard invariant.
 *   - The Capability Gate MAY (and must) consult the DB after writes because
 *     it runs after Stage A and verifies DB state that spans lessons (e.g.
 *     CS7 count-parity queries across the full `learning_capabilities` table
 *     filtered by lesson_id, CS9 seed-integrity cross-checks published items
 *     against their meanings + contexts). The verifiers in the post-write phase
 *     are not pure — they hold a Supabase client by design.
 *
 * Mid-write validators (NOT consolidated here):
 *   `validateDialogueClozes` (CS11) and `validateAffixedFormPairs` (CS12) run
 *   AFTER the projectors that need DB-resolved capability IDs
 *   (`projectDialogueArtifacts` + `projectAffixedFormPairs` both consume
 *   `capabilityIdsByKey` returned by `upsertCapabilities`). Moving them into
 *   the pre-write gate would require a different ordering / additional DB reads,
 *   which IS a behaviour change. They remain inline in the runner (right after
 *   the dialogue-artifact / affixed-pair projectors). Task 7's item-kind
 *   distractor validators will land here.
 *
 * `validateLessonIdPresence` and `validateItemSourceRefResolvability` THROW
 * rather than returning findings — they remain inline in the runner and are
 * not composed here.
 */

import type { ValidationFinding } from './model'
import type { CapabilitySupabaseClient } from './adapter'
import { validateGrammarPattern } from './validators/grammarPattern'
import { validateCandidatePayload } from './validators/candidatePayload'
import { validateGrammarExercises } from './validators/grammarExercises'
import { validatePerItemMeaning } from './validators/perItemMeaning'
import { validateItemTranslations } from './validators/itemTranslations'
import { validatePosTags } from './validators/pos'
import { runCountParity, type CountParityInput } from './verify/countParity'
import { runContentNonEmpty, type ContentNonEmptyInput } from './verify/contentNonEmpty'
import { runSeedIntegrity, type SeedIntegrityInput } from './verify/seedIntegrity'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CapabilityGateMode = 'pre-flight' | 'publish'

export interface CapabilityGatePreWriteInput {
  grammarPatterns: Array<{ slug: string; pattern_name: string; complexity_score: number }>
  candidates: Array<{
    exercise_type?: string
    grammar_pattern_slug?: string | null
    payload?: Record<string, unknown> | null
    review_status?: string
  }>
  learningItems: Array<{
    base_text: string
    item_type: string
    context_type?: string
    translation_nl?: string | null
    translation_en?: string | null
    pos?: string | null
  }>
  mode: CapabilityGateMode
}

export interface CapabilityGatePostWriteInput
  extends CountParityInput,
    ContentNonEmptyInput,
    SeedIntegrityInput {}

// ---------------------------------------------------------------------------
// Pre-write gate — CS3/CS4/CS4b/CS5/CS6
// ---------------------------------------------------------------------------

/**
 * Runs the pre-write validator family against the staging snapshot.
 * Pure: no DB, no network — isolation-testable.
 *
 * Corresponds to the pre-write validator block in the runner (section
 * "---- 2. Validate (pre-write)"); line numbers drift, so navigate by marker.
 *
 * @param mode - 'publish' = authoritative in-stage gate;
 *               'pre-flight' = same checks, mode wired for future severity flex.
 */
export function runCapabilityGatePreWrite(input: CapabilityGatePreWriteInput): ValidationFinding[] {
  // mode is wired for future severity flex (Task 7 item-kind validators).
  // Today both modes run identical checks.
  // const enrichedSeverity = input.mode === 'pre-flight' ? 'warning' : 'error'

  return [
    // CS6 — grammar pattern slug/name/complexity (structural).
    ...validateGrammarPattern(input.grammarPatterns),
    // CS3 — exercise candidate payload presence + exercise_type whitelist.
    ...validateCandidatePayload(input.candidates),
    // CS13 — grammar-exercise typed-row shape (PR 4 Zod per-table gate).
    ...validateGrammarExercises(input.candidates),
    // CS4 — per-item meaning: context_type, VALID_LANGUAGES.
    ...validatePerItemMeaning(input.learningItems),
    // CS4b — item translation columns: translation_nl CRITICAL for non-dialogue;
    // translation_en WARNING.
    ...validateItemTranslations(input.learningItems),
    // CS5 — POS: missing pos → warning; invalid pos value → error.
    ...validatePosTags(input.learningItems).findings,
  ]
}

// ---------------------------------------------------------------------------
// Post-write gate — CS7/CS8/CS9
// ---------------------------------------------------------------------------

/**
 * Runs the post-write verifier family against the DB the runner just wrote.
 * DB-state-aware: queries the database — not pure, not isolation-testable
 * without a mock Supabase client.
 *
 * Corresponds to the runner's post-write verify block (section
 * "---- 12. Verify (CS7 -> CS8 -> CS9)"); navigate by marker, not line number.
 */
export async function runCapabilityGatePostWrite(
  supabase: CapabilitySupabaseClient,
  input: CapabilityGatePostWriteInput,
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = []

  // CS7 — count parity: DB counts >= declared counts per-surface.
  findings.push(...await runCountParity(supabase, {
    lessonId: input.lessonId,
    declared: input.declared,
    contentUnitIds: input.contentUnitIds,
    capabilityIds: input.capabilityIds,
  }))

  // CS8 — content non-empty: required fields non-empty for each written row.
  findings.push(...await runContentNonEmpty(supabase, {
    contentUnitIds: input.contentUnitIds,
    capabilityIds: input.capabilityIds,
    capabilityArtifactIds: input.capabilityArtifactIds,
    learningItemIds: input.learningItemIds,
    exerciseVariantIds: input.exerciseVariantIds,
    grammarPatternIds: input.grammarPatternIds,
  }))

  // CS9 — seed integrity: non-dialogue published items must be reviewable.
  const integrityReport = await runSeedIntegrity(supabase, {
    publishedItemIds: input.publishedItemIds,
    dialogueItemIds: input.dialogueItemIds,
  })
  findings.push(...integrityReport.findings)

  return findings
}
