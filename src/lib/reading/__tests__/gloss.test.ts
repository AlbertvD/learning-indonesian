import { describe, expect, it } from 'vitest'
import { resolveGloss, type GlossDeps, type ItemGloss } from '../gloss'
import type { ItemMorphology, FamilyMember } from '../adapter'
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
  ['membaca', { root: 'baca', affix: 'meN-', glossNl: 'lezen (actief)', glossEn: 'to read' }],
  ['dibaca', { root: 'baca', affix: 'di-', glossNl: 'gelezen worden', glossEn: 'to be read' }],
  ['pembaca', { root: 'baca', affix: 'peN-', glossNl: null, glossEn: null }],
])

const families = new Map<string, FamilyMember[]>([
  ['baca', [
    { form: 'membaca', affix: 'meN-', glossNl: 'lezen (actief)', glossEn: 'to read' },
    { form: 'dibaca', affix: 'di-', glossNl: 'gelezen worden', glossEn: 'to be read' },
    { form: 'pembaca', affix: 'peN-', glossNl: 'lezer', glossEn: 'reader' },
  ]],
])

const base: GlossDeps = { glosses, morphology, families, sentenceNl: 'De hele zin.' }

describe('resolveGloss cascade', () => {
  it('exact item match → NL gloss (item source)', () => {
    expect(resolveGloss(tok('gelap'), base)).toEqual({ text: 'donker', source: 'item', morphology: undefined })
  })

  it('NL-first, falls back to EN when no NL', () => {
    expect(resolveGloss(tok('enonly'), base).text).toBe('english-only')
  })

  it('item that is ALSO affixed → item meaning + morphology payload (family with translations)', () => {
    const r = resolveGloss(tok('membaca'), base)
    expect(r.source).toBe('item')
    expect(r.text).toBe('lezen (actief)')
    expect(r.morphology?.root).toBe('baca')
    expect(r.morphology?.rootMeaning).toBe('lezen')
    // family excludes the tapped word; each member carries its affix (for the link) + translation
    expect(r.morphology?.family).toEqual([
      { form: 'dibaca', affix: 'di-', translation: 'gelezen worden' },
      { form: 'pembaca', affix: 'peN-', translation: 'lezer' },
    ])
  })

  it('affixed non-item → its OWN derived translation (not the root meaning)', () => {
    const r = resolveGloss(tok('dibaca'), base)
    expect(r.source).toBe('morphology')
    expect(r.text).toBe('gelezen worden') // the derived form's own gloss, not "lezen"
    expect(r.morphology?.root).toBe('baca')
  })

  it('affixed non-item with no stored gloss → falls back to the root meaning', () => {
    const r = resolveGloss(tok('pembaca'), base)
    expect(r.source).toBe('morphology')
    expect(r.text).toBe('lezen') // no derived gloss stored → root meaning
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
