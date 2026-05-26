export const SECTION_CONTENT_TYPES = [
  'text',
  'grammar',
  'reference_table',
  'vocabulary',
  'expressions',
  'numbers',
  'dialogue',
  'pronunciation',
  'culture',
  'exercises',
] as const

export type SectionContentType = typeof SECTION_CONTENT_TYPES[number]

export interface LessonStageInput {
  lessonNumber: number
  dryRun?: boolean
  audioBudget?: { maxNewSyntheses: number }
}

export interface LessonStageOutput {
  status: 'ok' | 'validation_failed' | 'partial'
  lesson: { id: string; orderIndex: number; title: string }
  counts: {
    sections: number
    audioClipsSynthesised: number
    audioClipsReused: number
    /** PR 2: per-line typed rows written to `lesson_dialogue_lines`. */
    dialogueLines?: number
    /** PR 6: typed capability-contract rows. */
    itemRows?: number
    grammarCategories?: number
    grammarTopics?: number
    affixedPairs?: number
  }
  findings: ValidationFinding[]
  durationMs: number
}

export interface ValidationFinding {
  // GT1–GT9 (PR 6): pre-write lesson-content validators.
  // GT10 (slice 3, ADR 0013): display-content blob structure — folded out of
  // the monolithic lint-staging gate + generic shape for display-only sections.
  // LV1/LV2 (slice 1, ADR 0013): post-write verification — the lesson-stage
  // analogue of the capability stage's CS7–CS9. LV1 = per-lesson row-count
  // parity; LV2 = retained content blob non-empty per section.
  gate: 'GT1' | 'GT2' | 'GT3' | 'GT4' | 'GT5' | 'GT6' | 'GT7' | 'GT8' | 'GT9' | 'GT10' | 'LV1' | 'LV2'
  severity: 'error' | 'warning'
  message: string
  context?: {
    sectionId?: string
    sectionOrderIndex?: number
    sectionTitle?: string
    blockKey?: string
    itemSlug?: string
    lineIndex?: number
    sourceRef?: string
    /** Post-write verification: the table / row the finding is about. */
    table?: string
    rowId?: string
  }
}
