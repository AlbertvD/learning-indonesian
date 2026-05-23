// lib/exercise-content/byKind/affixedFormPair — affixed_form_pair-source-kind
// fetcher.
//
// PR 3 (2026-05-23): switched from the legacy `capability_artifacts` reader
// (root_derived_pair + allomorph_rule — two rows per cap) to the typed
// `affixed_form_pairs` table (one row per cap, NOT NULL root_text/derived_text/
// allomorph_rule). The new reader is FAIL-LOUD per §1.5 of
// `docs/plans/2026-05-22-data-model-migration.md`: when `learning_capabilities`
// says the cap is ready but the typed-table query returns nothing, the resolver
// surfaces an `affixed_form_pair_typed_row_missing` failure diagnostic rather
// than silently skipping. Exact mirror of byKind/dialogueLine.ts (PR 2).
//
// The `direction` (root→derived recall vs derived→root recognition) comes from
// the canonical-key tail, decoded at bucketing time — NOT from the typed row,
// which is pair-stable across both caps of a linguistic pair.
//
// No capability_artifacts are read: the legacy morphology artifact writes were
// removed in this PR (renderContracts: typed_recall/affixed_form_pair → []).
//
// cued_recall remains item-only (its distractor pool requires authored
// distractors per affixed_form_pair; deferred to a future plan). cued_recall
// blocks scheduled for affixed_form_pair would be a planner bug — the projector
// rejects the input shape with item_not_found.

import {
  type AffixedFormPairBucketEntry,
  type BlockResolutionData,
  type SupabaseSchemaClient,
  makeFailContext,
} from '../adapter'

/**
 * Shape returned by the affixed_form_pairs query. Every column has a NOT NULL
 * constraint in the DB (scripts/migration.sql:2420-2431); we narrow defensively
 * in case Postgres-side integrity ever drifts.
 */
interface AffixedFormPairRow {
  capability_id: string
  root_text: string
  derived_text: string
  allomorph_rule: string
}

export async function fetchForAffixedFormPairBlocks(
  client: SupabaseSchemaClient,
  affixedBlocks: AffixedFormPairBucketEntry[],
  userLanguage: 'nl' | 'en',
  result: Map<string, BlockResolutionData>,
): Promise<void> {
  if (affixedBlocks.length === 0) return

  const capabilityIds = [...new Set(affixedBlocks.map(b => b.block.capabilityId))]
  const { data, error } = await client.schema('indonesian')
    .from('affixed_form_pairs')
    .select('capability_id, root_text, derived_text, allomorph_rule')
    .in('capability_id', capabilityIds)
  if (error) throw error

  const rowByCapability = new Map<string, AffixedFormPairRow>()
  for (const row of (data ?? []) as AffixedFormPairRow[]) {
    rowByCapability.set(row.capability_id, row)
  }

  for (const { block, sourceRef, direction } of affixedBlocks) {
    const row = rowByCapability.get(block.capabilityId)
    if (!row) {
      // Fail-loud: a ready affixed_form_pair cap with no typed row means the
      // typed-row writer (projectors/morphology.ts) failed or did not run for
      // this lesson, or the cap was promoted before the row landed. Surface,
      // do not skip silently.
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'affixed_form_pair_typed_row_missing',
          `affixed_form_pair cap ${block.capabilityId} has no affixed_form_pairs row — typed-row writer failed or did not run for this lesson`,
          { capabilityId: block.capabilityId, sourceRef }),
      })
      continue
    }

    const root = row.root_text
    const derived = row.derived_text
    const rule = row.allomorph_rule

    if (!root || !derived || !rule) {
      // DB NOT NULL constraints guard against empties at write time. This
      // branch is defensive belt-and-braces.
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'affixed_form_pair_typed_row_missing',
          `affixed_form_pairs row for cap ${block.capabilityId} has empty fields after fetch`,
          {
            capabilityId: block.capabilityId,
            sourceRef,
            hasRoot: !!root,
            hasDerived: !!derived,
            hasRule: !!rule,
          }),
      })
      continue
    }

    // direction comes from the canonical-key tail (parsed by decodeCanonicalKey).
    // Production caps always carry it. Normalize to the union type; an
    // unexpected value falls back to root_to_derived (production caps cover only
    // these two values per src/lib/capabilities/capabilityCatalog.ts).
    const normalizedDirection: 'root_to_derived' | 'derived_to_root' =
      direction === 'derived_to_root' ? 'derived_to_root' : 'root_to_derived'

    result.set(block.id, {
      kind: 'ok',
      block,
      input: {
        block,
        learningItem: null,
        dialogueLine: null,
        affixedFormPair: {
          root,
          derived,
          direction: normalizedDirection,
          allomorphRule: rule,
          sourceRef,
        },
        meanings: [],
        contexts: [],
        answerVariants: [],
        variant: null,
        // No artifacts in the typed-table path — the byType/typedRecall.ts
        // packager reads input.affixedFormPair; the empty map is a no-op for it.
        artifactsByKind: new Map(),
        poolItems: [],
        poolMeaningsByItem: new Map(),
        userLanguage,
      },
    })
  }
}
