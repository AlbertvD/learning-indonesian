/**
 * projectors/affixedCapabilities.ts — Task 5a.2 (Slice 5a).
 *
 * Pure emitter: `projectAffixedCapabilities({ pairs, lessonId })`
 * builds 2 `CapabilityInput` rows per `TypedAffixedPair` read from
 * `lesson_section_affixed_pairs` via `fetchAffixedPairsFromDb`.
 *
 * Canonical keys, sourceRef, capabilityType, direction, modality, and
 * learnerLanguage are BYTE-IDENTICAL to what the staging path produces via
 * `buildCapabilityStagingFromContent` + `capabilityCatalog.projectCapabilities`
 * (capabilityCatalog.ts:170-201). The parity gate (Slice 5b) asserts set-equality
 * between this emitter's output and the staging-derived caps.
 *
 * sourceRef comes verbatim from `TypedAffixedPair.source_ref` — the DB column
 * was written by the Lesson Stage using the same `affixedFormPairSourceRef`
 * formula the staging path uses, so it is already byte-identical (runner.ts:903-907,
 * verified against live DB — M-3). We do NOT recompute it from root/derived text
 * here; taking it verbatim from the DB is cheaper, simpler, and preserves the
 * invariant even if the formula is ever updated.
 *
 * Wire-up: Task 5a.5 wires this into runner.ts. This file is ONLY the pure
 * emitter + its unit test (inertness constraint — do not add side effects).
 */

import { buildCanonicalKey, CAPABILITY_PROJECTION_VERSION } from '@/lib/capabilities'
import type { CapabilityInput } from '../adapter'
import type { TypedAffixedPair } from '../loadFromDb'

export interface AffixedCapabilitiesInput {
  /** Typed affixed pairs from `lesson_section_affixed_pairs` via `fetchAffixedPairsFromDb`. */
  pairs: TypedAffixedPair[]
  /** The DB UUID of the introducing lesson (ADR 0006 — stamped on every cap). */
  lessonId: string
}

/**
 * Pure emitter: 2 CapabilityInput rows per pair.
 *
 *   1. `recognise_word_form_link_cap`  direction=derived_to_root  (recognition first)
 *   2. `produce_derived_form_cap`       direction=root_to_derived  (recall prereqs recognition)
 *
 * Matches capabilityCatalog.ts:179-201 exactly:
 *   - sourceKind='word_form_pair_src'
 *   - modality='text', learnerLanguage='none' (morphology is language-agnostic)
 *   - requiredArtifacts=[] (render from typed affixed_form_pairs table, Decision R)
 *   - recall.prerequisiteKeys=[recognition.canonicalKey]
 */
export function projectAffixedCapabilities(
  input: AffixedCapabilitiesInput,
): CapabilityInput[] {
  const caps: CapabilityInput[] = []

  for (const pair of input.pairs) {
    const sourceRef = pair.source_ref

    const recognitionDraft = {
      sourceKind: 'word_form_pair_src' as const,
      sourceRef,
      capabilityType: 'recognise_word_form_link_cap' as const,
      direction: 'derived_to_root' as const,
      modality: 'text' as const,
      learnerLanguage: 'none' as const,
    }
    const recognitionKey = buildCanonicalKey(recognitionDraft)

    caps.push({
      canonicalKey: recognitionKey,
      sourceKind: 'word_form_pair_src',
      sourceRef,
      capabilityType: 'recognise_word_form_link_cap',
      direction: 'derived_to_root',
      modality: 'text',
      learnerLanguage: 'none',
      projectionVersion: CAPABILITY_PROJECTION_VERSION,
      lessonId: input.lessonId,
      requiredArtifacts: [],
      prerequisiteKeys: [],
    })

    caps.push({
      canonicalKey: buildCanonicalKey({
        sourceKind: 'word_form_pair_src',
        sourceRef,
        capabilityType: 'produce_derived_form_cap',
        direction: 'root_to_derived',
        modality: 'text',
        learnerLanguage: 'none',
      }),
      sourceKind: 'word_form_pair_src',
      sourceRef,
      capabilityType: 'produce_derived_form_cap',
      direction: 'root_to_derived',
      modality: 'text',
      learnerLanguage: 'none',
      projectionVersion: CAPABILITY_PROJECTION_VERSION,
      lessonId: input.lessonId,
      requiredArtifacts: [],
      prerequisiteKeys: [recognitionKey],
    })

    // 3rd cap — recognise_allomorph_from_root_cap (morphology phase-b): ONLY for
    // pairs that carry an allomorph_class (meN-/peN- nasalisation). The
    // nasalisation sub-rule is its own recognise-level capability (level-purity);
    // it renders as an MCQ via the widened choose_form_ex. direction reuses
    // root_to_derived — the distinct capability_type keeps the canonical key unique
    // vs produce_derived_form_cap. Prereq = the pair's recognition cap.
    if (pair.allomorph_class != null && pair.allomorph_class !== '') {
      caps.push({
        canonicalKey: buildCanonicalKey({
          sourceKind: 'word_form_pair_src',
          sourceRef,
          capabilityType: 'recognise_allomorph_from_root_cap',
          direction: 'root_to_derived',
          modality: 'text',
          learnerLanguage: 'none',
        }),
        sourceKind: 'word_form_pair_src',
        sourceRef,
        capabilityType: 'recognise_allomorph_from_root_cap',
        direction: 'root_to_derived',
        modality: 'text',
        learnerLanguage: 'none',
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [recognitionKey],
      })
    }
  }

  return caps
}
