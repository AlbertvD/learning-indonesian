import { describe, expect, it } from 'vitest'
import { resolveGloss, type GlossDeps, type ItemGloss } from '../gloss'
import type { ItemMorphology } from '../adapter'
import type { ReadingToken } from '../readableText'

function tok(normalized: string, opts: Partial<ReadingToken> = {}): ReadingToken {
  return { raw: normalized, normalized, isProperNoun: false, isWord: true, ...opts }
}

const glosses = new Map<string, ItemGloss>([
  ['gelap', { nl: 'donker', en: 'dark' }],
  ['baca', { nl: 'lezen', en: 'read' }],
  ['membaca', { nl: 'lezen (actief)', en: 'to read' }],
  ['enonly', { nl: null, en: 'english-only' }],
])

const morphology = new Map<string, ItemMorphology>([
  ['membaca', { root: 'baca', affix: 'meN-' }],
  ['dibaca', { root: 'baca', affix: 'di-' }],
])

const families = new Map<string, string[]>([['baca', ['baca', 'membaca', 'dibaca']]])

const base: GlossDeps = {
  glosses,
  morphology,
  families,
  affixFunctionNl: (affix) => (affix === 'meN-' ? 'actief werkwoord' : affix),
  sentenceNl: 'De hele zin.',
}

describe('resolveGloss cascade', () => {
  it('exact item match → NL gloss (item source)', () => {
    expect(resolveGloss(tok('gelap'), base)).toEqual({ text: 'donker', source: 'item', morphology: undefined })
  })

  it('NL-first, falls back to EN when no NL', () => {
    expect(resolveGloss(tok('enonly'), base).text).toBe('english-only')
  })

  it('item that is ALSO affixed → item meaning + morphology payload attached', () => {
    const r = resolveGloss(tok('membaca'), base)
    expect(r.source).toBe('item')
    expect(r.text).toBe('lezen (actief)')
    expect(r.morphology).toEqual({
      affix: 'meN-',
      affixFunctionNl: 'actief werkwoord',
      root: 'baca',
      rootMeaning: 'lezen',
      family: ['baca', 'membaca', 'dibaca'],
    })
  })

  it('affixed non-item → root meaning + morphology payload (morphology source)', () => {
    const r = resolveGloss(tok('dibaca'), base)
    expect(r.source).toBe('morphology')
    expect(r.text).toBe('lezen') // the root's meaning
    expect(r.morphology?.root).toBe('baca')
    expect(r.morphology?.family).toEqual(['baca', 'membaca', 'dibaca'])
  })

  it('proper noun → no gloss (name source)', () => {
    expect(resolveGloss(tok('manu', { isProperNoun: true }), base)).toEqual({ text: null, source: 'name' })
  })

  it('unknown word → sentence-translation fallback', () => {
    expect(resolveGloss(tok('xyzzy'), base)).toEqual({ text: 'De hele zin.', source: 'sentence' })
  })

  it('non-word token → none', () => {
    expect(resolveGloss(tok('', { isWord: false }), base).source).toBe('none')
  })
})
