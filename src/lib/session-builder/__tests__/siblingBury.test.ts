import { describe, expect, it } from 'vitest'
import { buryThinSiblings } from '../siblingBury'

interface Cand { key: string; ref: string | undefined }
const refOf = (c: Cand) => c.ref

describe('buryThinSiblings', () => {
  it('keeps the first sibling per source_ref and buries the rest', () => {
    const used = new Set<string>()
    const candidates: Cand[] = [
      { key: 'paman:meaning_recall', ref: 'learning_items/paman' },
      { key: 'paman:dictation', ref: 'learning_items/paman' },
      { key: 'paman:form_recall', ref: 'learning_items/paman' },
    ]
    const kept = buryThinSiblings(candidates, refOf, used)
    expect(kept.map(c => c.key)).toEqual(['paman:meaning_recall'])
    expect(used.has('learning_items/paman')).toBe(true)
  })

  it('buries every sibling of a source_ref already used (e.g. reviewed today)', () => {
    const used = new Set<string>(['learning_items/paman'])
    const candidates: Cand[] = [
      { key: 'paman:meaning_recall', ref: 'learning_items/paman' },
      { key: 'makan:recognise_meaning_from_text_cap', ref: 'learning_items/makan' },
    ]
    const kept = buryThinSiblings(candidates, refOf, used)
    expect(kept.map(c => c.key)).toEqual(['makan:recognise_meaning_from_text_cap'])
  })

  it('keeps candidates with distinct source_refs and preserves order', () => {
    const used = new Set<string>()
    const candidates: Cand[] = [
      { key: 'a', ref: 'learning_items/a' },
      { key: 'b', ref: 'learning_items/b' },
      { key: 'c', ref: 'learning_items/c' },
    ]
    const kept = buryThinSiblings(candidates, refOf, used)
    expect(kept.map(c => c.key)).toEqual(['a', 'b', 'c'])
  })

  it('never buries a candidate whose source_ref is undefined (fail-open)', () => {
    const used = new Set<string>()
    const candidates: Cand[] = [
      { key: 'unknown-1', ref: undefined },
      { key: 'unknown-2', ref: undefined },
    ]
    const kept = buryThinSiblings(candidates, refOf, used)
    expect(kept.map(c => c.key)).toEqual(['unknown-1', 'unknown-2'])
  })

  it('threads the used set across calls so burying spans passes', () => {
    const used = new Set<string>()
    const pass1 = buryThinSiblings(
      [{ key: 'paman:due', ref: 'learning_items/paman' }],
      refOf,
      used,
    )
    const pass2 = buryThinSiblings(
      [{ key: 'paman:new', ref: 'learning_items/paman' }],
      refOf,
      used,
    )
    expect(pass1.map(c => c.key)).toEqual(['paman:due'])
    expect(pass2).toEqual([]) // paman already won its slot in pass 1
  })
})
