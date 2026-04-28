import {
  CAPABILITY_PROJECTION_VERSION,
  type ArtifactKind,
  type CapabilityDirection,
  type CapabilityModality,
  type CapabilityProjection,
  type CapabilitySourceKind,
  type CapabilitySourceProgressRequirement,
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
  requiredSourceProgress?: CapabilitySourceProgressRequirement
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
    const recognitionProgress: CapabilitySourceProgressRequirement = {
      kind: 'source_progress',
      sourceRef,
      requiredState: 'section_exposed',
    }
    const recallProgress: CapabilitySourceProgressRequirement = {
      kind: 'source_progress',
      sourceRef,
      requiredState: 'intro_completed',
    }
    const audioProgress: CapabilitySourceProgressRequirement = {
      kind: 'source_progress',
      sourceRef,
      requiredState: 'heard_once',
    }

    const textRecognitionCapability = createCapability({
      sourceKind: 'item',
      sourceRef,
      capabilityType: 'text_recognition',
      skillType: 'recognition',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: item.meanings[0]?.language ?? 'none',
      requiredArtifacts: recognitionArtifacts,
      requiredSourceProgress: recognitionProgress,
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
      requiredSourceProgress: recallProgress,
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
      requiredSourceProgress: recallProgress,
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
      requiredSourceProgress: recallProgress,
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
        requiredSourceProgress: audioProgress,
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
        requiredSourceProgress: audioProgress,
        prerequisiteKeys: [textRecognitionCapability.canonicalKey],
        difficultyLevel: 4,
      }))
    }
  }

  for (const pattern of input.grammarPatterns) {
    const sourceRef = normalizeLessonSourceRef(pattern.sourceRef)
    capabilities.push(createCapability({
      sourceKind: 'pattern',
      sourceRef,
      capabilityType: 'pattern_recognition',
      skillType: 'recognition',
      direction: 'none',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts: ['pattern_explanation:l1', 'pattern_example'],
      difficultyLevel: 4,
      requiredSourceProgress: {
        kind: 'source_progress',
        sourceRef,
        requiredState: 'pattern_noticing_seen',
      },
    }))
  }

  for (const line of input.dialogueLines ?? []) {
    const sourceRef = normalizeLessonSourceRef(line.sourceRef)
    capabilities.push(createCapability({
      sourceKind: 'dialogue_line',
      sourceRef,
      capabilityType: 'contextual_cloze',
      skillType: 'form_recall',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
      difficultyLevel: 3,
      requiredSourceProgress: { kind: 'source_progress', sourceRef, requiredState: 'section_exposed' },
    }))
  }

  for (const segment of input.podcastSegments ?? []) {
    capabilities.push(createCapability({
      sourceKind: 'podcast_segment',
      sourceRef: segment.sourceRef,
      capabilityType: 'podcast_gist',
      skillType: 'recognition',
      direction: 'audio_to_l1',
      modality: 'audio',
      learnerLanguage: 'none',
      requiredArtifacts: ['audio_segment', 'transcript_segment', 'podcast_gist_prompt'],
      difficultyLevel: 2,
      goalTags: ['podcast', 'guided_transcript'],
      requiredSourceProgress: { kind: 'none', reason: 'exposure_only' },
    }))
  }

  for (const phrase of input.podcastPhrases ?? []) {
    capabilities.push(createCapability({
      sourceKind: 'podcast_phrase',
      sourceRef: phrase.sourceRef,
      capabilityType: 'meaning_recall',
      skillType: 'meaning_recall',
      direction: 'id_to_l1',
      modality: 'mixed',
      learnerLanguage: 'none',
      requiredArtifacts: ['timecoded_phrase', 'translation:l1'],
      difficultyLevel: 3,
      goalTags: ['podcast', 'podcast_phrase'],
      requiredSourceProgress: {
        kind: 'source_progress',
        sourceRef: phrase.segmentSourceRef ?? phrase.sourceRef,
        requiredState: 'heard_once',
      },
    }))
  }

  for (const pair of input.affixedFormPairs ?? []) {
    const requiredArtifacts: ArtifactKind[] = pair.allomorphRule
      ? ['root_derived_pair', 'allomorph_rule']
      : ['root_derived_pair']
    const requiredSourceProgress: CapabilitySourceProgressRequirement = {
      kind: 'source_progress',
      sourceRef: pair.patternSourceRef ?? pair.sourceRef,
      requiredState: 'pattern_noticing_seen',
    }
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
      requiredSourceProgress,
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
      requiredSourceProgress,
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
