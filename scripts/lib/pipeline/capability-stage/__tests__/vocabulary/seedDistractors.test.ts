/**
 * cap-v2 Slice 1 — the distractor seeding orchestrator (DB I/O shell).
 *
 * Composes Pool(N) + the embedding cache + planDistractorWrites + idempotent
 * writes behind an injected `DistractorStore` + `Embedder` — so the orchestration
 * (cache-miss embedding, seed-once idempotency, --regenerate) is tested
 * hermetically with fakes; the supabase-backed store is the thin populate-pass
 * seam, verified there.
 */

import { describe, it, expect } from 'vitest'
import { seedDistractors } from '../../vocabulary/seedDistractors'
import type { DistractorStore, SeedCapInput, PoolItemInput } from '../../vocabulary/seedDistractors'
import type { Embedder } from '../../shared/embeddings'

// Deterministic meaning vectors: goedkoop is closer to duur than fiets is.
const VECTORS: Record<string, number[]> = {
  duur: [1, 0, 0],
  goedkoop: [0.8, 0.6, 0],
  fiets: [0, 1, 0],
}

const POOL: PoolItemInput[] = [
  { itemId: 'i-a', form: 'mahal', meaning: 'duur', pos: 'adjective' },
  { itemId: 'i-b', form: 'murah', meaning: 'goedkoop', pos: 'adjective' },
  { itemId: 'i-c', form: 'sepeda', meaning: 'fiets', pos: 'adjective' },
]

const CAP_A_TEXT: SeedCapInput = {
  capabilityId: 'cap-a-text',
  capabilityType: 'text_recognition',
  item: { itemId: 'i-a', form: 'mahal', meaning: 'duur', pos: 'adjective' },
}

interface FakeState {
  embedCalls: string[][]
  upserted: { itemId: string; embedding: number[] }[]
  inserted: { capabilityId: string; itemId: string }[]
  deleted: string[]
}

function makeFakes(opts?: {
  caps?: SeedCapInput[]
  cachedEmbeddings?: Map<string, number[]>
  seededCaps?: Set<string>
}): { store: DistractorStore; embedder: Embedder; state: FakeState } {
  const state: FakeState = { embedCalls: [], upserted: [], inserted: [], deleted: [] }
  const cached = opts?.cachedEmbeddings ?? new Map()
  const seeded = opts?.seededCaps ?? new Set<string>()

  const store: DistractorStore = {
    async fetchItemCapsForLesson() {
      return opts?.caps ?? [CAP_A_TEXT]
    },
    async fetchPool() {
      return POOL
    },
    async fetchEmbeddings(itemIds) {
      return new Map([...cached].filter(([id]) => itemIds.includes(id)))
    },
    async upsertEmbeddings(rows) {
      state.upserted.push(...rows)
    },
    async fetchCapsWithDistractors() {
      return seeded
    },
    async deleteDistractors(capIds) {
      state.deleted.push(...capIds)
    },
    async insertDistractors(rows) {
      state.inserted.push(...rows)
    },
  }

  const embedder: Embedder = {
    async embed(texts) {
      state.embedCalls.push(texts)
      return texts.map((t) => VECTORS[t] ?? [0, 0, 0])
    },
  }

  return { store, embedder, state }
}

describe('seedDistractors', () => {
  it('writes meaning-distractor pointer rows for a text_recognition cap', async () => {
    const { store, embedder, state } = makeFakes()

    await seedDistractors({ lessonId: 'L', lessonNumber: 1 }, store, embedder, { k: 2 })

    // cap-a-text → meaning distractors over the pool minus the answer: i-b, i-c.
    expect(state.inserted).toEqual([
      { capabilityId: 'cap-a-text', itemId: 'i-b' },
      { capabilityId: 'cap-a-text', itemId: 'i-c' },
    ])
    expect(state.inserted.every((r) => r.itemId !== 'i-a')).toBe(true)
  })

  it('embeds only cache-miss items and upserts the freshly computed vectors', async () => {
    // i-a already cached → only i-b and i-c get embedded + upserted.
    const cachedEmbeddings = new Map([['i-a', VECTORS.duur]])
    const { store, embedder, state } = makeFakes({ cachedEmbeddings })

    await seedDistractors({ lessonId: 'L', lessonNumber: 1 }, store, embedder, { k: 2 })

    expect(state.embedCalls).toEqual([['goedkoop', 'fiets']])
    expect(state.upserted.map((r) => r.itemId).sort()).toEqual(['i-b', 'i-c'])
  })

  it('does not call the embedder when every item is already cached', async () => {
    const cachedEmbeddings = new Map([
      ['i-a', VECTORS.duur],
      ['i-b', VECTORS.goedkoop],
      ['i-c', VECTORS.fiets],
    ])
    const { store, embedder, state } = makeFakes({ cachedEmbeddings })

    await seedDistractors({ lessonId: 'L', lessonNumber: 1 }, store, embedder, { k: 2 })

    expect(state.embedCalls).toEqual([])
    expect(state.upserted).toEqual([])
    expect(state.inserted.length).toBeGreaterThan(0)
  })

  it('skips a capability that already carries distractor rows (seed-once, ADR 0011)', async () => {
    const { store, embedder, state } = makeFakes({ seededCaps: new Set(['cap-a-text']) })

    const result = await seedDistractors({ lessonId: 'L', lessonNumber: 1 }, store, embedder, { k: 2 })

    expect(state.inserted).toEqual([])
    expect(state.deleted).toEqual([])
    expect(result.capsSkipped).toBe(1)
    expect(result.rowsWritten).toBe(0)
  })

  it('--regenerate deletes the target item\'s capability rows, then re-selects', async () => {
    // cap-a-text is seeded; without regenerate it would be skipped. With
    // regenerate on the answer's form "mahal", it is deleted then re-written.
    const { store, embedder, state } = makeFakes({ seededCaps: new Set(['cap-a-text']) })

    await seedDistractors({ lessonId: 'L', lessonNumber: 1 }, store, embedder, {
      k: 2,
      regenerateNormalizedText: 'mahal',
    })

    expect(state.deleted).toEqual(['cap-a-text'])
    expect(state.inserted).toEqual([
      { capabilityId: 'cap-a-text', itemId: 'i-b' },
      { capabilityId: 'cap-a-text', itemId: 'i-c' },
    ])
  })

  it('--regenerate-distractors (regenerateAll) deletes ALL seeded caps for the lesson, then re-selects (F5)', async () => {
    // cap-a-text is seeded; without regen it is skipped. regenerateAll deletes
    // every cap's rows for the lesson (not just one item) and re-seeds — the
    // lesson-scoped fix path for existing lessons after F1's dedup landed.
    const { store, embedder, state } = makeFakes({ seededCaps: new Set(['cap-a-text']) })

    await seedDistractors({ lessonId: 'L', lessonNumber: 1 }, store, embedder, { k: 2, regenerateAll: true })

    expect(state.deleted).toEqual(['cap-a-text'])
    expect(state.inserted).toEqual([
      { capabilityId: 'cap-a-text', itemId: 'i-b' },
      { capabilityId: 'cap-a-text', itemId: 'i-c' },
    ])
  })
})
