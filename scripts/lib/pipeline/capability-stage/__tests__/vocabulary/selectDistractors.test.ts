/**
 * cap-v2 Slice 1 — deterministic distractor selection (vocabulary).
 *
 * Form distractors ("pick the Indonesian word"): orthographic confusability
 * within the same-POS candidate pool. Spec §4: "look-alikes are the right
 * signal" (no embeddings, no frequency — there is no frequency data source).
 */

import { describe, it, expect } from 'vitest'
import {
  selectFormDistractors,
  selectMeaningDistractors,
  withPosFallback,
} from '../../vocabulary/selectDistractors'

describe('selectFormDistractors', () => {
  it('ranks the same-POS pool by orthographic confusability with the answer', () => {
    // Spec look-alike pairs: beli/beri are edit-distance 1 (the classic confusion);
    // makan / rumah are far; biru shares only the leading "b".
    const candidates = [
      { itemId: 'i-makan', text: 'makan' },
      { itemId: 'i-beri', text: 'beri' },
      { itemId: 'i-rumah', text: 'rumah' },
      { itemId: 'i-biru', text: 'biru' },
    ]

    const chosen = selectFormDistractors('beli', candidates, 2)

    expect(chosen.map((c) => c.itemId)).toEqual(['i-beri', 'i-biru'])
  })

  it('excludes the answer itself and its morphological variants', () => {
    // `beli` is the answer; `membeli` is a derived form (shared root `beli`) —
    // it tests morphology, not vocabulary (CS16 rule 5), so both are excluded
    // even though they are the closest orthographic matches.
    const candidates = [
      { itemId: 'i-beli', text: 'beli' }, // the answer itself, in the pool
      { itemId: 'i-membeli', text: 'membeli' }, // morphological variant
      { itemId: 'i-beri', text: 'beri' },
      { itemId: 'i-biru', text: 'biru' },
    ]

    const chosen = selectFormDistractors('beli', candidates, 2)

    expect(chosen.map((c) => c.itemId)).toEqual(['i-beri', 'i-biru'])
  })

  it('returns fewer than k when the eligible pool is undersupplied (never pads with excluded items)', () => {
    // Pool-relative coverage: chosen = min(k, |eligible|) — spec §4. After
    // excluding the answer, only one eligible candidate remains, so k=3 yields 1.
    const candidates = [
      { itemId: 'i-beli', text: 'beli' }, // the answer — excluded
      { itemId: 'i-beri', text: 'beri' },
    ]

    const chosen = selectFormDistractors('beli', candidates, 3)

    expect(chosen.map((c) => c.itemId)).toEqual(['i-beri'])
  })
})

describe('selectMeaningDistractors', () => {
  it('ranks candidates by meaning-embedding closeness, excluding near-synonyms above the threshold', () => {
    // Vectors are hand-built so the cosine ordering is deterministic; this pins
    // the mechanism (rank by cosine desc, drop synonyms ≥ threshold), not real
    // semantics. Answer gloss "duur"; threshold 0.85.
    const answer = { meaning: 'duur', embedding: [1, 0, 0, 0] }
    const candidates = [
      { itemId: 'i-kostbaar', meaning: 'kostbaar', embedding: [0.99, 0.14, 0, 0] }, // cos≈0.99 — synonym, excluded
      { itemId: 'i-goedkoop', meaning: 'goedkoop', embedding: [0.8, 0.6, 0, 0] }, // cos 0.8 — closest eligible
      { itemId: 'i-gratis', meaning: 'gratis', embedding: [0.5, 0.866, 0, 0] }, // cos 0.5
      { itemId: 'i-fiets', meaning: 'fiets', embedding: [0, 1, 0, 0] }, // cos 0 — far
    ]

    const chosen = selectMeaningDistractors(answer, candidates, 2, { synonymThreshold: 0.85 })

    expect(chosen.map((c) => c.itemId)).toEqual(['i-goedkoop', 'i-gratis'])
  })

  it('excludes the answer gloss and its slash-separated alternative forms', () => {
    // Answer "huis / woning" lists two equally-correct glosses (the `/`
    // convention); a candidate equal to either is a correct answer, not a
    // distractor, even if its embedding is far.
    const answer = { meaning: 'huis / woning', embedding: [1, 0, 0] }
    const candidates = [
      { itemId: 'i-woning', meaning: 'woning', embedding: [0, 1, 0] }, // a `/`-variant — excluded
      { itemId: 'i-huis', meaning: 'huis', embedding: [0, 0, 1] }, // exact variant — excluded
      { itemId: 'i-fiets', meaning: 'fiets', embedding: [0.3, 0.3, 0.9] },
    ]

    const chosen = selectMeaningDistractors(answer, candidates, 3, { synonymThreshold: 0.85 })

    expect(chosen.map((c) => c.itemId)).toEqual(['i-fiets'])
  })
})

describe('withPosFallback', () => {
  const pool = [
    { itemId: 'n1', pos: 'noun' },
    { itemId: 'n2', pos: 'noun' },
    { itemId: 'n3', pos: 'noun' },
    { itemId: 'v1', pos: 'verb' },
    { itemId: 'a1', pos: 'adjective' },
  ]

  it('returns only same-POS candidates when they suffice (no relaxation)', () => {
    // answer is a noun; 3 same-POS candidates ≥ needed=3 → never widen to verbs/adjs.
    const set = withPosFallback('noun', pool, 3)
    expect(set.map((c) => c.itemId).sort()).toEqual(['n1', 'n2', 'n3'])
  })

  it('relaxes to the full pool when same-POS candidates are undersupplied', () => {
    // answer is a verb; only 1 verb candidate < needed=3 → relax POS, hand the
    // whole pool to the ranker (closed-class function words need this rung).
    const set = withPosFallback('verb', pool, 3)
    expect(set.map((c) => c.itemId).sort()).toEqual(['a1', 'n1', 'n2', 'n3', 'v1'])
  })

  it('treats a null answer POS as already-relaxed (returns the full pool)', () => {
    // An item whose POS the Haiku backfill could not classify can't anchor a
    // same-POS filter — fall straight through to the full pool.
    const set = withPosFallback(null, pool, 3)
    expect(set.length).toBe(5)
  })
})
