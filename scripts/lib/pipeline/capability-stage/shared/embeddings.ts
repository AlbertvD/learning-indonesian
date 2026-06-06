/**
 * cap-v2 Slice 1 — local sentence-embedding service (shared).
 *
 * Meaning distractors are embedding-ranked (spec §4): the L1 gloss
 * (`translation_nl`) is embedded with a local multilingual model and ranked by
 * cosine against the answer's gloss. The model runs at build time under bun and
 * the vectors are cached in `item_embeddings` (computed once per new item).
 *
 * This is the swappable interface the spec mandates ("behind one
 * shared/embeddings.ts interface so the model is swappable"). The pure selector
 * (`vocabulary/selectDistractors.ts`) consumes precomputed vectors, so unit
 * tests inject fakes and never load the model; only the populate pass and the
 * lesson-11 acceptance exercise `createLocalEmbedder`.
 *
 * Model: paraphrase-multilingual-MiniLM-L12-v2 (Xenova ONNX port), 384 dims,
 * mean-pooled + L2-normalised → cosine == dot product. ~120 MB, downloaded once
 * to the transformers.js cache on first run, then offline.
 *
 * No disk I/O of our own — the model cache is managed inside the transformers.js
 * library, not by this module (the noDiskReads gate scans for our own reads).
 */

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

/** HF model id (the Xenova ONNX port transformers.js loads). */
export const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'

/** Embedding dimensionality — matches `item_embeddings.embedding vector(384)`. */
export const EMBEDDING_DIM = 384

/**
 * Embeds text into fixed-dimension vectors. The one seam meaning-distractor
 * selection and the `item_embeddings` cache depend on; swap the implementation
 * (different model, remote service) without touching either.
 */
export interface Embedder {
  /** Embed a batch of texts → one `EMBEDDING_DIM`-length vector per input. */
  embed(texts: string[]): Promise<number[][]>
}

/**
 * The local transformers.js embedder. The model is loaded lazily and once
 * (first `embed` call) — constructing the embedder is cheap; the download/init
 * happens on first use so a dry run that never embeds pays nothing.
 */
export function createLocalEmbedder(): Embedder {
  let extractorPromise: Promise<FeatureExtractionPipeline> | null = null
  const getExtractor = (): Promise<FeatureExtractionPipeline> => {
    if (!extractorPromise) {
      extractorPromise = pipeline(
        'feature-extraction',
        EMBEDDING_MODEL,
      ) as Promise<FeatureExtractionPipeline>
    }
    return extractorPromise
  }

  return {
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return []
      const extractor = await getExtractor()
      // Mean-pool + L2-normalise → sentence embeddings comparable by cosine.
      const tensor = await extractor(texts, { pooling: 'mean', normalize: true })
      const rows = tensor.tolist() as number[][]
      return rows
    },
  }
}
