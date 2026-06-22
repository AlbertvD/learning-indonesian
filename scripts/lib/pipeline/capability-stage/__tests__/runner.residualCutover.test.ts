/**
 * runner.residualCutover.test.ts — Slice 5a.5 residual-cutover assertions (#147).
 *
 * Four behavioral assertions for the new DB-native wiring (5a.5):
 *
 *   1. AFFIXED SECOND-CONSUMER GUARD (landmine #1):
 *      When fetchAffixedPairsFromDb returns ≥1 pair, the affixed_form_pairs
 *      table receives non-zero inserts (step 7c did NOT silently emit zero).
 *      Also asserts the staging-derived affixed caps are not double-written.
 *
 *   2. AUDIO IN NEW PATH:
 *      Covered by FIX1→5a.5 inversion in runner.itemCutover.test.ts.
 *
 *   3. CONTENT-UNITS DB-NATIVE GRAMMAR SLUG:
 *      In a usePatternPath lesson, the content_units upsert payload contains
 *      a grammar unit whose unit_slug is the pattern-path form
 *      (`pattern-l{N}-…`), NOT a legacy curated-slug form.
 *
 *   4. GRAMMAR JUNCTION BY SOURCE_REF (NO CS9 ORPHAN):
 *      The capability_content_units upsert contains a row linking a pattern
 *      cap to its grammar content_unit; no CS9 finding is emitted.
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
import type { PatternDbResult, TypedGrammarCategory, TypedAffixedPair } from '../loadFromDb'

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

interface RecordedOp {
  table: string
  op: 'upsert' | 'insert' | 'delete' | 'update'
  payload?: Record<string, unknown> | Array<Record<string, unknown>>
  opts?: Record<string, unknown>
}

const TYPED_TABLES = ['contrast_pair_exercises', 'sentence_transformation_exercises', 'constrained_translation_exercises', 'cloze_mcq_exercises']

/**
 * Mock that:
 *  - Returns proper `unit_slug` from content_units .single() so the grammar
 *    junction (step 6b) can resolve content_unit_id by source_ref.
 *  - Records all ops for assertion.
 */
function buildMock() {
  const ops: RecordedOp[] = []
  let seq = 0
  const nextId = (p: string) => `${p}-${++seq}`

  // Track content_unit rows so step 6b can look them up by unit_slug.
  // Key: unit_slug → id
  const contentUnitIdsBySlug = new Map<string, string>()

  // Track inserted typed-exercise rows so the CS18 coverage read reflects writes.
  const typedRows: Record<string, Array<{ grammar_pattern_id: string }>> = {
    contrast_pair_exercises: [], sentence_transformation_exercises: [],
    constrained_translation_exercises: [], cloze_mcq_exercises: [],
  }

  // Track upserted cap IDs by canonical_key (for junction lookups).
  const capIdsByKey = new Map<string, string>()

  const fromBuilder = (table: string) => {
    let upsertOpts: Record<string, unknown> = {}
    let upsertPayload: Record<string, unknown> | Array<Record<string, unknown>> = {}
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
      single: async () => {
        if (table === 'content_units') {
          // Return the unit_slug from the upserted payload so the grammar
          // junction (step 6b) can resolve content_unit_id via unit_slug.
          const row = Array.isArray(upsertPayload) ? upsertPayload[0] : upsertPayload
          const unitSlug = row?.unit_slug as string | undefined
          const id = nextId('cu')
          if (unitSlug) contentUnitIdsBySlug.set(unitSlug, id)
          return { data: { id, unit_slug: unitSlug ?? '' }, error: null }
        }
        if (table === 'learning_capabilities') {
          const row = Array.isArray(upsertPayload) ? upsertPayload[0] : upsertPayload
          const key = row?.canonical_key as string | undefined
          const id = key ? (capIdsByKey.get(key) ?? nextId('cap')) : nextId('cap')
          if (key) capIdsByKey.set(key, id)
          return { data: { id, canonical_key: key }, error: null }
        }
        return { data: { id: nextId(table), slug: 'slug', canonical_key: 'key', normalized_text: 'nt' }, error: null }
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        // CS18 coverage read: typed table .select('grammar_pattern_id').eq(is_active).in('grammar_pattern_id', ids)
        if (TYPED_TABLES.includes(table) && inCol === 'grammar_pattern_id') {
          const rows = typedRows[table]?.filter((r) => inVals.includes(r.grammar_pattern_id)) ?? []
          return resolve({ data: rows, error: null })
        }
        // fetchSeededDistractorCapIds: recognition_mcq_distractors .in()
        if (table === 'recognition_mcq_distractors' && inCol === 'capability_id') {
          return resolve({ data: [], error: null })
        }
        return resolve({ data: [], error: null })
      },
    }

    return {
      select: () => chain,
      upsert: (payload: Record<string, unknown> | Array<Record<string, unknown>>, opts2?: Record<string, unknown>) => {
        upsertOpts = opts2 ?? {}
        upsertPayload = payload
        ops.push({ table, op: 'upsert', payload, opts: upsertOpts })
        const rows = (Array.isArray(payload) ? payload : [payload]) as Array<Record<string, unknown>>

        // skip-if-exists path (item + affixed caps written via upsertCapabilitiesSkipIfExists)
        if (table === 'learning_capabilities' && upsertOpts?.ignoreDuplicates === true) {
          const inserted = rows.map((r) => {
            const id = nextId('cap')
            const key = r.canonical_key as string | undefined
            if (key) capIdsByKey.set(key, id)
            return { ...r, id }
          })
          return {
            select: () => ({
              then: (resolve: (v: unknown) => unknown) => resolve({ data: inserted, error: null }),
            }),
          }
        }

        // Standard path — single row upsert (used by upsertCapabilities, upsertContentUnits)
        const single = async () => {
          const row = rows[0] ?? {}
          if (table === 'content_units') {
            const unitSlug = row.unit_slug as string | undefined
            const id = nextId('cu')
            if (unitSlug) contentUnitIdsBySlug.set(unitSlug, id)
            return { data: { id, unit_slug: unitSlug ?? '' }, error: null }
          }
          if (table === 'learning_capabilities') {
            const key = row.canonical_key as string | undefined
            const id = key ? (capIdsByKey.get(key) ?? nextId('cap')) : nextId('cap')
            if (key) capIdsByKey.set(key, id)
            return { data: { id, canonical_key: key }, error: null }
          }
          return {
            data: {
              id: nextId(table),
              canonical_key: row.canonical_key,
              normalized_text: row.normalized_text,
              unit_slug: row.unit_slug,
            },
            error: null,
          }
        }

        return {
          select: () => ({
            single,
            then: (resolve: (v: unknown) => unknown) =>
              resolve({ data: rows.map((r) => ({ ...r, id: nextId(table) })), error: null }),
          }),
          then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
        }
      },
      insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const row = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown>
        ops.push({ table, op: 'insert', payload })
        if (TYPED_TABLES.includes(table) && typeof row.grammar_pattern_id === 'string') {
          typedRows[table]!.push({ grammar_pattern_id: row.grammar_pattern_id })
        }
        return {
          select: () => ({ single: async () => ({ data: { id: nextId(table) }, error: null }) }),
          then: (resolve: (v: unknown) => unknown) => resolve({ error: null, data: { id: nextId(table) } }),
        }
      },
      update: (payload: Record<string, unknown>) => {
        ops.push({ table, op: 'update', payload })
        return {
          eq: () => ({
            select: () => ({ single: async () => ({ data: { id: nextId(table) }, error: null }) }),
            in: async () => ({ error: null }),
          }),
          in: async () => ({ error: null }),
        }
      },
      delete: () => {
        ops.push({ table, op: 'delete' })
        return {
          eq: () => ({
            select: async () => ({ data: [], error: null }),
          }),
          in: async () => ({ error: null }),
        }
      },
    }
  }

  return { client: { schema: () => ({ from: fromBuilder }) }, ops, contentUnitIdsBySlug, capIdsByKey }
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
        id: 'section-grammar',
        title: 'Grammatica',
        order_index: 0,
        content: { type: 'grammar', grammar_topics: ['Bukan-negatie'] },
      },
    ],
    audioClipsByNormalizedText: new Map(),
    staging: {
      stagingDir,
      learningItems: [],
      grammarPatterns: [
        { slug: 'bukan-negation', pattern_name: 'Bukan negation', description: 'legacy', example: 'x', complexity_score: 2 },
      ],
      candidates: [],
      clozeContexts: [],
      contentUnits: [],
      capabilities: [],
      exerciseAssets: [],
      // No staging affixed pairs — DB-native pairs are the only source.
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

function patternDb(categories: TypedGrammarCategory[]): PatternDbResult {
  return {
    categories, topics: [],
    patternState: {
      existingPatternsBySlug: new Map(),
      existingPatternCapsByCanonicalKey: new Map(),
      exerciseCoverageByPatternId: new Map(),
    },
  }
}

const NO_ITEMS = {
  items: [],
  itemState: { existingItemsByNormalizedText: new Map(), existingItemCapsByCanonicalKey: new Map() },
}

// One DB-native affixed pair for lesson 1. pattern_source_ref points at the
// lesson's grammar pattern slug (l1-{stableSlug('Bukan-negatie')}) so the
// cap-stage projector resolves grammar_pattern_id — every pair MUST reference a
// rule pattern produced in the same publish (affixed_form_pairs.grammar_pattern_id
// is NOT NULL; phase-b data-architect ruling).
const AFFIXED_PAIRS: TypedAffixedPair[] = [
  {
    id: 'afp-uuid-1',
    lesson_id: 'lesson-uuid',
    section_id: null,
    source_ref: 'lesson-1/morphology/ber-jalan',
    pattern_source_ref: 'l1-bukan-negatie',
    affix: 'ber-',
    root_text: 'jalan',
    derived_text: 'berjalan',
    allomorph_rule: 'ber- + jalan -> berjalan',
    affix_type: 'prefix',
    affix_gloss: null,
    allomorph_class: null,
    circumfix_left: null,
    circumfix_right: null,
    productive: true,
    carrier_text: null,
    derived_gloss_nl: null,
    derived_gloss_en: null,
  },
]

/** Generator emitting all 4 exercise types for full CS18 coverage. */
function fullGrammarGenerateFn(): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const slug = prompt.match(/pattern slug: (\S+)/)?.[1] ?? 'unknown'
    return JSON.stringify([
      { exercise_type: 'choose_correct_form_ex', grammar_pattern_slug: slug, payload: { promptText: 'p', targetMeaning: 'm', options: [{ id: 'bukan', text: 'bukan' }, { id: 'tidak', text: 'tidak' }], correctOptionId: 'bukan', explanationText: 'e' } },
      { exercise_type: 'transform_sentence_ex', grammar_pattern_slug: slug, payload: { sourceSentence: 's', transformationInstruction: 'i', hintText: null, acceptableAnswers: ['a'], explanationText: 'e' } },
      { exercise_type: 'translate_sentence_ex', grammar_pattern_slug: slug, payload: { sourceLanguageSentence: 's', requiredTargetPattern: slug, disallowedShortcutForms: [], acceptableAnswers: ['a'], explanationText: 'e' } },
      { exercise_type: 'choose_missing_word_ex', grammar_pattern_slug: slug, payload: { sentence: 'Ini ___ rumah.', translation: 't', options: ['bukan', 'tidak', 'belum', 'jangan'], correctOptionId: 'bukan', explanationText: 'e' } },
    ])
  }
}

function baseHooks(client: unknown, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    loadLesson: async () => makeLesson(tmpDir),
    createSupabaseClient: () => client as never,
    loadFromDb: async () => NO_ITEMS,
    fetchDistractorPool: async () => [],
    loadPatternFromDb: async () => patternDb([category('Bukan-negatie', 0)]),
    fetchAffixedPairsFromDb: async () => [] as TypedAffixedPair[],
    generateFn: async () => '[]',
    generateGrammarFn: fullGrammarGenerateFn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runner residual cutover (5a.5 / #147)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-residual-cutover-'))
    enrichMissingPosMock.mockResolvedValue({ posByBaseText: new Map<string, string>(), enrichedCount: 0 })
  })
  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ---------------------------------------------------------------------------
  // ASSERTION 1: Affixed second-consumer guard
  // ---------------------------------------------------------------------------
  it('AFFIXED-GUARD: fetchAffixedPairsFromDb result produces non-zero affixed_form_pairs inserts (step 7c second-consumer guard)', async () => {
    // Landmine #1 regression guard: if the step 5a (affixed) append to allCapabilities
    // is removed, step 7c finds no word_form_pair_src source-kind caps in allCapabilities
    // → projectAffixedFormPairs emits zero rows → affixed_form_pairs table gets zero
    // inserts. This test catches that silent regression.
    //
    // Also asserts no double-write: the staging.affixedFormPairs is empty (no staging
    // caps), and the DB-native pair is the sole source.
    const { client, ops } = buildMock()

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      baseHooks(client, {
        fetchAffixedPairsFromDb: async () => AFFIXED_PAIRS,
      }) as never,
    )

    expect(['ok', 'partial']).toContain(result.status)

    // The affixed_form_pairs table must receive inserts (one per pair = 2 caps,
    // replaceAffixedFormPairs does delete + insert so 1 insert op for 2 rows).
    const affixedInserts = ops.filter((op) => op.table === 'affixed_form_pairs' && op.op === 'insert')
    expect(affixedInserts.length).toBeGreaterThan(0)

    // At least 1 affixed pair row written (capability_id present on every row).
    const affixedRows = affixedInserts.flatMap((op) =>
      Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>],
    )
    expect(affixedRows.length).toBeGreaterThan(0)
    expect(affixedRows.every((r) => typeof r.capability_id === 'string')).toBe(true)

    // No double-write: staging.affixedFormPairs is empty, so the legacy
    // upsertCapabilities bundle has NO word_form_pair_src source_kind cap
    // (newPathEmittedKeys excluded the staging-derived ones, and newAffixedCaps
    // carries only DB-native pairs). Verify by checking there's no duplicate
    // affixed cap with the same source_ref in the legacy upserts.
    const legacyCapUpserts = ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        !(op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates,
    )
    // Count unique affixed cap canonical_keys across all legacy writes.
    const legacyAffixedKeys = legacyCapUpserts.flatMap((op) =>
      (Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>])
        .filter((r) => r?.source_kind === 'word_form_pair_src')
        .map((r) => r?.canonical_key as string),
    )
    // Each affixed cap key appears at most once (no double-write).
    const uniqueAffixedKeys = new Set(legacyAffixedKeys)
    expect(uniqueAffixedKeys.size).toBe(legacyAffixedKeys.length)
  })

  it('AFFIXED-GUARD: affixed caps are in the legacy upsertCapabilities bundle (not skip-if-exists) — DB-native path still uses upsertCapabilities', async () => {
    // Affixed caps are DB-native (projectAffixedCapabilities from DB pairs) but they
    // flow through upsertCapabilities (the main legacy writer), NOT upsertCapabilitiesSkipIfExists.
    // They are excluded from the STAGING legacy bundle (via newPathEmittedKeys)
    // but appended to allCapabilities → upsertCapabilities.
    //
    // In 5a.5 the term "new path" for affixed means: emitted from DB, not staging.
    // The write path is still upsertCapabilities (no ignoreDuplicates).
    const { client, ops } = buildMock()

    await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      baseHooks(client, {
        fetchAffixedPairsFromDb: async () => AFFIXED_PAIRS,
      }) as never,
    )

    // Affixed caps must appear in the legacy upserts (no ignoreDuplicates).
    const legacyCapUpserts = ops.filter(
      (op) =>
        op.table === 'learning_capabilities' &&
        op.op === 'upsert' &&
        !(op.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates,
    )
    const legacyAffixedKeys = legacyCapUpserts.flatMap((op) =>
      (Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>])
        .filter((r) => r?.source_kind === 'word_form_pair_src')
        .map((r) => r?.canonical_key as string),
    )
    // ADR 0021: this ber- pair is TRANSPARENT and carries no carrier_text, so it
    // emits exactly 1 cap — recognise_meaning_from_text_cap (meaning-only; the usage
    // cap is carrier-conditional). The point of THIS guard is unchanged: affixed caps
    // flow through the legacy upsertCapabilities writer (not skip-if-exists).
    expect(legacyAffixedKeys.length).toBe(1)
    expect(legacyAffixedKeys[0]).toContain('recognise_meaning_from_text_cap')
  })

  // ---------------------------------------------------------------------------
  // ASSERTION 3: content_units DB-native grammar slug
  // ---------------------------------------------------------------------------
  it('GRAMMAR-SLUG: content_units upsert carries pattern-path slug (pattern-l{N}-…), not legacy curated slug', async () => {
    // Decision E amendment: buildContentUnitsFromDb consumes PatternPlan.slug
    // (collision-disambiguated, lesson-prefixed = `l{N}-{stableSlug(title)}`) so
    // the grammar unit_slug is always `pattern-l{N}-…`. A builder that emitted
    // the legacy curated slug (`pattern-{curated}` without `l{N}-`) would be caught here.
    //
    // Fixture: one category 'Bukan-negatie' → plan.slug = 'l1-bukan-negatie'
    //   → unit_slug = 'pattern-l1-bukan-negatie'.
    const { client, ops } = buildMock()

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      baseHooks(client) as never,
    )

    expect(['ok', 'partial']).toContain(result.status)

    // Collect all content_units upsert payloads.
    const cuUpserts = ops.filter((op) => op.table === 'content_units' && op.op === 'upsert')
    const cuPayloads = cuUpserts.flatMap((op) =>
      Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>],
    )

    // At least one grammar_pattern unit must be present.
    const grammarUnits = cuPayloads.filter((p) => p.unit_kind === 'grammar_pattern')
    expect(grammarUnits.length).toBeGreaterThan(0)

    // Every grammar unit_slug must match `pattern-l{N}-…` (lesson-prefixed form).
    for (const unit of grammarUnits) {
      const slug = unit.unit_slug as string
      expect(slug).toMatch(/^pattern-l\d+-/)
    }

    // No grammar unit_slug should be the legacy curated form `pattern-{curated}`
    // (i.e. starts with `pattern-` but NOT followed by `l{N}-`).
    for (const unit of grammarUnits) {
      const slug = unit.unit_slug as string
      // Guard: old curated form would be 'pattern-bukan-negation' (no `l1-` prefix)
      expect(slug).not.toMatch(/^pattern-(?!l\d+-)/)
    }
  })

  // ---------------------------------------------------------------------------
  // ASSERTION 4: Grammar junction by source_ref — no CS9 orphan
  // ---------------------------------------------------------------------------
  it('GRAMMAR-JUNCTION: capability_content_units contains a pattern-cap → grammar-unit row; no CS9 orphan finding emitted', async () => {
    // Step 6b resolves pattern caps to their grammar content_unit by source_ref
    // (cap.sourceRef == unit.source_ref by construction). If the source_ref match
    // breaks (e.g. slug mismatch or mis-keyed map), no junction row is written and
    // a CS9 warning is emitted. This test asserts the happy path: at least one
    // junction row for a grammar cap + zero CS9 findings.
    const { client, ops, contentUnitIdsBySlug } = buildMock()

    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      baseHooks(client) as never,
    )

    expect(['ok', 'partial']).toContain(result.status)

    // No CS9 warning (all caps resolved their content_unit by source_ref). Slice 5b
    // (#147) unified the junction into step 6 with a single source_ref map; the
    // orphan finding message changed from "Grammar content_unit junction" to the
    // generic "capability_content_units: …".
    const cs9Findings = result.findings.filter((f) => f.gate === 'CS9')
    expect(cs9Findings.filter((f) => f.message.includes('capability_content_units:'))).toHaveLength(0)

    // Isolate the grammar junction specifically — NOT just any junction. (The
    // unified step-6 source_ref loop also writes item/affixed junction rows, so
    // "junctionRows.length > 0" would pass even if grammar junctions regressed.
    // Resolve the grammar content_unit ids and assert a junction row links to one
    // with a grammar relationship_kind — this fails iff the grammar junction breaks.)
    const grammarUnitSlugs = ops
      .filter((op) => op.table === 'content_units' && op.op === 'upsert')
      .flatMap((op) => (Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>]))
      .filter((p) => p.unit_kind === 'grammar_pattern')
      .map((p) => p.unit_slug as string)
    expect(grammarUnitSlugs.length).toBeGreaterThan(0)
    const grammarUnitIds = new Set(
      grammarUnitSlugs.map((slug) => contentUnitIdsBySlug.get(slug)).filter(Boolean) as string[],
    )
    expect(grammarUnitIds.size).toBeGreaterThan(0)

    const junctionUpserts = ops.filter(
      (op) => op.table === 'capability_content_units' && op.op === 'upsert',
    )
    const junctionRows = junctionUpserts.flatMap((op) =>
      Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>],
    )
    const grammarJunctionRows = junctionRows.filter((r) =>
      grammarUnitIds.has(r.content_unit_id as string),
    )
    // Step 6b MUST have written at least one grammar junction row.
    expect(grammarJunctionRows.length).toBeGreaterThan(0)
    for (const row of grammarJunctionRows) {
      expect(typeof row.capability_id).toBe('string')
      expect(['introduced_by', 'practiced_by']).toContain(row.relationship_kind)
    }
  })
})
