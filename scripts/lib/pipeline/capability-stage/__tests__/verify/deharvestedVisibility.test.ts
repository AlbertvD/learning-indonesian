import { describe, it, expect } from 'vitest'
import { findInvisibleDeharvestedItems } from '../../verify/deharvestedVisibility'

describe('findInvisibleDeharvestedItems — CS21 reader-visibility net', () => {
  const typed = [
    'Ada yang dari negeri Belanda dan ada yang dari negeri Jerman.',
    'Selamat pagi, apa kabar?',
    'buku',
  ]

  it('returns items whose text is NOT in the typed content', () => {
    const invisible = findInvisibleDeharvestedItems(
      [{ base_text: 'Saya tidak ada di sini sekarang.', item_type: 'sentence' }],
      typed,
    )
    expect(invisible).toHaveLength(1)
  })

  it('treats a dialogue line present in typed content as visible (punctuation/case insensitive)', () => {
    const invisible = findInvisibleDeharvestedItems(
      [{ base_text: 'selamat pagi, apa kabar', item_type: 'dialogue_chunk' }],
      typed,
    )
    expect(invisible).toHaveLength(0)
  })

  it('treats an example sentence present in typed content as visible', () => {
    const invisible = findInvisibleDeharvestedItems(
      [{ base_text: 'Ada yang dari negeri Belanda dan ada yang dari negeri Jerman.', item_type: 'sentence' }],
      typed,
    )
    expect(invisible).toHaveLength(0)
  })

  it('returns nothing for an empty de-harvested set', () => {
    expect(findInvisibleDeharvestedItems([], typed)).toEqual([])
  })
})
