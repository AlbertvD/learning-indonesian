/**
 * vocabulary/publish.ts — the vocab module entry: the item slice, end-to-end.
 *
 * Thin composition over reused pure primitives (the item projector, the adapter
 * write fns, the done distractor slice) + the three new pieces (item content-units
 * builder, item contextual_cloze emitter, the vocab gate). The vocab module OWNS
 * the item slice; the runner loses it (cutover, Task 8). They share only DB tables.
 *
 * Flow (mirrors the proven runner item sequence, item-only):
 *   load (DB) → project items (+ cloze caps) → gate PRE-write → [dryRun stop]
 *   → write items+anchors → POS backfill → write caps → content_units → junction
 *   → retire item orphans → seed distractors → gate POST-write → return.
 *
 * Idempotent (ADR 0011 seed-once): upsertLearningItemIdempotent (translations-only
 * update), upsertCapabilitiesSkipIfExists (INSERT … ON CONFLICT DO NOTHING),
 * upsertContentUnits (on content_unit_key), the distractor seed (skip-if-seeded).
 * A re-publish is a zero-delta no-op.
 *
 * No disk I/O (noDiskReads gate). DB reads are injectable for tests.
 */

import {
  EMPTY_COUNTS,
  type CapabilityStageOutput,
  type ValidationFinding,
} from '../model'
import {
  createSupabaseClient as defaultCreateSupabaseClient,
  upsertLearningItemIdempotent,
  upsertItemAnchorContext,
  upsertCapabilitiesSkipIfExists,
  upsertContentUnits,
  upsertCapabilityContentUnits,
  fetchLearningItemPosByNormalizedText,
  updateLearningItemPos,
  retireOrphanedCapabilities,
  type CapabilityContentUnitInput,
  type CapabilityInput,
  type CapabilitySupabaseClient,
} from '../adapter'
import { loadLesson as defaultLoadLesson, type LoadedLesson } from '../loader'
import { loadFromDb as defaultLoadFromDb, type ItemDbResult } from '../loadFromDb'
import { projectItemsFromTypedRows } from '../projectors/vocab'
import { enrichMissingPos } from '../enrichPos'
import { itemSlug } from '@/lib/capabilities'
import { normalizeTtsText } from '../../../tts-normalize'

import { buildItemContentUnits } from './contentUnits'
import { projectItemClozeCaps } from './projectItemCloze'
import {
  createDistractorStore,
  fetchItemsWithClozeCarrier,
  fetchDistractorCountsByCapability,
} from './store'
import { seedDistractors } from './seedDistractors'
import { createLocalEmbedder, type Embedder } from '../shared/embeddings'
import {
  runVocabGatePreWrite,
  runVocabGatePostWrite,
  type VocabItemForGate,
  type VocabAudioCoverageItem,
} from './gate'
import type { CapDistractorCount } from './validateCoverage'

export interface PublishVocabularyInput {
  lessonId: string
  lessonNumber: number
  dryRun?: boolean
  regenerate?: { kind: 'item'; normalizedText: string } | { kind: 'pattern'; slug: string }
}

export interface PublishVocabularyHooks {
  createSupabaseClient?: () => CapabilitySupabaseClient
  loadLesson?: typeof defaultLoadLesson
  loadFromDb?: (
    supabase: CapabilitySupabaseClient,
    input: { lessonId: string },
  ) => Promise<ItemDbResult>
  embedder?: Embedder
}

const RELATIONSHIP_KIND = (capabilityType: string): CapabilityContentUnitInput['relationship_kind'] =>
  capabilityType === 'l1_to_id_choice' ? 'introduced_by'
  : capabilityType.includes('recognition') ? 'introduced_by'
  : 'practiced_by'

export async function publishVocabulary(
  input: PublishVocabularyInput,
  hooks: PublishVocabularyHooks = {},
): Promise<CapabilityStageOutput> {
  const start = Date.now()
  const findings: ValidationFinding[] = []
  const counts = { ...EMPTY_COUNTS }

  const createClient = hooks.createSupabaseClient ?? defaultCreateSupabaseClient
  const loadLesson = hooks.loadLesson ?? defaultLoadLesson
  const loadFromDb = hooks.loadFromDb ?? defaultLoadFromDb

  const supabase = createClient()

  // ---- 1. Load (DB-only). ------------------------------------------------
  const loaded: LoadedLesson = await loadLesson(supabase, {
    lessonNumber: input.lessonNumber,
    lessonId: input.lessonId,
  })
  const itemDbResult = await loadFromDb(supabase, { lessonId: input.lessonId })

  // ---- 2. Project (pure). ------------------------------------------------
  const itemProjection = projectItemsFromTypedRows({
    rows: itemDbResult.items,
    lessonId: input.lessonId,
    level: loaded.lesson.level,
    audioClipsByNormalizedText: loaded.audioClipsByNormalizedText,
  })
  const allItemCaps = itemProjection.perItemPlans.flatMap((p) => p.capabilities)

  // ---- 3. Gate (pre-write). Errors short-circuit before any write. -------
  const gateItems: VocabItemForGate[] = itemProjection.perItemPlans.map((p) => ({
    base_text: p.learningItemInput.base_text,
    item_type: p.learningItemInput.item_type,
    context_type: p.anchorContext.context_type,
    translation_nl: p.learningItemInput.translation_nl ?? null,
    translation_en: p.learningItemInput.translation_en ?? null,
  }))
  findings.push(...runVocabGatePreWrite(gateItems))
  if (findings.some((f) => f.severity === 'error')) {
    return { status: 'validation_failed', counts, findings, durationMs: Date.now() - start }
  }

  // ---- 3b. Dry-run stop before writes. -----------------------------------
  if (input.dryRun) {
    console.log(
      `\n[DRY RUN] Vocab lesson ${input.lessonNumber}: ${itemDbResult.items.length} items, ` +
        `${allItemCaps.length} item caps — pre-write gate passed.`,
    )
    return { status: 'ok', counts, findings, durationMs: Date.now() - start }
  }

  // ---- 3c. Item cloze caps (DB read deferred past the gate/dry-run). -----
  // The carriers are pre-authored item_contexts(cloze) rows (seed-once); we only
  // emit the contextual_cloze cap for items that have one. Read after the
  // short-circuits so a failed/dry publish does no DB work.
  const clozeCarriers = await fetchItemsWithClozeCarrier(supabase, input.lessonId)
  const clozeCaps = projectItemClozeCaps({
    itemsWithCloze: clozeCarriers,
    lessonId: input.lessonId,
  })

  // ---- 4. Write learning_items + anchor contexts. ------------------------
  const itemIdsByNormalizedText = new Map<string, string>()
  for (const plan of itemProjection.perItemPlans) {
    const written = await upsertLearningItemIdempotent(supabase, plan.learningItemInput)
    itemIdsByNormalizedText.set(plan.normalizedText, written.id)
    await upsertItemAnchorContext(supabase, {
      learning_item_id: written.id,
      context_type: plan.anchorContext.context_type,
      source_text: plan.anchorContext.source_text,
      translation_text: plan.anchorContext.translation_text,
      source_lesson_id: input.lessonId,
    })
  }
  counts.learningItems = itemIdsByNormalizedText.size

  // ---- 4b. DB-native POS backfill (the sole pos writer on this path). ----
  const wordPhrasePlans = itemProjection.perItemPlans.filter(
    (p) => p.learningItemInput.item_type === 'word' || p.learningItemInput.item_type === 'phrase',
  )
  const effectivePos = new Map<string, string | null>()
  if (wordPhrasePlans.length > 0) {
    const normalizedTexts = wordPhrasePlans.map((p) => p.normalizedText)
    const posMap = await fetchLearningItemPosByNormalizedText(supabase, normalizedTexts)
    for (const nt of normalizedTexts) effectivePos.set(nt, posMap.get(nt) ?? null)

    const enrichmentItems = wordPhrasePlans.map((p) => ({
      base_text: p.learningItemInput.base_text,
      item_type: p.learningItemInput.item_type as 'word' | 'phrase',
      translation_nl: p.learningItemInput.translation_nl ?? null,
      translation_en: p.learningItemInput.translation_en ?? null,
      pos: posMap.get(p.normalizedText) ?? null,
    }))
    const dbPosResult = await enrichMissingPos(enrichmentItems)
    for (const [baseText, pos] of dbPosResult.posByBaseText) {
      const nt = itemSlug(baseText)
      await updateLearningItemPos(supabase, nt, pos)
      effectivePos.set(nt, pos)
    }
  }

  // ---- 5. Write item caps + cloze caps (skip-if-exists; FSRS-safe). ------
  const capsToWrite: CapabilityInput[] = [...allItemCaps, ...clozeCaps]
  const newCapIdsByKey = await upsertCapabilitiesSkipIfExists(supabase, capsToWrite)
  // Complete key→id map: newly inserted ∪ already-existing (idempotent re-runs).
  const capIdsByKey = new Map<string, string>()
  for (const cap of capsToWrite) {
    const id =
      newCapIdsByKey.get(cap.canonicalKey) ??
      itemDbResult.itemState.existingItemCapsByCanonicalKey.get(cap.canonicalKey)?.id
    if (id) capIdsByKey.set(cap.canonicalKey, id)
  }
  counts.capabilities = capIdsByKey.size

  // ---- 6. content_units (item slice) + junction. -------------------------
  const itemUnits = buildItemContentUnits(itemDbResult.items, input.lessonNumber)
  const unitIdsBySlug = await upsertContentUnits(supabase, itemUnits)
  counts.contentUnits = unitIdsBySlug.size
  const unitIdBySourceRef = new Map<string, string>()
  for (const unit of itemUnits) {
    const unitId = unitIdsBySlug.get(unit.unit_slug)
    if (unitId) unitIdBySourceRef.set(unit.source_ref, unitId)
  }
  const junctionInputs: CapabilityContentUnitInput[] = []
  for (const cap of capsToWrite) {
    const capId = capIdsByKey.get(cap.canonicalKey)
    const unitId = unitIdBySourceRef.get(cap.sourceRef)
    if (!capId || !unitId) continue
    junctionInputs.push({
      capability_id: capId,
      content_unit_id: unitId,
      relationship_kind: RELATIONSHIP_KIND(cap.capabilityType),
    })
  }
  await upsertCapabilityContentUnits(supabase, junctionInputs)

  // ---- 7. Retire item orphans (scoped to source_kind='item'). ------------
  // sourceKinds scope is load-bearing: the runner sweeps the non-item kinds for
  // the same lesson, so an unscoped sweep here would retire its caps (Task 8a).
  await retireOrphanedCapabilities(supabase, {
    lessonId: input.lessonId,
    emittedKeys: [...capIdsByKey.keys()],
    sourceKinds: ['item'],
  })

  // ---- 8. Seed distractors (absorbs the old Stage C). --------------------
  const store = createDistractorStore(supabase)
  const embedder = hooks.embedder ?? createLocalEmbedder()
  const seedResult = await seedDistractors(
    { lessonId: input.lessonId, lessonNumber: input.lessonNumber },
    store,
    embedder,
    input.regenerate?.kind === 'item'
      ? { regenerateNormalizedText: input.regenerate.normalizedText }
      : {},
  )
  counts.itemDistractorSets = seedResult.capsSeeded

  // ---- 9. Gate (post-write). MUST run after the seed (CS15 reads counts). -
  const itemCapIds = allItemCaps
    .map((c) => capIdsByKey.get(c.canonicalKey))
    .filter((id): id is string => Boolean(id))
  const distractorCounts = await fetchDistractorCountsByCapability(supabase, itemCapIds)
  const coverage: CapDistractorCount[] = allItemCaps.flatMap((c) => {
    const id = capIdsByKey.get(c.canonicalKey)
    if (!id) return []
    return [{ capabilityId: id, capabilityType: c.capabilityType, distractorCount: distractorCounts.get(id) ?? 0 }]
  })
  const audio: VocabAudioCoverageItem[] = wordPhrasePlans.map((p) => ({
    normalizedText: p.normalizedText,
    itemType: p.learningItemInput.item_type,
    hasAudioClip: loaded.audioClipsByNormalizedText.has(normalizeTtsText(p.learningItemInput.base_text)),
  }))
  const posItems = wordPhrasePlans.map((p) => ({
    normalized_text: p.normalizedText,
    item_type: p.learningItemInput.item_type,
    pos: effectivePos.get(p.normalizedText) ?? null,
  }))
  findings.push(
    ...(await runVocabGatePostWrite(supabase, {
      posItems,
      coverage,
      audio,
      duplicates: {
        lessonId: input.lessonId,
        lessonNumber: input.lessonNumber,
        writtenNormalizedTexts: [...itemIdsByNormalizedText.keys()],
      },
    })),
  )

  const status: CapabilityStageOutput['status'] =
    findings.some((f) => f.severity === 'error') ? 'partial' : 'ok'
  return { status, counts, findings, durationMs: Date.now() - start }
}
