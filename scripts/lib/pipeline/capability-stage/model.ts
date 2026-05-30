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
] as const

export type CapabilityGate = typeof CAPABILITY_GATES[number]

export interface CapabilityStageInput {
  lessonNumber: number
  /** Lesson row id from Stage A's runLessonStage output. */
  lessonId: string
  dryRun?: boolean
  /**
   * When set, the item path deletes + regenerates distractors for the given
   * item (identified by normalized_text) before the skip-if-exists gate.
   * This is the ONLY destructive path — routine re-runs never delete seeded
   * distractor rows. OQ-3 / ADR 0011.
   */
  regenerate?: { kind: 'item'; normalizedText: string }
}

export interface CapabilityStageCounts {
  contentUnits: number
  capabilities: number
  capabilityArtifacts: number
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
  capabilityArtifacts: 0,
  learningItems: 0,
  exerciseVariants: 0,
  clozeContexts: 0,
  deferredDialogueChunks: 0,
  dialogueClozes: 0,
  affixedFormPairs: 0,
  grammarExerciseRows: 0,
  itemDistractorSets: 0,
}
