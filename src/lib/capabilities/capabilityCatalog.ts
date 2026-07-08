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
import { KEPT_VOCAB_CAP_TYPES } from './vocabModeSet'

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
    const formArtifacts: ArtifactKind[] = ['meaning:l1', 'base_text', 'accepted_answers:id']

    // ADR 0027 (vocabulary-mode-set-bounded): this loop emits exactly the 3
    // capabilities in KEPT_VOCAB_CAP_TYPES per item (2 unconditional + the
    // audio one gated on item.hasAudio) — modes #2
    // (recognise_form_from_meaning_cap), #4 (recall_meaning_from_text_cap) and
    // #5 (produce_form_from_audio_cap) are dropped from the model entirely.
    // This is the second, uncoordinated definition of the vocab capability
    // shape (the live projector is projectors/vocab.ts) — kept in lock-step so
    // the diagnostic tools that consume it (materialize-capabilities.ts,
    // check-capability-health.ts) cannot disagree with the live projector.
    // The guard below turns "cannot disagree" into an enforced invariant
    // rather than a comment that can silently drift.
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
    // #6 — produce_form_from_meaning_cap: productive frontier, never retired.
    // prerequisiteKeys points at #1 (ADR 0027 — was #2's key before the trim;
    // #2 no longer exists so every not-yet-introduced #6 would otherwise be
    // permanently unintroducible).
    const produceFormCapability = createCapability({
      sourceKind: 'vocabulary_src',
      sourceRef,
      capabilityType: 'produce_form_from_meaning_cap',
      skillType: 'produce_mode',
      direction: 'l1_to_id',
      modality: 'text',
      learnerLanguage: item.meanings[0]?.language ?? 'none',
      requiredArtifacts: formArtifacts,
      prerequisiteKeys: [textRecognitionCapability.canonicalKey],
    })

    const itemCapabilities: ProjectedCapability[] = [textRecognitionCapability, produceFormCapability]

    if (item.hasAudio) {
      // #3 — recognise_meaning_from_audio_cap: aural, a distinct construct,
      // never retired. ADR 0027 drops the dictation mode
      // (produce_form_from_audio_cap, #5) — aural recognition + orthographic
      // production overlap it (brief §3 guardrails).
      itemCapabilities.push(createCapability({
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
    }

    const droppedTypesPresent = itemCapabilities.filter(
      (c) => !(KEPT_VOCAB_CAP_TYPES as readonly string[]).includes(c.capabilityType),
    )
    if (droppedTypesPresent.length > 0) {
      throw new Error(
        `projectCapabilities: emitted a dropped vocab cap type `
        + `[${droppedTypesPresent.map((c) => c.capabilityType).join(', ')}] for ${sourceRef} `
        + `(ADR 0027 — must be a subset of KEPT_VOCAB_CAP_TYPES)`,
      )
    }

    capabilities.push(...itemCapabilities)
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
    // bag onto renderContracts routing (ADR 0017: recognise_grammar_pattern_cap →
    // choose_missing_word_ex; contrast_grammar_pattern_cap → choose_correct_form_ex;
    // produce_grammar_pattern_cap → transform_sentence_ex/translate_sentence_ex).
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
    const contrastCapability = createCapability({
      sourceKind: 'grammar_pattern_src',
      sourceRef,
      capabilityType: 'contrast_grammar_pattern_cap',
      skillType: 'recognise_mode',
      direction: 'none',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts,
      prerequisiteKeys: [recognitionCapability.canonicalKey],
    })
    capabilities.push(contrastCapability)
    // ADR 0017 — every pattern also emits a produce_grammar_pattern_cap, gated
    // after contrast (linear recognise → contrast → produce chain). It carries
    // the two production exercises (transform_sentence_ex, translate_sentence_ex)
    // per renderContracts, so production is scheduled as a produce-level skill.
    // skillType is passed explicitly so the catalog matches
    // deriveSkillTypeFromCapabilityType's mapping.
    capabilities.push(createCapability({
      sourceKind: 'grammar_pattern_src',
      sourceRef,
      capabilityType: 'produce_grammar_pattern_cap',
      skillType: 'produce_mode',
      direction: 'none',
      modality: 'text',
      learnerLanguage: 'none',
      requiredArtifacts,
      prerequisiteKeys: [contrastCapability.canonicalKey],
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

  // ⚠ NOT the live routing source of truth (ADR 0021). The capability stage seeds
  // affixed caps via scripts/.../projectors/affixedCapabilities.ts (runner.ts:279),
  // which FORKS by form-regularity (transparent → meaning/usage caps). This loop is
  // reached only by the non-publish diagnostics materialize-capabilities.ts (dry-run)
  // and check-capability-health.ts (read-only) — neither writes learning_capabilities
  // and neither is wired into a gate, so its pre-fork "always 2 form caps" shape is a
  // tolerated staleness, not a second writer. Do NOT treat this as the cap-type router;
  // if either tool ever gains a DB-compare against live caps, mirror the fork here.
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
