/**
 * cap-v2 Slice 1 — deterministic distractor selection (vocabulary).
 *
 * Replaces the old LLM-based `generateItemDistractors.ts` with deterministic
 * selection from the cumulative Pool(N) (Minimum Mechanism: deterministic
 * selection > LLM generation). Distractors are stored as pointers to learning
 * items (the `distractors` table), so these selectors return the chosen
 * candidate items, not copied text.
 *
 * Two selection signals, by distractor kind (spec §4):
 *   - form distractors ("pick the Indonesian word"): orthographic confusability
 *     — look-alikes are the right signal (`beli`/`beri`, `murah`/`marah`).
 *     NB: the spec also names "frequency"; there is no frequency data source in
 *     the schema, so it is omitted rather than mechanised (omission test).
 *   - meaning distractors ("pick the L1 gloss"): embedding-ranked (slice 3).
 *
 * The caller is responsible for supplying an already same-POS-filtered pool
 * (POS lives on `learning_items.pos`, populated by the Lesson Stage / enrichPos).
 */

import { levenshteinDistance } from '../../../text-similarity'
import { stripAffixes } from '../../../affix'

/** A learning item eligible to be a wrong MCQ option. */
export interface DistractorCandidate {
  /** `learning_items.id` — the pointer stored in the `distractors` table. */
  itemId: string
  /** The Indonesian written form (the orthographic-comparison key). */
  text: string
}

/**
 * Rank `candidates` by orthographic confusability with `answer` (closest first)
 * and return the top `k`. Lower Levenshtein distance = more confusable = a
 * better distractor. Ties break by ascending text for a stable, deterministic
 * result (idempotent re-selection, ADR 0011).
 */
export function selectFormDistractors(
  answer: string,
  candidates: DistractorCandidate[],
  k: number,
): DistractorCandidate[] {
  const a = answer.toLowerCase().trim()
  const aRoot = stripAffixes(a)

  // Exclude the answer itself and its morphological variants (a derived form
  // tests morphology, not vocabulary — CS16 rule 5). Mirror the validator's
  // shared-root test: equal stripped roots, root length ≥ 3.
  const isExcluded = (text: string): boolean => {
    const t = text.toLowerCase().trim()
    if (t === a) return true
    return aRoot.length >= 3 && stripAffixes(t) === aRoot
  }

  return candidates
    .filter((c) => !isExcluded(c.text))
    .map((c) => ({ c, dist: levenshteinDistance(a, c.text.toLowerCase().trim()) }))
    .sort((x, y) => x.dist - y.dist || x.c.text.localeCompare(y.c.text))
    .slice(0, k)
    .map((ranked) => ranked.c)
}

/** Default cosine above which a candidate gloss is treated as a synonym of the
 *  answer (≈ a correct answer, not a distractor). Spec §4 start point ~0.85;
 *  tuned on real L1 cases. */
export const DEFAULT_SYNONYM_THRESHOLD = 0.85

/** A learning item eligible to be a wrong *meaning* (L1 gloss) MCQ option. */
export interface MeaningCandidate {
  /** `learning_items.id` — the pointer stored in the `distractors` table. */
  itemId: string
  /** The L1 (Dutch) gloss — `translation_nl`. */
  meaning: string
  /** Precomputed embedding of `meaning` (supplied by the cache/embedding layer). */
  embedding: number[]
}

/** Cosine similarity of two equal-length vectors. Returns 0 for a zero vector. */
function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Split an answer gloss on the canonical `/` separator into its equally-correct
 *  alternative forms (the alternative-answer convention, CONTEXT.md). */
function answerForms(meaning: string): Set<string> {
  return new Set(
    meaning
      .toLowerCase()
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

/**
 * Rank `candidates` by meaning-embedding closeness to `answer` (most confusable
 * first) and return the top `k`. Spec §4:
 *   - exclude the answer gloss and its `/`-separated alternative forms (those
 *     are correct answers, not distractors);
 *   - exclude near-synonyms — any candidate with cosine ≥ `synonymThreshold`
 *     (too close to be a *wrong* option);
 *   - among the rest, closest-by-cosine = most confusable = the best distractor.
 * Ties break by ascending gloss for a stable, deterministic (idempotent) result.
 */
export function selectMeaningDistractors(
  answer: { meaning: string; embedding: number[] },
  candidates: MeaningCandidate[],
  k: number,
  opts?: { synonymThreshold?: number },
): MeaningCandidate[] {
  const threshold = opts?.synonymThreshold ?? DEFAULT_SYNONYM_THRESHOLD
  const forms = answerForms(answer.meaning)

  return candidates
    .map((c) => ({ c, sim: cosine(answer.embedding, c.embedding) }))
    .filter(({ c, sim }) => !forms.has(c.meaning.toLowerCase().trim()) && sim < threshold)
    .sort((x, y) => y.sim - x.sim || x.c.meaning.localeCompare(y.c.meaning))
    .slice(0, k)
    .map((ranked) => ranked.c)
}
