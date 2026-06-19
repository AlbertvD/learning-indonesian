// Per-exercise-type packagers for lib/exercise-content. Each packager takes
// a typed BuilderInputFor<'<exerciseType>'> (narrowed by the projector) and
// returns a BuilderResult. Originally extracted from sessionQueue.ts
// (retired in #7); migrated to typed contract inputs in PR #65; relocated
// from src/lib/exercises/builders/ to here in the lib/exercise-content fold
// (docs/plans/2026-05-21-lib-exercise-content-fold.md PR-A step 2).
//
// See docs/current-system/modules/exercise-content.md and
// docs/current-system/modules/capabilities.md.

import type { ExerciseType } from '@/types/learning'
import type { BuilderInputFor, BuilderResult, RawProjectorInput } from './types'
import { projectBuilderInput } from '@/lib/capabilities'

import { buildRecognitionMCQ } from './recognitionMcq'
import { buildCuedRecall } from './cuedRecall'
import { buildTypedRecall } from './typedRecall'
import { buildMeaningRecall } from './meaningRecall'
import { buildListeningMCQ } from './listeningMcq'
import { buildDictation } from './dictation'
import { buildCloze } from './cloze'
import { buildClozeMcq } from './clozeMcq'
import { buildContrastPair } from './contrastPair'
import { buildSentenceTransformation } from './sentenceTransformation'
import { buildConstrainedTranslation } from './constrainedTranslation'
import { buildSpeaking } from './speaking'
import { buildDecomposeWord } from './decomposeWord'

export type { BuilderResult, BuilderInputFor, RawProjectorInput } from './types'

type BuilderRegistry = {
  [K in ExerciseType]: (input: BuilderInputFor<K>) => BuilderResult
}

const BUILDERS: BuilderRegistry = {
  choose_meaning_ex:         buildRecognitionMCQ,
  choose_form_ex:             buildCuedRecall,
  type_form_ex:            buildTypedRecall,
  type_meaning_ex:          buildMeaningRecall,
  choose_meaning_from_audio_ex:           buildListeningMCQ,
  type_form_from_audio_ex:               buildDictation,
  type_missing_word_ex:                   buildCloze,
  choose_missing_word_ex:               buildClozeMcq,
  choose_correct_form_ex:           buildContrastPair,
  transform_sentence_ex: buildSentenceTransformation,
  translate_sentence_ex: buildConstrainedTranslation,
  speaking:                buildSpeaking,
  decompose_word_ex:       buildDecomposeWord,
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
