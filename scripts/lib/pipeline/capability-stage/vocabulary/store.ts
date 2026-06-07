/**
 * cap-v2 Slice 1 — supabase-backed DistractorStore (the integration seam).
 *
 * The thin DB shell behind the hermetic orchestrator (`seedDistractors.ts`). All
 * reads/writes are database-only (no disk — noDiskReads gate). Verified against
 * the live DB at the populate pass; the orchestration logic is unit-tested with
 * a fake of this interface.
 *
 * Pool(N) is STRICT (spec §4, not the legacy "all active items" shortcut): items
 * introduced in lessons 1..N, so earlier lessons' selections never churn when
 * later lessons land (idempotent, ADR 0011). `learning_items` carries no
 * lesson_id, so membership is resolved through the item capabilities
 * (`source_kind='item'`, `source_ref='learning_items/<normalized_text>'`,
 * `lesson_id`) → `lessons.order_index`. The live course is a single module
 * (`module-1`) with `order_index` == the lesson number; Pool(N) = items whose
 * introducing cap's lesson has `order_index <= N`.
 *
 * pgvector: item_embeddings.embedding is read/written in the canonical text form
 * `[f1,f2,...]` (PostgREST serialises a vector column to that string).
 */

import type { CapabilitySupabaseClient } from '../adapter'
import type {
  DistractorStore,
  PoolItemInput,
  SeedCapInput,
} from './seedDistractors'

const PAGE_SIZE = 1000
/** Bound list length for the remaining `.in(uuid,...)` URL filter
 *  (deleteDistractors) and the insert payload chunks. The homelab gateway
 *  rejects request URLs past ~2.5 KB (≈65 UUIDs worked, 100 failed), so 50 keeps
 *  a safe margin. Reads that would need a large `.in()` (pool items by
 *  normalized_text, embedding/distractor lookups) use paginate-all-then-filter
 *  instead. */
const IN_CHUNK = 50
const ITEM_REF_PREFIX = 'learning_items/'

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

/** `learning_items/<normalized_text>` → `<normalized_text>` (the ref may contain
 *  spaces/punctuation, e.g. `learning_items/deh! (deh)`). */
function normalizedTextFromRef(sourceRef: string): string {
  return sourceRef.startsWith(ITEM_REF_PREFIX)
    ? sourceRef.slice(ITEM_REF_PREFIX.length)
    : sourceRef
}

interface ItemRow {
  id: string
  normalized_text: string
  base_text: string
  translation_nl: string
  pos: string | null
}

/**
 * Fetch ALL active word/phrase learning_items, keyed by normalized_text
 * (paginated — mirrors loadFromDb.fetchDistractorPool). We read the whole set and
 * filter in memory rather than `.in(normalized_text, [...])`, because item keys
 * carry spaces/punctuation (e.g. `deh! (deh)`) that corrupt a long `.in(...)`
 * filter and overflow the gateway. The full set is small (hundreds of rows).
 */
async function fetchAllActiveItems(
  supabase: CapabilitySupabaseClient,
): Promise<Map<string, ItemRow>> {
  const byNt = new Map<string, ItemRow>()
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('id, normalized_text, base_text, translation_nl, pos')
      .eq('is_active', true)
      .in('item_type', ['word', 'phrase'])
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`store.fetchAllActiveItems: ${error.message}`)
    const page = (data ?? []) as ItemRow[]
    for (const r of page) byNt.set(r.normalized_text, r)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return byNt
}

/**
 * Items introduced by `lessonId` that have an authored cloze carrier in
 * item_contexts (context_type='cloze'). Feeds projectItemClozeCaps. Standalone
 * (NOT part of the DistractorStore interface — cloze emission is a separate
 * concern from distractor seeding). Returns the item base_text so the caller's
 * sourceRefForLearningItem matches the other item caps' sourceRef exactly.
 *
 * Membership = the lesson's item caps' source_refs (same resolution as
 * fetchItemCapsForLesson). item_contexts is paginated + intersected in memory
 * (gateway-URL-length rule — no .in(uuid,[...]) over a large set).
 */
export async function fetchItemsWithClozeCarrier(
  supabase: CapabilitySupabaseClient,
  lessonId: string,
): Promise<{ indonesianText: string }[]> {
  const idn = supabase.schema('indonesian')

  // 1. This lesson's item caps → the set of item normalized_texts it introduces.
  const { data: caps, error: capErr } = await idn
    .from('learning_capabilities')
    .select('source_ref')
    .eq('source_kind', 'item')
    .eq('lesson_id', lessonId)
  if (capErr) throw new Error(`store.fetchItemsWithClozeCarrier/caps: ${capErr.message}`)
  const normalizedTexts = new Set(
    (caps ?? []).map((c) => normalizedTextFromRef((c as { source_ref: string }).source_ref)),
  )
  if (normalizedTexts.size === 0) return []

  // 2. Resolve to learning_item id → base_text for this lesson's items.
  const items = await fetchAllActiveItems(supabase)
  const idToText = new Map<string, string>()
  for (const i of items.values()) {
    if (normalizedTexts.has(i.normalized_text)) idToText.set(i.id, i.base_text)
  }
  if (idToText.size === 0) return []

  // 3. Which of those items have a cloze carrier? Paginate item_contexts(cloze)
  //    and intersect in memory.
  const withCarrier = new Set<string>()
  let offset = 0
  while (true) {
    const { data, error } = await idn
      .from('item_contexts')
      .select('learning_item_id')
      .eq('context_type', 'cloze')
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`store.fetchItemsWithClozeCarrier/contexts: ${error.message}`)
    const page = (data ?? []) as Array<{ learning_item_id: string }>
    for (const r of page) if (idToText.has(r.learning_item_id)) withCarrier.add(r.learning_item_id)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return [...withCarrier].map((id) => ({ indonesianText: idToText.get(id) as string }))
}

export function createDistractorStore(
  supabase: CapabilitySupabaseClient,
): DistractorStore {
  const idn = () => supabase.schema('indonesian')

  return {
    async fetchItemCapsForLesson(lessonId: string): Promise<SeedCapInput[]> {
      const { data, error } = await idn()
        .from('learning_capabilities')
        .select('id, capability_type, source_ref')
        .eq('source_kind', 'item')
        .eq('lesson_id', lessonId)
      if (error) throw new Error(`store.fetchItemCapsForLesson: ${error.message}`)
      const caps = (data ?? []) as Array<{ id: string; capability_type: string; source_ref: string }>

      const items = await fetchAllActiveItems(supabase)

      const result: SeedCapInput[] = []
      for (const c of caps) {
        const item = items.get(normalizedTextFromRef(c.source_ref))
        if (!item) continue // item not active/word-phrase — that cap carries no MCQ distractors anyway
        result.push({
          capabilityId: c.id,
          capabilityType: c.capability_type,
          item: { itemId: item.id, form: item.base_text, meaning: item.translation_nl, pos: item.pos },
        })
      }
      return result
    },

    async fetchPool(lessonNumber: number): Promise<PoolItemInput[]> {
      // Lessons 1..N (single module-1, order_index == lesson number).
      const { data: lessonRows, error: lessonErr } = await idn()
        .from('lessons')
        .select('id')
        .lte('order_index', lessonNumber)
      if (lessonErr) throw new Error(`store.fetchPool/lessons: ${lessonErr.message}`)
      const lessonIds = (lessonRows ?? []).map((l) => (l as { id: string }).id)
      if (lessonIds.length === 0) return []

      // Item caps introduced by those lessons → distinct item normalized_texts.
      const normalizedTexts = new Set<string>()
      for (const lid of lessonIds) {
        let offset = 0
        while (true) {
          const { data, error } = await idn()
            .from('learning_capabilities')
            .select('source_ref')
            .eq('source_kind', 'item')
            .eq('lesson_id', lid)
            .range(offset, offset + PAGE_SIZE - 1)
          if (error) throw new Error(`store.fetchPool/caps: ${error.message}`)
          const page = (data ?? []) as Array<{ source_ref: string }>
          for (const r of page) normalizedTexts.add(normalizedTextFromRef(r.source_ref))
          if (page.length < PAGE_SIZE) break
          offset += PAGE_SIZE
        }
      }

      const items = await fetchAllActiveItems(supabase)
      return [...items.values()]
        .filter((i) => normalizedTexts.has(i.normalized_text))
        .map((i) => ({
          itemId: i.id,
          form: i.base_text,
          meaning: i.translation_nl,
          pos: i.pos,
        }))
    },

    async fetchEmbeddings(itemIds: string[]): Promise<Map<string, number[]>> {
      // Paginate the whole (small) cache and filter in memory rather than
      // .in(uuid, [...]) — the homelab gateway rejects long request URLs (same
      // failure mode as the normalized_text .in()). item_embeddings has ≤1 row
      // per item.
      const want = new Set(itemIds)
      const out = new Map<string, number[]>()
      let offset = 0
      while (true) {
        const { data, error } = await idn()
          .from('item_embeddings')
          .select('learning_item_id, embedding')
          .range(offset, offset + PAGE_SIZE - 1)
        if (error) throw new Error(`store.fetchEmbeddings: ${error.message}`)
        const page = (data ?? []) as Array<{ learning_item_id: string; embedding: string | number[] }>
        for (const r of page) {
          if (!want.has(r.learning_item_id)) continue
          // pgvector serialises to the text form "[f1,f2,...]"; parse to number[].
          out.set(r.learning_item_id, typeof r.embedding === 'string' ? (JSON.parse(r.embedding) as number[]) : r.embedding)
        }
        if (page.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }
      return out
    },

    async upsertEmbeddings(rows: { itemId: string; embedding: number[] }[]): Promise<void> {
      if (rows.length === 0) return
      const payload = rows.map((r) => ({
        learning_item_id: r.itemId,
        embedding: `[${r.embedding.join(',')}]`, // pgvector text input form
      }))
      for (const part of chunk(payload, IN_CHUNK)) {
        const { error } = await idn()
          .from('item_embeddings')
          .upsert(part, { onConflict: 'learning_item_id' })
        if (error) throw new Error(`store.upsertEmbeddings: ${error.message}`)
      }
    },

    async fetchCapsWithDistractors(capabilityIds: string[]): Promise<Set<string>> {
      // Paginate all seeded capability_ids and intersect in memory (same
      // gateway-URL-length avoidance as fetchEmbeddings). Returning a superset
      // of `capabilityIds` is harmless — the caller only does membership checks.
      const want = new Set(capabilityIds)
      const seeded = new Set<string>()
      let offset = 0
      while (true) {
        const { data, error } = await idn()
          .from('distractors')
          .select('capability_id')
          .range(offset, offset + PAGE_SIZE - 1)
        if (error) throw new Error(`store.fetchCapsWithDistractors: ${error.message}`)
        const page = (data ?? []) as Array<{ capability_id: string }>
        for (const r of page) if (want.has(r.capability_id)) seeded.add(r.capability_id)
        if (page.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }
      return seeded
    },

    async deleteDistractors(capabilityIds: string[]): Promise<void> {
      for (const part of chunk(capabilityIds, IN_CHUNK)) {
        const { error } = await idn().from('distractors').delete().in('capability_id', part)
        if (error) throw new Error(`store.deleteDistractors: ${error.message}`)
      }
    },

    async insertDistractors(rows: { capabilityId: string; itemId: string }[]): Promise<void> {
      if (rows.length === 0) return
      const payload = rows.map((r) => ({ capability_id: r.capabilityId, item_id: r.itemId }))
      for (const part of chunk(payload, IN_CHUNK)) {
        // PK (capability_id, item_id) → ignoreDuplicates keeps it idempotent.
        const { error } = await idn()
          .from('distractors')
          .upsert(part, { onConflict: 'capability_id,item_id', ignoreDuplicates: true })
        if (error) throw new Error(`store.insertDistractors: ${error.message}`)
      }
    },
  }
}
