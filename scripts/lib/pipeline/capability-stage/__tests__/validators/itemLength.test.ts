import { describe, it, expect } from 'vitest'
import { validateItemLength } from '../../validators/itemLength'

describe('validateItemLength — CS20 length guard', () => {
  it('warns on a word/phrase running >= 6 tokens (likely mis-tagged sentence)', () => {
    const findings = validateItemLength([
      { base_text: 'satu dua tiga empat lima enam', item_type: 'phrase' },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS20')
    expect(findings[0].severity).toBe('warning')
  })

  it('does not warn on a short word/phrase', () => {
    expect(validateItemLength([{ base_text: 'terima kasih kembali', item_type: 'phrase' }])).toHaveLength(0)
    expect(validateItemLength([{ base_text: 'buku', item_type: 'word' }])).toHaveLength(0)
  })

  it('is warn-only — never errors (long fixed expressions are legitimate)', () => {
    const findings = validateItemLength([
      { base_text: 'a b c d e f g', item_type: 'word' },
    ])
    expect(findings.every((f) => f.severity === 'warning')).toBe(true)
  })

  it('does not check sentence / dialogue_chunk items (they are dropped, not flagged)', () => {
    expect(validateItemLength([
      { base_text: 'Ada yang dari negeri Belanda dan ada yang dari negeri Jerman.', item_type: 'sentence' },
      { base_text: 'Selamat pagi semuanya, apa kabar kalian hari ini?', item_type: 'dialogue_chunk' },
    ])).toHaveLength(0)
  })
})
