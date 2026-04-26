// src/lib/featureFlags.ts
/**
 * Feature flags for gradual rollout of new exercise types and content pipeline.
 * All flags are environment variables (VITE_FEATURE_*)
 * Defaults to true for broad availability, but can be disabled per-deployment.
 */

interface FeatureFlags {
  textbookImport: boolean
  aiGeneration: boolean
  cuedRecall: boolean
  contrastPair: boolean
  sentenceTransformation: boolean
  constrainedTranslation: boolean
  speaking: boolean
  listeningMcq: boolean
  dictation: boolean
}

export interface CapabilityMigrationFlags {
  sessionDiagnostics: boolean
  reviewShadow: boolean
  reviewCompat: boolean
  standardSession: boolean
  experiencePlayerV1: boolean
  lessonReaderV2: boolean
  localContentPreview: boolean
}

function parseEnvFlag(key: string): boolean {
  const value = import.meta.env[key]
  // Treat undefined or empty string as true (enabled by default)
  if (value === undefined || value === '') return true
  // Explicitly disabled
  if (value === 'false' || value === '0') return false
  // Everything else is enabled
  return true
}

export function parseDisabledByDefaultFlag(key: string): boolean {
  const value = import.meta.env[key]
  if (value === undefined || value === '') return false
  if (value === 'true' || value === '1') return true
  return false
}

export const featureFlags: FeatureFlags = {
  textbookImport: parseEnvFlag('VITE_FEATURE_TEXTBOOK_IMPORT'),
  aiGeneration: parseEnvFlag('VITE_FEATURE_AI_GENERATION'),
  cuedRecall: parseEnvFlag('VITE_FEATURE_CUED_RECALL'),
  contrastPair: parseEnvFlag('VITE_FEATURE_CONTRAST_PAIR'),
  sentenceTransformation: parseEnvFlag('VITE_FEATURE_SENTENCE_TRANSFORMATION'),
  constrainedTranslation: parseEnvFlag('VITE_FEATURE_CONSTRAINED_TRANSLATION'),
  speaking: parseEnvFlag('VITE_FEATURE_SPEAKING'),
  listeningMcq: parseEnvFlag('VITE_FEATURE_LISTENING_MCQ'),
  dictation: parseEnvFlag('VITE_FEATURE_DICTATION'),
}

export const capabilityMigrationFlags: CapabilityMigrationFlags = {
  sessionDiagnostics: parseDisabledByDefaultFlag('VITE_CAPABILITY_SESSION_DIAGNOSTICS'),
  reviewShadow: parseDisabledByDefaultFlag('VITE_CAPABILITY_REVIEW_SHADOW'),
  reviewCompat: parseDisabledByDefaultFlag('VITE_CAPABILITY_REVIEW_COMPAT'),
  standardSession: parseDisabledByDefaultFlag('VITE_CAPABILITY_STANDARD_SESSION'),
  experiencePlayerV1: parseDisabledByDefaultFlag('VITE_EXPERIENCE_PLAYER_V1'),
  lessonReaderV2: parseDisabledByDefaultFlag('VITE_LESSON_READER_V2'),
  localContentPreview: parseDisabledByDefaultFlag('VITE_LOCAL_CONTENT_PREVIEW'),
}

/**
 * Check if an exercise type is enabled via feature flag.
 * Both the feature flag AND the availability registry must enable it.
 */
export function isExerciseTypeEnabled(exerciseType: string): boolean {
  switch (exerciseType) {
    case 'cued_recall':
      return featureFlags.cuedRecall
    case 'contrast_pair':
      return featureFlags.contrastPair
    case 'sentence_transformation':
      return featureFlags.sentenceTransformation
    case 'constrained_translation':
      return featureFlags.constrainedTranslation
    case 'speaking':
      return featureFlags.speaking
    case 'listening_mcq':
      return featureFlags.listeningMcq
    case 'dictation':
      return featureFlags.dictation
    // Core types cannot be disabled via feature flags
    case 'recognition_mcq':
    case 'typed_recall':
    case 'cloze':
    case 'meaning_recall':
      return true
    default:
      return false
  }
}

/**
 * Check if content pipeline features are enabled.
 */
export function isContentPipelineEnabled(): boolean {
  return featureFlags.textbookImport && featureFlags.aiGeneration
}

export function isTextbookImportEnabled(): boolean {
  return featureFlags.textbookImport
}

export function isAiGenerationEnabled(): boolean {
  return featureFlags.aiGeneration
}
