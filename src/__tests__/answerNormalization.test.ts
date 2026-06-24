import { describe, it, expect } from 'vitest'
import { normalizeAnswer, checkAnswer, normalizeAnswerResponse, findIneffectiveProduceReason } from '@/lib/answerNormalization'

describe('normalizeAnswer', () => {
  it('trims whitespace', () => {
    expect(normalizeAnswer('  rumah  ')).toBe('rumah')
  })

  it('folds case', () => {
    expect(normalizeAnswer('Rumah')).toBe('rumah')
  })

  it('strips punctuation', () => {
    expect(normalizeAnswer('rumah!')).toBe('rumah')
    expect(normalizeAnswer('rumah.')).toBe('rumah')
    expect(normalizeAnswer("it's")).toBe('its')
  })

  it('removes parentheticals', () => {
    expect(normalizeAnswer('house (building)')).toBe('house')
  })

  it('handles combined transforms', () => {
    expect(normalizeAnswer('  Rumah Besar!  ')).toBe('rumah besar')
  })
})

describe('checkAnswer', () => {
  it('matches exact canonical answer', () => {
    const result = checkAnswer('rumah', 'rumah', [])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(false)
  })

  it('accepts any slash-separated alternative in canonical', () => {
    expect(checkAnswer('huis', 'huis / woning', []).isCorrect).toBe(true)
    expect(checkAnswer('woning', 'huis / woning', []).isCorrect).toBe(true)
  })

  it('accepts any slash-separated alternative in a variant', () => {
    expect(checkAnswer('gaan', 'lopen', ['gaan / rijden']).isCorrect).toBe(true)
    expect(checkAnswer('rijden', 'lopen', ['gaan / rijden']).isCorrect).toBe(true)
  })

  it('accepts answer matching canonical stripped of parenthetical', () => {
    expect(checkAnswer('huis', 'huis (gebouw)', []).isCorrect).toBe(true)
  })

  it('accepts slash alternative when canonical has parentheticals', () => {
    expect(checkAnswer('huis', 'huis (gebouw) / woning', []).isCorrect).toBe(true)
    expect(checkAnswer('woning', 'huis (gebouw) / woning', []).isCorrect).toBe(true)
  })

  it('matches with normalization', () => {
    const result = checkAnswer('  Rumah  ', 'rumah', [])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(false)
  })

  it('matches a known variant', () => {
    const result = checkAnswer('home', 'house', ['home', 'dwelling'])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(false)
  })

  it('accepts typo within Levenshtein distance 1 of canonical', () => {
    const result = checkAnswer('rumha', 'rumah', [])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(true)
  })

  it('accepts typo within Levenshtein distance 1 of variant', () => {
    const result = checkAnswer('hom', 'house', ['home'])
    expect(result.isCorrect).toBe(true)
    expect(result.isFuzzy).toBe(true)
  })

  it('rejects wrong answers', () => {
    const result = checkAnswer('kucing', 'rumah', [])
    expect(result.isCorrect).toBe(false)
    expect(result.isFuzzy).toBe(false)
  })

  it('rejects answers beyond Levenshtein distance 1', () => {
    const result = checkAnswer('membeli', 'memberi', [])
    expect(result.isCorrect).toBe(false)
  })

  // ── Separator convention (PR #129): "/" canonical, ";" defensive, NEVER
  //    comma. The grader delegates to the shared splitAlternatives in
  //    @/lib/capabilities (the one definition the CS19 gate + HC24 also use).

  it('accepts either clause of a multi-form translation joined by ";" (defensive split)', () => {
    // The real legacy `translation_nl` shape the 2026-06 audit found unmatchable.
    expect(checkAnswer('het is goedkoop', 'het is goedkoop; de prijs is laag', []).isCorrect).toBe(true)
    expect(checkAnswer('de prijs is laag', 'het is goedkoop; de prijs is laag', []).isCorrect).toBe(true)
  })

  it('accepts either clause of a multi-form translation joined by "/" (canonical)', () => {
    expect(checkAnswer('het is goedkoop', 'het is goedkoop / de prijs is laag', []).isCorrect).toBe(true)
    expect(checkAnswer('de prijs is laag', 'het is goedkoop / de prijs is laag', []).isCorrect).toBe(true)
  })

  it('treats a comma as part of ONE answer — it is NOT an alternatives separator (M2)', () => {
    // With comma-split removed, a meaning still authored with comma-as-OR is one
    // unmatchable blob. This is the guard that 2e (re-author) + HC24 (confirm
    // clean) MUST precede the grader change in deploy order.
    expect(checkAnswer('maar', 'maar, echter', []).isCorrect).toBe(false)
    expect(checkAnswer('echter', 'maar, echter', []).isCorrect).toBe(false)
  })

  it('still accepts the full comma-joined string typed verbatim as a single answer', () => {
    const r = checkAnswer('maar, echter', 'maar, echter', [])
    expect(r.isCorrect).toBe(true)
    expect(r.isFuzzy).toBe(false)
  })

  it('accepts ";"-separated alternatives supplied as an accepted variant', () => {
    expect(checkAnswer('gaan', 'lopen', ['gaan; rijden']).isCorrect).toBe(true)
    expect(checkAnswer('rijden', 'lopen', ['gaan; rijden']).isCorrect).toBe(true)
  })

  it('still rejects a genuinely wrong answer when canonical has alternatives', () => {
    expect(checkAnswer('banana', 'maar / echter', []).isCorrect).toBe(false)
  })
})

describe('normalizeAnswerResponse', () => {
  it('lowercases', () => {
    expect(normalizeAnswerResponse('Hello')).toBe('hello')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeAnswerResponse('  hello  ')).toBe('hello')
  })

  it('does both', () => {
    expect(normalizeAnswerResponse('  HELLO World  ')).toBe('hello world')
  })

  it('returns null for null', () => {
    expect(normalizeAnswerResponse(null)).toBe(null)
  })

  it('returns null for undefined', () => {
    expect(normalizeAnswerResponse(undefined)).toBe(null)
  })

  it('returns null for empty string', () => {
    // Empty string is falsy → null. An empty rawResponse means "no answer
    // provided" and should not be stored as the literal empty string.
    expect(normalizeAnswerResponse('')).toBe(null)
  })

  it('preserves internal whitespace', () => {
    expect(normalizeAnswerResponse('saya makan nasi')).toBe('saya makan nasi')
  })

  it('preserves punctuation (unlike comparison-side normalizeAnswer)', () => {
    expect(normalizeAnswerResponse('  Hello, World!  ')).toBe('hello, world!')
  })
})

// findIneffectiveProduceReason is the dual of checkAnswer: it detects produce
// exercises the grader cannot grade. Fixtures are the real live exercises from
// the 2026-06-24 audit. Each "ineffective" case is paired with the actual input
// that `checkAnswer` wrongly accepts — proving the predicate flags exactly the
// exercises whose transformation the grader is blind to.
describe('findIneffectiveProduceReason', () => {
  it('flags a slash word-group answer (grader splits "/" as OR → fragment passes)', () => {
    const acc = ['Saya / minum teh / di kamar.', 'Saya / minum teh / di kamar']
    expect(findIneffectiveProduceReason('Saya minum teh di kamar.', acc)).toBe('slash_fragments_answer')
    // and indeed the grader accepts a bare fragment:
    expect(checkAnswer('di kamar', acc[0], acc).isCorrect).toBe(true)
  })

  it('flags a capitalization-only fix (grader lowercases → unfixed prompt passes)', () => {
    const acc = ['Saya pergi ke kantor pada hari Rabu.']
    expect(findIneffectiveProduceReason('Saya pergi ke kantor pada hari rabu.', acc)).toBe('answer_equals_prompt')
    expect(checkAnswer('Saya pergi ke kantor pada hari rabu.', acc[0], acc).isCorrect).toBe(true)
  })

  it('flags a punctuation-only change (grader strips "?" → unchanged declarative passes)', () => {
    const acc = ['Harga ini sudah termasuk makanan?', 'Apakah harga ini sudah termasuk makanan?']
    expect(findIneffectiveProduceReason('Harga ini sudah termasuk makanan.', acc)).toBe('answer_equals_prompt')
  })

  it('flags a verbatim source listed as an accepted answer', () => {
    const acc = ['Mereka datang pada malam Minggu.', 'Mereka datang malam Minggu.']
    expect(findIneffectiveProduceReason('Mereka datang pada malam Minggu.', acc)).toBe('answer_equals_prompt')
  })

  it('passes a genuine transformation (answer differs from prompt under normalization)', () => {
    const acc = ['Koper itu berat.', 'Koper itu berat']
    expect(findIneffectiveProduceReason('Koper ini berat.', acc)).toBeNull()
  })

  it('passes a constrained translation (cross-language prompt, no slash) — equals-prompt arm is inert', () => {
    // source is Dutch; answer is Indonesian — never normalizes equal, and no "/".
    expect(findIneffectiveProduceReason('Mijn voet doet pijn.', ['Kaki saya sakit.'])).toBeNull()
  })

  it('still flags a slash answer even when the cross-language source differs', () => {
    expect(findIneffectiveProduceReason('Teman koopt fruit op de markt.', ['Teman / beli buah / di pasar.']))
      .toBe('slash_fragments_answer')
  })
})
