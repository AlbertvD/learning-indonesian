import { describe, it, expect } from 'vitest'
import { runCountParity } from '../../verify/countParity'
import { runContentNonEmpty } from '../../verify/contentNonEmpty'
import { runSeedIntegrity } from '../../verify/seedIntegrity'

interface MockTable {
  rows: Array<Record<string, unknown>>
  /** Optional count override; if set, head:true count returns this. */
  countOverride?: number
}

function buildMockSupabase(tables: Record<string, MockTable>) {
  return {
    schema: () => ({
      from: (table: string) => ({
        select: (_cols: string, opts?: { count?: 'exact'; head?: boolean }) => {
          const t = tables[table] ?? { rows: [] }
          let current = [...t.rows]
          const buildResult = () => ({
            data: current,
            error: null,
            count: opts?.count ? (t.countOverride ?? current.length) : undefined,
          })
          const chain: any = {
            eq: (col: string, val: unknown) => {
              current = current.filter((r) => r[col] === val)
              return chain
            },
            in: (col: string, vals: unknown[]) => {
              current = current.filter((r) => vals.includes(r[col]))
              return chain
            },
            ilike: () => chain,
            limit: () => chain,
            order: () => chain,
            maybeSingle: async () => ({ data: current[0] ?? null, error: null }),
            single: async () => ({ data: current[0] ?? null, error: null }),
            then: (resolve: (v: ReturnType<typeof buildResult>) => unknown) => resolve(buildResult()),
          }
          return chain
        },
      }),
    }),
  } as unknown as Parameters<typeof runCountParity>[0]
}

describe('CS7 countParity — db_count >= declaredCount per #21', () => {
  it('passes when DB count meets declared count', async () => {
    const supabase = buildMockSupabase({
      content_units: { rows: [], countOverride: 10 },
      grammar_patterns: { rows: [], countOverride: 5 },
      exercise_variants: { rows: [], countOverride: 3 },
    })
    const findings = await runCountParity(supabase, {
      lessonId: 'lesson-9-uuid',
      lessonSourceRef: 'lesson-9',
      declared: {
        contentUnits: 10,
        grammarPatterns: 5,
        capabilities: 0,
        capabilityArtifacts: 0,
        learningItems: 0,
        exerciseVariants: 3,
        clozeContexts: 0,
      },
    })
    expect(findings).toEqual([])
  })

  it('fails CS7 when DB count is below declared count', async () => {
    const supabase = buildMockSupabase({
      content_units: { rows: [], countOverride: 5 },
      grammar_patterns: { rows: [], countOverride: 0 },
      exercise_variants: { rows: [], countOverride: 0 },
    })
    const findings = await runCountParity(supabase, {
      lessonId: 'lesson-9-uuid',
      lessonSourceRef: 'lesson-9',
      declared: {
        contentUnits: 10,
        grammarPatterns: 5,
        capabilities: 0,
        capabilityArtifacts: 0,
        learningItems: 0,
        exerciseVariants: 3,
        clozeContexts: 0,
      },
    })
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.every((f) => f.gate === 'CS7' && f.severity === 'error')).toBe(true)
  })

  it('passes on re-run (DB count exceeds declared) — strict-equality would flake here', async () => {
    const supabase = buildMockSupabase({
      content_units: { rows: [], countOverride: 25 }, // already had rows from prior run
      grammar_patterns: { rows: [], countOverride: 8 },
      exercise_variants: { rows: [], countOverride: 5 },
    })
    const findings = await runCountParity(supabase, {
      lessonId: 'lesson-9-uuid',
      lessonSourceRef: 'lesson-9',
      declared: {
        contentUnits: 10,
        grammarPatterns: 5,
        capabilities: 0,
        capabilityArtifacts: 0,
        learningItems: 0,
        exerciseVariants: 3,
        clozeContexts: 0,
      },
    })
    expect(findings).toEqual([])
  })
})

describe('CS8 contentNonEmpty — required field presence checks per #22', () => {
  it('passes when no row IDs are provided (lesson with no writes is trivially clean)', async () => {
    const supabase = buildMockSupabase({})
    const findings = await runContentNonEmpty(supabase, {
      contentUnitIds: [],
      capabilityIds: [],
      capabilityArtifactIds: [],
      learningItemIds: [],
      exerciseVariantIds: [],
      grammarPatternIds: [],
    })
    expect(findings).toEqual([])
  })

  it('flags learning_capabilities rows missing canonical_key', async () => {
    const supabase = buildMockSupabase({
      learning_capabilities: {
        rows: [
          { id: 'cap-1', canonical_key: '', capability_type: 'text_recognition', source_ref: 'learning_items/halo' },
        ],
      },
    })
    const findings = await runContentNonEmpty(supabase, {
      contentUnitIds: [],
      capabilityIds: ['cap-1'],
      capabilityArtifactIds: [],
      learningItemIds: [],
      exerciseVariantIds: [],
      grammarPatternIds: [],
    })
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].gate).toBe('CS8')
    expect(findings[0].context?.table).toBe('learning_capabilities')
  })
})

describe('CS9 seedIntegrity — non-dialogue reviewability cross-check (legacy 805–923)', () => {
  it('passes when every non-dialogue item has an NL meaning', async () => {
    const supabase = buildMockSupabase({
      item_meanings: {
        rows: [
          { learning_item_id: 'item-1', translation_language: 'nl' },
          { learning_item_id: 'item-2', translation_language: 'nl' },
        ],
      },
      item_contexts: {
        rows: [
          { id: 'ctx-1', learning_item_id: 'item-1' },
          { id: 'ctx-2', learning_item_id: 'item-2' },
        ],
      },
      exercise_variants: { rows: [] },
    })
    const report = await runSeedIntegrity(supabase, {
      publishedItemIds: ['item-1', 'item-2'],
      dialogueItemIds: new Set(),
    })
    expect(report.findings).toEqual([])
    expect(report.totals.nonDialogueCount).toBe(2)
  })

  it('flags non-dialogue items missing both NL meaning AND active variant (the 2026-04-24 incident)', async () => {
    const supabase = buildMockSupabase({
      // item-2 has no NL meaning row.
      item_meanings: { rows: [{ learning_item_id: 'item-1', translation_language: 'nl' }] },
      item_contexts: {
        rows: [
          { id: 'ctx-1', learning_item_id: 'item-1' },
          { id: 'ctx-2', learning_item_id: 'item-2' },
        ],
      },
      // No active exercise_variants on item-2's context.
      exercise_variants: { rows: [] },
    })
    const report = await runSeedIntegrity(supabase, {
      publishedItemIds: ['item-1', 'item-2'],
      dialogueItemIds: new Set(),
    })
    expect(report.findings.length).toBeGreaterThan(0)
    expect(report.findings.every((f) => f.gate === 'CS9')).toBe(true)
  })

  it('skips dialogue_chunk items from the non-dialogue reviewability check', async () => {
    const supabase = buildMockSupabase({
      // No NL meanings for item-2 (a dialogue chunk).
      item_meanings: { rows: [{ learning_item_id: 'item-1', translation_language: 'nl' }] },
      item_contexts: {
        rows: [
          { id: 'ctx-1', learning_item_id: 'item-1' },
          { id: 'ctx-2', learning_item_id: 'item-2' },
        ],
      },
      exercise_variants: { rows: [] },
    })
    const report = await runSeedIntegrity(supabase, {
      publishedItemIds: ['item-1', 'item-2'],
      dialogueItemIds: new Set(['item-2']),
    })
    // item-2 (dialogue) is exempt; item-1 (non-dialogue) has NL → green.
    expect(report.findings).toEqual([])
  })
})
