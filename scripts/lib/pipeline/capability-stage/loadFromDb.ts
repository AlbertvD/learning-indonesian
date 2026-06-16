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
import type { ClozePoolItem } from './generateClozeContexts'

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
    // Deterministic ordering: display_order is the primary sort key (matches
    // the staging builder's deduped order → content_units display_order parity).
    // id as tiebreaker for any same-display_order rows.
    .order('display_order', { ascending: true })
    .order('id', { ascending: true })

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
      .eq('source_kind', 'vocabulary_src')
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
 * One row of the cumulative distractor pool (the grammar/pattern path's distractor
 * source). Relocated here from the retired `generateItemDistractors.ts` (cap-v2
 * F1) — it is the return shape of `fetchDistractorPool`. DB-sourced fields:
 */
export interface DistractorInputItem {
  /** `normalized_text` — stable dedup key (candidate-only). */
  source_item_ref: string
  /** 'word' or 'phrase' — used for the same-word-class rule. */
  item_type: 'word' | 'phrase'
  /** `base_text` — the Indonesian word/phrase. */
  indonesian_text: string
  /** `translation_nl` — Dutch translation (L1) shown in choose_meaning_ex. */
  l1_translation: string
}

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
  | 'choose_correct_form_ex'
  | 'transform_sentence_ex'
  | 'translate_sentence_ex'
  | 'choose_missing_word_ex'

/** exercise type → its typed table name (the per-pattern coverage sources). */
export const GRAMMAR_EXERCISE_TABLES: Record<GrammarExerciseType, string> = {
  choose_correct_form_ex: 'contrast_pair_exercises',
  transform_sentence_ex: 'sentence_transformation_exercises',
  translate_sentence_ex: 'constrained_translation_exercises',
  choose_missing_word_ex: 'cloze_mcq_exercises',
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
      .eq('source_kind', 'grammar_pattern_src')
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

// ===========================================================================
// Slice 3 — dialogue_line source kind (dialogue cloze)
// ===========================================================================
//
// Mirrors the item/pattern reads: lesson-scoped typed content (the cloze
// generator's Mode-2 input) + the idempotency-delta state. The seeded signal
// here is per dialogue LINE (R2/R5): a line is seeded iff a `dialogue_clozes`
// row exists for it — surfaced as `seededDialogueLineIds` (the set of
// `dialogue_clozes.dialogue_line_id`). The projector/runner skips generation
// for a seeded line (no LLM call, no write), preserving reviewed clozes.
// NO disk I/O — same enforcement as the item/pattern paths.

// ---------------------------------------------------------------------------
// Public types (dialogue path)
// ---------------------------------------------------------------------------

/** A row from `lesson_dialogue_lines` (PR 6 typed dialogue table). */
export interface TypedDialogueLine {
  id: string
  section_id: string
  lesson_id: string
  line_index: number
  source_line_ref: string
  text: string
  speaker: string | null
  /** The NOT NULL translation leg (the reader contract — byKind/dialogueLine.ts). */
  translation: string
  translation_nl: string | null
  translation_en: string | null
}

/** Entry in the existing dialogue-caps map (keyed by canonical_key). */
export interface ExistingDialogueCap {
  id: string
  canonical_key: string
}

/** The dialogue-path idempotency-delta state from the DB. */
export interface ExistingDialogueState {
  /** `dialogue_line`-kind `learning_capabilities`, keyed by canonical_key. */
  existingDialogueCapsByCanonicalKey: Map<string, ExistingDialogueCap>
  /**
   * `dialogue_clozes.dialogue_line_id` values — the set of dialogue lines that
   * already have a cloze (the per-line seeded signal, R2/R5). A line whose id
   * is in this set is skipped by the generator (no LLM call, no write).
   */
  seededDialogueLineIds: Set<string>
}

/** The composite result returned by `loadDialogueFromDb`. */
export interface DialogueDbResult {
  dialogueLines: TypedDialogueLine[]
  dialogueState: ExistingDialogueState
}

// ---------------------------------------------------------------------------
// fetchDialogueLinesFromDb
// ---------------------------------------------------------------------------

/**
 * Read the typed dialogue lines for ONE lesson — the Mode-2 cloze generator's
 * raw material. Lesson-scoped and small (a handful of lines), so no pagination
 * (mirrors fetchItemRowsFromDb / fetchGrammarSectionsFromDb).
 */
export async function fetchDialogueLinesFromDb(
  supabase: CapabilitySupabaseClient,
  lessonId: string,
): Promise<TypedDialogueLine[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lesson_dialogue_lines')
    .select(
      'id, section_id, lesson_id, line_index, source_line_ref, text, speaker, translation, translation_nl, translation_en',
    )
    .eq('lesson_id', lessonId)

  if (error) {
    throw new Error(
      `Failed to fetch lesson_dialogue_lines for lesson_id=${lessonId}: ${error.message}`,
    )
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row['id'] as string,
    section_id: row['section_id'] as string,
    lesson_id: row['lesson_id'] as string,
    line_index: row['line_index'] as number,
    source_line_ref: row['source_line_ref'] as string,
    text: row['text'] as string,
    speaker: (row['speaker'] as string | null | undefined) ?? null,
    translation: row['translation'] as string,
    translation_nl: (row['translation_nl'] as string | null | undefined) ?? null,
    translation_en: (row['translation_en'] as string | null | undefined) ?? null,
  }))
}

// ---------------------------------------------------------------------------
// fetchDialogueClozeState
// ---------------------------------------------------------------------------

/**
 * Read the dialogue-path idempotency-delta state, GLOBALLY (paginated):
 *   - `dialogue_line`-kind `learning_capabilities` by canonical_key
 *   - `dialogue_clozes.dialogue_line_id` → the seeded-line set
 *
 * Both reads paginate with `.range()` — a truncated seeded set would re-seed a
 * line whose reviewed cloze already exists (the ADR-0011 "preserve reviewed
 * clozes" violation R2 guards against).
 */
export async function fetchDialogueClozeState(
  supabase: CapabilitySupabaseClient,
): Promise<ExistingDialogueState> {
  // --- dialogue_line-kind learning_capabilities by canonical_key ---
  const existingDialogueCapsByCanonicalKey = new Map<string, ExistingDialogueCap>()
  let capOffset = 0
  while (true) {
    const { data: page, error } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .select('id, canonical_key')
      .eq('source_kind', 'dialogue_line_src')
      .range(capOffset, capOffset + PAGE_SIZE - 1)
    if (error) {
      throw new Error(`Failed to fetch existing dialogue_line learning_capabilities: ${error.message}`)
    }
    for (const row of (page ?? []) as Array<{ id: string; canonical_key: string }>) {
      existingDialogueCapsByCanonicalKey.set(row.canonical_key, {
        id: row.id,
        canonical_key: row.canonical_key,
      })
    }
    if (!page || page.length < PAGE_SIZE) break
    capOffset += PAGE_SIZE
  }

  // --- dialogue_clozes.dialogue_line_id → the seeded-line set ---
  const seededDialogueLineIds = new Set<string>()
  let clozeOffset = 0
  while (true) {
    const { data: page, error } = await supabase
      .schema('indonesian')
      .from('dialogue_clozes')
      .select('dialogue_line_id')
      .range(clozeOffset, clozeOffset + PAGE_SIZE - 1)
    if (error) {
      throw new Error(`Failed to fetch dialogue_clozes: ${error.message}`)
    }
    for (const row of (page ?? []) as Array<{ dialogue_line_id: string }>) {
      seededDialogueLineIds.add(row.dialogue_line_id)
    }
    if (!page || page.length < PAGE_SIZE) break
    clozeOffset += PAGE_SIZE
  }

  return { existingDialogueCapsByCanonicalKey, seededDialogueLineIds }
}

// ---------------------------------------------------------------------------
// loadDialogueFromDb — composed dialogue entry point
// ---------------------------------------------------------------------------

/**
 * Load all DB state the Capability Stage's dialogue-kind path needs. Runs the
 * lesson-scoped dialogue-line read and the global dialogue-state read in
 * parallel. NO disk I/O.
 */
export async function loadDialogueFromDb(
  supabase: CapabilitySupabaseClient,
  input: { lessonId: string },
): Promise<DialogueDbResult> {
  const [dialogueLines, dialogueState] = await Promise.all([
    fetchDialogueLinesFromDb(supabase, input.lessonId),
    fetchDialogueClozeState(supabase),
  ])
  return { dialogueLines, dialogueState }
}

// ===========================================================================
// Slice 3 — word_form_pair_src source kind (morphology repoint)
// ===========================================================================
//
// Affixed is a REPOINT (not a generation step): read lesson_section_affixed_pairs
// from the DB instead of morphology-patterns.ts off disk. Lesson-scoped typed
// content + the idempotency-delta. The seeded signal is per CAP: a cap is
// seeded iff an `affixed_form_pairs` row exists for it (`seededAffixedCapIds` =
// the set of `affixed_form_pairs.capability_id`). NO disk I/O.

// ---------------------------------------------------------------------------
// Public types (affixed path)
// ---------------------------------------------------------------------------

/** A row from `lesson_section_affixed_pairs` (PR 6 typed morphology table). */
export interface TypedAffixedPair {
  id: string
  lesson_id: string
  /** Nullable — morphology pairs may have no owning section. */
  section_id: string | null
  source_ref: string
  affix: string
  root_text: string
  derived_text: string
  /** NOT NULL (OQ3-7): "no allomorphy" is a content value, never null. */
  allomorph_rule: string
}

/** Entry in the existing affixed-caps map (keyed by canonical_key). */
export interface ExistingAffixedCap {
  id: string
  canonical_key: string
}

/** The affixed-path idempotency-delta state from the DB. */
export interface ExistingAffixedState {
  /** `word_form_pair_src`-kind `learning_capabilities`, keyed by canonical_key. */
  existingAffixedCapsByCanonicalKey: Map<string, ExistingAffixedCap>
  /** `affixed_form_pairs.capability_id` values — caps that already have a row. */
  seededAffixedCapIds: Set<string>
}

/** The composite result returned by `loadAffixedFromDb`. */
export interface AffixedDbResult {
  affixedPairs: TypedAffixedPair[]
  affixedState: ExistingAffixedState
}

// ---------------------------------------------------------------------------
// fetchAffixedPairsFromDb
// ---------------------------------------------------------------------------

/**
 * Read the typed affixed pairs for ONE lesson — replaces the morphology-patterns.ts
 * staging read. Lesson-scoped and small, so no pagination.
 */
export async function fetchAffixedPairsFromDb(
  supabase: CapabilitySupabaseClient,
  lessonId: string,
): Promise<TypedAffixedPair[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lesson_section_affixed_pairs')
    .select('id, lesson_id, section_id, source_ref, affix, root_text, derived_text, allomorph_rule')
    .eq('lesson_id', lessonId)

  if (error) {
    throw new Error(
      `Failed to fetch lesson_section_affixed_pairs for lesson_id=${lessonId}: ${error.message}`,
    )
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row['id'] as string,
    lesson_id: row['lesson_id'] as string,
    section_id: (row['section_id'] as string | null | undefined) ?? null,
    source_ref: row['source_ref'] as string,
    affix: row['affix'] as string,
    root_text: row['root_text'] as string,
    derived_text: row['derived_text'] as string,
    allomorph_rule: row['allomorph_rule'] as string,
  }))
}

// ---------------------------------------------------------------------------
// fetchAffixedCapabilityState
// ---------------------------------------------------------------------------

/**
 * Read the affixed-path idempotency-delta state, GLOBALLY (paginated):
 *   - `word_form_pair_src`-kind `learning_capabilities` by canonical_key
 *   - `affixed_form_pairs.capability_id` → the seeded-cap set
 */
export async function fetchAffixedCapabilityState(
  supabase: CapabilitySupabaseClient,
): Promise<ExistingAffixedState> {
  // --- word_form_pair_src-kind learning_capabilities by canonical_key ---
  const existingAffixedCapsByCanonicalKey = new Map<string, ExistingAffixedCap>()
  let capOffset = 0
  while (true) {
    const { data: page, error } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .select('id, canonical_key')
      .eq('source_kind', 'word_form_pair_src')
      .range(capOffset, capOffset + PAGE_SIZE - 1)
    if (error) {
      throw new Error(`Failed to fetch existing word_form_pair_src learning_capabilities: ${error.message}`)
    }
    for (const row of (page ?? []) as Array<{ id: string; canonical_key: string }>) {
      existingAffixedCapsByCanonicalKey.set(row.canonical_key, {
        id: row.id,
        canonical_key: row.canonical_key,
      })
    }
    if (!page || page.length < PAGE_SIZE) break
    capOffset += PAGE_SIZE
  }

  // --- affixed_form_pairs.capability_id → the seeded-cap set ---
  const seededAffixedCapIds = new Set<string>()
  let pairOffset = 0
  while (true) {
    const { data: page, error } = await supabase
      .schema('indonesian')
      .from('affixed_form_pairs')
      .select('capability_id')
      .range(pairOffset, pairOffset + PAGE_SIZE - 1)
    if (error) {
      throw new Error(`Failed to fetch affixed_form_pairs: ${error.message}`)
    }
    for (const row of (page ?? []) as Array<{ capability_id: string }>) {
      seededAffixedCapIds.add(row.capability_id)
    }
    if (!page || page.length < PAGE_SIZE) break
    pairOffset += PAGE_SIZE
  }

  return { existingAffixedCapsByCanonicalKey, seededAffixedCapIds }
}

// ---------------------------------------------------------------------------
// loadAffixedFromDb — composed affixed entry point
// ---------------------------------------------------------------------------

/**
 * Load all DB state the Capability Stage's affixed-kind path needs. Runs the
 * lesson-scoped affixed-pair read and the global affixed-state read in
 * parallel. NO disk I/O.
 */
export async function loadAffixedFromDb(
  supabase: CapabilitySupabaseClient,
  input: { lessonId: string },
): Promise<AffixedDbResult> {
  const [affixedPairs, affixedState] = await Promise.all([
    fetchAffixedPairsFromDb(supabase, input.lessonId),
    fetchAffixedCapabilityState(supabase),
  ])
  return { affixedPairs, affixedState }
}

// ---------------------------------------------------------------------------
// fetchClozePool (Slice 3 — dialogue cloze generator input)
// ---------------------------------------------------------------------------

/**
 * Read the cumulative vocab pool WITH part-of-speech for the dialogue cloze
 * generator's eligibility gates (the same-POS-distractor rule needs `pos`).
 *
 * Mirrors fetchDistractorPool (all active word/phrase learning_items, paginated)
 * but selects `pos` and returns the ClozePoolItem shape
 * (normalized_text / base_text / pos). fetchDistractorPool can't be reused — it
 * omits `pos` and maps to a different (DistractorInputItem) shape.
 */
export async function fetchClozePool(
  supabase: CapabilitySupabaseClient,
): Promise<ClozePoolItem[]> {
  const pool: ClozePoolItem[] = []
  let offset = 0

  while (true) {
    const { data: page, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('normalized_text, base_text, pos')
      .eq('is_active', true)
      .in('item_type', ['word', 'phrase'])
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Failed to fetch cloze pool from learning_items: ${error.message}`)
    }

    for (const row of (page ?? []) as Array<{
      normalized_text: string
      base_text: string
      pos: string | null
    }>) {
      pool.push({
        normalized_text: row.normalized_text,
        base_text: row.base_text,
        pos: row.pos ?? null,
      })
    }

    if (!page || page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return pool
}
