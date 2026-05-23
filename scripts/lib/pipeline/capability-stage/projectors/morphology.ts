/**
 * projectors/morphology.ts — Decision 3.
 *
 * Morphology capabilities (`affixed_form_pair` source kind) come pre-built
 * in the staging `capabilities.ts` file via `materialize-capabilities.ts`
 * upstream. The legacy publish flow upserted them as-is.
 *
 * Decision 3 stamps `learning_capabilities.lesson_id` on every morphology
 * row at publish time so the runtime knows which lesson INTRODUCES the
 * morphology rule (not which lesson the affixed form appears in, not the
 * lesson where the root word was first taught).
 *
 * The hardcoded slug set below (fold §11 #1) gates whether the stamping
 * applies. Lessons whose `grammar_patterns` set includes any of these slugs
 * are morphology-introducing lessons; their `affixed_form_pair` capability
 * rows get `lesson_id = <this lesson>`. Lessons 1–8 without these slugs do
 * not introduce morphology and skip the stamping.
 */

export const MORPHOLOGY_PATTERN_SLUGS = new Set([
  'men-active',     // meN- prefix (lesson 9)
  'ber-prefix',
  'di-passive',
  'me-prefix',
  'pe-nominalizer',
  'ke-an-noun',
  'pe-an-noun',
])

export function lessonIntroducesMorphology(patternSlugs: string[]): boolean {
  return patternSlugs.some((slug) => MORPHOLOGY_PATTERN_SLUGS.has(slug))
}

// ───────────────────────── PR 3: affixed_form_pairs typed rows ──────────────
//
// projectAffixedFormPairs emits the typed `affixed_form_pairs` row that makes an
// affixed_form_pair:root_derived_* capability renderable — one row per cap (2
// per linguistic pair: recognition + recall). It replaces the legacy two
// capability_artifacts rows (root_derived_pair + allomorph_rule); those writes
// are no longer emitted (capabilityCatalog sets requiredArtifacts: []).
//
// The row is the SOLE persisted representation for affixed_form_pair caps (PR 3
// slice). The runtime reader (byKind/affixedFormPair.ts) reads the typed table;
// structure is guaranteed by its NOT NULL columns + validateAffixedFormPairs +
// HC17, and readiness requires no artifact bag (renderContracts: [] — mirror of
// the dialogue_line PR 2 end-state). Mirrors projectors/dialogueArtifacts.ts.

import type { ValidationFinding } from '../model'
import type { AffixedFormPairRowInput } from '../adapter'

/** The linguistic-pair source data, keyed by the cap's source_ref. */
export interface AffixedPairSource {
  root: string
  derived: string
  allomorphRule?: string
}

export interface AffixedFormPairsProjectionInput {
  /** Every capability in the lesson's emit set (the projector filters to
   *  sourceKind='affixed_form_pair' itself). */
  capabilities: ReadonlyArray<{ canonicalKey: string; sourceKind: string; sourceRef: string }>
  /** canonical_key → DB capability id (from upsertCapabilities). */
  capabilityIdsByKey: ReadonlyMap<string, string>
  /** source_ref → pair source data (root/derived/allomorphRule). The cap's
   *  source_ref and the pair's source_ref are the same value
   *  (affixedFormPairSourceRef in content-pipeline-output.ts). */
  pairsBySourceRef: ReadonlyMap<string, AffixedPairSource>
  /** The introducing lesson id (ADR 0006). Denormalised onto every row. */
  lessonId: string
}

export interface AffixedFormPairsProjectionOutput {
  rows: AffixedFormPairRowInput[]
  findings: ValidationFinding[]
}

/**
 * Pure projection: map each affixed_form_pair cap to one typed row. Fails loud
 * (CS12 finding) when a ready cap has no resolvable id or no source pair, or
 * when a required field is empty — mirroring §1.5 (the reader never has to
 * defend against a missing/empty row at runtime).
 */
export function projectAffixedFormPairs(
  input: AffixedFormPairsProjectionInput,
): AffixedFormPairsProjectionOutput {
  const rows: AffixedFormPairRowInput[] = []
  const findings: ValidationFinding[] = []

  const affixedCaps = input.capabilities.filter((c) => c.sourceKind === 'affixed_form_pair')

  for (const cap of affixedCaps) {
    const capabilityId = input.capabilityIdsByKey.get(cap.canonicalKey)
    if (!capabilityId) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `affixed_form_pair cap "${cap.canonicalKey}" has no upserted capability id — cannot write affixed_form_pairs row`,
        context: { capabilityKey: cap.canonicalKey },
      })
      continue
    }

    const pair = input.pairsBySourceRef.get(cap.sourceRef)
    if (!pair) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `affixed_form_pair cap "${cap.canonicalKey}" has no source pair for source_ref "${cap.sourceRef}" — staging morphology-patterns.ts is missing this pair`,
        context: { capabilityKey: cap.canonicalKey },
      })
      continue
    }

    const root = (pair.root ?? '').trim()
    const derived = (pair.derived ?? '').trim()
    const rule = (pair.allomorphRule ?? '').trim()
    if (!root || !derived || !rule) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message:
          `affixed_form_pair cap "${cap.canonicalKey}" has empty field(s): ` +
          `${!root ? 'root ' : ''}${!derived ? 'derived ' : ''}${!rule ? 'allomorphRule' : ''}`.trim() +
          ` (affixed_form_pairs columns are NOT NULL)`,
        context: { capabilityKey: cap.canonicalKey },
      })
      continue
    }

    rows.push({
      capability_id: capabilityId,
      source_ref: cap.sourceRef,
      lesson_id: input.lessonId,
      root_text: root,
      derived_text: derived,
      allomorph_rule: rule,
    })
  }

  return { rows, findings }
}
