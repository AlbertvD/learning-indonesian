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
  // enrichEnTranslations / enrichDialogueTranslations) that fill the
  // fields rather than gating on their absence.
  'CS3', // candidate payload (GRAMMAR_EXERCISE_TYPES + payload presence)
  'CS4', // per-item meaning (VALID_LANGUAGES + VALID_CONTEXT_TYPES)
  'CS5', // pos validation
  'CS6', // grammar pattern (moved from lesson-stage GT7)
  'CS7', // count parity (post-write seed hook)
  'CS8', // content non-empty (post-write seed hook)
  'CS9', // seed integrity (post-write reviewability cross-check)
  'CS10', // dialogue-line artifact emission (Decision 5b — cloze_context/cloze_answer/translation:l1 for dialogue_line caps)
  'CS11', // dialogue_clozes typed-row shape (PR 2 — sentence_with_blank/answer_text/translation_text)
] as const

export type CapabilityGate = typeof CAPABILITY_GATES[number]

export interface CapabilityStageInput {
  lessonNumber: number
  /** Lesson row id from Stage A's runLessonStage output. */
  lessonId: string
  dryRun?: boolean
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
}
