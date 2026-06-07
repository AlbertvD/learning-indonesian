/**
 * vocabulary/projectItemCloze.ts — item-source contextual_cloze cap emitter.
 *
 * The net-new piece of the cap-v2 rebuild (Mode-1 item cloze, deferred until now —
 * generateClozeContexts.ts:13). For each item that has an authored cloze carrier in
 * item_contexts (context_type='cloze', seed-once / DB-authoritative, ADR 0011), emit
 * ONE `contextual_cloze` capability. The carrier sentences themselves are authored
 * separately (extract-cloze-items.ts); this only emits the schedulable cap. The
 * runtime `cloze` builder (renderContracts.ts:107-118 → byType/cloze.ts) reads the
 * carrier from item_contexts at render time — no new typed table, no exercise row.
 *
 * Identity contract (VERIFIED — projectors/dialogueCloze.ts:47-54, the only live
 * contextual_cloze emitter): direction='id_to_l1', modality='text',
 * learnerLanguage='none'. canonical_key is opaque/deterministic and
 * UNIQUE(source_ref, capability_type) does not catch a wrong direction, so these
 * values are the binding writer↔reader contract — pinned in the test.
 *
 * No new CapabilityType and no RENDER_CONTRACTS.cloze addition: contextual_cloze is
 * already in CAPABILITY_TYPES and RENDER_CONTRACTS.cloze serves ['item','dialogue_line'].
 */

import { buildCanonicalKey, CAPABILITY_PROJECTION_VERSION } from '@/lib/capabilities'

import { sourceRefForLearningItem } from '../../../content-pipeline-output'

import type { CapabilityInput } from '../adapter'

/** One item that has an authored cloze carrier. `indonesianText` is the item's
 *  base_text (== TypedItemRow.indonesian_text), so the derived sourceRef matches
 *  the other item caps' sourceRef exactly. */
export interface ItemWithClozeCarrier {
  indonesianText: string
}

export interface ProjectItemClozeInput {
  itemsWithCloze: ReadonlyArray<ItemWithClozeCarrier>
  lessonId: string
}

export function projectItemClozeCaps(input: ProjectItemClozeInput): CapabilityInput[] {
  return input.itemsWithCloze.map(({ indonesianText }) => {
    const sourceRef = sourceRefForLearningItem(indonesianText)

    // The prerequisite is the item's text_recognition cap (learnerLanguage 'nl',
    // matching projectors/vocab.ts:141-151). prerequisiteKeys is NOT part of the
    // canonical_key, so it carries no identity weight — sequencing only (ADR 0007).
    const textRecognitionKey = buildCanonicalKey({
      sourceKind: 'item',
      sourceRef,
      capabilityType: 'text_recognition',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'nl',
    })

    const canonicalKey = buildCanonicalKey({
      sourceKind: 'item',
      sourceRef,
      capabilityType: 'contextual_cloze',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'none',
    })

    return {
      canonicalKey,
      sourceKind: 'item',
      sourceRef,
      capabilityType: 'contextual_cloze',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'none',
      projectionVersion: CAPABILITY_PROJECTION_VERSION,
      lessonId: input.lessonId,
      requiredArtifacts: [],
      prerequisiteKeys: [textRecognitionKey],
    }
  })
}
