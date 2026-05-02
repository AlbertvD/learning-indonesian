// Type-specific builders for capabilityContentService. Each takes BuilderInput
// and returns BuilderResult. Mirrors the legacy switch in
// sessionQueue.ts:230-560 but accepts capability-path inputs.
//
// See docs/plans/2026-05-02-capability-content-service-spec.md §6.

import type { ExerciseType } from '@/types/learning'
import type { BuilderInput, BuilderResult } from './types'

import { buildRecognitionMCQ } from './RecognitionMCQ'
import { buildCuedRecall } from './CuedRecall'
import { buildTypedRecall } from './TypedRecall'
import { buildMeaningRecall } from './MeaningRecall'
import { buildListeningMCQ } from './ListeningMCQ'
import { buildDictation } from './Dictation'
import { buildCloze } from './Cloze'
import { buildClozeMcq } from './ClozeMcq'
import { buildContrastPair } from './ContrastPair'
import { buildSentenceTransformation } from './SentenceTransformation'
import { buildConstrainedTranslation } from './ConstrainedTranslation'
import { buildSpeaking } from './Speaking'

export type { BuilderInput, BuilderResult } from './types'

const BUILDERS: Record<ExerciseType, (input: BuilderInput) => BuilderResult> = {
  recognition_mcq:         buildRecognitionMCQ,
  cued_recall:             buildCuedRecall,
  typed_recall:            buildTypedRecall,
  meaning_recall:          buildMeaningRecall,
  listening_mcq:           buildListeningMCQ,
  dictation:               buildDictation,
  cloze:                   buildCloze,
  cloze_mcq:               buildClozeMcq,
  contrast_pair:           buildContrastPair,
  sentence_transformation: buildSentenceTransformation,
  constrained_translation: buildConstrainedTranslation,
  speaking:                buildSpeaking,
}

/**
 * Dispatch a BuilderInput to the right builder. Returns
 * `{ kind: 'fail', reasonCode: 'unsupported_exercise_type' }` for unknown
 * exercise types — defensive against future ExerciseType additions that
 * forget to register a builder here.
 */
export function buildForExerciseType(
  exerciseType: ExerciseType,
  input: BuilderInput,
): BuilderResult {
  const builder = BUILDERS[exerciseType]
  if (!builder) {
    return {
      kind: 'fail',
      reasonCode: 'unsupported_exercise_type',
      message: `no builder registered for exerciseType '${exerciseType}'`,
      payloadSnapshot: { exerciseType },
    }
  }
  return builder(input)
}
