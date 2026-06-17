/**
 * projectors/morphology.ts — Decision 3.
 *
 * Morphology capabilities (`word_form_pair_src` source kind) come pre-built
 * in the staging `capabilities.ts` file via `materialize-capabilities.ts`
 * upstream. The legacy publish flow upserted them as-is.
 *
 * Decision 3 stamps `learning_capabilities.lesson_id` on every morphology
 * row at publish time so the runtime knows which lesson INTRODUCES the
 * morphology rule. NOTE: the stamping is UNCONDITIONAL — the cap emitter
 * (`affixedCapabilities.ts`) sets `lessonId: input.lessonId` on every emitted
 * `word_form_pair_src` cap. The old `MORPHOLOGY_PATTERN_SLUGS` /
 * `lessonIntroducesMorphology` gate was never wired into the runner (dead code)
 * and was deleted in the 2026-06-17 cap-model fix.
 */

// ───────────────────────── PR 3: affixed_form_pairs typed rows ──────────────
//
// projectAffixedFormPairs emits the typed `affixed_form_pairs` row that makes an
// word_form_pair_src:root_derived_* capability renderable — one row per cap (2
// per linguistic pair: recognition + recall). It replaces the legacy two
// capability_artifacts rows (root_derived_pair + allomorph_rule); those writes
// are no longer emitted (capabilityCatalog sets requiredArtifacts: []).
//
// The row is the SOLE persisted representation for word_form_pair_src caps (PR 3
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
  // Morphology phase-b application-tier payload (from lesson_section_affixed_pairs).
  affix?: string | null
  /** Authored grammar-pattern slug; resolved to grammar_pattern_id via patternIdsBySlug. */
  patternSourceRef?: string | null
  affixType?: string | null
  affixGloss?: string | null
  allomorphClass?: string | null
  circumfixLeft?: string | null
  circumfixRight?: string | null
  productive?: boolean | null
}

export interface AffixedFormPairsProjectionInput {
  /** Every capability in the lesson's emit set (the projector filters to
   *  sourceKind='word_form_pair_src' itself). */
  capabilities: ReadonlyArray<{ canonicalKey: string; sourceKind: string; sourceRef: string }>
  /** canonical_key → DB capability id (from upsertCapabilities). */
  capabilityIdsByKey: ReadonlyMap<string, string>
  /** source_ref → pair source data (root/derived/allomorphRule + payload). The cap's
   *  source_ref and the pair's source_ref are the same value
   *  (affixedFormPairSourceRef in content-pipeline-output.ts). */
  pairsBySourceRef: ReadonlyMap<string, AffixedPairSource>
  /** grammar_patterns.slug → grammar_pattern_id (from writePatternPath, runner.ts:396).
   *  The projector resolves each pair's authored slug against this — grammar_patterns
   *  are written by the CAPABILITY stage, so this is the ONLY place the id exists
   *  (the lesson stage cannot resolve it; data-architect re-ruling 2026-06-16). */
  patternIdsBySlug: ReadonlyMap<string, string>
  /** The introducing lesson id (ADR 0006). Denormalised onto every row. */
  lessonId: string
}

export interface AffixedFormPairsProjectionOutput {
  rows: AffixedFormPairRowInput[]
  findings: ValidationFinding[]
}

/**
 * Pure projection: map each word_form_pair_src cap to one typed row. Fails loud
 * (CS12 finding) when a ready cap has no resolvable id or no source pair, or
 * when a required field is empty — mirroring §1.5 (the reader never has to
 * defend against a missing/empty row at runtime).
 */
export function projectAffixedFormPairs(
  input: AffixedFormPairsProjectionInput,
): AffixedFormPairsProjectionOutput {
  const rows: AffixedFormPairRowInput[] = []
  const findings: ValidationFinding[] = []

  const affixedCaps = input.capabilities.filter((c) => c.sourceKind === 'word_form_pair_src')

  for (const cap of affixedCaps) {
    const capabilityId = input.capabilityIdsByKey.get(cap.canonicalKey)
    if (!capabilityId) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `word_form_pair_src cap "${cap.canonicalKey}" has no upserted capability id — cannot write affixed_form_pairs row`,
        context: { capabilityKey: cap.canonicalKey },
      })
      continue
    }

    const pair = input.pairsBySourceRef.get(cap.sourceRef)
    if (!pair) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `word_form_pair_src cap "${cap.canonicalKey}" has no source pair for source_ref "${cap.sourceRef}" — staging morphology-patterns.ts is missing this pair`,
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
          `word_form_pair_src cap "${cap.canonicalKey}" has empty field(s): ` +
          `${!root ? 'root ' : ''}${!derived ? 'derived ' : ''}${!rule ? 'allomorphRule' : ''}`.trim() +
          ` (affixed_form_pairs columns are NOT NULL)`,
        context: { capabilityKey: cap.canonicalKey },
      })
      continue
    }

    // Resolve the rule's grammar_pattern_id from the authored slug. grammar_patterns
    // are written by THIS (capability) stage, so patternIdsBySlug is the only source
    // of the id. An unresolved slug = a content defect (the pair references a pattern
    // that is not produced in this lesson's publish) → fail loud, not a null FK.
    const slug = (pair.patternSourceRef ?? '').trim()
    const grammarPatternId = slug ? input.patternIdsBySlug.get(slug) : undefined
    if (!grammarPatternId) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message:
          `word_form_pair_src cap "${cap.canonicalKey}" could not resolve grammar_pattern_id from ` +
          `pattern slug "${slug || '(none)'}" — the affix's grammar pattern must exist in this lesson's ` +
          `publish (affixed_form_pairs.grammar_pattern_id is NOT NULL)`,
        context: { capabilityKey: cap.canonicalKey, patternSlug: slug },
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
      grammar_pattern_id: grammarPatternId,
      affix: ((pair.affix ?? '').trim()) || null,
      affix_type: ((pair.affixType ?? '').trim()) || null,
      affix_gloss: ((pair.affixGloss ?? '').trim()) || null,
      allomorph_class: ((pair.allomorphClass ?? '').trim()) || null,
      circumfix_left: ((pair.circumfixLeft ?? '').trim()) || null,
      circumfix_right: ((pair.circumfixRight ?? '').trim()) || null,
      productive: pair.productive ?? null,
    })
  }

  return { rows, findings }
}
