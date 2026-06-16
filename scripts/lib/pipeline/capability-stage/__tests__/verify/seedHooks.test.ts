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
      declared: {
        contentUnits: 10,
        grammarPatterns: 5,
        capabilities: 0,
        learningItems: 0,
        exerciseVariants: 3,
        clozeContexts: 0,
      },
      contentUnitIds: Array.from({ length: 10 }, (_, i) => `unit-${i}`),
      capabilityIds: [],
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
      declared: {
        contentUnits: 10,
        grammarPatterns: 5,
        capabilities: 0,
        learningItems: 0,
        exerciseVariants: 3,
        clozeContexts: 0,
      },
      contentUnitIds: Array.from({ length: 10 }, (_, i) => `unit-${i}`),
      capabilityIds: [],
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
      declared: {
        contentUnits: 10,
        grammarPatterns: 5,
        capabilities: 0,
        learningItems: 0,
        exerciseVariants: 3,
        clozeContexts: 0,
      },
      contentUnitIds: Array.from({ length: 10 }, (_, i) => `unit-${i}`),
      capabilityIds: [],
    })
    expect(findings).toEqual([])
  })

  // The 2026-05-13 regression: lesson-9 has 112 content_units, of which only 9
  // carry source_ref="lesson-9". The prior implementation filtered by source_ref
  // and reported 9 vs declared 112 — a false positive. By-ID verification
  // counts all 112 via .in('id', contentUnitIds) and passes correctly.
  it('counts content_units by ID — including mixed source_ref shapes', async () => {
    const contentUnitIds = [
      // 9 lesson-section rows (source_ref="lesson-9")
      ...Array.from({ length: 9 }, (_, i) => `section-${i}`),
      // 100 vocab item rows (source_ref="learning_items/<base>")
      ...Array.from({ length: 100 }, (_, i) => `item-${i}`),
      // 3 grammar pattern rows (source_ref="lesson-9/pattern-<slug>")
      ...Array.from({ length: 3 }, (_, i) => `pattern-${i}`),
    ]
    const supabase = buildMockSupabase({
      content_units: {
        rows: contentUnitIds.map((id) => ({ id })),
      },
    })
    const findings = await runCountParity(supabase, {
      lessonId: 'lesson-9-uuid',
      declared: {
        contentUnits: 112,
        grammarPatterns: 0,
        capabilities: 0,
        learningItems: 0,
        exerciseVariants: 0,
        clozeContexts: 0,
      },
      contentUnitIds,
      capabilityIds: [],
    })
    expect(findings).toEqual([])
  })

  it('verifies learning_capabilities by ID — every declared capability must be in DB', async () => {
    const capabilityIds = Array.from({ length: 10 }, (_, i) => `cap-${i}`)
    const supabase = buildMockSupabase({
      // Only 7 of the 10 declared capabilities are actually in DB.
      learning_capabilities: {
        rows: capabilityIds.slice(0, 7).map((id) => ({ id })),
      },
    })
    const findings = await runCountParity(supabase, {
      lessonId: 'lesson-9-uuid',
      declared: {
        contentUnits: 0,
        grammarPatterns: 0,
        capabilities: 10,
        learningItems: 0,
        exerciseVariants: 0,
        clozeContexts: 0,
      },
      contentUnitIds: [],
      capabilityIds,
    })
    expect(findings.length).toBe(1)
    expect(findings[0].context?.table).toBe('learning_capabilities')
  })

})

describe('CS8 contentNonEmpty — required field presence checks per #22', () => {
  it('passes when no row IDs are provided (lesson with no writes is trivially clean)', async () => {
    const supabase = buildMockSupabase({})
    const findings = await runContentNonEmpty(supabase, {
      contentUnitIds: [],
      capabilityIds: [],
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
          { id: 'cap-1', canonical_key: '', capability_type: 'recognise_meaning_from_text_cap', source_ref: 'learning_items/halo' },
        ],
      },
    })
    const findings = await runContentNonEmpty(supabase, {
      contentUnitIds: [],
      capabilityIds: ['cap-1'],
      learningItemIds: [],
      exerciseVariantIds: [],
      grammarPatternIds: [],
    })
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].gate).toBe('CS8')
    expect(findings[0].context?.table).toBe('learning_capabilities')
  })

  it('does NOT flag content_units with empty payload_json (Decision E — {} is intentional on the DB-native builder)', async () => {
    const supabase = buildMockSupabase({
      content_units: {
        rows: [
          { id: 'cu-1', content_unit_key: 'lesson-1::sec::item-halo', unit_kind: 'learning_item', payload_json: {} },
          { id: 'cu-2', content_unit_key: 'lesson-1::grammar::pattern-l1-x', unit_kind: 'grammar_pattern', payload_json: {} },
        ],
      },
    })
    const findings = await runContentNonEmpty(supabase, {
      contentUnitIds: ['cu-1', 'cu-2'],
      capabilityIds: [],
      learningItemIds: [],
      exerciseVariantIds: [],
      grammarPatternIds: [],
    })
    // payload_json={} must NOT trip CS8 — the column is unread + being retired (Decision E).
    expect(findings).toEqual([])
  })

  it('still flags content_units missing content_unit_key or unit_kind', async () => {
    const supabase = buildMockSupabase({
      content_units: {
        rows: [
          { id: 'cu-bad-key', content_unit_key: '', unit_kind: 'learning_item', payload_json: {} },
          { id: 'cu-bad-kind', content_unit_key: 'k', unit_kind: '', payload_json: {} },
        ],
      },
    })
    const findings = await runContentNonEmpty(supabase, {
      contentUnitIds: ['cu-bad-key', 'cu-bad-kind'],
      capabilityIds: [],
      learningItemIds: [],
      exerciseVariantIds: [],
      grammarPatternIds: [],
    })
    expect(findings.length).toBe(2)
    expect(findings.every((f) => f.gate === 'CS8' && f.context?.table === 'content_units')).toBe(true)
  })
})

describe('CS9 seedIntegrity — non-dialogue reviewability cross-check (legacy 805–923)', () => {
  it('passes when every non-dialogue item has translation_nl in learning_items', async () => {
    const supabase = buildMockSupabase({
      // Decision R (PR 1): NL coverage read from learning_items.translation_nl.
      learning_items: {
        rows: [
          { id: 'item-1', translation_nl: 'boek', translation_en: 'book' },
          { id: 'item-2', translation_nl: 'pen', translation_en: 'pen' },
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

  it('flags non-dialogue items missing both translation_nl AND active variant (the 2026-04-24 incident)', async () => {
    const supabase = buildMockSupabase({
      // item-2 has no translation_nl (null) — no NL coverage.
      learning_items: {
        rows: [
          { id: 'item-1', translation_nl: 'boek', translation_en: 'book' },
          { id: 'item-2', translation_nl: null, translation_en: 'pen' },
        ],
      },
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
      // item-2 (dialogue chunk) has no translation_nl but is exempt from the check.
      learning_items: {
        rows: [
          { id: 'item-1', translation_nl: 'boek', translation_en: 'book' },
          { id: 'item-2', translation_nl: null, translation_en: 'hello' },
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
      dialogueItemIds: new Set(['item-2']),
    })
    // item-2 (dialogue) is exempt; item-1 (non-dialogue) has translation_nl → green.
    expect(report.findings).toEqual([])
  })
})
