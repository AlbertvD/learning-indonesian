import { describe, expect, it } from 'vitest'
import { affixCandidates } from '../affixStrip'
import { resolveGloss, type ItemGloss } from '../gloss'
import type { ReadingToken } from '../readableText'

function tok(normalized: string, opts: Partial<ReadingToken> = {}): ReadingToken {
  return { raw: normalized, normalized, isProperNoun: false, isWord: true, ...opts }
}

const glosses = new Map<string, ItemGloss>([
  ['gelap', { nl: 'donker', en: 'dark' }],
  ['baca', { nl: 'lezen', en: 'read' }],
  ['enonly', { nl: null, en: 'english-only' }],
])

const base = { glosses, sentenceNl: 'De hele zin.', affixCandidates }

describe('resolveGloss cascade', () => {
  it('exact item match → NL gloss (item source)', () => {
    expect(resolveGloss(tok('gelap'), base)).toEqual({ text: 'donker', source: 'item' })
  })

  it('NL-first, falls back to EN when no NL', () => {
    expect(resolveGloss(tok('enonly'), base)).toEqual({ text: 'english-only', source: 'item' })
  })

  it('affixed form glosses via its root (morphology source)', () => {
    // membaca is not an item; its root baca is.
    expect(resolveGloss(tok('membaca'), base)).toEqual({ text: 'lezen', source: 'morphology' })
  })

  it('proper noun → no gloss (name source)', () => {
    expect(resolveGloss(tok('manu', { isProperNoun: true }), base)).toEqual({
      text: null, source: 'name',
    })
  })

  it('unknown word → sentence-translation fallback', () => {
    expect(resolveGloss(tok('xyzzy'), base)).toEqual({
      text: 'De hele zin.', source: 'sentence',
    })
  })

  it('non-word token → none', () => {
    expect(resolveGloss(tok('', { isWord: false }), base).source).toBe('none')
  })
})

describe('affixCandidates', () => {
  it('recovers the root of common prefixed/suffixed forms', () => {
    expect(affixCandidates('membaca')).toContain('baca')
    expect(affixCandidates('memukul')).toContain('pukul') // nasal restore (mem → p)
    expect(affixCandidates('menulis')).toContain('tulis') // men → t
    expect(affixCandidates('berlari')).toContain('lari')
    expect(affixCandidates('makanan')).toContain('makan') // suffix -an
    expect(affixCandidates('namanya')).toContain('nama') // suffix -nya
  })
  it('always includes the surface form itself', () => {
    expect(affixCandidates('rumah')).toContain('rumah')
  })
})
