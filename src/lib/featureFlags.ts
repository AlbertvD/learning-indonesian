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
  /**
   * Enables the /preview routes. Six sibling flags
   * (sessionDiagnostics, reviewShadow, reviewCompat, standardSession,
   * experiencePlayerV1, lessonReaderV2) used to live here; they were the
   * migration scaffolding for the capability-runtime rollout, all
   * unconditionally-on in production today and removed in the
   * 2026-05-21 cleanup. Only localContentPreview remains because
   * LocalPreview.tsx genuinely gates on it.
   */
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

function parseDisabledByDefaultFlag(key: string): boolean {
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
  localContentPreview: parseDisabledByDefaultFlag('VITE_LOCAL_CONTENT_PREVIEW'),
}

/**
 * Check if an exercise type is enabled via feature flag.
 * Both the feature flag AND the availability registry must enable it.
 */
export function isExerciseTypeEnabled(exerciseType: string): boolean {
  switch (exerciseType) {
    case 'choose_form_ex':
      return featureFlags.cuedRecall
    case 'choose_correct_form_ex':
      return featureFlags.contrastPair
    case 'transform_sentence_ex':
      return featureFlags.sentenceTransformation
    case 'translate_sentence_ex':
      return featureFlags.constrainedTranslation
    case 'speaking':
      return featureFlags.speaking
    case 'choose_meaning_from_audio_ex':
      return featureFlags.listeningMcq
    case 'dictation':
      return featureFlags.dictation
    // Core types cannot be disabled via feature flags
    case 'choose_meaning_ex':
    case 'type_form_ex':
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
