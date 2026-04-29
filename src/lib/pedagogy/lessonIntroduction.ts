import type { ReviewEvidence } from '@/lib/pedagogy/sourceProgressGates'

export type LessonContentKind =
  | 'vocabulary'
  | 'grammar'
  | 'morphology'
  | 'sentence'
  | 'dialogue'
  | 'audio'

export interface LessonContentIntroductionInput {
  contentKind: LessonContentKind
  reviewEvidence?: ReviewEvidence[]
  explanationExposed?: boolean
  exposed?: boolean
  heardOnce?: boolean
}

export interface LessonCurrentExposureInput {
  explicitlyStarted: boolean
  exposureSeconds: number
  lessonAudioExplanationHeard: boolean
}

const vocabularyIntroductionCapabilityTypes = new Set(['text_recognition', 'l1_to_id_choice'])
const patternIntroductionCapabilityTypes = new Set([
  'pattern_recognition',
  'pattern_contrast',
  'root_derived_recognition',
])

function hasSuccessfulEvidence(input: {
  evidence: ReviewEvidence[]
  capabilityTypes: Set<string>
}): boolean {
  return input.evidence.some(evidence => (
    evidence.successfulReviews > 0
    && evidence.capabilityType != null
    && input.capabilityTypes.has(evidence.capabilityType)
  ))
}

export function isLessonContentIntroduced(input: LessonContentIntroductionInput): boolean {
  const evidence = input.reviewEvidence ?? []
  if (input.contentKind === 'vocabulary') {
    return hasSuccessfulEvidence({
      evidence,
      capabilityTypes: vocabularyIntroductionCapabilityTypes,
    })
  }

  if (input.contentKind === 'grammar' || input.contentKind === 'morphology') {
    return input.explanationExposed === true && hasSuccessfulEvidence({
      evidence,
      capabilityTypes: patternIntroductionCapabilityTypes,
    })
  }

  if (input.contentKind === 'sentence' || input.contentKind === 'dialogue') {
    return input.exposed === true
  }

  return input.heardOnce === true
}

export function isLessonCurrentByExposure(input: LessonCurrentExposureInput): boolean {
  return (
    input.explicitlyStarted
    || input.exposureSeconds >= 120
    || input.lessonAudioExplanationHeard
  )
}
