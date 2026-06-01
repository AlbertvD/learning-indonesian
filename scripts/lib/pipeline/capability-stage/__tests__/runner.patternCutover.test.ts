/**
 * runner.patternCutover.test.ts — Slice 2 Task 6 runner wiring for the pattern path.
 *
 * The plan's required NO-DOUBLE-WRITE assertion, at the runner level:
 *   When the lesson HAS typed grammar categories (usePatternPath), the regenerated
 *   staging bundle's `sourceKind: 'pattern'` caps (LEGACY slugs) are EXCLUDED from
 *   the legacy upsertCapabilities path — the new pattern path owns them — while the
 *   NEW pattern caps (new slugs) are written via skip-if-exists. This is the
 *   sourceKind filter that replaces the plan's broken exact-key filter (OQ2-5 made
 *   the keys disjoint). Also asserts usePatternPath=false leaves the legacy path on.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { enrichMissingPosMock } = vi.hoisted(() => ({
  enrichMissingPosMock: vi.fn().mockResolvedValue({ posByBaseText: new Map<string, string>(), enrichedCount: 0 }),
}))
vi.mock('../enrichPos', () => ({ enrichMissingPos: enrichMissingPosMock }))

import { runCapabilityStage } from '../runner'
import type { LoadedLesson } from '../loader'
import type { PatternDbResult, TypedGrammarCategory } from '../loadFromDb'

// ---------------------------------------------------------------------------
// Mock Supabase — records ops, returns plausible rows for every chain the
// pattern path + item path use. Generic enough that the pattern writes flow.
// ---------------------------------------------------------------------------

interface RecordedOp {
  table: string
  op: 'upsert' | 'insert' | 'delete' | 'update'
  payload?: Record<string, unknown> | Array<Record<string, unknown>>
  opts?: Record<string, unknown>
}

const TYPED_TABLES = ['contrast_pair_exercises', 'sentence_transformation_exercises', 'constrained_translation_exercises', 'cloze_mcq_exercises']

function buildMock() {
  const ops: RecordedOp[] = []
  let seq = 0
  const nextId = (p: string) => `${p}-${++seq}`
  // Track inserted typed-exercise rows so the CS18 coverage read reflects writes.
  const typedRows: Record<string, Array<{ grammar_pattern_id: string }>> = {
    contrast_pair_exercises: [], sentence_transformation_exercises: [],
    constrained_translation_exercises: [], cloze_mcq_exercises: [],
  }

  const fromBuilder = (table: string) => {
    let upsertOpts: Record<string, unknown> = {}
    let inCol: string | undefined
    let inVals: string[] = []
    const chain: any = {
      eq: () => chain,
      in: (col: string, vals: string[]) => { inCol = col; inVals = vals; return chain },
      is: () => chain,
      not: () => chain,
      ilike: () => chain,
      limit: () => chain,
      order: () => chain,
      range: () => Promise.resolve({ data: [], error: null, count: 0 }),
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: { id: nextId(table), slug: 'slug', canonical_key: 'key', normalized_text: 'nt' }, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        // CS18 coverage read: typed table .select('grammar_pattern_id').eq(is_active).in('grammar_pattern_id', ids)
        if (TYPED_TABLES.includes(table) && inCol === 'grammar_pattern_id') {
          const rows = typedRows[table].filter((r) => inVals.includes(r.grammar_pattern_id))
          return resolve({ data: rows, error: null })
        }
        return resolve({ data: [], error: null })
      },
    }
    return {
      select: () => chain,
      upsert: (payload: Record<string, unknown> | Array<Record<string, unknown>>, opts2?: Record<string, unknown>) => {
        upsertOpts = opts2 ?? {}
        ops.push({ table, op: 'upsert', payload, opts: upsertOpts })
        const rows = (Array.isArray(payload) ? payload : [payload]) as Array<Record<string, unknown>>
        // skip-if-exists path (item + pattern caps): return all as "inserted".
        if (table === 'learning_capabilities' && upsertOpts?.ignoreDuplicates === true) {
          const inserted = rows.map((r) => ({ ...r, id: nextId('cap') }))
          return { select: () => ({ then: (resolve: (v: unknown) => unknown) => resolve({ data: inserted, error: null }) }) }
        }
        const single = () => {
          const row = rows[0] ?? {}
          const id = nextId(table)
          return { data: { id, canonical_key: row.canonical_key, normalized_text: row.normalized_text }, error: null }
        }
        return {
          select: () => ({ single: async () => single(), then: (resolve: (v: unknown) => unknown) => resolve({ data: rows.map((r) => ({ ...r, id: nextId(table) })), error: null }) }),
          then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
        }
      },
      insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const row = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown>
        ops.push({ table, op: 'insert', payload: row })
        if (TYPED_TABLES.includes(table) && typeof row.grammar_pattern_id === 'string') {
          typedRows[table].push({ grammar_pattern_id: row.grammar_pattern_id })
        }
        return {
          select: () => ({ single: async () => ({ data: { id: nextId(table) }, error: null }) }),
          then: (resolve: (v: unknown) => unknown) => resolve({ error: null, data: { id: nextId(table) } }),
        }
      },
      update: (payload: Record<string, unknown>) => {
        ops.push({ table, op: 'update', payload })
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: nextId(table) }, error: null }) }), in: async () => ({ error: null }) }), in: async () => ({ error: null }) }
      },
      delete: () => {
        ops.push({ table, op: 'delete' })
        return { eq: () => ({ select: async () => ({ data: [], error: null }) }), in: async () => ({ error: null }) }
      },
    }
  }
  return { client: { schema: () => ({ from: fromBuilder }) }, ops }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir: string

function makeLesson(stagingDir: string): LoadedLesson {
  return {
    lesson: { id: 'lesson-uuid', module_id: 'module-1', order_index: 1, title: 'Test', level: 'A1', primary_voice: 'Achird' },
    sections: [
      {
        id: 'section-grammar', title: 'Grammatica', order_index: 0,
        content: { type: 'grammar', grammar_topics: ['Bukan-negatie'] },
      },
    ],
    audioClipsByNormalizedText: new Map(),
    staging: {
      stagingDir,
      learningItems: [],
      // A legacy grammar pattern → the regenerated bundle emits sourceKind:'pattern'
      // caps (LEGACY slug). These are what the cutover must exclude.
      grammarPatterns: [
        { slug: 'bukan-negation', pattern_name: 'Bukan negation', description: 'legacy', example: 'x', complexity_score: 2 },
      ],
      candidates: [],
      clozeContexts: [],
      contentUnits: [],
      capabilities: [],
      exerciseAssets: [],
      affixedFormPairs: [],
    },
  }
}

function category(title: string, order: number): TypedGrammarCategory {
  return {
    id: `cat-${order}`, section_id: 'section-grammar', lesson_id: 'lesson-uuid', display_order: order,
    title, title_en: null, rules: [`rule ${title}`], rules_en: [],
    examples: [{ indonesian: 'Ini bukan rumah.', dutch: 'Dit is geen huis.', english: null }],
  }
}

function emptyPatternDb(categories: TypedGrammarCategory[]): PatternDbResult {
  return {
    categories, topics: [],
    patternState: { existingPatternsBySlug: new Map(), existingPatternCapsByCanonicalKey: new Map(), exerciseCoverageByPatternId: new Map() },
  }
}

const NO_ITEMS = {
  items: [],
  itemState: { existingItemsByNormalizedText: new Map(), existingItemCapsByCanonicalKey: new Map() },
}

/** Generator emitting one valid candidate of ALL 4 types → full CS18 coverage. */
function fullGrammarGenerateFn(): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const slug = prompt.match(/pattern slug: (\S+)/)?.[1] ?? 'unknown'
    return JSON.stringify([
      { exercise_type: 'contrast_pair', grammar_pattern_slug: slug, payload: { promptText: 'p', targetMeaning: 'm', options: [{ id: 'bukan', text: 'bukan' }, { id: 'tidak', text: 'tidak' }], correctOptionId: 'bukan', explanationText: 'e' } },
      { exercise_type: 'sentence_transformation', grammar_pattern_slug: slug, payload: { sourceSentence: 's', transformationInstruction: 'i', hintText: null, acceptableAnswers: ['a'], explanationText: 'e' } },
      { exercise_type: 'constrained_translation', grammar_pattern_slug: slug, payload: { sourceLanguageSentence: 's', requiredTargetPattern: slug, disallowedShortcutForms: [], acceptableAnswers: ['a'], explanationText: 'e' } },
      { exercise_type: 'cloze_mcq', grammar_pattern_slug: slug, payload: { sentence: 'Ini ___ rumah.', translation: 't', options: ['bukan', 'tidak', 'belum', 'jangan'], correctOptionId: 'bukan', explanationText: 'e' } },
    ])
  }
}

/** Generator emitting only 2 of 4 types → CS18 pattern_typed_row_missing. */
function partialGrammarGenerateFn(): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const slug = prompt.match(/pattern slug: (\S+)/)?.[1] ?? 'unknown'
    return JSON.stringify([
      { exercise_type: 'contrast_pair', grammar_pattern_slug: slug, payload: { promptText: 'p', targetMeaning: 'm', options: [{ id: 'bukan', text: 'bukan' }, { id: 'tidak', text: 'tidak' }], correctOptionId: 'bukan', explanationText: 'e' } },
      { exercise_type: 'cloze_mcq', grammar_pattern_slug: slug, payload: { sentence: 'Ini ___ rumah.', translation: 't', options: ['bukan', 'tidak', 'belum', 'jangan'], correctOptionId: 'bukan', explanationText: 'e' } },
    ])
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runner pattern cutover (Task 6)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-pattern-cutover-'))
    enrichMissingPosMock.mockResolvedValue({ posByBaseText: new Map<string, string>(), enrichedCount: 0 })
  })
  afterEach(() => { if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('NO-DOUBLE-WRITE: legacy pattern caps are excluded from upsertCapabilities; new pattern caps written via skip-if-exists', async () => {
    const { client, ops } = buildMock()

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLesson(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => NO_ITEMS,
        fetchDistractorPool: async () => [],
        loadPatternFromDb: async () => emptyPatternDb([category('Bukan-negatie', 0)]),
        generateGrammarFn: fullGrammarGenerateFn(),
        generateFn: async () => '[]',
      },
    )
    expect(['ok', 'partial']).toContain(result.status)

    // Legacy upserts (no ignoreDuplicates) must contain NO sourceKind:'pattern' cap.
    const legacyCapUpserts = ops.filter(
      (op) => op.table === 'learning_capabilities' && op.op === 'upsert' && !(op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates,
    )
    for (const op of legacyCapUpserts) {
      const rows = Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>]
      for (const r of rows) expect(r?.source_kind).not.toBe('pattern')
    }

    // New pattern caps written via skip-if-exists, with the NEW slug source_ref.
    const skipIfExists = ops.filter(
      (op) => op.table === 'learning_capabilities' && op.op === 'upsert' && (op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates === true,
    )
    const patternCapRows = skipIfExists.flatMap((op) => (Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>]))
      .filter((r) => r?.source_kind === 'pattern')
    expect(patternCapRows.length).toBe(2) // pattern_recognition + pattern_contrast
    expect(patternCapRows.every((r) => String(r.source_ref).includes('pattern-l1-bukan-negatie'))).toBe(true)
  })

  it('writes new grammar_patterns + typed exercise rows + exercise_variants dual-write', async () => {
    const { client, ops } = buildMock()
    await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLesson(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => NO_ITEMS,
        fetchDistractorPool: async () => [],
        loadPatternFromDb: async () => emptyPatternDb([category('Bukan-negatie', 0)]),
        generateGrammarFn: fullGrammarGenerateFn(),
        generateFn: async () => '[]',
      },
    )
    expect(ops.some((o) => o.table === 'grammar_patterns' && o.op === 'upsert')).toBe(true)
    // The generator returned all 4 types → all 4 typed tables written.
    for (const t of TYPED_TABLES) expect(ops.some((o) => o.table === t && o.op === 'insert')).toBe(true)
    // exercise_variants dual-write (kept until Task 8): 4 exercises × 1 pattern.
    expect(ops.filter((o) => o.table === 'exercise_variants' && o.op === 'insert').length).toBe(4)
  })

  it('CS18 wiring: a partial-coverage pattern (2 of 4 types) yields a pattern_typed_row_missing finding', async () => {
    const { client } = buildMock()
    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLesson(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => NO_ITEMS,
        fetchDistractorPool: async () => [],
        loadPatternFromDb: async () => emptyPatternDb([category('Bukan-negatie', 0)]),
        generateGrammarFn: partialGrammarGenerateFn(), // only 2 of 4 types
        generateFn: async () => '[]',
      },
    )
    const cs18 = result.findings.filter((f) => f.gate === 'CS18')
    expect(cs18.length).toBe(1)
    expect(cs18[0].message).toContain('pattern_typed_row_missing')
    // A CS18 error makes the run 'partial' (graceful — runtime renders what exists).
    expect(result.status).toBe('partial')
  })

  it('CS18 wiring: a full-coverage pattern (all 4 types) yields NO CS18 finding (status ok)', async () => {
    const { client } = buildMock()
    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLesson(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => NO_ITEMS,
        fetchDistractorPool: async () => [],
        loadPatternFromDb: async () => emptyPatternDb([category('Bukan-negatie', 0)]),
        generateGrammarFn: fullGrammarGenerateFn(),
        generateFn: async () => '[]',
      },
    )
    // Full per-type coverage → CS18 emits nothing. (Status may still be 'partial'
    // from CS7 count-parity, which this generic mock can't satisfy — not the point here.)
    expect(result.findings.filter((f) => f.gate === 'CS18')).toHaveLength(0)
  })

  it('usePatternPath=false (no typed categories): legacy pattern caps flow through unchanged', async () => {
    const { client, ops } = buildMock()
    await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      {
        loadLesson: async () => makeLesson(tmpDir),
        createSupabaseClient: () => client as never,
        loadFromDb: async () => NO_ITEMS,
        fetchDistractorPool: async () => [],
        loadPatternFromDb: async () => emptyPatternDb([]), // no categories
        generateGrammarFn: fullGrammarGenerateFn(),
        generateFn: async () => '[]',
      },
    )
    // No pattern path: no typed exercise inserts, and the legacy bundle's pattern
    // caps go through the normal upsert (some sourceKind:'pattern' present).
    expect(ops.some((o) => o.table === 'contrast_pair_exercises')).toBe(false)
    const legacyCapUpserts = ops.filter(
      (op) => op.table === 'learning_capabilities' && op.op === 'upsert' && !(op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates,
    )
    const anyPattern = legacyCapUpserts.flatMap((op) => (Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>]))
      .some((r) => r?.source_kind === 'pattern')
    expect(anyPattern).toBe(true)
  })
})
