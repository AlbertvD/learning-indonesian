/**
 * capability-stage/loadFromDb.ts — disk-free typed item import seam.
 *
 * Reads the two DB sources the Capability Stage needs for the `item` source
 * kind, with NO disk I/O (ADR 0011/0012 contract):
 *
 *   1. `lesson_section_item_rows` (joined to `lesson_sections.section_kind`)
 *      — the typed lesson content written by Stage A (Lesson Stage).
 *
 *   2. Existing capability state — `learning_items` by `normalized_text` and
 *      item-kind `learning_capabilities` by `canonical_key` — for the
 *      idempotency delta: only seed what is not yet seeded.
 *
 * External interface: `loadFromDb(supabase, { lessonId }) → ItemDbResult`.
 * The loader is self-contained; it does NOT call any staging-file read and
 * does NOT import from loader.ts.
 *
 * Consumed by: Task 4 item projector (runs after loadFromDb).
 * Does NOT modify: runner.ts, loader.ts (those are Task 4 + cutover).
 */

import type { CapabilitySupabaseClient } from './adapter'
import type { DistractorInputItem } from './generateItemDistractors'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single row from `lesson_section_item_rows`, augmented with the
 * `section_kind` value from the parent `lesson_sections` row.
 */
export interface TypedItemRow {
  id: string
  section_id: string
  lesson_id: string
  display_order: number
  source_item_ref: string
  item_type: 'word' | 'phrase'
  indonesian_text: string
  l1_translation: string
  l2_translation: string | null
  section_kind:
    | 'text' | 'grammar' | 'reference_table' | 'vocabulary'
    | 'expressions' | 'numbers' | 'dialogue' | 'pronunciation'
    | 'culture' | 'exercises'
    | ''
}

/** Entry in the existing-items map (keyed by normalized_text). */
export interface ExistingLearningItem {
  id: string
  normalized_text: string
}

/** Entry in the existing-caps map (keyed by canonical_key). */
export interface ExistingItemCap {
  id: string
  canonical_key: string
}

/**
 * The idempotency-delta state from the DB.
 * Used by the projector (Task 4) to determine which items need seeding.
 */
export interface ExistingItemState {
  /** `learning_items` with source_type='lesson', keyed by normalized_text. */
  existingItemsByNormalizedText: Map<string, ExistingLearningItem>
  /** item-kind `learning_capabilities`, keyed by canonical_key. */
  existingItemCapsByCanonicalKey: Map<string, ExistingItemCap>
}

/** The composite result returned by `loadFromDb`. */
export interface ItemDbResult {
  items: TypedItemRow[]
  itemState: ExistingItemState
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * PostgREST's `db-max-rows` (commonly 1000) silently caps single-response reads.
 * For correctness, cross-lesson dedup reads must fetch the COMPLETE set —
 * a truncated map would cause the projector to re-seed caps it wrongly thinks
 * are missing, producing duplicate-key errors or duplicate caps.
 * Loop with `.range()` until a page returns fewer rows than PAGE_SIZE.
 */
export const PAGE_SIZE = 1000

// ---------------------------------------------------------------------------
// fetchItemRowsFromDb
// ---------------------------------------------------------------------------

/**
 * Read all `lesson_section_item_rows` for the lesson, joined to their parent
 * `lesson_sections.section_kind` via a Supabase select on the FK relationship.
 *
 * The select uses `lesson_sections(section_kind)` PostgREST join syntax so
 * section_kind is fetched in the same round-trip without a second query.
 */
export async function fetchItemRowsFromDb(
  supabase: CapabilitySupabaseClient,
  lessonId: string,
): Promise<TypedItemRow[]> {
  // PostgREST join: lesson_sections!inner(section_kind) via the section_id FK.
  // The !inner means only item rows whose section exists are returned (safe since
  // the FK is NOT NULL; it eliminates orphan rows at the query level).
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lesson_section_item_rows')
    .select(
      'id, section_id, lesson_id, display_order, source_item_ref, item_type, indonesian_text, l1_translation, l2_translation, lesson_sections!inner(section_kind)',
    )
    .eq('lesson_id', lessonId)

  if (error) {
    throw new Error(
      `Failed to fetch lesson_section_item_rows for lesson_id=${lessonId}: ${error.message}`,
    )
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    // PostgREST embeds the joined table as a nested object under the FK alias.
    const sectionKind =
      (row['lesson_sections'] as { section_kind?: string } | null)?.section_kind ?? ''

    return {
      id: row['id'] as string,
      section_id: row['section_id'] as string,
      lesson_id: row['lesson_id'] as string,
      display_order: row['display_order'] as number,
      source_item_ref: row['source_item_ref'] as string,
      item_type: row['item_type'] as 'word' | 'phrase',
      indonesian_text: row['indonesian_text'] as string,
      l1_translation: row['l1_translation'] as string,
      l2_translation: (row['l2_translation'] as string | null | undefined) ?? null,
      section_kind: sectionKind,
    }
  })
}

// ---------------------------------------------------------------------------
// fetchItemCapabilityState
// ---------------------------------------------------------------------------

/**
 * Read the existing capability state from the DB for the idempotency delta.
 *
 * Reads globally (all lessons) because item dedup is by `normalized_text`
 * across lessons — a word introduced in L2 already seeded in L2 must not be
 * re-seeded when L5 also uses it. This is the legitimate Capability-Gate
 * asymmetry (ADR 0013 §4): unlike the Lesson Gate, the Capability Stage IS
 * allowed to consult cross-lesson state.
 *
 * `learning_capabilities` filtered to `source_kind='item'` so the map is
 * bounded to the relevant rows.
 */
export async function fetchItemCapabilityState(
  supabase: CapabilitySupabaseClient,
): Promise<ExistingItemState> {
  // Cross-lesson dedup needs the COMPLETE set of already-seeded items and caps.
  // PostgREST's db-max-rows cap silently truncates single-response reads, so we
  // paginate with .range() until a page shorter than PAGE_SIZE signals the end.

  // --- Read all lesson-source learning_items ---
  const existingItemsByNormalizedText = new Map<string, ExistingLearningItem>()
  let itemOffset = 0
  while (true) {
    const { data: page, error: itemError } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('id, normalized_text')
      .eq('source_type', 'lesson')
      .range(itemOffset, itemOffset + PAGE_SIZE - 1)

    if (itemError) {
      throw new Error(
        `Failed to fetch existing learning_items: ${itemError.message}`,
      )
    }

    for (const row of (page ?? []) as Array<{ id: string; normalized_text: string }>) {
      existingItemsByNormalizedText.set(row.normalized_text, {
        id: row.id,
        normalized_text: row.normalized_text,
      })
    }

    if (!page || page.length < PAGE_SIZE) break
    itemOffset += PAGE_SIZE
  }

  // --- Read all item-kind learning_capabilities ---
  const existingItemCapsByCanonicalKey = new Map<string, ExistingItemCap>()
  let capOffset = 0
  while (true) {
    const { data: page, error: capError } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .select('id, canonical_key')
      .eq('source_kind', 'item')
      .range(capOffset, capOffset + PAGE_SIZE - 1)

    if (capError) {
      throw new Error(
        `Failed to fetch existing item learning_capabilities: ${capError.message}`,
      )
    }

    for (const row of (page ?? []) as Array<{ id: string; canonical_key: string }>) {
      existingItemCapsByCanonicalKey.set(row.canonical_key, {
        id: row.id,
        canonical_key: row.canonical_key,
      })
    }

    if (!page || page.length < PAGE_SIZE) break
    capOffset += PAGE_SIZE
  }

  return { existingItemsByNormalizedText, existingItemCapsByCanonicalKey }
}

// ---------------------------------------------------------------------------
// fetchDistractorPool
// ---------------------------------------------------------------------------

/**
 * Read the cumulative distractor pool from `learning_items`.
 *
 * Pool definition: ALL active word/phrase `learning_items` across all lessons.
 * Lessons publish in order, so the set of already-seeded items approximates
 * the learner's seen-word vocabulary. The generator excludes the answer item
 * itself, so including same-lesson items in the pool is safe.
 *
 * Field mapping:
 *   base_text       → indonesian_text  (the Indonesian word/phrase)
 *   translation_nl  → l1_translation   (Dutch translation shown in MCQ)
 *   item_type       → item_type        (word|phrase, for same-word-class rule)
 *   normalized_text → source_item_ref  (stable dedup key; pool entries are
 *                                       candidates only — the generator never
 *                                       keys output by pool source_item_ref)
 *
 * Exclusions: inactive items (`is_active = false`); non-word/phrase types
 * (grammar patterns, morphology, etc. are seeded with different item_types).
 *
 * Pagination: mirrors fetchItemCapabilityState — reads all pages with .range()
 * to avoid PostgREST's db-max-rows cap (~1000 rows per response).
 */
export async function fetchDistractorPool(
  supabase: CapabilitySupabaseClient,
): Promise<DistractorInputItem[]> {
  const pool: DistractorInputItem[] = []
  let offset = 0

  while (true) {
    const { data: page, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('normalized_text, base_text, translation_nl, item_type')
      .eq('is_active', true)
      .in('item_type', ['word', 'phrase'])
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Failed to fetch distractor pool from learning_items: ${error.message}`)
    }

    for (const row of (page ?? []) as Array<{
      normalized_text: string
      base_text: string
      translation_nl: string
      item_type: 'word' | 'phrase'
    }>) {
      pool.push({
        source_item_ref: row.normalized_text,
        indonesian_text: row.base_text,
        l1_translation: row.translation_nl,
        item_type: row.item_type,
      })
    }

    if (!page || page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return pool
}

// ---------------------------------------------------------------------------
// loadFromDb — composed entry point
// ---------------------------------------------------------------------------

/**
 * Load all DB state needed by the Capability Stage's item-kind path.
 *
 * Runs the two fetches in parallel (independent queries) and combines them
 * into an `ItemDbResult`. NO disk I/O — this module imports no `fs` module
 * and contains no disk-IO markers (enforced by noDiskReads.test.ts).
 */
export async function loadFromDb(
  supabase: CapabilitySupabaseClient,
  input: { lessonId: string },
): Promise<ItemDbResult> {
  const [items, itemState] = await Promise.all([
    fetchItemRowsFromDb(supabase, input.lessonId),
    fetchItemCapabilityState(supabase),
  ])
  return { items, itemState }
}

// ===========================================================================
// Slice 2 — pattern (grammar) source kind
// ===========================================================================
//
// The grammar read mirrors the item read above: lesson-scoped typed content
// from the DB (the generator input) + global pattern capability state (the
// idempotency delta). NO disk I/O — same enforcement as the item path.
//
// The CRUCIAL Slice-2 addition is `exerciseCoverageByPatternId` — per pattern,
// which of the 4 grammar exercise types currently have >=1 active row. This is
// the OQ2-2 "seeded-check" INPUT (option B): the runner/projector decides a
// pattern is seeded iff it has every required type; partial coverage -> rebuild.
// The loader only READS the coverage; the seeded DECISION lives downstream.

// ---------------------------------------------------------------------------
// Public types (pattern path)
// ---------------------------------------------------------------------------

/** One worked example on a grammar category (jsonb `examples` element). */
export interface GrammarExample {
  indonesian: string
  dutch: string | null
  english: string | null
}

/** A row from `lesson_section_grammar_categories` (PR 6 typed grammar table). */
export interface TypedGrammarCategory {
  id: string
  section_id: string
  lesson_id: string
  display_order: number
  title: string
  title_en: string | null
  rules: string[]
  rules_en: string[]
  /** jsonb `examples`; nullable in the DB → normalised to [] here. */
  examples: GrammarExample[]
}

/** A row from `lesson_section_grammar_topics`. */
export interface TypedGrammarTopic {
  id: string
  section_id: string
  lesson_id: string
  topic_label: string
}

/** Entry in the existing-patterns map (keyed by slug). */
export interface ExistingGrammarPattern {
  id: string
  slug: string
}

/** Entry in the existing pattern-caps map (keyed by canonical_key). */
export interface ExistingPatternCap {
  id: string
  canonical_key: string
}

/** The 4 grammar exercise types, each backed by one typed table. */
export type GrammarExerciseType =
  | 'contrast_pair'
  | 'sentence_transformation'
  | 'constrained_translation'
  | 'cloze_mcq'

/** exercise type → its typed table name (the per-pattern coverage sources). */
export const GRAMMAR_EXERCISE_TABLES: Record<GrammarExerciseType, string> = {
  contrast_pair: 'contrast_pair_exercises',
  sentence_transformation: 'sentence_transformation_exercises',
  constrained_translation: 'constrained_translation_exercises',
  cloze_mcq: 'cloze_mcq_exercises',
}

/** The pattern-path idempotency-delta state from the DB. */
export interface ExistingPatternState {
  /** `grammar_patterns`, keyed by slug. */
  existingPatternsBySlug: Map<string, ExistingGrammarPattern>
  /** `pattern`-kind `learning_capabilities`, keyed by canonical_key. */
  existingPatternCapsByCanonicalKey: Map<string, ExistingPatternCap>
  /**
   * Per `grammar_pattern_id`, the set of exercise types that currently have
   * >=1 ACTIVE row. The OQ2-2 seeded-check input: a pattern is "seeded" iff
   * this set covers every type its capabilities require (decided downstream).
   * A pattern with NO active rows is simply absent from the map.
   */
  exerciseCoverageByPatternId: Map<string, Set<GrammarExerciseType>>
}

/** The composite result returned by `loadPatternFromDb`. */
export interface PatternDbResult {
  categories: TypedGrammarCategory[]
  topics: TypedGrammarTopic[]
  patternState: ExistingPatternState
}

// ---------------------------------------------------------------------------
// fetchGrammarSectionsFromDb
// ---------------------------------------------------------------------------

/**
 * Read the typed grammar sections for ONE lesson: categories (title + rules +
 * examples — the generator's raw material) and topics (labels). Lesson-scoped
 * and small (<= a handful per lesson), so no pagination (mirrors
 * fetchItemRowsFromDb). The `examples` jsonb is normalised to a typed array.
 */
export async function fetchGrammarSectionsFromDb(
  supabase: CapabilitySupabaseClient,
  lessonId: string,
): Promise<{ categories: TypedGrammarCategory[]; topics: TypedGrammarTopic[] }> {
  const { data: catData, error: catError } = await supabase
    .schema('indonesian')
    .from('lesson_section_grammar_categories')
    .select('id, section_id, lesson_id, display_order, title, title_en, rules, rules_en, examples')
    .eq('lesson_id', lessonId)

  if (catError) {
    throw new Error(
      `Failed to fetch lesson_section_grammar_categories for lesson_id=${lessonId}: ${catError.message}`,
    )
  }

  const categories = ((catData ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row['id'] as string,
    section_id: row['section_id'] as string,
    lesson_id: row['lesson_id'] as string,
    display_order: row['display_order'] as number,
    title: row['title'] as string,
    title_en: (row['title_en'] as string | null | undefined) ?? null,
    rules: (row['rules'] as string[] | null | undefined) ?? [],
    rules_en: (row['rules_en'] as string[] | null | undefined) ?? [],
    examples: normaliseExamples(row['examples']),
  }))

  const { data: topicData, error: topicError } = await supabase
    .schema('indonesian')
    .from('lesson_section_grammar_topics')
    .select('id, section_id, lesson_id, topic_label')
    .eq('lesson_id', lessonId)

  if (topicError) {
    throw new Error(
      `Failed to fetch lesson_section_grammar_topics for lesson_id=${lessonId}: ${topicError.message}`,
    )
  }

  const topics = ((topicData ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row['id'] as string,
    section_id: row['section_id'] as string,
    lesson_id: row['lesson_id'] as string,
    topic_label: row['topic_label'] as string,
  }))

  return { categories, topics }
}

/**
 * Normalise the `examples` jsonb (nullable; element shape
 * `{indonesian, dutch, english}`) into a typed `GrammarExample[]`. Non-array or
 * null → []. Missing dutch/english → null. Drops elements with no
 * `indonesian` string (the only required field for a usable example).
 */
function normaliseExamples(raw: unknown): GrammarExample[] {
  if (!Array.isArray(raw)) return []
  const out: GrammarExample[] = []
  for (const el of raw) {
    if (el == null || typeof el !== 'object') continue
    const e = el as Record<string, unknown>
    const indonesian = e['indonesian']
    if (typeof indonesian !== 'string' || indonesian.length === 0) continue
    out.push({
      indonesian,
      dutch: typeof e['dutch'] === 'string' ? (e['dutch'] as string) : null,
      english: typeof e['english'] === 'string' ? (e['english'] as string) : null,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// fetchPatternCapabilityState
// ---------------------------------------------------------------------------

/**
 * Read the pattern-path idempotency-delta state, GLOBALLY (cross-lesson —
 * grammar patterns recur across lessons, same asymmetry as item dedup):
 *   - `grammar_patterns` by slug
 *   - `pattern`-kind `learning_capabilities` by canonical_key
 *   - per-pattern active exercise-type coverage (the seeded-check input)
 *
 * All reads paginate with `.range()` (exercise rows can exceed PostgREST's
 * db-max-rows cap) — a truncated coverage map would mis-detect a seeded pattern
 * as partial and trigger a needless destructive rebuild.
 */
export async function fetchPatternCapabilityState(
  supabase: CapabilitySupabaseClient,
): Promise<ExistingPatternState> {
  // --- grammar_patterns by slug ---
  const existingPatternsBySlug = new Map<string, ExistingGrammarPattern>()
  let patternOffset = 0
  while (true) {
    const { data: page, error } = await supabase
      .schema('indonesian')
      .from('grammar_patterns')
      .select('id, slug')
      .range(patternOffset, patternOffset + PAGE_SIZE - 1)
    if (error) {
      throw new Error(`Failed to fetch existing grammar_patterns: ${error.message}`)
    }
    for (const row of (page ?? []) as Array<{ id: string; slug: string }>) {
      existingPatternsBySlug.set(row.slug, { id: row.id, slug: row.slug })
    }
    if (!page || page.length < PAGE_SIZE) break
    patternOffset += PAGE_SIZE
  }

  // --- pattern-kind learning_capabilities by canonical_key ---
  const existingPatternCapsByCanonicalKey = new Map<string, ExistingPatternCap>()
  let capOffset = 0
  while (true) {
    const { data: page, error } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .select('id, canonical_key')
      .eq('source_kind', 'pattern')
      .range(capOffset, capOffset + PAGE_SIZE - 1)
    if (error) {
      throw new Error(`Failed to fetch existing pattern learning_capabilities: ${error.message}`)
    }
    for (const row of (page ?? []) as Array<{ id: string; canonical_key: string }>) {
      existingPatternCapsByCanonicalKey.set(row.canonical_key, {
        id: row.id,
        canonical_key: row.canonical_key,
      })
    }
    if (!page || page.length < PAGE_SIZE) break
    capOffset += PAGE_SIZE
  }

  // --- per-pattern active exercise-type coverage (one read per typed table) ---
  const exerciseCoverageByPatternId = new Map<string, Set<GrammarExerciseType>>()
  for (const [exerciseType, table] of Object.entries(GRAMMAR_EXERCISE_TABLES) as Array<
    [GrammarExerciseType, string]
  >) {
    let offset = 0
    while (true) {
      const { data: page, error } = await supabase
        .schema('indonesian')
        .from(table)
        .select('grammar_pattern_id')
        .eq('is_active', true)
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) {
        throw new Error(`Failed to fetch exercise coverage from ${table}: ${error.message}`)
      }
      for (const row of (page ?? []) as Array<{ grammar_pattern_id: string }>) {
        let set = exerciseCoverageByPatternId.get(row.grammar_pattern_id)
        if (!set) {
          set = new Set<GrammarExerciseType>()
          exerciseCoverageByPatternId.set(row.grammar_pattern_id, set)
        }
        set.add(exerciseType)
      }
      if (!page || page.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }
  }

  return {
    existingPatternsBySlug,
    existingPatternCapsByCanonicalKey,
    exerciseCoverageByPatternId,
  }
}

// ---------------------------------------------------------------------------
// loadPatternFromDb — composed pattern entry point
// ---------------------------------------------------------------------------

/**
 * Load all DB state the Capability Stage's pattern-kind path needs. Runs the
 * lesson-scoped grammar-section read and the global pattern-state read in
 * parallel. NO disk I/O.
 */
export async function loadPatternFromDb(
  supabase: CapabilitySupabaseClient,
  input: { lessonId: string },
): Promise<PatternDbResult> {
  const [sections, patternState] = await Promise.all([
    fetchGrammarSectionsFromDb(supabase, input.lessonId),
    fetchPatternCapabilityState(supabase),
  ])
  return { categories: sections.categories, topics: sections.topics, patternState }
}
