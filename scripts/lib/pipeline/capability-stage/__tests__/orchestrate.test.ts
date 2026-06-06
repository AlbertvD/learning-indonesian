/**
 * cap-v2 Slice 1 — populate-pass orchestration (loop layer).
 *
 * The thin ascending-lesson loop is tested hermetically; the supabase wiring
 * (createDistractorStore + createLocalEmbedder + lesson listing) is the
 * integration seam verified at the populate pass.
 */

import { describe, it, expect, vi } from 'vitest'
import { populateDistractors } from '../orchestrate'
import type { DistractorStore } from '../vocabulary/seedDistractors'
import type { Embedder } from '../shared/embeddings'

function noopStore(): DistractorStore {
  return {
    fetchItemCapsForLesson: vi.fn(async () => []),
    fetchPool: vi.fn(async () => []),
    fetchEmbeddings: vi.fn(async () => new Map()),
    upsertEmbeddings: vi.fn(async () => {}),
    fetchCapsWithDistractors: vi.fn(async () => new Set<string>()),
    deleteDistractors: vi.fn(async () => {}),
    insertDistractors: vi.fn(async () => {}),
  }
}
const noopEmbedder: Embedder = { embed: vi.fn(async (t: string[]) => t.map(() => [0])) }

describe('populateDistractors', () => {
  it('seeds each lesson in ascending order and returns a per-lesson result', async () => {
    const seen: number[] = []
    const store = noopStore()
    store.fetchItemCapsForLesson = vi.fn(async (lessonId: string) => {
      seen.push(Number(lessonId.replace('L', '')))
      return []
    })

    const lessons = [
      { lessonId: 'L2', lessonNumber: 2 },
      { lessonId: 'L1', lessonNumber: 1 },
      { lessonId: 'L3', lessonNumber: 3 },
    ]
    const results = await populateDistractors(lessons, store, noopEmbedder)

    // Ascending by lessonNumber so Pool(N) is complete before lesson N is seeded.
    expect(seen).toEqual([1, 2, 3])
    expect(results.map((r) => r.lessonNumber)).toEqual([1, 2, 3])
  })
})
