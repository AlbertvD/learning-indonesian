/**
 * projectors/itemDistractors.ts — build curated distractor rows for item
 * capabilities (recognition_mcq, cued_recall, cloze_mcq).
 *
 * This is the "never-built curated-distractor writer" referenced in the
 * Slice 1 spec (issue #99). Distractors are selected deterministically using
 * the same cascade algorithm as the runtime (pickDistractorCascade), but
 * run once at publish time so the result is stored in the three typed tables:
 *   - recognition_mcq_distractors (NL option strings)
 *   - cued_recall_distractors     (Indonesian base_text strings)
 *   - cloze_mcq_item_distractors  (Indonesian base_text strings)
 *
 * Selection is principled: same word-class first, drawn from the cumulative
 * pool of items anchored to this lesson and adjacent lessons. The pool is
 * identical to what the runtime uses — this makes "curated" mean "the same
 * algorithm but pre-computed," eliminating per-request randomness.
 *
 * Idempotent: upsertItemDistractors uses ON CONFLICT (capability_id) DO UPDATE.
 * Re-running regenerates the same distractors (deterministic algorithm, same
 * pool) and overwrites the row — safe.
 */

import type { PerItemPlan } from './vocab'
import type { CapabilitySupabaseClient } from '../adapter'
import { itemSlug } from '@/lib/capabilities'

// Import cascade from runtime path (shared algorithm).
// The pipeline runs in Node/Bun, not in a browser, so this import is valid.
import { pickDistractorCascade, getSemanticGroup, type DistractorCandidate } from '@/lib/distractors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DistractorRow {
  capability_id: string
  table: 'recognition_mcq_distractors' | 'cued_recall_distractors' | 'cloze_mcq_item_distractors'
  distractors: string[]
}

interface PoolItem {
  id: string
  base_text: string
  item_type: string
  translation_nl: string | null
  translation_en: string | null
  pos: string | null
  level: string
}

// ---------------------------------------------------------------------------
// Pool fetch
// ---------------------------------------------------------------------------

/**
 * Fetch the cumulative pool of items from lessons adjacent to lessonId.
 * "Adjacent" means all lessons from item_contexts.source_lesson_id — the same
 * query the runtime uses in fetchDistractorPool in byKind/item.ts.
 */
async function fetchPoolItems(
  supabase: CapabilitySupabaseClient,
  lessonId: string,
): Promise<PoolItem[]> {
  // Step 1: find all lesson IDs that share any item with this lesson's items.
  // Using the same query shape as the runtime's fetchDistractorPool.
  const { data: contextRows, error: ctxErr } = await supabase
    .schema('indonesian')
    .from('item_contexts')
    .select('learning_item_id')
    .eq('source_lesson_id', lessonId)
  if (ctxErr) throw ctxErr

  const itemIds = [...new Set(
    ((contextRows ?? []) as Array<{ learning_item_id: string }>).map(r => r.learning_item_id),
  )]
  if (itemIds.length === 0) return []

  // Step 2: find all lesson IDs these items are anchored to.
  const { data: allCtxRows, error: allCtxErr } = await supabase
    .schema('indonesian')
    .from('item_contexts')
    .select('source_lesson_id')
    .in('learning_item_id', itemIds)
    .eq('is_anchor_context', true)
  if (allCtxErr) throw allCtxErr

  const lessonIds = [...new Set(
    ((allCtxRows ?? []) as Array<{ source_lesson_id: string | null }>)
      .map(r => r.source_lesson_id)
      .filter((x): x is string => x != null),
  )]
  if (lessonIds.length === 0) return []

  // Step 3: fetch all active items anchored to any of those lessons.
  const { data: poolContextRows, error: poolCtxErr } = await supabase
    .schema('indonesian')
    .from('item_contexts')
    .select('learning_item_id')
    .in('source_lesson_id', lessonIds)
    .eq('is_anchor_context', true)
  if (poolCtxErr) throw poolCtxErr

  const poolItemIds = [...new Set(
    ((poolContextRows ?? []) as Array<{ learning_item_id: string }>).map(r => r.learning_item_id),
  )]
  if (poolItemIds.length === 0) return []

  // Fetch in chunks to stay under Kong's 8 KB URL limit.
  const chunkSize = 50
  const allItems: PoolItem[] = []
  for (let i = 0; i < poolItemIds.length; i += chunkSize) {
    const chunk = poolItemIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('id, base_text, item_type, translation_nl, translation_en, pos, level')
      .in('id', chunk)
      .eq('is_active', true)
    if (error) throw error
    allItems.push(...((data ?? []) as PoolItem[]))
  }
  return allItems
}

// ---------------------------------------------------------------------------
// Distractor projection
// ---------------------------------------------------------------------------

/**
 * Build distractor rows for every item cap in perItemPlans.
 *
 * Returns an array of DistractorRow (one per capability × exercise type).
 * Only capabilities with a resolved capabilityId are included.
 */
export async function projectItemDistractors(input: {
  supabase: CapabilitySupabaseClient
  lessonId: string
  capabilityIdsByKey: Map<string, string>
  perItemPlans: PerItemPlan[]
}): Promise<DistractorRow[]> {
  const { supabase, lessonId, capabilityIdsByKey, perItemPlans } = input

  const poolItems = await fetchPoolItems(supabase, lessonId)
  const rows: DistractorRow[] = []

  for (const plan of perItemPlans) {
    const itemSlugValue = itemSlug(plan.item.base_text)
    const sourceRef = `learning_items/${itemSlugValue}`

    // Build pool as DistractorCandidate[] for NL (recognition_mcq) picks.
    const nlPool: DistractorCandidate[] = poolItems
      .filter(p => p.id !== plan.learningItemInput.base_text && p.translation_nl)
      .map(p => ({
        id: p.id,
        option: (p.translation_nl ?? '').trim(),
        itemType: p.item_type,
        pos: p.pos ?? null,
        level: p.level,
        semanticGroup: getSemanticGroup((p.translation_nl ?? '').trim(), 'nl'),
      }))
      .filter(c => c.option.length > 0)

    // Build pool for ID (cued_recall, cloze_mcq) picks.
    const idPool: DistractorCandidate[] = poolItems
      .filter(p => p.id !== plan.learningItemInput.base_text)
      .map(p => ({
        id: p.id,
        option: p.base_text,
        itemType: p.item_type,
        pos: p.pos ?? null,
        level: p.level,
        semanticGroup: null,
      }))

    const targetNl = (plan.learningItemInput.translation_nl ?? '').trim()
    const targetId = plan.item.base_text

    const target = {
      itemType: plan.item.item_type,
      pos: plan.learningItemInput.pos ?? null,
      level: plan.learningItemInput.level,
      semanticGroup: targetNl ? getSemanticGroup(targetNl, 'nl') : null,
    }

    // recognition_mcq: NL options
    const nlCaps = findCapsBySourceRef(capabilityIdsByKey, sourceRef, 'recognition_mcq')
    if (nlCaps.length > 0 && nlPool.length >= 1) {
      const distractors = pickDistractorCascade(target, nlPool, 3, targetNl)
      if (distractors.length > 0) {
        for (const capId of nlCaps) {
          rows.push({ capability_id: capId, table: 'recognition_mcq_distractors', distractors })
        }
      }
    }

    // cued_recall: Indonesian options (l1→id)
    const cuedCaps = findCapsBySourceRef(capabilityIdsByKey, sourceRef, 'cued_recall')
    if (cuedCaps.length > 0 && idPool.length >= 1) {
      const distractors = pickDistractorCascade(
        { ...target, semanticGroup: null },
        idPool,
        3,
        targetId,
      )
      if (distractors.length > 0) {
        for (const capId of cuedCaps) {
          rows.push({ capability_id: capId, table: 'cued_recall_distractors', distractors })
        }
      }
    }

    // cloze_mcq: Indonesian options
    const clozeCaps = findCapsBySourceRef(capabilityIdsByKey, sourceRef, 'cloze_mcq')
    if (clozeCaps.length > 0 && idPool.length >= 1) {
      const distractors = pickDistractorCascade(
        { ...target, semanticGroup: null },
        idPool,
        3,
        targetId,
      )
      if (distractors.length > 0) {
        for (const capId of clozeCaps) {
          rows.push({ capability_id: capId, table: 'cloze_mcq_item_distractors', distractors })
        }
      }
    }
  }

  return rows
}

// ---------------------------------------------------------------------------
// Helper: find capability ids by sourceRef + exercise type in canonical key
// ---------------------------------------------------------------------------

function findCapsBySourceRef(
  capabilityIdsByKey: Map<string, string>,
  sourceRef: string,
  exerciseTypePart: string,
): string[] {
  const ids: string[] = []
  for (const [key, id] of capabilityIdsByKey) {
    // canonical key: cap:v1:<sourceKind>:<encodedSourceRef>:<capabilityType>:...
    if (key.includes(encodeURIComponent(sourceRef).replace(/%3A/g, ':')) || key.includes(sourceRef)) {
      if (key.includes(exerciseTypePart)) {
        ids.push(id)
      }
    }
  }
  return ids
}
