import {
  CAPABILITY_PROJECTION_VERSION,
  type ArtifactKind,
  type CapabilityDirection,
  type CapabilityModality,
  type CapabilityProjection,
  type CapabilitySourceKind,
  type CapabilityType,
  type CurrentContentSnapshot,
  type LearnerLanguage,
  type ProjectedCapability,
} from './capabilityTypes'
import type { SkillType } from '../../types/learning'
import { buildCanonicalKey, normalizeLessonSourceRef } from './canonicalKey'

interface CapabilityDraft {
  sourceKind: CapabilitySourceKind
  sourceRef: string
  capabilityType: CapabilityType
  skillType: SkillType
  direction: CapabilityDirection
  modality: CapabilityModality
  learnerLanguage: LearnerLanguage
  requiredArtifacts: ArtifactKind[]
  prerequisiteKeys?: string[]
  difficultyLevel: number
  goalTags?: string[]
}

function fingerprint(input: unknown): string {
  return JSON.stringify(input)
}

function createCapability(draft: CapabilityDraft): ProjectedCapability {
  return {
    ...draft,
    canonicalKey: buildCanonicalKey(draft),
    prerequisiteKeys: draft.prerequisiteKeys ?? [],
    goalTags: draft.goalTags ?? [],
    projectionVersion: CAPABILITY_PROJECTION_VERSION,
    sourceFingerprint: fingerprint({ sourceKind: draft.sourceKind, sourceRef: draft.sourceRef }),
    artifactFingerprint: fingerprint(draft.requiredArtifacts),
  }
}

export function projectCapabilities(input: CurrentContentSnapshot): CapabilityProjection {
  const capabilities: ProjectedCapability[] = []

  for (const item of input.learningItems) {
    const sourceRef = `learning_items/${item.id}`
    const recognitionArtifacts: ArtifactKind[] = ['base_text', 'meaning:l1']
    const meaningArtifacts: ArtifactKind[] = ['meaning:l1', 'accepted_answers:l1']
    const choiceArtifacts: ArtifactKind[] = ['meaning:l1', 'base_text']
    const formArtifacts: ArtifactKind[] = ['meaning:l1', 'base_text', 'accepted_answers:id']

    const textRecognitionCapability = createCapability({
      sourceKind: 'item',
      sourceRef,
      capabilityType: 'text_recognition',
      skillType: 'recognition',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: item.meanings[0]?.language ?? 'none',
      requiredArtifacts: recognitionArtifacts,
      difficultyLevel: 1,
    })
    capabilities.push(textRecognitionCapability)
    const choiceCapability = createCapability({
      sourceKind: 'item',
      sourceRef,
      capabilityType: 'l1_to_id_choice',
      skillType: 'meaning_recall',
      direction: 'l1_to_id',
      modality: 'text',
      learnerLanguage: item.meanings[0]?.language ?? 'none',
      requiredArtifacts: choiceArtifacts,
      prerequisiteKeys: [textRecognitionCapability.canonicalKey],
      difficultyLevel: 2,
    })
    capabilities.push(choiceCapability)
    capabilities.push(createCapability({
      sourceKind: 'item',
      sourceRef,
      capabilityType: 'meaning_recall',
      skillType: 'meaning_recall',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: item.meanings[0]?.language ?? 'none',
      requiredArtifacts: meaningArtifacts,
      prerequisiteKeys: [textRecognitionCapability.canonicalKey],
      difficultyLevel: 2,
    }))
    capabilities.push(createCapability({
      sourceKind: 'item',
      sourceRef,
      capabilityType: 'form_recall',
      skillType: 'form_recall',
      direction: 'l1_to_id',
      modality: 'text',
      learnerLanguage: item.meanings[0]?.language ?? 'none',
      requiredArtifacts: formArtifacts,
      prerequisiteKeys: [choiceCapability.canonicalKey],
      difficultyLevel: 3,
    }))

    if (item.hasAudio) {
      capabilities.push(createCapability({
        sourceKind: 'item',
        sourceRef,
        capabilityType: 'audio_recognition',
        skillType: 'recognition',
        direction: 'audio_to_l1',
        modality: 'audio',
        learnerLanguage: item.meanings[0]?.language ?? 'none',
        requiredArtifacts: ['audio_clip', 'meaning:l1'],
        prerequisiteKeys: [textRecognitionCapability.canonicalKey],
        difficultyLevel: 2,
      }))
      capabilities.push(createCapability({
        sourceKind: 'item',
        sourceRef,
        capabilityType: 'dictation',
        skillType: 'form_recall',
        direction: 'audio_to_id',
        modality: 'audio',
        learnerLanguage: 'none',
        requiredArtifacts: ['audio_clip', 'base_text', 'accepted_answers:id'],
        prerequisiteKeys: [textRecognitionCapability.canonicalKey],
        difficultyLevel: 4,
      }))
    }
  }

  for (const pattern of input.grammarPatterns) {
    const sourceRef = normalizeLessonSourceRef(pattern.sourceRef)
    const recognitionCapability = createCapability({
      sourceKind: 'pattern',
      sourceRef,
      capabilityType: 'pattern_recognition',
      skillType: 'recognition',
      direction: 'none',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts: ['pattern_explanation:l1', 'pattern_example'],
      difficultyLevel: 4,
    })
    capabilities.push(recognitionCapability)
    // Decision 5a — every pattern_recognition capability has a sibling
    // pattern_contrast capability. Mirrors the recognition rule's source_ref
    // so the runtime can render contrast exercises against the same examples.
    capabilities.push(createCapability({
      sourceKind: 'pattern',
      sourceRef,
      capabilityType: 'pattern_contrast',
      skillType: 'recognition',
      direction: 'none',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts: ['pattern_explanation:l1', 'pattern_example'],
      prerequisiteKeys: [recognitionCapability.canonicalKey],
      difficultyLevel: 5,
    }))
  }

  // Decision 5b — `contextual_cloze` capability emission moved out of the
  // shared catalog. The capability-stage's projectors/vocab.ts now emits
  // these rows directly, driven by clozeContexts produced by the
  // cloze-creator authoring agent (a cloze context keyed on a dialogue
  // line's slug becomes one contextual_cloze capability rooted at that
  // line's source_ref). Removed reads of `input.dialogueLines` here.
  //
  // Decision 4 — podcast capability emission moved to
  // `scripts/lib/pipeline/podcast-stage/podcastProjectionRules.ts`. The four
  // callers of projectCapabilities concatenate the podcast rule's output
  // with the array returned by this function.

  for (const pair of input.affixedFormPairs ?? []) {
    const requiredArtifacts: ArtifactKind[] = pair.allomorphRule
      ? ['root_derived_pair', 'allomorph_rule']
      : ['root_derived_pair']
    const recognitionCapability = createCapability({
      sourceKind: 'affixed_form_pair',
      sourceRef: pair.sourceRef,
      capabilityType: 'root_derived_recognition',
      skillType: 'recognition',
      direction: 'derived_to_root',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts,
      difficultyLevel: 4,
      goalTags: ['morphology', 'meN-active'],
    })
    capabilities.push(recognitionCapability)
    capabilities.push(createCapability({
      sourceKind: 'affixed_form_pair',
      sourceRef: pair.sourceRef,
      capabilityType: 'root_derived_recall',
      skillType: 'form_recall',
      direction: 'root_to_derived',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts,
      prerequisiteKeys: [recognitionCapability.canonicalKey],
      difficultyLevel: 5,
      goalTags: ['morphology', 'meN-active'],
    }))
  }

  capabilities.sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey))

  return {
    projectionVersion: CAPABILITY_PROJECTION_VERSION,
    capabilities,
    aliases: [],
    diagnostics: [],
  }
}
