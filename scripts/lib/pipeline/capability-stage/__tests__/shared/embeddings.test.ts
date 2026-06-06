/**
 * Contract smoke test for the local embedder. Loading the real model downloads
 * ~120 MB and needs onnxruntime-node's native binary, so it is SKIPPED in the
 * normal suite and run on demand at the populate pass / acceptance:
 *
 *   RUN_EMBEDDING_SMOKE=1 bun run test .../shared/embeddings.test.ts
 *
 * It pins the contract the meaning-distractor selector and the item_embeddings
 * cache depend on: EMBEDDING_DIM-length, L2-normalised vectors, and that a
 * paraphrase scores higher than an unrelated sentence.
 */

import { describe, it, expect } from 'vitest'
import { createLocalEmbedder, EMBEDDING_DIM } from '../../shared/embeddings'

const run = process.env.RUN_EMBEDDING_SMOKE === '1'

describe.skipIf(!run)('createLocalEmbedder (real model)', () => {
  it('returns L2-normalised EMBEDDING_DIM-length vectors and ranks a paraphrase above an unrelated sentence', async () => {
    const embedder = createLocalEmbedder()
    const [duur, kostbaar, fiets] = await embedder.embed(['duur', 'kostbaar', 'fiets'])

    expect(duur).toHaveLength(EMBEDDING_DIM)
    const norm = Math.sqrt(duur.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 2) // normalised → cosine == dot product

    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)
    // "kostbaar" (≈ duur/expensive) should be closer than "fiets" (bicycle).
    expect(dot(duur, kostbaar)).toBeGreaterThan(dot(duur, fiets))
  }, 120_000)
})
