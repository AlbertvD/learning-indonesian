// Type-specific builders for capabilityContentService. Each builder takes
// a typed BuilderInputFor<'<exerciseType>'> (narrowed by the projector) and
// returns a BuilderResult. Originally extracted from sessionQueue.ts
// (retired in #7); migrated to typed contract inputs in PR #65.
//
// See docs/plans/2026-05-18-render-contracts.md and
// docs/current-system/modules/capabilities.md.

import type { ExerciseType } from '@/types/learning'
import type { BuilderInputFor, BuilderResult, RawProjectorInput } from './types'
import { projectBuilderInput } from '@/lib/capabilities'

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

export type { BuilderResult, BuilderInputFor, RawProjectorInput } from './types'

type BuilderRegistry = {
  [K in ExerciseType]: (input: BuilderInputFor<K>) => BuilderResult
}

const BUILDERS: BuilderRegistry = {
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
 * Dispatch a raw input to the right builder, via the projector. The
 * projector narrows the input type and performs every runtime guard that
 * used to live inside each builder. After it returns ok, the builder is
 * statically guaranteed every field its contract requires is non-null.
 *
 * Failure cases bubble up as BuilderResult.fail — the projector's
 * reasonCode + message + payloadSnapshot all surface intact.
 */
export function buildForExerciseType<K extends ExerciseType>(
  exerciseType: K,
  raw: RawProjectorInput,
): BuilderResult {
  const projected = projectBuilderInput(exerciseType, raw)
  if (!projected.ok) {
    return {
      kind: 'fail',
      reasonCode: projected.reasonCode,
      message: projected.message,
      payloadSnapshot: projected.payloadSnapshot,
    }
  }
  const builder = BUILDERS[exerciseType] as (input: BuilderInputFor<K>) => BuilderResult
  return builder(projected.input)
}
