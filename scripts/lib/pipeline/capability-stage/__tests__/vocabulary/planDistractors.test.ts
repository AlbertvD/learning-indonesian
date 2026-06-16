/**
 * cap-v2 Slice 1 — the pure distractor-write planner.
 *
 * Maps each item capability to the right distractor kind (the seam grounded from
 * runner.ts:620-694) and composes the pure selectors over Pool(N):
 *   recognise_meaning_from_text_cap  → meaning distractors (recognition_mcq)
 *   recognise_meaning_from_audio_cap → meaning distractors (listening_mcq — newly curated)
 *   recognise_form_from_meaning_cap   → form distractors (cued_recall)
 *   meaning_recall / form_recall / dictation / produce_form_from_context_cap → none (typed/typed-cloze)
 * Returns the (capability_id, item_id) pointer rows the writer persists.
 */

import { describe, it, expect } from 'vitest'
import { planDistractorWrites } from '../../vocabulary/planDistractors'
import type { PoolItem, SeedCap } from '../../vocabulary/planDistractors'

// A small Pool(N): all nouns so same-POS never relaxes; embeddings hand-built so
// meaning ranking is deterministic. `merah`/`merah` are the orthographic look-alike.
const pool: PoolItem[] = [
  { itemId: 'i-duur', form: 'mahal', meaning: 'duur', pos: 'adjective', embedding: [1, 0, 0] },
  { itemId: 'i-goedkoop', form: 'murah', meaning: 'goedkoop', pos: 'adjective', embedding: [0.8, 0.6, 0] },
  { itemId: 'i-gratis', form: 'gratis', meaning: 'gratis', pos: 'adjective', embedding: [0.5, 0.87, 0] },
  { itemId: 'i-marah', form: 'marah', meaning: 'boos', pos: 'adjective', embedding: [0, 1, 0] },
]

// The answer item under test: "mahal" / "duur".
const answer = pool[0]

function capOf(capabilityType: string): SeedCap {
  return { capabilityId: `cap-${capabilityType}`, capabilityType, item: answer }
}

describe('planDistractorWrites', () => {
  it('emits meaning-distractor pointers for recognise_meaning_from_text_cap and form-distractor pointers for recognise_form_from_meaning_cap', () => {
    const caps = [capOf('recognise_meaning_from_text_cap'), capOf('recognise_form_from_meaning_cap')]

    const rows = planDistractorWrites(caps, pool, { k: 2, synonymThreshold: 0.99 })

    // recognise_meaning_from_text_cap → meaning distractors, ranked by gloss-embedding closeness
    // to "duur": goedkoop (cos .8) then gratis (cos .5); marah (cos 0) is farthest.
    const meaning = rows.filter((r) => r.capabilityId === 'cap-recognise_meaning_from_text_cap').map((r) => r.itemId)
    expect(meaning).toEqual(['i-goedkoop', 'i-gratis'])

    // recognise_form_from_meaning_cap → form distractors, orthographic look-alikes of "mahal":
    // marah (dist 2) and murah (dist 1) — closest first.
    const form = rows.filter((r) => r.capabilityId === 'cap-recognise_form_from_meaning_cap').map((r) => r.itemId).sort()
    expect(form).toEqual(['i-goedkoop', 'i-marah']) // murah=i-goedkoop, marah=i-marah
  })

  it('emits no rows for typed capabilities (meaning_recall, form_recall, dictation)', () => {
    const caps = [capOf('meaning_recall'), capOf('form_recall'), capOf('dictation')]
    const rows = planDistractorWrites(caps, pool, { k: 3, synonymThreshold: 0.99 })
    expect(rows).toEqual([])
  })

  it('never points a distractor at the answer item itself', () => {
    const caps = [capOf('recognise_meaning_from_text_cap'), capOf('recognise_form_from_meaning_cap')]
    const rows = planDistractorWrites(caps, pool, { k: 3, synonymThreshold: 0.99 })
    expect(rows.every((r) => r.itemId !== answer.itemId)).toBe(true)
  })
})
