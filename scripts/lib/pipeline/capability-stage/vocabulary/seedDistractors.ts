/**
 * cap-v2 Slice 1 — distractor seeding orchestrator (the DB I/O shell).
 *
 * Composes the pure planner with Pool(N), the `item_embeddings` cache, and
 * idempotent writes, all behind an injected `DistractorStore` + `Embedder`. The
 * orchestration is pure-ish (deterministic given the store/embedder); the
 * supabase-backed store impl is the thin integration seam (`store.ts`), verified
 * at the populate pass.
 *
 * Idempotency (ADR 0011 — seed once, additive): a capability already carrying
 * `distractors` rows is skipped. `--regenerate <normalizedText>` deletes that
 * item's capabilities' rows first, then re-selects (naive insert is not
 * idempotent when the selection changes — DA Q5).
 */

import { planDistractorWrites, type PoolItem, type SeedCap } from './planDistractors'
import type { Embedder } from '../shared/embeddings'

/** A pool item as the store returns it — no embedding yet (the cache attaches it). */
export interface PoolItemInput {
  itemId: string
  form: string
  meaning: string
  pos: string | null
}

/** An item capability to seed, with its answer item (no embedding yet). */
export interface SeedCapInput {
  capabilityId: string
  capabilityType: string
  item: PoolItemInput
}

/** The database seam the orchestrator depends on. Hermetic-faked in tests; the
 *  supabase-backed impl lives in `vocabulary/store.ts`. */
export interface DistractorStore {
  /** Item capabilities introduced by this lesson, with their answer items. */
  fetchItemCapsForLesson(lessonId: string): Promise<SeedCapInput[]>
  /** Pool(N): every item introduced in lessons 1..lessonNumber (cumulative). */
  fetchPool(lessonNumber: number): Promise<PoolItemInput[]>
  /** Cached meaning embeddings for the given items (item_embeddings). */
  fetchEmbeddings(itemIds: string[]): Promise<Map<string, number[]>>
  /** Cache freshly computed meaning embeddings. */
  upsertEmbeddings(rows: { itemId: string; embedding: number[] }[]): Promise<void>
  /** Of the given capabilities, those already carrying distractor rows. */
  fetchCapsWithDistractors(capabilityIds: string[]): Promise<Set<string>>
  /** Delete all distractor rows for the given capabilities (--regenerate). */
  deleteDistractors(capabilityIds: string[]): Promise<void>
  /** Persist the chosen wrong-option pointer rows. */
  insertDistractors(rows: { capabilityId: string; itemId: string }[]): Promise<void>
}

export interface SeedOptions {
  /** Distractors per capability. Default 3. */
  k?: number
  synonymThreshold?: number
  /** Re-seed this item's capabilities (delete-then-reselect) instead of skipping. */
  regenerateNormalizedText?: string
}

export interface SeedResult {
  capsConsidered: number
  capsSeeded: number
  capsSkipped: number
  rowsWritten: number
}

export async function seedDistractors(
  target: { lessonId: string; lessonNumber: number },
  store: DistractorStore,
  embedder: Embedder,
  opts: SeedOptions = {},
): Promise<SeedResult> {
  const k = opts.k ?? 3

  const caps = await store.fetchItemCapsForLesson(target.lessonId)
  const pool = await store.fetchPool(target.lessonNumber)

  // --- Embedding cache: embed only cache-miss items, then upsert. ----------
  // Meaning selection needs an embedding for every pool candidate and every
  // answer item; union covers cap items not (yet) in the pool.
  const itemMeaning = new Map<string, string>()
  for (const p of pool) itemMeaning.set(p.itemId, p.meaning)
  for (const c of caps) itemMeaning.set(c.item.itemId, c.item.meaning)
  const allItemIds = [...itemMeaning.keys()]

  const embeddings = await store.fetchEmbeddings(allItemIds)
  const missing = allItemIds.filter((id) => !embeddings.has(id))
  if (missing.length > 0) {
    const vectors = await embedder.embed(missing.map((id) => itemMeaning.get(id) ?? ''))
    const fresh = missing.map((id, i) => ({ itemId: id, embedding: vectors[i] }))
    await store.upsertEmbeddings(fresh)
    for (const { itemId, embedding } of fresh) embeddings.set(itemId, embedding)
  }

  const withEmbedding = <T extends { itemId: string }>(x: T): T & { embedding: number[] } => ({
    ...x,
    embedding: embeddings.get(x.itemId) ?? [],
  })
  const poolWithEmb: PoolItem[] = pool.map(withEmbedding)
  const capsWithEmb: SeedCap[] = caps.map((c) => ({ ...c, item: withEmbedding(c.item) }))

  // --- Idempotency: skip seeded caps; --regenerate deletes then re-selects. -
  const capIds = capsWithEmb.map((c) => c.capabilityId)
  const seeded = await store.fetchCapsWithDistractors(capIds)
  if (opts.regenerateNormalizedText) {
    const targetCapIds = capsWithEmb
      .filter((c) => c.item.form === opts.regenerateNormalizedText)
      .map((c) => c.capabilityId)
    if (targetCapIds.length > 0) {
      await store.deleteDistractors(targetCapIds)
      for (const id of targetCapIds) seeded.delete(id)
    }
  }
  const unseeded = capsWithEmb.filter((c) => !seeded.has(c.capabilityId))

  // --- Plan + write. -------------------------------------------------------
  const rows = planDistractorWrites(unseeded, poolWithEmb, {
    k,
    synonymThreshold: opts.synonymThreshold,
  })
  if (rows.length > 0) await store.insertDistractors(rows)

  const distractorBearing = (c: SeedCap): boolean =>
    rows.some((r) => r.capabilityId === c.capabilityId)
  return {
    capsConsidered: capsWithEmb.length,
    capsSeeded: unseeded.filter(distractorBearing).length,
    capsSkipped: capsWithEmb.length - unseeded.length,
    rowsWritten: rows.length,
  }
}
