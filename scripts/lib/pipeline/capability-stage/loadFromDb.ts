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
  section_kind: string
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
  // Read all lesson-source learning_items (these are the already-seeded items).
  const { data: itemData, error: itemError } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .select('id, normalized_text')
    .eq('source_type', 'lesson')

  if (itemError) {
    throw new Error(
      `Failed to fetch existing learning_items: ${itemError.message}`,
    )
  }

  const existingItemsByNormalizedText = new Map<string, ExistingLearningItem>()
  for (const row of (itemData ?? []) as Array<{ id: string; normalized_text: string }>) {
    existingItemsByNormalizedText.set(row.normalized_text, {
      id: row.id,
      normalized_text: row.normalized_text,
    })
  }

  // Read all item-kind learning_capabilities.
  const { data: capData, error: capError } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id, canonical_key')
    .eq('source_kind', 'item')

  if (capError) {
    throw new Error(
      `Failed to fetch existing item learning_capabilities: ${capError.message}`,
    )
  }

  const existingItemCapsByCanonicalKey = new Map<string, ExistingItemCap>()
  for (const row of (capData ?? []) as Array<{ id: string; canonical_key: string }>) {
    existingItemCapsByCanonicalKey.set(row.canonical_key, {
      id: row.id,
      canonical_key: row.canonical_key,
    })
  }

  return { existingItemsByNormalizedText, existingItemCapsByCanonicalKey }
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
