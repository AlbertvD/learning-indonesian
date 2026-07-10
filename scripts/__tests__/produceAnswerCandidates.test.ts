import { describe, it, expect } from 'vitest'
import { generateCandidates, SYNONYM_PAIRS, ONE_WAY_SUBSTITUTIONS } from '../lib/produceAnswerCandidates'

describe('generateCandidates — itu-deletion', () => {
  it('drops a standalone "itu" and reattaches trailing punctuation', () => {
    const out = generateCandidates('Nanas yang murah itu enak.')
    expect(out).toContain('Nanas yang murah enak.')
  })

  it('handles itu as the very last token before punctuation', () => {
    const out = generateCandidates('Buku itu.')
    expect(out).toContain('Buku.')
  })

  it('does not fire deletion when there is no itu to delete (itu-insertion may still fire separately)', () => {
    const out = generateCandidates('Saya minum kopi.')
    expect(out.some((c) => c.includes('itu'))).toBe(false)
  })

  it('REGRESSION (2026-07-10 review): does not drop a SENTENCE-INITIAL itu — it is the subject pronoun, not a modifier', () => {
    const out = generateCandidates('Itu benar.')
    expect(out).not.toContain('benar.')
    expect(out).not.toContain('.')
  })

  it('REGRESSION: does not drop itu from the "itu pasar." subject+noun-predicate shape', () => {
    const out = generateCandidates('Itu pasar.')
    expect(out).not.toContain('pasar.')
  })

  it('REGRESSION: does not drop itu from the fixed connector "sesudah itu" (after that)', () => {
    const out = generateCandidates('Sesudah itu dia pulang.')
    expect(out).not.toContain('Sesudah dia pulang.')
  })

  it('REGRESSION: does not drop itu from the fixed connector "setelah itu"', () => {
    const out = generateCandidates('Setelah itu, pulang.')
    expect(out).not.toContain('Setelah, pulang.')
  })

  it('REGRESSION: does not drop itu from the fixed connector "karena itu" (therefore) — dropping it flips the causal reading', () => {
    const out = generateCandidates('Air dingin, karena itu saya tidak mau renang.')
    expect(out).not.toContain('Air dingin, karena saya tidak mau renang.')
  })

  it('REGRESSION: does not drop itu from "apakah itu?" — "Apakah?" alone is a sentence fragment', () => {
    const out = generateCandidates('Apakah itu?')
    expect(out).not.toContain('Apakah?')
  })

  it('still drops a genuine post-nominal itu next to an ordinary noun', () => {
    const out = generateCandidates('Karcis itu dibeli oleh saya.')
    expect(out).toContain('Karcis dibeli oleh saya.')
  })
})

describe('generateCandidates — itu-insertion (scoped)', () => {
  it('inserts itu before a closed-list adjective on a short sentence (real mined example)', () => {
    const out = generateCandidates('Nanas yang murah enak.')
    expect(out).toContain('Nanas yang murah itu enak.')
  })

  it('inserts itu before "murah" on a short yang-clause subject (real mined example)', () => {
    const out = generateCandidates('Yang kecil murah.')
    expect(out).toContain('Yang kecil itu murah.')
  })

  it('does not insert if itu is already present', () => {
    const out = generateCandidates('Nanas yang murah itu enak.')
    expect(out.filter((c) => c === 'Nanas yang murah itu enak.')).toHaveLength(0)
  })

  it('does not insert when the sentence exceeds the token ceiling', () => {
    const long = 'Orang yang sangat rajin dan pintar itu selalu datang tepat waktu setiap hari kerja banyak.'
    const out = generateCandidates(long)
    // last token "banyak." is in the adjective list, but the sentence is far
    // longer than ITU_INSERTION_MAX_TOKENS -> rule must not fire
    expect(out.some((c) => c.includes(' itu banyak'))).toBe(false)
  })

  it('does not insert when the final token is not a known predicate adjective', () => {
    const out = generateCandidates('Saya pergi ke pasar.')
    expect(out.some((c) => c.endsWith('itu pasar.'))).toBe(false)
  })

  it('REGRESSION (2026-07-10 review): does not insert when yang directly precedes the final adjective — that adjective is INSIDE the yang-clause, not a separate predicate', () => {
    const out = generateCandidates('Ini kursi besar yang baru.')
    expect(out).not.toContain('Ini kursi besar yang itu baru.')
  })

  it('does not fire when the sentence has no yang token at all, even if it ends in a closed-list adjective', () => {
    const out = generateCandidates('Restoran ini bagus.')
    expect(out.some((c) => c.includes(' itu bagus'))).toBe(false)
  })

  it('does not fire when the sentence opens with a bare Ini/Itu topic pronoun', () => {
    const out = generateCandidates('Itu kursi yang mahal.')
    expect(out.some((c) => c.includes('yang itu mahal'))).toBe(false)
  })

  it('REGRESSION (2026-07-10 review): does not insert between a negator and the adjective it negates', () => {
    const out = generateCandidates('Yang mahal tidak baik.')
    expect(out).not.toContain('Yang mahal tidak itu baik.')
  })

  it('REGRESSION (2026-07-10 review): does not insert between a coordinator ("dan") and the second conjunct adjective', () => {
    const out = generateCandidates('Restoran yang besar dan bersih.')
    expect(out).not.toContain('Restoran yang besar dan itu bersih.')
  })

  it('REGRESSION (2026-07-10 review): does not insert between a comparative marker ("lebih") and its adjective', () => {
    const out = generateCandidates('Tuti punya tas yang lebih mahal.')
    expect(out).not.toContain('Tuti punya tas yang lebih itu mahal.')
  })

  it('REGRESSION (2026-07-10 review): does not insert between a superlative marker ("paling") and its adjective', () => {
    const out = generateCandidates('Yati punya pakaian yang paling bagus.')
    expect(out).not.toContain('Yati punya pakaian yang paling itu bagus.')
  })

  it('still fires on the verified-safe template when the pre-adjective token is an ordinary content word', () => {
    const out = generateCandidates('Baju yang kamu beli bagus.')
    expect(out).toContain('Baju yang kamu beli itu bagus.')
  })
})

describe('generateCandidates — adalah insertion/deletion', () => {
  it('inserts adalah after a leading Ini (real mined example)', () => {
    const out = generateCandidates('Ini teman yang ke hotel.')
    expect(out).toContain('Ini adalah teman yang ke hotel.')
  })

  it('inserts adalah after a leading Itu', () => {
    const out = generateCandidates('Itu rumah saya.')
    expect(out).toContain('Itu adalah rumah saya.')
  })

  it('does not double-insert when adalah is already present', () => {
    const out = generateCandidates('Ini adalah teman saya.')
    expect(out.filter((c) => c === 'Ini adalah teman saya.')).toHaveLength(0)
  })

  it('drops an existing adalah', () => {
    const out = generateCandidates('Ini adalah teman saya.')
    expect(out).toContain('Ini teman saya.')
  })

  it('does not fire adalah-insertion when the sentence does not start with Ini/Itu', () => {
    const out = generateCandidates('Saya pergi ke pasar.')
    expect(out.some((c) => c.includes('adalah'))).toBe(false)
  })

  it('REGRESSION (2026-07-10 review): does not insert adalah before a negator ("adalah bukan" is redundant/ungrammatical)', () => {
    const out = generateCandidates('Ini bukan rumah, tetapi kantor.')
    expect(out).not.toContain('Ini adalah bukan rumah, tetapi kantor.')
  })

  it('REGRESSION (2026-07-10 review): does not insert adalah before a bare adjective predicate ("Itu adalah benar." is not natural Indonesian)', () => {
    const out = generateCandidates('Itu benar.')
    expect(out).not.toContain('Itu adalah benar.')
  })

  it('REGRESSION (2026-07-10 review): does not insert adalah before another adjective predicate case', () => {
    const out = generateCandidates('Itu murah.')
    expect(out).not.toContain('Itu adalah murah.')
  })

  it('still inserts adalah before a genuine noun-phrase predicate', () => {
    const out = generateCandidates('Itu pasar.')
    expect(out).toContain('Itu adalah pasar.')
  })
})

describe('generateCandidates — synonym pairs (bidirectional)', () => {
  it.each(SYNONYM_PAIRS)('substitutes %s <-> %s in both directions', (a, b) => {
    const sentenceWithA = generateCandidates(`Saya pikir ${a} benar.`)
    expect(sentenceWithA).toContain(`Saya pikir ${b} benar.`)
    const sentenceWithB = generateCandidates(`Saya pikir ${b} benar.`)
    expect(sentenceWithB).toContain(`Saya pikir ${a} benar.`)
  })

  it('preserves trailing punctuation on synonym substitution', () => {
    const out = generateCandidates('Dia sudah pergi.')
    expect(out).toContain('Dia telah pergi.')
  })

  it('is case-insensitive on the token match but substitutes lowercase', () => {
    const out = generateCandidates('Dia sudah pergi.')
    // "Dia" (capitalized, sentence-initial) matches the dia/ia pair too
    expect(out.some((c) => c.startsWith('Ia'))).toBe(false) // we do not re-capitalize — documents current behavior
  })
})

describe('generateCandidates — one-way substitution', () => {
  it.each(ONE_WAY_SUBSTITUTIONS)('substitutes %s -> %s but not the reverse', (from, to) => {
    const out = generateCandidates(`Ini lebih besar ${from} itu.`)
    expect(out).toContain(`Ini lebih besar ${to} itu.`)
    const reverseOut = generateCandidates(`Ini lebih besar ${to} itu.`)
    expect(reverseOut.some((c) => c.includes(from))).toBe(false)
  })
})

describe('generateCandidates — no-op cases', () => {
  it('returns an empty array for a sentence with no applicable rule', () => {
    const out = generateCandidates('Saya makan nasi goreng.')
    expect(out).toEqual([])
  })

  it('returns an empty array for an empty string', () => {
    expect(generateCandidates('')).toEqual([])
  })

  it('never includes the canonical answer itself in its own candidate set', () => {
    const canonical = 'Dia sudah pergi.'
    expect(generateCandidates(canonical)).not.toContain(canonical)
  })
})
