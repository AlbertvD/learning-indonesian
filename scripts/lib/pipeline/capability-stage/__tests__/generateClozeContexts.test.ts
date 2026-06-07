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
  narrowClozeCarrier,
  buildDialogueClozePrompt,
  parseDialogueClozeResponse,
  sanitizeGeneratedCloze,
  generateDialogueClozes,
  type ClozePoolItem,
  type DialogueLineInput,
  type ClozeCandidate,
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

  it('no longer rejects a long multi-sentence line on length (F2: the carrier is narrowed downstream)', () => {
    // 20 tokens across two sentences, "pohon" (noun) in the 2nd. Pre-F2 this was
    // rejected as above_max_token_threshold; now it is eligible and the over-long
    // carrier is narrowed to the blank's sentence by narrowClozeCarrier downstream.
    const long = 'Saya mau pergi ke pasar dulu lalu saya akan kembali ke rumah. Dia jatuh dari sebuah pohon di dekat rumah.'
    const result = assessDialogueLineEligibility(line(long), POOL)
    expect(result.eligible).toBe(true)
    expect(result.candidates?.some((c) => c.normalized === 'pohon')).toBe(true)
  })

  it('accepts a single sentence at the upper boundary that has a viable candidate', () => {
    // 8 tokens, well within the ceiling, with the noun "pohon" (3 same-POS siblings).
    const result = assessDialogueLineEligibility(line('Dia jatuh dari pohon di dekat rumah.'), POOL)
    expect(result.eligible).toBe(true)
    expect(result.candidates?.some((c) => c.normalized === 'pohon')).toBe(true)
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

// ---------------------------------------------------------------------------
// narrowClozeCarrier (F2: single-sentence carrier extraction)
// ---------------------------------------------------------------------------

describe('narrowClozeCarrier', () => {
  it('returns a within-ceiling carrier unchanged (a short line keeps its whole carrier)', () => {
    // 6 tokens, two short sentences — a good carrier; not narrowed.
    expect(narrowClozeCarrier('Itu ___ ya! Empat rupiah boleh?')).toBe('Itu ___ ya! Empat rupiah boleh?')
  })

  it('narrows an over-ceiling line to the single sentence containing the blank', () => {
    const whole = 'Saya mau pergi ke pasar dulu lalu saya akan kembali ke rumah. Dia jatuh dari sebuah ___ di dekat rumah.'
    expect(narrowClozeCarrier(whole)).toBe('Dia jatuh dari sebuah ___ di dekat rumah.')
  })

  it('drops (null) when the blank sentence is under the floor (under-context)', () => {
    // over-ceiling line; the ___ sentence is only 5 tokens → too little context.
    const whole = 'Saya juga tidak punya ___. Jadi tinggal di rumah saja besok pagi sekali ya kawan dekat sana.'
    expect(narrowClozeCarrier(whole)).toBeNull()
  })

  it('drops (null) when the blank sentence itself exceeds the ceiling', () => {
    const whole = 'Awal cerita biasa. Mereka ke bandar udara dengan bapak dan setelah terbang satu setengah jam mereka ___ di bandara Ngurah Rai Denpasar Bali pagi tadi. Lalu pulang.'
    expect(narrowClozeCarrier(whole)).toBeNull()
  })

  it('returns null for an over-ceiling line with no blank (defensive)', () => {
    const whole = 'Tidak ada blank di sini sama sekali ya pak. Teman saya dekat rumah pasar pagi tadi sekali lagi ya bu.'
    expect(narrowClozeCarrier(whole)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildDialogueClozePrompt
// ---------------------------------------------------------------------------

describe('buildDialogueClozePrompt', () => {
  const candidates: ClozeCandidate[] = [
    { token: 'pohon', normalized: 'pohon', pos: 'noun' },
    { token: 'kaki', normalized: 'kaki', pos: 'noun' },
  ]

  it('includes the dialogue line text verbatim', () => {
    const prompt = buildDialogueClozePrompt(line('Saya benar benar jatuh dari sebuah pohon.'), candidates)
    expect(prompt).toContain('Saya benar benar jatuh dari sebuah pohon.')
  })

  it('lists the candidate words the blank must be chosen from', () => {
    const prompt = buildDialogueClozePrompt(line('Saya benar benar jatuh dari sebuah pohon.'), candidates)
    expect(prompt).toContain('pohon')
    expect(prompt).toContain('kaki')
  })

  it('instructs a single ___ blank and JSON-only output', () => {
    const prompt = buildDialogueClozePrompt(line('Saya benar benar jatuh dari sebuah pohon.'), candidates)
    expect(prompt).toContain('___')
    expect(prompt.toLowerCase()).toContain('json')
  })
})

// ---------------------------------------------------------------------------
// parseDialogueClozeResponse
// ---------------------------------------------------------------------------

describe('parseDialogueClozeResponse', () => {
  it('parses a well-formed JSON object', () => {
    const parsed = parseDialogueClozeResponse(
      '{"answer":"pohon","sentence_with_blank":"Saya jatuh dari ___."}',
    )
    expect(parsed).toEqual({ answer: 'pohon', sentence_with_blank: 'Saya jatuh dari ___.' })
  })

  it('strips ```json fences', () => {
    const parsed = parseDialogueClozeResponse(
      '```json\n{"answer":"kaki","sentence_with_blank":"___ saya sakit."}\n```',
    )
    expect(parsed).toEqual({ answer: 'kaki', sentence_with_blank: '___ saya sakit.' })
  })

  it('returns null for malformed JSON', () => {
    expect(parseDialogueClozeResponse('not json at all')).toBeNull()
  })

  it('returns null when required fields are missing or non-string', () => {
    expect(parseDialogueClozeResponse('{"answer":"pohon"}')).toBeNull()
    expect(parseDialogueClozeResponse('{"answer":1,"sentence_with_blank":"___"}')).toBeNull()
    expect(parseDialogueClozeResponse('[]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// sanitizeGeneratedCloze (defensive — Slice-1 Lesson #4)
// ---------------------------------------------------------------------------

describe('sanitizeGeneratedCloze', () => {
  const dialogueLine = line('Saya benar benar jatuh dari sebuah pohon.')
  const candidates: ClozeCandidate[] = [{ token: 'pohon', normalized: 'pohon', pos: 'noun' }]

  it('accepts a faithful cloze (one blank; reconstructs the line; answer is a candidate)', () => {
    const ok = sanitizeGeneratedCloze(
      { answer: 'pohon', sentence_with_blank: 'Saya benar benar jatuh dari sebuah ___.' },
      dialogueLine,
      candidates,
    )
    expect(ok).toEqual({ sentenceWithBlank: 'Saya benar benar jatuh dari sebuah ___.', answerText: 'pohon' })
  })

  it('rejects when sentence_with_blank does not contain exactly one ___', () => {
    expect(sanitizeGeneratedCloze(
      { answer: 'pohon', sentence_with_blank: 'Saya jatuh dari ___ ___.' }, dialogueLine, candidates,
    )).toBeNull()
    expect(sanitizeGeneratedCloze(
      { answer: 'pohon', sentence_with_blank: 'Saya jatuh dari pohon.' }, dialogueLine, candidates,
    )).toBeNull()
  })

  it('rejects when the blanked answer is not one of the viable candidates', () => {
    // 'jatuh' is not in candidates (e.g. lone-verb, filtered out by eligibility)
    expect(sanitizeGeneratedCloze(
      { answer: 'jatuh', sentence_with_blank: 'Saya benar benar ___ dari sebuah pohon.' },
      dialogueLine, candidates,
    )).toBeNull()
  })

  it('rejects when filling the blank does not reconstruct the original line (LLM altered the line)', () => {
    expect(sanitizeGeneratedCloze(
      { answer: 'pohon', sentence_with_blank: 'Aku jatuh dari ___.' }, dialogueLine, candidates,
    )).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// generateDialogueClozes (orchestrator)
// ---------------------------------------------------------------------------

describe('generateDialogueClozes', () => {
  const eligibleLine = line('Saya benar benar jatuh dari sebuah pohon.', {
    id: 'dl-eligible',
    sourceLineRef: 'lesson-5/section-3/line-0',
    translation: 'Ik ben echt uit een boom gevallen.',
    translationNl: 'Ik ben echt uit een boom gevallen.',
    translationEn: 'I really fell out of a tree.',
  })
  const shortLine = line('Sudah.', { id: 'dl-short', sourceLineRef: 'lesson-5/section-3/line-1' })

  const goodFn = async () =>
    JSON.stringify({ answer: 'pohon', sentence_with_blank: 'Saya benar benar jatuh dari sebuah ___.' })

  it('emits a cloze for an eligible line, with translations sourced from the DB line (not the LLM)', async () => {
    const result = await generateDialogueClozes([eligibleLine], POOL, { generateFn: goodFn })
    expect(result.clozes).toHaveLength(1)
    expect(result.clozes[0]).toMatchObject({
      dialogueLineId: 'dl-eligible',
      sourceLineRef: 'lesson-5/section-3/line-0',
      sentenceWithBlank: 'Saya benar benar jatuh dari sebuah ___.',
      answerText: 'pohon',
      translationText: 'Ik ben echt uit een boom gevallen.',
      translationNl: 'Ik ben echt uit een boom gevallen.',
      translationEn: 'I really fell out of a tree.',
    })
    expect(result.skips).toHaveLength(0)
  })

  it('emits a structural skip for an ineligible line and never calls the LLM for it', async () => {
    let called = 0
    const countingFn = async () => { called += 1; return goodFn() }
    const result = await generateDialogueClozes([shortLine], POOL, { generateFn: countingFn })
    expect(result.clozes).toHaveLength(0)
    expect(result.skips).toEqual([
      { dialogueLineId: 'dl-short', sourceLineRef: 'lesson-5/section-3/line-1', reason: 'below_6_token_threshold' },
    ])
    expect(called).toBe(0)
  })

  it('drops an eligible line whose LLM output fails sanitization (no cloze, no structural skip)', async () => {
    const badFn = async () => JSON.stringify({ answer: 'kucing', sentence_with_blank: 'Aku suka ___.' })
    const result = await generateDialogueClozes([eligibleLine], POOL, { generateFn: badFn })
    expect(result.clozes).toHaveLength(0)
    // not a structural skip — it was eligible; the gate (Task 8) catches the coverage gap
    expect(result.skips).toHaveLength(0)
    expect(result.failedLineRefs).toEqual(['lesson-5/section-3/line-0'])
  })

  it('returns empty for an empty line list without calling the LLM', async () => {
    let called = 0
    const result = await generateDialogueClozes([], POOL, { generateFn: async () => { called += 1; return '{}' } })
    expect(result.clozes).toHaveLength(0)
    expect(result.skips).toHaveLength(0)
    expect(called).toBe(0)
  })

  it('narrows an over-ceiling eligible line to the blank sentence (F2)', async () => {
    // 18 tokens across two sentences; "pohon" (noun) in the 2nd. The LLM returns
    // the faithful whole-line carrier; the stored cloze is the narrowed sentence.
    const longLine = line('Mereka mau pergi ke pasar pagi tadi bersama teman teman dekat. Dia jatuh dari sebuah pohon di rumah.', {
      id: 'dl-long', sourceLineRef: 'lesson-5/section-3/line-7',
    })
    const wholeBlankFn = async () =>
      JSON.stringify({ answer: 'pohon', sentence_with_blank: 'Mereka mau pergi ke pasar pagi tadi bersama teman teman dekat. Dia jatuh dari sebuah ___ di rumah.' })
    const result = await generateDialogueClozes([longLine], POOL, { generateFn: wholeBlankFn })
    expect(result.clozes).toHaveLength(1)
    expect(result.clozes[0].sentenceWithBlank).toBe('Dia jatuh dari sebuah ___ di rumah.')
    expect(result.clozes[0].answerText).toBe('pohon')
  })
})

// ---------------------------------------------------------------------------
// generateDialogueClozes — per-line seeded gate (R2: sole idempotency mechanism)
// ---------------------------------------------------------------------------

describe('generateDialogueClozes — per-line seeded gate', () => {
  const eligibleLine = line('Saya benar benar jatuh dari sebuah pohon.', {
    id: 'dl-seeded',
    sourceLineRef: 'lesson-5/section-3/line-0',
  })
  const goodFn = async () =>
    JSON.stringify({ answer: 'pohon', sentence_with_blank: 'Saya benar benar jatuh dari sebuah ___.' })

  it('skips a seeded line entirely — no LLM call, no cloze, no skip, no failure', async () => {
    let called = 0
    const countingFn = async () => { called += 1; return goodFn() }
    const result = await generateDialogueClozes([eligibleLine], POOL, {
      generateFn: countingFn,
      seededLineIds: new Set(['dl-seeded']),
    })
    expect(called).toBe(0)
    expect(result.clozes).toHaveLength(0)
    expect(result.skips).toHaveLength(0)
    expect(result.failedLineRefs).toHaveLength(0)
  })

  it('regenerate=true bypasses the seeded gate and regenerates the line', async () => {
    const result = await generateDialogueClozes([eligibleLine], POOL, {
      generateFn: goodFn,
      seededLineIds: new Set(['dl-seeded']),
      regenerate: true,
    })
    expect(result.clozes).toHaveLength(1)
    expect(result.clozes[0].dialogueLineId).toBe('dl-seeded')
  })

  it('generates an un-seeded line normally even when other lines are seeded', async () => {
    // Same text as the seeded line so the static goodFn's sentence reconstructs;
    // distinct id/ref so the gate treats it as a separate, un-seeded unit.
    const unseeded = line('Saya benar benar jatuh dari sebuah pohon.', {
      id: 'dl-new', sourceLineRef: 'lesson-5/section-3/line-9',
    })
    const result = await generateDialogueClozes([eligibleLine, unseeded], POOL, {
      generateFn: goodFn,
      seededLineIds: new Set(['dl-seeded']),
    })
    expect(result.clozes.map((c) => c.dialogueLineId)).toEqual(['dl-new'])
  })
})
