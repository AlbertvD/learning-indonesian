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

export const featureFlags: FeatureFlags = {
  textbookImport: parseEnvFlag('VITE_FEATURE_TEXTBOOK_IMPORT'),
  aiGeneration: parseEnvFlag('VITE_FEATURE_AI_GENERATION'),
  cuedRecall: parseEnvFlag('VITE_FEATURE_CUED_RECALL'),
  contrastPair: parseEnvFlag('VITE_FEATURE_CONTRAST_PAIR'),
  sentenceTransformation: parseEnvFlag('VITE_FEATURE_SENTENCE_TRANSFORMATION'),
  constrainedTranslation: parseEnvFlag('VITE_FEATURE_CONSTRAINED_TRANSLATION'),
  speaking: parseEnvFlag('VITE_FEATURE_SPEAKING'),
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
    // Core types cannot be disabled via feature flags
    case 'recognition_mcq':
    case 'typed_recall':
    case 'cloze':
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
