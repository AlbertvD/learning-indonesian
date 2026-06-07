/**
 * capability-stage/model.ts — Stage B (capability-stage) input / output / findings.
 *
 * Mirrors lesson-stage/model.ts. Gate prefix is `CS` to disambiguate from
 * lesson-stage's `GT` findings when both stages run in the same pipeline.
 */

export const CAPABILITY_GATES = [
  'CS1', // grammar topics (moved from lesson-stage GT1)
  // CS2 retired — its per-item-enrichment checks (pos/level/translation)
  // are now replaced by active enrichments (enrichPos / enrichLevel /
  // enrichDialogueTranslations) that fill the fields rather than gating on
  // their absence. EN-translation enrichment was relocated to lesson-stage
  // (PR 6, ADR 0012).
  'CS3', // candidate payload (GRAMMAR_EXERCISE_TYPES + payload presence)
  'CS4', // per-item meaning (VALID_LANGUAGES + VALID_CONTEXT_TYPES)
  'CS5', // pos validation
  'CS6', // grammar pattern (moved from lesson-stage GT7)
  'CS7', // count parity (post-write seed hook)
  'CS8', // content non-empty (post-write seed hook)
  'CS9', // seed integrity (post-write reviewability cross-check)
  'CS10', // dialogue-line artifact emission (Decision 5b — cloze_context/cloze_answer/translation:l1 for dialogue_line caps)
  'CS11', // dialogue_clozes typed-row shape (PR 2 — sentence_with_blank/answer_text/translation_text)
  'CS12', // affixed_form_pairs typed-row shape (PR 3 — root_text/derived_text/allomorph_rule non-empty per cap)
  'CS13', // grammar-exercise typed-row shape (PR 4 — per-table Zod over the 4 grammar exercise tables, audit I2 options shapes)
  // Task 7: item-kind Capability Gate layer (Slice 1, ADR 0013 §6)
  'CS14', // item POS — word/phrase item must have a valid POS tag (relocated from lint-staging checkLearningItemsPos)
  'CS15', // item distractor coverage — every item cap must have curated distractor rows post-write (relocated from lint-staging checkVocabCoverage intent)
  'CS16', // item distractor quality — array length=3, no-answer, no-intra-dup, in-pool, no morphological variant (relocated from lint-staging checkVocabEnrichments §12)
  'CS17', // cross-lesson item duplicates — same normalized_text must not appear in two lessons' learning_items (relocated from lint-staging findDuplicateItems)
  // Slice 2 Task 7: pattern-kind Capability Gate layer (ADR 0013 §6).
  'CS18', // pattern typed-exercise coverage — every written grammar pattern must end with >=1 active row for EVERY required exercise type (OQ2-2 (2) certification; pattern_typed_row_missing class). Relocates the intent of lint-staging checkGrammarPatterns/checkCandidatesStructural to post-write DB state.
  // PR #130 (paraphrase acceptance): alternative-answer separator convention.
  'CS19', // separator convention — translation_nl (Dutch) must not use ";"/comma-as-OR as an alternatives separator (ERROR, learner-breaking once the grader drops comma); Indonesian-side answers warn-only on ";". Detection shared with the runtime grader + HC24 via @/lib/capabilities.
  // Fix 1 (ADR 0014, productive ceiling): item-harvest is word/phrase only.
  'CS20', // item length guard — a word/phrase running >= 6 tokens is a likely mis-tagged sentence (WARN-only; kind is the gate, length is the smell). Pre-write, pure.
  'CS21', // de-harvested reader visibility — a dropped sentence/dialogue_chunk's text must still appear in the lesson's typed content tables (lesson_dialogue_lines / grammar examples / item rows), else WARN ("item text not found in typed lesson content"). Never silently vaporise. DB-aware (mid-write).
  'CS22', // dialogue-cloze coverage (Slice 3 — DB-state successor of lint-staging checkDialogueClozes): an ELIGIBLE dialogue line whose in-stage Mode-2 generation failed sanitization (generator failedLineRefs) produced no dialogue_clozes row. ERROR → run 'partial' (graceful — runtime renders the clozes that DID land; the gap is surfaced for re-publish/--regenerate, never silently dropped — m-2). Ineligible lines are validly skipped by the generator and not flagged.
  // cap-v2 vocab rebuild (#161): audio caps (audio_recognition/dictation) are
  // emitted for every word/phrase item assuming audio exists; a missing audio_clip
  // is flagged WARN here (not blocked). The hard Stage-A error (halt the publish
  // when a vocab word is unvoiced) is deferred to #165.
  'CS23', // item audio coverage (WARN — missing audio_clip for a word/phrase item)
] as const

export type CapabilityGate = typeof CAPABILITY_GATES[number]

export interface CapabilityStageInput {
  lessonNumber: number
  /** Lesson row id from Stage A's runLessonStage output. */
  lessonId: string
  dryRun?: boolean
  /**
   * When set, a destructive regeneration of ONE unit before the skip-if-exists /
   * pattern-seeded gate. This is the ONLY destructive routine path — ordinary
   * re-runs never delete seeded rows (ADR 0011). Discriminated by kind:
   *   - `item`    — delete + regenerate distractors for the item (by normalized_text).
   *   - `pattern` — delete (by grammar_pattern_id, across the 4 typed exercise
   *                 tables) + regenerate grammar exercises for the pattern slug
   *                 (Slice 2 Task 5, OQ2-2).
   */
  regenerate?:
    | { kind: 'item'; normalizedText: string }
    | { kind: 'pattern'; slug: string }
}

export interface CapabilityStageCounts {
  contentUnits: number
  capabilities: number
  learningItems: number
  exerciseVariants: number
  clozeContexts: number
  deferredDialogueChunks: number
  /** PR 2: typed `dialogue_clozes` rows written. */
  dialogueClozes: number
  /** PR 3: typed `affixed_form_pairs` rows written. */
  affixedFormPairs: number
  /** PR 4: typed grammar-exercise rows written across the 4 tables. */
  grammarExerciseRows: number
  /** Task 6c: item distractor sets written (by upsertItemDistractors). */
  itemDistractorSets: number
}

export interface CapabilityStageOutput {
  status: 'ok' | 'validation_failed' | 'partial'
  counts: CapabilityStageCounts
  findings: ValidationFinding[]
  durationMs: number
}

export interface ValidationFinding {
  gate: CapabilityGate
  severity: 'error' | 'warning'
  message: string
  context?: {
    sectionId?: string
    itemSlug?: string
    capabilityKey?: string
    rowId?: string
    table?: string
    /** PR 2: source_line_ref used to identify dialogue_clozes rows in CS11 findings. */
    sourceLineRef?: string
  }
}

export const EMPTY_COUNTS: CapabilityStageCounts = {
  contentUnits: 0,
  capabilities: 0,
  learningItems: 0,
  exerciseVariants: 0,
  clozeContexts: 0,
  deferredDialogueChunks: 0,
  dialogueClozes: 0,
  affixedFormPairs: 0,
  grammarExerciseRows: 0,
  itemDistractorSets: 0,
}
