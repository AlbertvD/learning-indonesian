// lib/exercise-content/byKind/affixedFormPair — affixed_form_pair-source-kind
// fetcher.
//
// Artifacts-only fetch: no learning_items join. The two required artifacts
// (root_derived_pair, allomorph_rule) are written by the publish pipeline at
// scripts/lib/content-pipeline-output.ts:430-441. The RawProjectorInput has
// learningItem=null and affixedFormPair populated; the byType typedRecall
// packager branches on which field is set.
//
// cued_recall remains item-only (its distractor pool requires authored
// distractors per affixed_form_pair; deferred to a future plan). cued_recall
// blocks scheduled for affixed_form_pair would be a planner bug — the
// projector will reject the input shape with item_not_found.
//
// PR 1 of docs/plans/2026-05-21-affixed-form-pair-runtime.md.

import type { ArtifactKind, CapabilityArtifact } from '@/lib/capabilities'
import {
  type AffixedFormPairBucketEntry,
  type BlockResolutionData,
  type SupabaseSchemaClient,
  fetchArtifacts,
  makeFailContext,
} from '../adapter'

export async function fetchForAffixedFormPairBlocks(
  client: SupabaseSchemaClient,
  affixedBlocks: AffixedFormPairBucketEntry[],
  userLanguage: 'nl' | 'en',
  result: Map<string, BlockResolutionData>,
): Promise<void> {
  if (affixedBlocks.length === 0) return

  const capabilityIds = [...new Set(affixedBlocks.map(b => b.block.capabilityId))]
  const artifactRows = await fetchArtifacts(client, capabilityIds)

  // Index artifacts by capability_id → Map<kind, artifact>. Same shape as
  // sibling fetchers so the resolver gets a uniform artifactsByKind map.
  const artifactsByCapability = new Map<string, Map<ArtifactKind, CapabilityArtifact>>()
  for (const row of artifactRows) {
    const inner = artifactsByCapability.get(row.capability_id) ?? new Map<ArtifactKind, CapabilityArtifact>()
    inner.set(row.artifact_kind, {
      qualityStatus: 'approved',
      value: row.artifact_json,
    })
    artifactsByCapability.set(row.capability_id, inner)
  }

  for (const { block, sourceRef, direction } of affixedBlocks) {
    const artifactsByKind = artifactsByCapability.get(block.capabilityId) ?? new Map<ArtifactKind, CapabilityArtifact>()
    const pairArtifact = artifactsByKind.get('root_derived_pair')
    const ruleArtifact = artifactsByKind.get('allomorph_rule')

    const missing: string[] = []
    if (!pairArtifact) missing.push('root_derived_pair')
    if (!ruleArtifact) missing.push('allomorph_rule')
    if (missing.length > 0) {
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'affixed_form_pair_artifact_missing',
          `affixed_form_pair cap ${block.capabilityId} is missing artifacts: ${missing.join(', ')}`,
          { capabilityId: block.capabilityId, sourceRef, missing }),
      })
      continue
    }

    // Payload shapes are written by content-pipeline-output.ts:430-441:
    //   root_derived_pair.value = { root: '<word>', derived: '<word>' }
    //   allomorph_rule.value    = { rule: '<sentence>' }
    const pairPayload = pairArtifact!.value as { root?: unknown; derived?: unknown }
    const rulePayload = ruleArtifact!.value as { rule?: unknown }

    const root = typeof pairPayload?.root === 'string' ? pairPayload.root : ''
    const derived = typeof pairPayload?.derived === 'string' ? pairPayload.derived : ''
    const rule = typeof rulePayload?.rule === 'string' ? rulePayload.rule : ''

    if (!root || !derived || !rule) {
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'affixed_form_pair_artifact_missing',
          `affixed_form_pair cap ${block.capabilityId} artifacts have empty/malformed payloads`,
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

    // direction comes from the canonical-key tail (parsed by
    // decodeCanonicalKey). Production caps always carry it. We normalize to
    // the union type here; an unexpected value falls back to root_to_derived
    // (production caps cover only these two values per the capability catalog
    // at src/lib/capabilities/capabilityCatalog.ts).
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
        artifactsByKind,
        poolItems: [],
        poolMeaningsByItem: new Map(),
        userLanguage,
      },
    })
  }
}
