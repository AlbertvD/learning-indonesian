// Exercise type catalog with metadata

export type ContentFocus = 'vocabulary' | 'grammar' | 'mixed' | 'production'
export type ExerciseType =
  | 'recognition'
  | 'cued_recall'
  | 'typed_recall'
  | 'cloze'
  | 'contrast_pair'
  | 'sentence_transformation'
  | 'constrained_translation'
  | 'speaking'

export type ImplementedExerciseType =
  | 'recognition'
  | 'cued_recall'
  | 'typed_recall'
  | 'cloze'
  | 'contrast_pair'
  | 'sentence_transformation'
  | 'constrained_translation'

export type PlannedExerciseType = 'speaking'

export interface ExerciseMetadata {
  type: ExerciseType
  contentFocus: ContentFocus
  requiresAudio: boolean
  requiresGrammarPattern: boolean
  requiresManualApproval: boolean
  primarySkillFacet: 'recognition' | 'form_recall' | 'meaning_recall' | 'spoken_production'
}

const EXERCISE_CATALOG: Record<ExerciseType, ExerciseMetadata> = {
  // Already implemented
  recognition: {
    type: 'recognition',
    contentFocus: 'vocabulary',
    requiresAudio: false,
    requiresGrammarPattern: false,
    requiresManualApproval: false,
    primarySkillFacet: 'recognition',
  },
  typed_recall: {
    type: 'typed_recall',
    contentFocus: 'vocabulary',
    requiresAudio: false,
    requiresGrammarPattern: false,
    requiresManualApproval: false,
    primarySkillFacet: 'form_recall',
  },
  cloze: {
    type: 'cloze',
    contentFocus: 'vocabulary',
    requiresAudio: false,
    requiresGrammarPattern: false,
    requiresManualApproval: false,
    primarySkillFacet: 'form_recall',
  },

  // New text-based exercises - text first rollout
  cued_recall: {
    type: 'cued_recall',
    contentFocus: 'vocabulary',
    requiresAudio: false,
    requiresGrammarPattern: false,
    requiresManualApproval: false,
    primarySkillFacet: 'meaning_recall',
  },
  contrast_pair: {
    type: 'contrast_pair',
    contentFocus: 'grammar',
    requiresAudio: false,
    requiresGrammarPattern: true,
    requiresManualApproval: true,
    primarySkillFacet: 'recognition',
  },
  sentence_transformation: {
    type: 'sentence_transformation',
    contentFocus: 'grammar',
    requiresAudio: false,
    requiresGrammarPattern: true,
    requiresManualApproval: true,
    primarySkillFacet: 'form_recall',
  },
  constrained_translation: {
    type: 'constrained_translation',
    contentFocus: 'production',
    requiresAudio: false,
    requiresGrammarPattern: true,
    requiresManualApproval: true,
    primarySkillFacet: 'meaning_recall',
  },

  // Contract-ready but disabled at launch
  speaking: {
    type: 'speaking',
    contentFocus: 'production',
    requiresAudio: true,
    requiresGrammarPattern: false,
    requiresManualApproval: true,
    primarySkillFacet: 'spoken_production',
  },
}

/**
 * Get metadata for an exercise type
 */
export function getExerciseMetadata(type: ExerciseType): ExerciseMetadata {
  const metadata = EXERCISE_CATALOG[type]
  if (!metadata) {
    throw new Error(`Unknown exercise type: ${type}`)
  }
  return metadata
}

/**
 * Check if an exercise type is implemented
 */
export function isImplemented(type: ExerciseType): type is ImplementedExerciseType {
  return type !== 'speaking'
}

/**
 * Get all implemented exercise types
 */
export function getImplementedExercises(): ImplementedExerciseType[] {
  return Object.keys(EXERCISE_CATALOG).filter(
    (type): type is ImplementedExerciseType => isImplemented(type as ExerciseType)
  )
}

/**
 * Get all exercise types
 */
export function getAllExercises(): ExerciseType[] {
  return Object.keys(EXERCISE_CATALOG) as ExerciseType[]
}

/**
 * Get exercises by content focus
 */
export function getExercisesByFocus(focus: ContentFocus): ExerciseMetadata[] {
  return Object.values(EXERCISE_CATALOG).filter(ex => ex.contentFocus === focus)
}

/**
 * Get exercises that require grammar patterns
 */
export function getGrammarAwareExercises(): ExerciseMetadata[] {
  return Object.values(EXERCISE_CATALOG).filter(ex => ex.requiresGrammarPattern)
}

/**
 * Get exercises that require manual approval
 */
export function getApprovedContentExercises(): ExerciseMetadata[] {
  return Object.values(EXERCISE_CATALOG).filter(ex => ex.requiresManualApproval)
}

/**
 * Get primary skill facet for an exercise type
 */
export function getPrimarySkillFacet(
  type: ExerciseType
): 'recognition' | 'form_recall' | 'meaning_recall' | 'spoken_production' {
  return getExerciseMetadata(type).primarySkillFacet
}
