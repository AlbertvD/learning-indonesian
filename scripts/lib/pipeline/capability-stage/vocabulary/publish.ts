/**
 * vocabulary/publish.ts — the vocab module entry: the item slice, end-to-end.
 *
 * Thin composition over reused pure primitives (the item projector, the adapter
 * write fns, the done distractor slice) + the new pieces (item content-units builder,
 * the vocab gate). The vocab module OWNS the item slice; the runner loses it
 * (cutover, Task 8). They share only DB tables.
 *
 * Item contextual_cloze is intentionally NOT emitted — WON'T-BUILD (decided
 * 2026-06-09). It would have to be a full first-class capability (one exercise
 * per capability type; renderContracts binds `cloze` to `contextual_cloze` only,
 * so there is no lightweight render-variant), and the literature makes it low
 * yield: contextual cloze is no better than decontextualised recall for
 * form-meaning (Webb/Nation), and the real lever — number of retrievals
 * (Folse 2006) — is already covered by the word's other caps. The emitter
 * (projectItemCloze.ts) + carrier reader (fetchItemsWithClozeCarrier) were
 * deleted. Cloze is served only by the runner's dialogue_line path. The runtime
 * item-cloze render leg remains, flagged for the #109 teardown. See module spec §4.
 *
 * Flow (mirrors the proven runner item sequence, item-only):
 *   load (DB) → project items → gate PRE-write → [dryRun stop]
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
import { loadPromotionPlan, applyPromotionPlan } from '../../../../promote-capabilities'
import { itemSlug } from '@/lib/capabilities'
import { normalizeTtsText } from '../../../tts-normalize'

import { buildItemContentUnits } from './contentUnits'
import {
  createDistractorStore,
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
  regenerate?:
    | { kind: 'item'; normalizedText: string }
    | { kind: 'pattern'; slug: string }
    | { kind: 'dialogue' }
    | { kind: 'distractors' }
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

  // ---- 5. Write item caps (skip-if-exists; FSRS-safe). ------------------
  // Item contextual_cloze is intentionally NOT emitted — won't-build (2026-06-09,
  // low yield; see header comment + module spec §4). Cloze stays dialogue-only.
  const capsToWrite: CapabilityInput[] = allItemCaps
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
      : input.regenerate?.kind === 'distractors'
        ? { regenerateAll: true } // F5: delete + re-seed every item cap's distractors for the lesson
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

  // ---- 10. Promote (make the item caps live). ---------------------------
  // The runner's promotion (step 13) runs BEFORE publishVocabulary, so it never
  // sees the item caps this module just created — they would stay
  // unknown/draft (dead) without this. publishVocabulary owns the item slice
  // "to the end", which includes promotion to ready/published. Lesson-scoped +
  // idempotent; only on a clean (non-error) run, mirroring the runner.
  if (status === 'ok') {
    try {
      const plan = await loadPromotionPlan({
        lesson: input.lessonNumber,
        sourceRef: `lesson-${input.lessonNumber}`,
        apply: true,
      })
      if (plan.promotions.length > 0) {
        await applyPromotionPlan(plan)
        console.log(`   ✓ Promoted ${plan.promotions.length} capabilities → ready/published (${plan.blocked.length} blocked)`)
      } else {
        console.log(`   No capabilities eligible for promotion (${plan.blocked.length} blocked)`)
      }
    } catch (err) {
      console.warn(`   ⚠ Capability promotion failed: ${(err as Error).message}`)
      findings.push({ gate: 'CS9', severity: 'warning', message: `Capability promotion failed: ${(err as Error).message}` })
    }
  }

  return { status, counts, findings, durationMs: Date.now() - start }
}
