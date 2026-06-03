/**
 * generateClozeContexts.test.ts — Slice 3 Task 4: the in-stage Mode-2 (dialogue
 * line) cloze generator. Ports the cloze-creator agent's dialogue contract
 * (.claude/agents/cloze-creator.md) into the capability stage, disk-free.
 *
 * This first suite covers the DETERMINISTIC eligibility core (no LLM):
 *   - normalizeClozeToken: the publish-time normalization for vocab matching
 *   - assessDialogueLineEligibility: the three structural gates from the agent
 *     spec (≥6 tokens; ≥1 current/prior vocab word in the line; that word's POS
 *     has ≥2 OTHER pool items with the same POS) and the three skip reasons.
 *
 * The LLM-facing parts (buildDialogueClozePrompt / parseDialogueClozeResponse /
 * sanitizeGeneratedCloze / generateDialogueClozes) are covered in later suites.
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeClozeToken,
  assessDialogueLineEligibility,
  type ClozePoolItem,
  type DialogueLineInput,
} from '../generateClozeContexts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Pool with a 3-noun class (so same-POS rule passes for nouns) + a lone verb. */
const POOL: ClozePoolItem[] = [
  { normalized_text: 'pohon', base_text: 'pohon', pos: 'noun' },
  { normalized_text: 'kaki', base_text: 'kaki', pos: 'noun' },
  { normalized_text: 'dokter', base_text: 'dokter', pos: 'noun' },
  { normalized_text: 'jatuh', base_text: 'jatuh', pos: 'verb' }, // lone verb (only 1 verb)
]

function line(text: string, overrides: Partial<DialogueLineInput> = {}): DialogueLineInput {
  return {
    id: 'dl-1',
    sourceLineRef: 'lesson-5/section-3/line-0',
    text,
    translation: 'vertaling',
    translationNl: 'vertaling',
    translationEn: 'translation',
    speaker: 'Andi',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// normalizeClozeToken
// ---------------------------------------------------------------------------

describe('normalizeClozeToken', () => {
  it('lowercases and strips trailing sentence punctuation', () => {
    expect(normalizeClozeToken('Pohon.')).toBe('pohon')
    expect(normalizeClozeToken('Ada?')).toBe('ada')
    expect(normalizeClozeToken('kaki,')).toBe('kaki')
    expect(normalizeClozeToken('sekali!')).toBe('sekali')
  })

  it('preserves internal hyphens and diacritics', () => {
    expect(normalizeClozeToken('buah-buahan')).toBe('buah-buahan')
    expect(normalizeClozeToken('dèh')).toBe('dèh')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeClozeToken('  pohon  ')).toBe('pohon')
  })
})

// ---------------------------------------------------------------------------
// assessDialogueLineEligibility
// ---------------------------------------------------------------------------

describe('assessDialogueLineEligibility', () => {
  it('skips lines with fewer than 6 tokens', () => {
    const result = assessDialogueLineEligibility(line('Saya jatuh dari pohon.'), POOL) // 4 tokens
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('below_6_token_threshold')
  })

  it('skips lines with no current/prior vocab word', () => {
    // 6 tokens, none of which are in the pool
    const result = assessDialogueLineEligibility(line('Xxx yyy zzz aaa bbb ccc.'), POOL)
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('no_current_or_prior_vocab_in_line')
  })

  it('skips lines whose only vocab word lacks 2 same-POS pool siblings', () => {
    // 6 tokens; 'jatuh' is the only pool word and it is the lone verb (no 2 same-POS others)
    const result = assessDialogueLineEligibility(line('Mereka mau pergi lalu ia jatuh.'), POOL)
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('no_same_pos_distractors_in_pool')
  })

  it('is eligible when a vocab word has >=2 same-POS pool siblings', () => {
    // 7 tokens; 'pohon' (noun) is in the pool and nouns have 3 members → 2 others
    const result = assessDialogueLineEligibility(
      line('Saya benar benar jatuh dari sebuah pohon.'),
      POOL,
    )
    expect(result.eligible).toBe(true)
    expect(result.reason).toBeUndefined()
    expect(result.candidates?.some((c) => c.normalized === 'pohon')).toBe(true)
  })

  it('matches vocab words case- and punctuation-insensitively', () => {
    // 'Pohon.' at sentence end must match pool 'pohon'
    const result = assessDialogueLineEligibility(
      line('Dia benar benar jatuh dari Pohon.'),
      POOL,
    )
    expect(result.eligible).toBe(true)
    expect(result.candidates?.some((c) => c.normalized === 'pohon')).toBe(true)
  })

  it('treats a candidate with null POS as having no same-POS class', () => {
    const poolWithNull: ClozePoolItem[] = [
      { normalized_text: 'foo', base_text: 'foo', pos: null },
      { normalized_text: 'bar', base_text: 'bar', pos: null },
      { normalized_text: 'baz', base_text: 'baz', pos: null },
    ]
    const result = assessDialogueLineEligibility(line('satu dua tiga empat lima foo.'), poolWithNull)
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('no_same_pos_distractors_in_pool')
  })

  it('counts only OTHER pool items for the same-POS rule (not the candidate itself)', () => {
    // Exactly 2 nouns total → candidate + 1 other = only 1 OTHER → not enough (<2 others)
    const twoNounPool: ClozePoolItem[] = [
      { normalized_text: 'pohon', base_text: 'pohon', pos: 'noun' },
      { normalized_text: 'kaki', base_text: 'kaki', pos: 'noun' },
    ]
    const result = assessDialogueLineEligibility(
      line('Saya benar benar jatuh dari sebuah pohon.'),
      twoNounPool,
    )
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('no_same_pos_distractors_in_pool')
  })
})
