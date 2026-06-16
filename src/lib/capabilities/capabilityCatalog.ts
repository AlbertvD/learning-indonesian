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
}

function createCapability(draft: CapabilityDraft): ProjectedCapability {
  return {
    ...draft,
    canonicalKey: buildCanonicalKey(draft),
    prerequisiteKeys: draft.prerequisiteKeys ?? [],
    projectionVersion: CAPABILITY_PROJECTION_VERSION,
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
      sourceKind: 'vocabulary_src',
      sourceRef,
      capabilityType: 'recognise_meaning_from_text_cap',
      skillType: 'recognise_mode',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: item.meanings[0]?.language ?? 'none',
      requiredArtifacts: recognitionArtifacts,
    })
    capabilities.push(textRecognitionCapability)
    const choiceCapability = createCapability({
      sourceKind: 'vocabulary_src',
      sourceRef,
      capabilityType: 'recognise_form_from_meaning_cap',
      // cap-v2 Slice 1 mis-level fix: recognise_form_from_meaning_cap ("pick the Indonesian
      // word from the L1 meaning") is a receptive recognition, not a recall.
      // Kept in lock-step with deriveSkillTypeFromCapabilityType (the read-time
      // authority at session-builder/adapter.ts) so both surfaces agree.
      skillType: 'recognise_mode',
      direction: 'l1_to_id',
      modality: 'text',
      learnerLanguage: item.meanings[0]?.language ?? 'none',
      requiredArtifacts: choiceArtifacts,
      prerequisiteKeys: [textRecognitionCapability.canonicalKey],
    })
    capabilities.push(choiceCapability)
    capabilities.push(createCapability({
      sourceKind: 'vocabulary_src',
      sourceRef,
      capabilityType: 'recall_meaning_from_text_cap',
      skillType: 'recall_mode',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: item.meanings[0]?.language ?? 'none',
      requiredArtifacts: meaningArtifacts,
      prerequisiteKeys: [textRecognitionCapability.canonicalKey],
    }))
    capabilities.push(createCapability({
      sourceKind: 'vocabulary_src',
      sourceRef,
      capabilityType: 'produce_form_from_meaning_cap',
      skillType: 'produce_mode',
      direction: 'l1_to_id',
      modality: 'text',
      learnerLanguage: item.meanings[0]?.language ?? 'none',
      requiredArtifacts: formArtifacts,
      prerequisiteKeys: [choiceCapability.canonicalKey],
    }))

    if (item.hasAudio) {
      capabilities.push(createCapability({
        sourceKind: 'vocabulary_src',
        sourceRef,
        capabilityType: 'recognise_meaning_from_audio_cap',
        skillType: 'recognise_mode',
        direction: 'audio_to_l1',
        modality: 'audio',
        learnerLanguage: item.meanings[0]?.language ?? 'none',
        requiredArtifacts: ['audio_clip', 'meaning:l1'],
        prerequisiteKeys: [textRecognitionCapability.canonicalKey],
      }))
      capabilities.push(createCapability({
        sourceKind: 'vocabulary_src',
        sourceRef,
        capabilityType: 'produce_form_from_audio_cap',
        skillType: 'produce_mode',
        direction: 'audio_to_id',
        modality: 'audio',
        learnerLanguage: 'none',
        requiredArtifacts: ['audio_clip', 'base_text', 'accepted_answers:id'],
        prerequisiteKeys: [textRecognitionCapability.canonicalKey],
      }))
    }
  }

  for (const pattern of input.grammarPatterns) {
    const sourceRef = normalizeLessonSourceRef(pattern.sourceRef)
    // PR 4 slice: pattern caps render from the 4 typed grammar-exercise tables
    // (byKind/pattern.ts); structure is guaranteed by those tables' NOT NULL
    // columns + validateGrammarExercises + HC19/HC20, so no capability_artifacts
    // are required (mirrors item + dialogue_line + word_form_pair_src, Decision R).
    // Emitting [] both (a) stops the shared artifact builder from writing
    // pattern_explanation:l1/pattern_example (buildArtifactsForCapability maps
    // over requiredArtifacts), and (b) moves readiness off the legacy artifact
    // bag onto renderContracts routing (contrast_grammar_pattern_cap → choose_correct_form_ex,
    // recognise_grammar_pattern_cap → transform_sentence_ex/translate_sentence_ex/choose_missing_word_ex).
    const requiredArtifacts: ArtifactKind[] = []
    const recognitionCapability = createCapability({
      sourceKind: 'grammar_pattern_src',
      sourceRef,
      capabilityType: 'recognise_grammar_pattern_cap',
      skillType: 'recognise_mode',
      direction: 'none',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts,
    })
    capabilities.push(recognitionCapability)
    // Decision 5a — every recognise_grammar_pattern_cap capability has a sibling
    // contrast_grammar_pattern_cap capability. Mirrors the recognition rule's source_ref
    // so the runtime can render contrast exercises against the same examples.
    capabilities.push(createCapability({
      sourceKind: 'grammar_pattern_src',
      sourceRef,
      capabilityType: 'contrast_grammar_pattern_cap',
      skillType: 'recognise_mode',
      direction: 'none',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts,
      prerequisiteKeys: [recognitionCapability.canonicalKey],
    }))
  }

  // Decision 5b — `produce_form_from_context_cap` capability emission moved out of the
  // shared catalog. The capability-stage's projectors/vocab.ts now emits
  // these rows directly, driven by clozeContexts produced by the
  // cloze-creator authoring agent (a cloze context keyed on a dialogue
  // line's slug becomes one produce_form_from_context_cap capability rooted at that
  // line's source_ref). Removed reads of `input.dialogueLines` here.
  //
  // Decision 4 — podcast capability emission moved to
  // `scripts/lib/pipeline/podcast-stage/podcastProjectionRules.ts`. The four
  // callers of projectCapabilities concatenate the podcast rule's output
  // with the array returned by this function.

  for (const pair of input.affixedFormPairs ?? []) {
    // PR 3 slice: word_form_pair_src caps render from the typed `affixed_form_pairs`
    // table; structure is guaranteed by that table's NOT NULL columns +
    // validateAffixedFormPairs + HC17, so no capability_artifacts are required
    // (mirrors item + dialogue_line, Decision R). Emitting [] both (a) stops the
    // shared artifact builder from writing root_derived_pair/allomorph_rule
    // (buildArtifactsForCapability maps over requiredArtifacts), and (b) keeps
    // readiness off the legacy artifact bag.
    const requiredArtifacts: ArtifactKind[] = []
    const recognitionCapability = createCapability({
      sourceKind: 'word_form_pair_src',
      sourceRef: pair.sourceRef,
      capabilityType: 'recognise_word_form_link_cap',
      skillType: 'recognise_mode',
      direction: 'derived_to_root',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts,
    })
    capabilities.push(recognitionCapability)
    capabilities.push(createCapability({
      sourceKind: 'word_form_pair_src',
      sourceRef: pair.sourceRef,
      capabilityType: 'produce_derived_form_cap',
      skillType: 'produce_mode',
      direction: 'root_to_derived',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts,
      prerequisiteKeys: [recognitionCapability.canonicalKey],
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
