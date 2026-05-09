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
    pageBlocks: number
    audioClipsSynthesised: number
    audioClipsReused: number
  }
  findings: ValidationFinding[]
  durationMs: number
}

export interface ValidationFinding {
  gate: 'GT1' | 'GT2' | 'GT3' | 'GT4' | 'GT5' | 'GT6' | 'GT7'
  severity: 'error' | 'warning'
  message: string
  context?: { sectionId?: string; blockKey?: string; itemSlug?: string }
}
