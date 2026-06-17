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
import { sourceRefForLearningItem } from '../../../content-pipeline-output'
import type { CapabilityInput } from '../adapter'
import type { TypedAffixedPair } from '../loadFromDb'

export interface AffixedCapabilitiesInput {
  /** Typed affixed pairs from `lesson_section_affixed_pairs` via `fetchAffixedPairsFromDb`. */
  pairs: TypedAffixedPair[]
  /** The DB UUID of the introducing lesson (ADR 0006 — stamped on every cap). */
  lessonId: string
  /** grammar_patterns.slug → the pattern's `recognise_grammar_pattern_cap` canonical_key.
   *  The rule→application prerequisite (ADR 0018). Built by the runner from the
   *  pattern projection; absent ⇒ the rule prereq is omitted (the projectAffixedFormPairs
   *  CS12 fails the stage anyway when the slug resolves to no grammar_pattern_id). */
  ruleCapKeyBySlug?: ReadonlyMap<string, string>
}

/**
 * The root-vocabulary recognition cap canonical_key for a pair's root (ADR 0018
 * prereq ii). Built deterministically — NO DB query — and must byte-match the live
 * vocab recognition cap (vocab.ts:149-158): vocabulary_src / sourceRefForLearningItem
 * (applies itemSlug) / recognise_meaning_from_text_cap / id_to_l1 / text / 'nl'.
 * Couples to the all-NL corpus (learnerLanguage hardcoded 'nl').
 */
function rootVocabPrereqKey(rootText: string): string {
  return buildCanonicalKey({
    sourceKind: 'vocabulary_src',
    sourceRef: sourceRefForLearningItem(rootText),
    capabilityType: 'recognise_meaning_from_text_cap',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
  })
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

  const ruleCapKeyBySlug = input.ruleCapKeyBySlug ?? new Map<string, string>()

  for (const pair of input.pairs) {
    const sourceRef = pair.source_ref

    // ADR 0018 — the two cross-source-kind hard-block prerequisites every
    // application cap carries: (i) the affix RULE (grammar-pattern recognise cap,
    // resolved from the authored slug) and (ii) the derived form's ROOT vocabulary
    // recognition cap. Both are flat canonical_keys the planner resolves
    // source-kind-agnostically (pedagogy.ts:326,524-526).
    const ruleCapKey = pair.pattern_source_ref
      ? ruleCapKeyBySlug.get(pair.pattern_source_ref)
      : undefined
    const crossPrereqs = [ruleCapKey, rootVocabPrereqKey(pair.root_text)]
      .filter((k): k is string => typeof k === 'string' && k.length > 0)

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
      prerequisiteKeys: [...crossPrereqs],
    })

    // produce_derived_form_cap — SKIPPED for lexicalised (productive=false) pairs:
    // there is no point drilling a learner to "generate" a frozen form (data-architect i1).
    // null/true ⇒ productive (emit); only an explicit false skips.
    if (pair.productive !== false) {
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
        prerequisiteKeys: [recognitionKey, ...crossPrereqs],
      })
    }

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
        prerequisiteKeys: [recognitionKey, ...crossPrereqs],
      })
    }
  }

  return caps
}
