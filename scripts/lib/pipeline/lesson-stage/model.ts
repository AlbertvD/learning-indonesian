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
  // GT9 (PR 6): typed lesson-section capability-contract row shape.
  gate: 'GT1' | 'GT2' | 'GT3' | 'GT4' | 'GT5' | 'GT6' | 'GT7' | 'GT8' | 'GT9'
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
  }
}
