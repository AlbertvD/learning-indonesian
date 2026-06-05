/**
 * gate.test.ts — Unit tests for runCapabilityGatePreWrite and
 * runCapabilityGatePostWrite.
 *
 * Strategy: feed the same fixture inputs the runner feeds and assert that
 * the gate returns exactly the same findings the inline calls produced.
 * This is the regression guard for the no-behaviour-change refactor — if
 * any test breaks, a behaviour change occurred; investigate rather than
 * paper over.
 */

import { describe, it, expect } from 'vitest'
import {
  runCapabilityGatePreWrite,
  runCapabilityGatePostWrite,
  type CapabilityGatePreWriteInput,
  type CapabilityGatePostWriteInput,
} from '../gate'
import { validateGrammarPattern } from '../validators/grammarPattern'
import { validateCandidatePayload } from '../validators/candidatePayload'
import { validateGrammarExercises } from '../validators/grammarExercises'
import { validatePerItemMeaning } from '../validators/perItemMeaning'
import { validateItemTranslations } from '../validators/itemTranslations'
import { validatePosTags } from '../validators/pos'
import type { ValidationFinding } from '../model'

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

function validGrammarPattern() {
  return { slug: 'me-verb', pattern_name: 'Me- verb formation', complexity_score: 1 }
}

function validCandidate() {
  return {
    exercise_type: 'contrast_pair',
    review_status: 'approved',
    payload: {
      promptText: 'Choose the correct form',
      targetMeaning: 'to read',
      options: [
        { id: 'a', text: 'membaca' },
        { id: 'b', text: 'menulis' },
      ],
      correctOptionId: 'a',
      explanationText: 'membaca means to read',
    },
  }
}

function validItem() {
  return {
    base_text: 'buku',
    item_type: 'word',
    context_type: 'vocabulary_list',
    translation_nl: 'boek',
    translation_en: 'book',
    pos: 'noun',
  }
}

function minimalPreWriteInput(
  overrides: Partial<CapabilityGatePreWriteInput> = {},
): CapabilityGatePreWriteInput {
  return {
    grammarPatterns: [validGrammarPattern()],
    candidates: [validCandidate()],
    learningItems: [validItem()],
    mode: 'publish',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock Supabase for post-write gate (CS7/CS8/CS9)
// ---------------------------------------------------------------------------

interface MockTable {
  rows: Array<Record<string, unknown>>
  countOverride?: number
}

function buildMockSupabase(tables: Record<string, MockTable>) {
  return {
    schema: () => ({
      from: (table: string) => {
        const t = tables[table] ?? { rows: [] }
        let current = [...t.rows]
        const buildResult = () => ({
          data: current,
          error: null,
          count: t.countOverride ?? current.length,
        })
        const chain: Record<string, unknown> = {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          select: (_cols: string, _opts?: unknown) => {
            current = [...t.rows]
            return chain
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          eq: (_col: string, _val: unknown) => {
            current = t.rows
            return chain
          },
          in: (col: string, vals: unknown[]) => {
            current = t.rows.filter((r) => vals.includes(r[col]))
            return chain
          },
          ilike: () => chain,
          limit: () => chain,
          order: () => chain,
          maybeSingle: async () => ({ data: current[0] ?? null, error: null }),
          single: async () => ({ data: current[0] ?? null, error: null }),
          then: (resolve: (v: ReturnType<typeof buildResult>) => unknown) =>
            resolve(buildResult()),
        }
        return chain
      },
    }),
  }
}

function minimalPostWriteInput(
  overrides: Partial<CapabilityGatePostWriteInput> = {},
): CapabilityGatePostWriteInput {
  return {
    lessonId: 'lesson-uuid-1',
    declared: {
      contentUnits: 0,
      grammarPatterns: 0,
      capabilities: 0,
      learningItems: 0,
      exerciseVariants: 0,
      clozeContexts: 0,
    },
    contentUnitIds: [],
    capabilityIds: [],
    capabilityArtifactIds: [],
    learningItemIds: [],
    exerciseVariantIds: [],
    grammarPatternIds: [],
    publishedItemIds: [],
    dialogueItemIds: new Set(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Pre-write gate -- CS3/CS4/CS4b/CS5/CS6
// ---------------------------------------------------------------------------

describe('runCapabilityGatePreWrite', () => {
  it('returns no findings for a clean fixture', () => {
    const findings = runCapabilityGatePreWrite(minimalPreWriteInput())
    expect(findings).toEqual([])
  })

  describe('CS6 -- grammar pattern validator', () => {
    it('emits CS6 error when slug is missing', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          grammarPatterns: [{ slug: '', pattern_name: 'Me- verb', complexity_score: 1 }],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS6' && f.severity === 'error')).toBe(true)
    })

    it('emits CS6 error when slug has uppercase', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          grammarPatterns: [{ slug: 'Me-Verb', pattern_name: 'Me- verb', complexity_score: 1 }],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS6' && f.severity === 'error')).toBe(true)
    })

    it('emits CS6 error for duplicate slugs', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          grammarPatterns: [
            { slug: 'me-verb', pattern_name: 'Pattern A', complexity_score: 1 },
            { slug: 'me-verb', pattern_name: 'Pattern B', complexity_score: 2 },
          ],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS6' && f.severity === 'error')).toBe(true)
    })
  })

  describe('CS3 -- candidate payload validator', () => {
    it('emits CS3 error when exercise_type is missing', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          candidates: [{ exercise_type: '', payload: {} }],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS3' && f.severity === 'error')).toBe(true)
    })

    it('emits CS3 error for unknown exercise_type', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          candidates: [{ exercise_type: 'unknown_type', payload: {} }],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS3' && f.severity === 'error')).toBe(true)
    })

    it('emits CS3 error when payload is missing', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          candidates: [{ exercise_type: 'contrast_pair', payload: null }],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS3' && f.severity === 'error')).toBe(true)
    })
  })

  describe('CS13 -- grammar exercise typed-row validator', () => {
    it('emits CS13 error when contrast_pair options shape is wrong', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          candidates: [
            {
              exercise_type: 'contrast_pair',
              review_status: 'approved',
              payload: {
                // Missing required fields: prompt_text, target_meaning, explanation_text
                options: [{ id: 'a', text: 'membaca' }],
                correctOptionId: 'a',
              },
            },
          ],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS13' && f.severity === 'error')).toBe(true)
    })
  })

  describe('CS4 -- per-item meaning validator', () => {
    it('emits CS4 error when context_type is invalid', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          learningItems: [
            {
              base_text: 'buku',
              item_type: 'word',
              context_type: 'invalid_type',
              translation_nl: 'boek',
              translation_en: 'book',
              pos: 'noun',
            },
          ],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS4' && f.severity === 'error')).toBe(true)
    })
  })

  describe('CS4b -- item translation validator', () => {
    it('emits CS4b error when translation_nl is missing for non-dialogue item', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          learningItems: [
            {
              base_text: 'buku',
              item_type: 'word',
              context_type: 'vocabulary_list',
              translation_nl: '',
              translation_en: 'book',
              pos: 'noun',
            },
          ],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS4b' && f.severity === 'error')).toBe(true)
    })

    it('emits CS4b warning when translation_en is missing', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          learningItems: [
            {
              base_text: 'buku',
              item_type: 'word',
              context_type: 'vocabulary_list',
              translation_nl: 'boek',
              translation_en: '',
              pos: 'noun',
            },
          ],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS4b' && f.severity === 'warning')).toBe(true)
    })

    it('does NOT emit CS4b error for dialogue_chunk even without translation_nl', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          learningItems: [
            {
              base_text: 'Selamat pagi',
              item_type: 'dialogue_chunk',
              context_type: 'dialogue',
              translation_nl: '',
              translation_en: 'Good morning',
              pos: null,
            },
          ],
        }),
      )
      expect(findings.filter((f) => f.gate === 'CS4b' && f.severity === 'error')).toHaveLength(0)
    })
  })

  describe('CS19 -- separator convention validator', () => {
    it('emits CS19 error when translation_nl uses ";" as an alternatives separator', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          learningItems: [
            {
              base_text: 'bapak',
              item_type: 'word',
              context_type: 'vocabulary_list',
              translation_nl: 'vader; meneer',
              translation_en: 'father',
              pos: 'noun',
            },
          ],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS19' && f.severity === 'error')).toBe(true)
    })

    it('does NOT emit CS19 for a canonical "/"-separated translation', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          learningItems: [
            {
              base_text: 'huis',
              item_type: 'word',
              context_type: 'vocabulary_list',
              translation_nl: 'huis / woning',
              translation_en: 'house',
              pos: 'noun',
            },
          ],
        }),
      )
      expect(findings.filter((f) => f.gate === 'CS19')).toHaveLength(0)
    })
  })

  describe('CS5 -- POS validator', () => {
    it('emits CS5 warning for missing pos on word item', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          learningItems: [
            {
              base_text: 'buku',
              item_type: 'word',
              context_type: 'vocabulary_list',
              translation_nl: 'boek',
              translation_en: 'book',
              pos: null,
            },
          ],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS5' && f.severity === 'warning')).toBe(true)
    })

    it('emits CS5 error for an invalid pos value', () => {
      const findings = runCapabilityGatePreWrite(
        minimalPreWriteInput({
          learningItems: [
            {
              base_text: 'buku',
              item_type: 'word',
              context_type: 'vocabulary_list',
              translation_nl: 'boek',
              translation_en: 'book',
              pos: 'NOT_VALID_POS',
            },
          ],
        }),
      )
      expect(findings.some((f) => f.gate === 'CS5' && f.severity === 'error')).toBe(true)
    })
  })

  describe('mode flexes severity', () => {
    // In pre-flight mode the gate still runs the same checks -- mode only affects
    // severity flex in the lesson gate (enriched translations). For the capability
    // gate, mode is wired but today the same severity applies in both modes
    // (no async-enriched columns need relaxing at capability-stage pre-flight).
    it('returns the same findings in pre-flight mode as in publish mode for a clean fixture', () => {
      const publish = runCapabilityGatePreWrite(minimalPreWriteInput({ mode: 'publish' }))
      const preFlight = runCapabilityGatePreWrite(minimalPreWriteInput({ mode: 'pre-flight' }))
      expect(publish).toEqual(preFlight)
    })
  })
})

// ---------------------------------------------------------------------------
// Post-write gate -- CS7/CS8/CS9
// ---------------------------------------------------------------------------

describe('runCapabilityGatePostWrite', () => {
  it('returns no findings when no items were published and all declared counts are 0', async () => {
    const supabase = buildMockSupabase({
      content_units: { rows: [], countOverride: 0 },
      learning_capabilities: { rows: [], countOverride: 0 },
      grammar_patterns: { rows: [], countOverride: 0 },
      exercise_variants: { rows: [], countOverride: 0 },
      learning_items: { rows: [], countOverride: 0 },
      item_contexts: { rows: [], countOverride: 0 },
    })
    const findings = await runCapabilityGatePostWrite(
      supabase as Parameters<typeof runCapabilityGatePostWrite>[0],
      minimalPostWriteInput(),
    )
    // No published items -> CS7/CS8/CS9 produce no errors for empty sets
    expect(findings.filter((f) => f.severity === 'error')).toHaveLength(0)
  })

  it('returns CS7 error when DB count is below declared count', async () => {
    const supabase = buildMockSupabase({
      content_units: { rows: [], countOverride: 3 },
      learning_capabilities: { rows: [], countOverride: 0 },
      grammar_patterns: { rows: [], countOverride: 0 },
      exercise_variants: { rows: [], countOverride: 0 },
      learning_items: { rows: [] },
      item_contexts: { rows: [] },
    })

    // Declared 5 content_units but mock returns 3
    const findings = await runCapabilityGatePostWrite(
      supabase as Parameters<typeof runCapabilityGatePostWrite>[0],
      minimalPostWriteInput({
        declared: {
          contentUnits: 5,
          grammarPatterns: 0,
          capabilities: 0,
          learningItems: 0,
          exerciseVariants: 0,
          clozeContexts: 0,
        },
        contentUnitIds: ['id-1', 'id-2', 'id-3', 'id-4', 'id-5'],
      }),
    )
    expect(findings.some((f) => f.gate === 'CS7' && f.severity === 'error')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Regression: pre-write findings are the same whether called via the gate
// or via the original inline calls
// ---------------------------------------------------------------------------

describe('gate findings == inline calls findings (regression)', () => {
  it('produces the same findings the inline validator calls produce', () => {
    const patterns = [
      { slug: 'me-verb', pattern_name: 'Pattern', complexity_score: 1 },
      { slug: 'BAD-SLUG', pattern_name: 'Bad', complexity_score: 2 },
    ]
    const candidates = [validCandidate()]
    const items = [validItem()]

    // Inline calls (what the runner used to do)
    const inlineFindings: ValidationFinding[] = []
    inlineFindings.push(...validateGrammarPattern(patterns))
    inlineFindings.push(...validateCandidatePayload(candidates))
    inlineFindings.push(...validateGrammarExercises(candidates))
    inlineFindings.push(...validatePerItemMeaning(items))
    inlineFindings.push(...validateItemTranslations(items))
    inlineFindings.push(...validatePosTags(items).findings)

    // Gate call
    const gateFindings = runCapabilityGatePreWrite({
      grammarPatterns: patterns,
      candidates,
      learningItems: items,
      mode: 'publish',
    })

    expect(gateFindings).toEqual(inlineFindings)
  })
})
