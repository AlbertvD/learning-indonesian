/**
 * patternPath.test.ts — Slice 2 Task 6 pattern-path write orchestration.
 *
 * Uses a STATEFUL fake Supabase that models the real chains (so a drift to a
 * non-existent method/option throws — Lesson #3) and tracks row state across
 * calls, letting us prove the headline idempotency guarantees:
 *   - fresh (absent)   → generate + write typed rows + exercise_variants dual-write
 *   - seeded           → skip generation (the gate's reason for existing)
 *   - partial          → delete-first + regenerate (the keyless-table crash guard)
 *   - --regenerate slug → delete-first that pattern only
 *   - cutover-delete    → legacy patterns removed, new kept
 *   - tableMissing      → early no-op
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writePatternPath, type WritePatternPathInput } from '../patternPath'
import { projectPatternsFromCategories } from '../projectors/grammar'
import type { ExistingPatternState, GrammarExerciseType, TypedGrammarCategory } from '../loadFromDb'
import type { GrammarExerciseCandidate } from '../generateGrammarExercises'

const GRAMMAR_TABLES = [
  'contrast_pair_exercises',
  'sentence_transformation_exercises',
  'constrained_translation_exercises',
  'cloze_mcq_exercises',
]

// ---------------------------------------------------------------------------
// Stateful fake Supabase
// ---------------------------------------------------------------------------

interface FakeDb {
  grammarPatterns: Array<{ id: string; slug: string; introduced_by_lesson_id: string }>
  caps: Array<{ id: string; canonical_key: string }>
  typedRows: Record<string, Array<{ id: string; grammar_pattern_id: string }>>
  exerciseVariants: Array<{ id: string; grammar_pattern_id: string | null }>
}

function makeFake(seed?: Partial<FakeDb>) {
  let idSeq = 0
  const nextId = (p: string) => `${p}-${++idSeq}`
  const db: FakeDb = {
    grammarPatterns: seed?.grammarPatterns ?? [],
    caps: seed?.caps ?? [],
    typedRows: seed?.typedRows ?? {
      contrast_pair_exercises: [],
      sentence_transformation_exercises: [],
      constrained_translation_exercises: [],
      cloze_mcq_exercises: [],
    },
    exerciseVariants: seed?.exerciseVariants ?? [],
  }

  const client = {
    schema: () => ({
      from: (table: string) => {
        if (table === 'grammar_patterns') {
          return {
            upsert: (row: { slug: string; introduced_by_lesson_id: string }) => ({
              select: () => ({
                single: async () => {
                  let existing = db.grammarPatterns.find((p) => p.slug === row.slug)
                  if (!existing) {
                    existing = { id: nextId('pat'), slug: row.slug, introduced_by_lesson_id: row.introduced_by_lesson_id }
                    db.grammarPatterns.push(existing)
                  }
                  return { data: { id: existing.id }, error: null }
                },
              }),
            }),
            select: () => ({
              eq: async (_col: string, lessonId: string) => ({
                data: db.grammarPatterns
                  .filter((p) => p.introduced_by_lesson_id === lessonId)
                  .map((p) => ({ id: p.id, slug: p.slug })),
                error: null,
              }),
            }),
            delete: () => ({
              in: async (_col: string, ids: string[]) => {
                db.grammarPatterns = db.grammarPatterns.filter((p) => !ids.includes(p.id))
                // CASCADE: clear typed rows + null exercise_variants for those patterns.
                for (const t of GRAMMAR_TABLES) {
                  db.typedRows[t] = db.typedRows[t].filter((r) => !ids.includes(r.grammar_pattern_id))
                }
                for (const v of db.exerciseVariants) {
                  if (v.grammar_pattern_id && ids.includes(v.grammar_pattern_id)) v.grammar_pattern_id = null
                }
                return { error: null }
              },
            }),
          }
        }
        if (table === 'learning_capabilities') {
          return {
            upsert: (rows: Array<{ canonical_key: string }>, opts: { ignoreDuplicates?: boolean }) => ({
              select: async () => {
                const inserted: Array<{ id: string; canonical_key: string }> = []
                for (const r of rows) {
                  const exists = db.caps.find((c) => c.canonical_key === r.canonical_key)
                  if (opts?.ignoreDuplicates && exists) continue
                  if (!exists) {
                    const row = { id: nextId('cap'), canonical_key: r.canonical_key }
                    db.caps.push(row)
                    inserted.push(row)
                  }
                }
                return { data: inserted, error: null }
              },
            }),
          }
        }
        if (table === 'exercise_variants') {
          return {
            insert: (row: { grammar_pattern_id: string }) => ({
              select: () => ({
                single: async () => {
                  const r = { id: nextId('ev'), grammar_pattern_id: row.grammar_pattern_id }
                  db.exerciseVariants.push(r)
                  return { data: { id: r.id }, error: null }
                },
              }),
            }),
            delete: () => ({
              eq: (_col: string, id: string) => ({
                select: async () => {
                  const removed = db.exerciseVariants.filter((v) => v.grammar_pattern_id === id)
                  db.exerciseVariants = db.exerciseVariants.filter((v) => v.grammar_pattern_id !== id)
                  return { data: removed.map((r) => ({ id: r.id })), error: null }
                },
              }),
            }),
          }
        }
        // One of the 4 typed exercise tables.
        return {
          insert: (row: { grammar_pattern_id: string }) => ({
            select: () => ({
              single: async () => {
                const r = { id: nextId('tr'), grammar_pattern_id: row.grammar_pattern_id }
                db.typedRows[table] ??= []
                db.typedRows[table].push(r)
                return { data: { id: r.id }, error: null }
              },
            }),
          }),
          delete: () => ({
            eq: (_col: string, id: string) => ({
              select: async () => {
                const removed = (db.typedRows[table] ?? []).filter((r) => r.grammar_pattern_id === id)
                db.typedRows[table] = (db.typedRows[table] ?? []).filter((r) => r.grammar_pattern_id !== id)
                return { data: removed.map((r) => ({ id: r.id })), error: null }
              },
            }),
          }),
        }
      },
    }),
  } as never
  return { client, db }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function category(id: string, order: number, title: string): TypedGrammarCategory {
  return {
    id,
    section_id: 'sec-1',
    lesson_id: 'lesson-6',
    display_order: order,
    title,
    title_en: null,
    rules: [`rule for ${title}`],
    rules_en: [],
    examples: [{ indonesian: 'Ini bukan rumah.', dutch: 'Dit is geen huis.', english: null }],
  }
}

const CATEGORIES = [category('c1', 0, 'Bukan-negatie'), category('c2', 1, 'Reduplicatie')]

function emptyPatternState(overrides?: Partial<ExistingPatternState>): ExistingPatternState {
  return {
    existingPatternsBySlug: new Map(),
    existingPatternCapsByCanonicalKey: new Map(),
    exerciseCoverageByPatternId: new Map(),
    ...overrides,
  }
}

/** A generator that returns one valid candidate of EACH of the 4 types per pattern. */
function fullGenerateFn(): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const slugMatch = prompt.match(/pattern slug: (\S+)/)
    const slug = slugMatch?.[1] ?? 'unknown'
    const cands: GrammarExerciseCandidate[] = [
      { exercise_type: 'contrast_pair', grammar_pattern_slug: slug, payload: { promptText: 'p', targetMeaning: 'm', options: [{ id: 'bukan', text: 'bukan' }, { id: 'tidak', text: 'tidak' }], correctOptionId: 'bukan', explanationText: 'e' } },
      { exercise_type: 'sentence_transformation', grammar_pattern_slug: slug, payload: { sourceSentence: 's', transformationInstruction: 'i', hintText: null, acceptableAnswers: ['a'], explanationText: 'e' } },
      { exercise_type: 'constrained_translation', grammar_pattern_slug: slug, payload: { sourceLanguageSentence: 's', requiredTargetPattern: slug, disallowedShortcutForms: [], acceptableAnswers: ['a'], explanationText: 'e' } },
      { exercise_type: 'cloze_mcq', grammar_pattern_slug: slug, payload: { sentence: 'Ini ___ rumah.', translation: 't', options: ['bukan', 'tidak', 'belum', 'jangan'], correctOptionId: 'bukan', explanationText: 'e' } },
    ]
    return JSON.stringify(cands)
  }
}

const ALL_TYPES: GrammarExerciseType[] = ['contrast_pair', 'sentence_transformation', 'constrained_translation', 'cloze_mcq']

function baseInput(state: ExistingPatternState, regenerateSlug: string | null = null): WritePatternPathInput {
  const projection = projectPatternsFromCategories({ categories: CATEGORIES, lessonNumber: 6, lessonId: 'lesson-6' })
  return {
    patternPlans: projection.patternPlans,
    lessonId: 'lesson-6',
    patternState: state,
    pool: [{ indonesian_text: 'rumah', l1_translation: 'huis', item_type: 'word' }],
    regenerateSlug,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writePatternPath', () => {
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY })
  afterEach(() => vi.restoreAllMocks())

  it('fresh lesson: upserts patterns, writes typed rows for all 4 types (typed-only, NO exercise_variants)', async () => {
    const { client, db } = makeFake()
    const result = await writePatternPath(client, baseInput(emptyPatternState()), { generateFn: fullGenerateFn() })

    expect(result.patternsUpserted).toBe(2)
    expect(result.exercisesWritten).toBe(8) // 4 types × 2 patterns
    // every typed table got 2 rows (one per pattern)
    for (const t of GRAMMAR_TABLES) expect(db.typedRows[t]).toHaveLength(2)
    // Task 8: the pattern path is typed-only — it writes NO exercise_variants.
    expect(db.exerciseVariants).toHaveLength(0)
    expect(result.patternsSkippedSeeded).toBe(0)
  })

  it('idempotent: a re-run with full coverage SKIPS generation (no duplicate rows)', async () => {
    // Seed the DB as if a prior run fully wrote both patterns.
    const { client, db } = makeFake({
      grammarPatterns: [
        { id: 'pat-A', slug: 'l6-bukan-negatie', introduced_by_lesson_id: 'lesson-6' },
        { id: 'pat-B', slug: 'l6-reduplicatie', introduced_by_lesson_id: 'lesson-6' },
      ],
    })
    const coverage = new Map<string, Set<GrammarExerciseType>>([
      ['pat-A', new Set(ALL_TYPES)],
      ['pat-B', new Set(ALL_TYPES)],
    ])
    const genSpy = vi.fn(fullGenerateFn())
    const result = await writePatternPath(
      client,
      baseInput(emptyPatternState({ exerciseCoverageByPatternId: coverage })),
      { generateFn: genSpy },
    )
    expect(result.patternsSkippedSeeded).toBe(2)
    expect(result.exercisesWritten).toBe(0)
    expect(genSpy).not.toHaveBeenCalled() // skipped → generator never invoked
    expect(db.typedRows.contrast_pair_exercises).toHaveLength(0) // nothing new written
  })

  it('partial (mid-write crash): deletes stragglers then regenerates the full set', async () => {
    // pat-A has only 2 of 4 types (a crash left it partial) + 2 stale typed rows.
    const { client, db } = makeFake({
      grammarPatterns: [
        { id: 'pat-A', slug: 'l6-bukan-negatie', introduced_by_lesson_id: 'lesson-6' },
        { id: 'pat-B', slug: 'l6-reduplicatie', introduced_by_lesson_id: 'lesson-6' },
      ],
      typedRows: {
        contrast_pair_exercises: [{ id: 'old1', grammar_pattern_id: 'pat-A' }],
        sentence_transformation_exercises: [{ id: 'old2', grammar_pattern_id: 'pat-A' }],
        constrained_translation_exercises: [],
        cloze_mcq_exercises: [],
      },
      exerciseVariants: [{ id: 'oldev', grammar_pattern_id: 'pat-A' }],
    })
    const coverage = new Map<string, Set<GrammarExerciseType>>([
      ['pat-A', new Set<GrammarExerciseType>(['contrast_pair', 'sentence_transformation'])], // partial
      ['pat-B', new Set(ALL_TYPES)], // seeded
    ])
    const result = await writePatternPath(
      client,
      baseInput(emptyPatternState({ exerciseCoverageByPatternId: coverage })),
      { generateFn: fullGenerateFn() },
    )
    expect(result.patternsRegenerated).toBe(1) // pat-A
    expect(result.patternsSkippedSeeded).toBe(1) // pat-B
    // pat-A's stale rows gone, replaced with a fresh full set of 4 (no duplicates)
    expect(db.typedRows.contrast_pair_exercises.filter((r) => r.grammar_pattern_id === 'pat-A')).toHaveLength(1)
    expect(db.typedRows.sentence_transformation_exercises.filter((r) => r.grammar_pattern_id === 'pat-A')).toHaveLength(1)
    expect(db.typedRows.constrained_translation_exercises.filter((r) => r.grammar_pattern_id === 'pat-A')).toHaveLength(1)
    expect(db.typedRows.cloze_mcq_exercises.filter((r) => r.grammar_pattern_id === 'pat-A')).toHaveLength(1)
    // Task 8: the pattern path no longer touches exercise_variants at all — the
    // pre-existing 'oldev' row is left untouched (it retires with #102), and no
    // new exercise_variants are written.
    expect(db.exerciseVariants).toEqual([{ id: 'oldev', grammar_pattern_id: 'pat-A' }])
  })

  it('--regenerate <slug>: force-rebuilds only the named pattern, leaves the seeded one alone', async () => {
    const { client, db } = makeFake({
      grammarPatterns: [
        { id: 'pat-A', slug: 'l6-bukan-negatie', introduced_by_lesson_id: 'lesson-6' },
        { id: 'pat-B', slug: 'l6-reduplicatie', introduced_by_lesson_id: 'lesson-6' },
      ],
      typedRows: {
        contrast_pair_exercises: [{ id: 'a1', grammar_pattern_id: 'pat-A' }, { id: 'b1', grammar_pattern_id: 'pat-B' }],
        sentence_transformation_exercises: [],
        constrained_translation_exercises: [],
        cloze_mcq_exercises: [],
      },
    })
    const coverage = new Map<string, Set<GrammarExerciseType>>([
      ['pat-A', new Set(ALL_TYPES)],
      ['pat-B', new Set(ALL_TYPES)],
    ])
    const result = await writePatternPath(
      client,
      baseInput(emptyPatternState({ exerciseCoverageByPatternId: coverage }), 'l6-bukan-negatie'),
      { generateFn: fullGenerateFn() },
    )
    expect(result.patternsRegenerated).toBe(1) // only pat-A (the named one)
    expect(result.patternsSkippedSeeded).toBe(1) // pat-B left alone
    // pat-A rebuilt (old 'a1' gone, fresh full set); pat-B's 'b1' untouched
    expect(db.typedRows.contrast_pair_exercises.find((r) => r.id === 'a1')).toBeUndefined()
    expect(db.typedRows.contrast_pair_exercises.find((r) => r.id === 'b1')).toBeDefined()
  })

  it('cutover-delete: removes the lesson legacy patterns whose slug is not in the new set', async () => {
    const { client, db } = makeFake({
      grammarPatterns: [
        { id: 'legacy1', slug: 'bukan-negation', introduced_by_lesson_id: 'lesson-6' }, // legacy → delete
        { id: 'legacy2', slug: 'reduplication', introduced_by_lesson_id: 'lesson-6' }, // legacy → delete
      ],
    })
    const result = await writePatternPath(client, baseInput(emptyPatternState()), { generateFn: fullGenerateFn() })
    expect(result.retiredLegacySlugs.sort()).toEqual(['bukan-negation', 'reduplication'])
    // legacy gone; the 2 new-slug patterns remain
    expect(db.grammarPatterns.map((p) => p.slug).sort()).toEqual(['l6-bukan-negatie', 'l6-reduplicatie'])
  })

  it('empty pattern plans → no-op result', async () => {
    const { client } = makeFake()
    const result = await writePatternPath(
      client,
      { patternPlans: [], lessonId: 'lesson-6', patternState: emptyPatternState(), pool: [], regenerateSlug: null },
      { generateFn: fullGenerateFn() },
    )
    expect(result.patternsUpserted).toBe(0)
    expect(result.exercisesWritten).toBe(0)
  })
})
