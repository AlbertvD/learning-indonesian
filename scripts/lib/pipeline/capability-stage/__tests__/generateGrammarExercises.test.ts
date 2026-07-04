/**
 * generateGrammarExercises.test.ts — Unit tests for the in-stage grammar
 * exercise generator (Slice 2, Task 4).
 *
 * Strategy: TDD the pure parts (buildPrompt, parseResponse, validateCandidate)
 * and the injected-generator path without any network calls. The headline
 * requirement (Lesson #2 + #4): a constraint-violating LLM candidate is DROPPED,
 * never returned for write.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildPrompt,
  parseResponse,
  validateCandidate,
  generateGrammarExercises,
  type GrammarPatternInput,
  type GrammarVocabPoolItem,
  type GrammarExerciseCandidate,
} from '../generateGrammarExercises'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PATTERN_BUKAN: GrammarPatternInput = {
  slug: 'l4-bukan-negatie',
  title: 'Bukan-negatie',
  rules: ['bukan ontkent zelfstandige naamwoorden', 'tidak ontkent werkwoorden en bijvoeglijke naamwoorden'],
  examples: [
    { indonesian: 'Ini bukan rumah.', dutch: 'Dit is geen huis.', english: null },
  ],
}

const PATTERN_RULES_ONLY: GrammarPatternInput = {
  slug: 'l4-duur',
  title: 'Duur',
  rules: ['gebruik "jam" voor tijdsduur'],
  examples: [],
}

const POOL: GrammarVocabPoolItem[] = [
  { indonesian_text: 'rumah', l1_translation: 'huis', item_type: 'word' },
  { indonesian_text: 'beli', l1_translation: 'kopen', item_type: 'word' },
  { indonesian_text: 'mahal', l1_translation: 'duur', item_type: 'word' },
]

// A valid choose_correct_form_ex candidate (passes buildGrammarExerciseRow + Zod).
const VALID_CONTRAST: GrammarExerciseCandidate = {
  exercise_type: 'choose_correct_form_ex',
  grammar_pattern_slug: 'l4-bukan-negatie',
  payload: {
    promptText: 'Je wijst naar een gebouw en zegt dat het geen huis is.',
    targetMeaning: 'bukan — geen (bij zelfstandig naamwoord)',
    options: [
      { id: 'bukan', text: 'bukan' },
      { id: 'tidak', text: 'tidak' },
    ],
    correctOptionId: 'bukan',
    explanationText: 'bukan ontkent zelfstandige naamwoorden; tidak ontkent werkwoorden.',
  },
}

const VALID_CLOZE: GrammarExerciseCandidate = {
  exercise_type: 'choose_missing_word_ex',
  grammar_pattern_slug: 'l4-bukan-negatie',
  payload: {
    sentence: 'Ini ___ rumah.',
    translation: 'Dit is geen huis.',
    options: ['bukan', 'tidak', 'belum', 'jangan'],
    correctOptionId: 'bukan',
    explanationText: 'bukan ontkent het zelfstandig naamwoord rumah.',
  },
}

function candidateJson(...candidates: GrammarExerciseCandidate[]): string {
  return JSON.stringify(candidates)
}

// ---------------------------------------------------------------------------
// 1. buildPrompt — pure function tests
// ---------------------------------------------------------------------------

describe('buildPrompt', () => {
  it('includes the pattern slug, title, and rules', () => {
    const prompt = buildPrompt(PATTERN_BUKAN, POOL)
    expect(prompt).toContain('l4-bukan-negatie')
    expect(prompt).toContain('Bukan-negatie')
    expect(prompt).toContain('bukan ontkent zelfstandige naamwoorden')
  })

  it('includes the pool words and their translations', () => {
    const prompt = buildPrompt(PATTERN_BUKAN, POOL)
    expect(prompt).toContain('rumah')
    expect(prompt).toContain('huis')
    expect(prompt).toContain('mahal')
  })

  it('includes worked examples when present', () => {
    const prompt = buildPrompt(PATTERN_BUKAN, POOL)
    expect(prompt).toContain('Ini bukan rumah.')
  })

  it('tolerates a rules-only pattern (no examples)', () => {
    const prompt = buildPrompt(PATTERN_RULES_ONLY, POOL)
    expect(prompt).toContain('l4-duur')
    expect(prompt).toContain('work from the rules')
  })

  it('lists all four exercise types and the pool-only sentence rule', () => {
    const prompt = buildPrompt(PATTERN_BUKAN, POOL)
    expect(prompt).toContain('choose_missing_word_ex')
    expect(prompt).toContain('choose_correct_form_ex')
    expect(prompt).toContain('transform_sentence_ex')
    expect(prompt).toContain('translate_sentence_ex')
    expect(prompt).toContain('ONLY words from this pool')
  })

  it('instructs Claude to return only a JSON array, no fences', () => {
    const prompt = buildPrompt(PATTERN_BUKAN, POOL)
    expect(prompt).toContain('No prose, no markdown fences')
  })

  it('binds requiredTargetPattern to the pattern slug exactly', () => {
    const prompt = buildPrompt(PATTERN_BUKAN, POOL)
    expect(prompt).toContain('MUST equal the pattern slug "l4-bukan-negatie"')
  })

  it('handles an empty pool gracefully', () => {
    const prompt = buildPrompt(PATTERN_BUKAN, [])
    expect(prompt).toContain('l4-bukan-negatie')
    expect(prompt).toContain('[]')
  })
})

// ---------------------------------------------------------------------------
// 2. parseResponse — pure function tests
// ---------------------------------------------------------------------------

describe('parseResponse', () => {
  it('parses a valid candidate array', () => {
    const result = parseResponse(candidateJson(VALID_CONTRAST, VALID_CLOZE))
    expect(result).toHaveLength(2)
    expect(result[0].exercise_type).toBe('choose_correct_form_ex')
    expect(result[1].exercise_type).toBe('choose_missing_word_ex')
  })

  it('returns empty array for empty / malformed / non-array JSON', () => {
    expect(parseResponse('[]')).toEqual([])
    expect(parseResponse('not json')).toEqual([])
    expect(parseResponse('')).toEqual([])
    expect(parseResponse('{"k":"v"}')).toEqual([])
  })

  it('strips markdown fences before parsing', () => {
    const wrapped = '```json\n' + candidateJson(VALID_CONTRAST) + '\n```'
    expect(parseResponse(wrapped)).toHaveLength(1)
  })

  it('extracts the array from a prose preamble (same live failure mode as dialogue cloze)', () => {
    const wrapped =
      'Here are the exercises I generated after considering each pattern:\n\n' +
      candidateJson(VALID_CONTRAST) +
      '\n\nEach follows the constraints.'
    expect(parseResponse(wrapped)).toHaveLength(1)
  })

  it('drops candidates with an unrecognized exercise_type (e.g. speaking)', () => {
    const raw = JSON.stringify([
      { exercise_type: 'speaking', grammar_pattern_slug: 'l4-bukan-negatie', payload: {} },
      VALID_CONTRAST,
    ])
    const result = parseResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].exercise_type).toBe('choose_correct_form_ex')
  })

  it('drops candidates with a missing slug or non-object payload', () => {
    const raw = JSON.stringify([
      { exercise_type: 'choose_correct_form_ex', payload: {} }, // no slug
      { exercise_type: 'choose_correct_form_ex', grammar_pattern_slug: 'x', payload: 'nope' }, // payload not object
      { exercise_type: 'choose_correct_form_ex', grammar_pattern_slug: 'x', payload: [] }, // payload array
    ])
    expect(parseResponse(raw)).toEqual([])
  })

  it('skips null entries', () => {
    const raw = JSON.stringify([null, VALID_CONTRAST])
    expect(parseResponse(raw)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 3. validateCandidate — the constraint-validity binding (Lesson #2)
// ---------------------------------------------------------------------------

describe('validateCandidate', () => {
  it('accepts a constraint-valid choose_correct_form_ex', () => {
    expect(validateCandidate(VALID_CONTRAST)).toBe(true)
  })

  it('accepts a constraint-valid choose_missing_word_ex', () => {
    expect(validateCandidate(VALID_CLOZE)).toBe(true)
  })

  it('rejects choose_correct_form_ex whose correctOptionId matches no option', () => {
    const bad: GrammarExerciseCandidate = {
      ...VALID_CONTRAST,
      payload: { ...VALID_CONTRAST.payload, correctOptionId: 'nonexistent' },
    }
    expect(validateCandidate(bad)).toBe(false)
  })

  it('rejects choose_missing_word_ex whose correctOptionId is not among the options', () => {
    const bad: GrammarExerciseCandidate = {
      ...VALID_CLOZE,
      payload: { ...VALID_CLOZE.payload, correctOptionId: 'sudah' },
    }
    expect(validateCandidate(bad)).toBe(false)
  })

  it('rejects a candidate missing a NOT-NULL field (explanationText empty)', () => {
    const bad: GrammarExerciseCandidate = {
      ...VALID_CONTRAST,
      payload: { ...VALID_CONTRAST.payload, explanationText: '' },
    }
    expect(validateCandidate(bad)).toBe(false)
  })

  it('rejects transform_sentence_ex with empty acceptableAnswers', () => {
    const bad: GrammarExerciseCandidate = {
      exercise_type: 'transform_sentence_ex',
      grammar_pattern_slug: 'l4-bukan-negatie',
      payload: {
        sourceSentence: 'Ini rumah.',
        transformationInstruction: 'Maak de zin ontkennend.',
        acceptableAnswers: [],
        hintText: null,
        explanationText: 'gebruik bukan.',
      },
    }
    expect(validateCandidate(bad)).toBe(false)
  })

  it('rejects an UNGRADEABLE transform (slash word-group answer) even though its shape is valid', () => {
    const bad: GrammarExerciseCandidate = {
      exercise_type: 'transform_sentence_ex',
      grammar_pattern_slug: 'l2-woordgroepen',
      payload: {
        sourceSentence: 'Saya minum teh di kamar.',
        transformationInstruction: 'Plaats schuine strepen tussen de woordgroepen.',
        acceptableAnswers: ['Saya / minum teh / di kamar.'],
        hintText: null,
        explanationText: 'woordgroepen.',
      },
    }
    expect(validateCandidate(bad)).toBe(false)
  })

  it('rejects an UNGRADEABLE transform whose answer differs from the prompt only by capitalization', () => {
    const bad: GrammarExerciseCandidate = {
      exercise_type: 'transform_sentence_ex',
      grammar_pattern_slug: 'l7-dagen-van-de-week-hari',
      payload: {
        sourceSentence: 'Saya pergi pada hari rabu.',
        transformationInstruction: 'Schrijf de zin correct op.',
        acceptableAnswers: ['Saya pergi pada hari Rabu.'],
        hintText: null,
        explanationText: 'dagen krijgen een hoofdletter.',
      },
    }
    expect(validateCandidate(bad)).toBe(false)
  })

  it('accepts a gradeable produce exercise (answer genuinely differs, no slash)', () => {
    const good: GrammarExerciseCandidate = {
      exercise_type: 'transform_sentence_ex',
      grammar_pattern_slug: 'l2-woordgroepen',
      payload: {
        sourceSentence: 'minum teh / Saya / di kamar',
        transformationInstruction: 'Zet de woordgroepen in de juiste volgorde tot een correcte zin.',
        acceptableAnswers: ['Saya minum teh di kamar.'],
        hintText: null,
        explanationText: 'het onderwerp staat vooraan.',
      },
    }
    expect(validateCandidate(good)).toBe(true)
  })

  it('accepts translate_sentence_ex with empty disallowedShortcutForms', () => {
    const ok: GrammarExerciseCandidate = {
      exercise_type: 'translate_sentence_ex',
      grammar_pattern_slug: 'l4-bukan-negatie',
      payload: {
        sourceLanguageSentence: 'Dit is geen huis.',
        requiredTargetPattern: 'l4-bukan-negatie',
        acceptableAnswers: ['Ini bukan rumah.'],
        disallowedShortcutForms: [],
        explanationText: 'bukan ontkent het zelfstandig naamwoord.',
      },
    }
    expect(validateCandidate(ok)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. generateGrammarExercises — injected fn path, no-op, drop-and-skip
// ---------------------------------------------------------------------------

describe('generateGrammarExercises', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an empty result for an empty patterns array', async () => {
    const result = await generateGrammarExercises([], POOL)
    expect(result.generatedCount).toBe(0)
    expect(result.candidatesByPatternSlug.size).toBe(0)
    expect(result.candidatesByPatternSlug).toBeInstanceOf(Map)
  })

  it('no-ops (empty result) when no generateFn and no API key', async () => {
    const result = await generateGrammarExercises([PATTERN_BUKAN], POOL)
    expect(result.generatedCount).toBe(0)
    expect(result.candidatesByPatternSlug.size).toBe(0)
  })

  it('uses the injected generateFn, bypassing the API-key check', async () => {
    const fakeFn = vi.fn().mockResolvedValue(candidateJson(VALID_CONTRAST, VALID_CLOZE))
    const result = await generateGrammarExercises([PATTERN_BUKAN], POOL, { generateFn: fakeFn })
    expect(fakeFn).toHaveBeenCalledOnce()
    expect(result.generatedCount).toBe(2)
    expect(result.candidatesByPatternSlug.get('l4-bukan-negatie')).toHaveLength(2)
  })

  it('DROPS a constraint-violating candidate, never returns it for write', async () => {
    const badContrast: GrammarExerciseCandidate = {
      ...VALID_CONTRAST,
      payload: { ...VALID_CONTRAST.payload, correctOptionId: 'ghost' },
    }
    const fakeFn = vi.fn().mockResolvedValue(candidateJson(badContrast, VALID_CLOZE))
    const result = await generateGrammarExercises([PATTERN_BUKAN], POOL, { generateFn: fakeFn })
    expect(result.generatedCount).toBe(1)
    expect(result.droppedCount).toBe(1)
    const kept = result.candidatesByPatternSlug.get('l4-bukan-negatie')!
    expect(kept).toHaveLength(1)
    expect(kept[0].exercise_type).toBe('choose_missing_word_ex')
  })

  it('warn-and-skips a pattern that yields zero valid candidates', async () => {
    // Rules-only reference pattern → LLM returns [] (nothing drill-worthy).
    const fakeFn = vi.fn().mockResolvedValue('[]')
    const result = await generateGrammarExercises([PATTERN_RULES_ONLY], POOL, { generateFn: fakeFn })
    expect(result.generatedCount).toBe(0)
    expect(result.skippedPatternSlugs).toEqual(['l4-duur'])
    expect(result.candidatesByPatternSlug.has('l4-duur')).toBe(false)
  })

  it('forces each candidate slug to the pattern being generated (anti-hallucination)', async () => {
    const wrongSlug: GrammarExerciseCandidate = {
      ...VALID_CLOZE,
      grammar_pattern_slug: 'some-hallucinated-slug',
    }
    const fakeFn = vi.fn().mockResolvedValue(candidateJson(wrongSlug))
    const result = await generateGrammarExercises([PATTERN_BUKAN], POOL, { generateFn: fakeFn })
    const kept = result.candidatesByPatternSlug.get('l4-bukan-negatie')!
    expect(kept).toHaveLength(1)
    expect(kept[0].grammar_pattern_slug).toBe('l4-bukan-negatie')
  })

  it('generates per-pattern: one Claude call per pattern, accumulates results', async () => {
    const fakeFn = vi.fn().mockImplementation(async (prompt: string) => {
      // Echo a valid cloze for whichever pattern slug is in the prompt.
      const slug = prompt.includes('l4-duur') ? 'l4-duur' : 'l4-bukan-negatie'
      return candidateJson({ ...VALID_CLOZE, grammar_pattern_slug: slug })
    })
    const result = await generateGrammarExercises([PATTERN_BUKAN, PATTERN_RULES_ONLY], POOL, {
      generateFn: fakeFn,
    })
    expect(fakeFn).toHaveBeenCalledTimes(2)
    expect(result.generatedCount).toBe(2)
    expect(result.candidatesByPatternSlug.size).toBe(2)
  })

  it('handles a malformed generateFn response as a skipped pattern', async () => {
    const fakeFn = vi.fn().mockResolvedValue('not json')
    const result = await generateGrammarExercises([PATTERN_BUKAN], POOL, { generateFn: fakeFn })
    expect(result.generatedCount).toBe(0)
    expect(result.skippedPatternSlugs).toEqual(['l4-bukan-negatie'])
  })
})
