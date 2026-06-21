/**
 * capability-stage/adapter.ts — every Supabase write or read this module
 * performs lives here. Mirrors lesson-stage/adapter.ts: pure I/O, no
 * orchestration, no validation logic.
 *
 * Source-of-truth mapping (legacy → new):
 *   legacy 35–50  createSupabaseClient
 *   legacy 203–224 upsertContentUnits
 *   legacy 246–279 upsertCapabilities (now accepts lessonId per Decision 3)
 *   legacy 281–297 upsertCapabilityContentUnits
 *   legacy 299–316 upsertCapabilityArtifacts
 *   legacy 386–420 upsertGrammarPatterns (PGRST205 fallback preserved)
 *   legacy 491–504 upsertLearningItem (gains review_status per §11 #15)
 *   legacy 549–560 upsertItemAnchorContext
 *   (Slice 5b #147) the legacy exercise_variants writers (insertExerciseVariantGrammar
 *     / insertExerciseVariantVocab), the cloze writer (upsertClozeContext), and the
 *     dead lookup helpers (findLearningItemBySlug / fetchGrammarPatternIdsBySlug /
 *     findContextIdBySourceText) are RETIRED — the runner is DB-only and writes
 *     grammar exercises through the typed pattern path (insertGrammarExerciseTyped).
 *   legacy 805–923 supplies the chunked-read helpers used by verify/seedIntegrity.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { buildGrammarExerciseRow } from './projectors/grammarExerciseRows'
import { extractAnswerKey } from './validators/candidatePayload'
import { GRAMMAR_EXERCISE_TABLES, type GrammarExerciseType } from './loadFromDb'
import { findCapsMissingSatellite, type CapForSatelliteCheck } from './satellitePresence'
import { normalizeTtsText } from '../../tts-normalize'
import { itemSlug } from '@/lib/capabilities'

// Homelab uses an internal Step-CA certificate that Node/Bun does not trust by default.
// This is safe — we're connecting to our own internal Supabase instance.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

export type CapabilitySupabaseClient = SupabaseClient

export function createSupabaseClient(): CapabilitySupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_KEY is not set — required for capability-stage writes. ' +
      'Add it to .env.local: SUPABASE_SERVICE_KEY=<your-key>',
    )
  }
  return createClient(url, serviceKey)
}

// ---------------------------------------------------------------------------
// Content units
// ---------------------------------------------------------------------------

export interface ContentUnitInput {
  content_unit_key: string
  source_ref: string
  source_section_ref: string
  unit_kind: 'lesson_section' | 'learning_item' | 'grammar_pattern' | 'affixed_form_pair'
  unit_slug: string
  display_order: number
  payload_json: Record<string, unknown>
  source_fingerprint: string
}

export async function upsertContentUnits(
  supabase: CapabilitySupabaseClient,
  units: ContentUnitInput[],
): Promise<Map<string, string>> {
  const idsBySlug = new Map<string, string>()
  for (const unit of units) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('content_units')
      .upsert({
        content_unit_key: unit.content_unit_key,
        source_ref: unit.source_ref,
        source_section_ref: unit.source_section_ref,
        unit_kind: unit.unit_kind,
        unit_slug: unit.unit_slug,
        display_order: unit.display_order,
        payload_json: unit.payload_json ?? {},
        source_fingerprint: unit.source_fingerprint,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'content_unit_key' })
      .select('id, unit_slug')
      .single()
    if (error) throw error
    idsBySlug.set(data.unit_slug, data.id)
  }
  return idsBySlug
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export interface CapabilityInput {
  canonicalKey: string
  sourceKind: string
  sourceRef: string
  capabilityType: string
  direction: string
  modality: string
  learnerLanguage: string
  projectionVersion: string
  /**
   * Decision 3b (ADR 0006): every lesson-derived capability has lessonId set.
   * Podcast capabilities are the only source kinds permitted to leave it null
   * — see the CHECK constraint in scripts/migration.sql.
   */
  lessonId?: string | null
  // Typed columns replacing metadata_json (Decision F, 2026-05-22).
  // The reader (session-builder/adapter.ts) derives skillType from
  // capability_type; goalTags + difficultyLevel + requiredSourceProgress are
  // gone (no consumers).
  requiredArtifacts: string[]
  prerequisiteKeys: string[]
}

export async function upsertCapabilities(
  supabase: CapabilitySupabaseClient,
  capabilities: CapabilityInput[],
): Promise<Map<string, string>> {
  const idsByKey = new Map<string, string>()
  for (const capability of capabilities) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .upsert({
        canonical_key: capability.canonicalKey,
        source_kind: capability.sourceKind,
        source_ref: capability.sourceRef,
        capability_type: capability.capabilityType,
        direction: capability.direction,
        modality: capability.modality,
        learner_language: capability.learnerLanguage,
        projection_version: capability.projectionVersion,
        readiness_status: 'unknown',
        publication_status: 'draft',
        lesson_id: capability.lessonId ?? null,
        prerequisite_keys: capability.prerequisiteKeys,
        // PR 1.5: re-emission un-retires. If the canonical_key fell out of an
        // earlier emit set and got soft-retired (see retireOrphanedCapabilities),
        // its reappearance here flips retired_at back to NULL so readers see it
        // again. FSRS state in learner_capability_state survives the round-trip
        // because the row id is stable across upserts.
        retired_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'canonical_key' })
      .select('id, canonical_key')
      .single()
    if (error) throw error
    idsByKey.set(data.canonical_key, data.id)
  }
  return idsByKey
}

export interface RetireOrphanedCapabilitiesResult {
  retiredCount: number
  retiredKeys: string[]
}

/**
 * The shared SOFT-RETIRE write seam. Sets `retired_at = now()` on each cap id
 * AND clears the companion `learner_capability_state.next_due_at` so no past-due
 * scheduler row is left pointing at a retired cap (HC14 invariant — data-arch M1
 * of 2026-06-14-readiness-artifact-reconciliation.md §2d).
 *
 * Clearing `next_due_at` (not the row) is sufficient and history-preserving: the
 * due filter requires `nextDueAt != null` (session-builder/dueFilter.ts), while
 * FSRS `stability`/`difficulty`/`lapseCount`/`reviewCount` are untouched — so a
 * later re-emission (upsertCapabilities sets retired_at=null) reanimates the cap
 * and scheduling resumes from preserved state.
 *
 * Both reasons-to-retire share this write: `retireOrphanedCapabilities`
 * (key-not-emitted) and `reconcileArtifactPresence` (satellite-absent).
 */
async function softRetireCapabilities(
  supabase: CapabilitySupabaseClient,
  capIds: string[],
): Promise<void> {
  if (capIds.length === 0) return
  const nowIso = new Date().toISOString()
  const { error: updateError } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .update({ retired_at: nowIso, updated_at: nowIso })
    .in('id', capIds)
  if (updateError) throw updateError

  // M1: a retired cap must not leave a past-due scheduler row behind (HC14).
  const { error: stateError } = await supabase
    .schema('indonesian')
    .from('learner_capability_state')
    .update({ next_due_at: null })
    .in('capability_id', capIds)
  if (stateError) throw stateError
}

/**
 * PR 1.5: soft-retire active capabilities attached to `lessonId` whose
 * canonical_key is NOT in `emittedKeys`. Sets `retired_at = now()`; readers
 * filter `retired_at IS NULL`. Child rows (learner_capability_state FSRS,
 * capability_review_events history) are preserved — no DELETE, no CASCADE.
 *
 * Re-publish flow (per-lesson):
 *   upsertCapabilities      — re-emits every cap in the new staging snapshot
 *                             (sets retired_at = NULL so any previously-retired
 *                             reincarnations come back active).
 *   ↓
 *   retireOrphanedCapabilities — sweeps anything still attached to this
 *                                lesson that did NOT re-appear.
 *
 * Scoped to `lessonId` so a re-publish of lesson N never touches lesson M's
 * capabilities, even if their canonical_keys happen to differ.
 *
 * `sourceKinds` (cap-v2 #161): OPTIONAL source_kind scope. The vocab module and
 * the runner each own DISJOINT source_kinds for one lesson (item vs
 * dialogue_line/pattern/affixed) and call this independently — without the scope,
 * one stage's sweep (its emittedKeys lack the other's keys) would retire the
 * OTHER stage's live caps. Omitted = sweep all kinds (the pre-cutover behavior;
 * backward-compatible — the runner's existing call is unchanged until the cutover
 * narrows it to the non-item kinds, Task 8a).
 */
export async function retireOrphanedCapabilities(
  supabase: CapabilitySupabaseClient,
  input: { lessonId: string; emittedKeys: ReadonlyArray<string>; sourceKinds?: ReadonlyArray<string> },
): Promise<RetireOrphanedCapabilitiesResult> {
  let query = supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id, canonical_key')
    .eq('lesson_id', input.lessonId)
    .is('retired_at', null)
  if (input.sourceKinds && input.sourceKinds.length > 0) {
    query = query.in('source_kind', input.sourceKinds)
  }
  const { data: active, error: fetchError } = await query
  if (fetchError) throw fetchError

  const emittedSet = new Set(input.emittedKeys)
  const orphans = (active ?? []).filter(
    (c: { canonical_key: string }) => !emittedSet.has(c.canonical_key),
  )
  if (orphans.length === 0) {
    return { retiredCount: 0, retiredKeys: [] }
  }

  const orphanIds = orphans.map((o: { id: string }) => o.id)
  await softRetireCapabilities(supabase, orphanIds)

  return {
    retiredCount: orphanIds.length,
    retiredKeys: orphans.map((o: { canonical_key: string }) => o.canonical_key),
  }
}

/**
 * Readiness↔artifact reconciliation (2026-06-14 spec). The sibling soft-retire
 * reason on the same write seam as `retireOrphanedCapabilities`, with a different
 * predicate: instead of "canonical_key not re-emitted" it is "required typed
 * satellite row is ABSENT" (the shared `findCapsMissingSatellite` predicate).
 *
 * Soft-retires any active + ready + published capability for `lessonId` (scoped
 * to `sourceKinds`) whose render artifact has disappeared post-seed — so an
 * unrenderable cap can never stay schedulable (the live N−2 bug). The cap
 * re-activates automatically on a later publish once its satellite exists again
 * (upsertCapabilities sets retired_at=null on re-emission).
 *
 * MUST run AFTER this run's typed satellite writes (so a just-written row counts
 * as present) and BEFORE promotion (so a cap retired this run is not re-promoted).
 * Source-kind scoping is load-bearing: the runner owns the non-item kinds and the
 * vocab module owns `['item']`; an unscoped sweep would cross the ownership line.
 */
export async function reconcileArtifactPresence(
  supabase: CapabilitySupabaseClient,
  input: { lessonId: string; sourceKinds: ReadonlyArray<string> },
): Promise<RetireOrphanedCapabilitiesResult> {
  if (input.sourceKinds.length === 0) return { retiredCount: 0, retiredKeys: [] }

  const { data, error } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id, canonical_key, source_kind, source_ref, capability_type')
    .eq('lesson_id', input.lessonId)
    .eq('readiness_status', 'ready')
    .eq('publication_status', 'published')
    .is('retired_at', null)
    .in('source_kind', [...input.sourceKinds])
  if (error) throw error

  const caps = (data ?? []) as CapForSatelliteCheck[]
  const missing = await findCapsMissingSatellite(supabase, caps)
  if (missing.length === 0) return { retiredCount: 0, retiredKeys: [] }

  await softRetireCapabilities(supabase, missing.map((c) => c.id))
  return {
    retiredCount: missing.length,
    retiredKeys: missing.map((c) => c.canonical_key),
  }
}

// ---------------------------------------------------------------------------
// Capability ↔ content-unit junction
// ---------------------------------------------------------------------------

export interface CapabilityContentUnitInput {
  capability_id: string
  content_unit_id: string
  relationship_kind: 'introduced_by' | 'practiced_by' | 'assessed_by' | 'referenced_by'
}

export async function upsertCapabilityContentUnits(
  supabase: CapabilitySupabaseClient,
  rows: CapabilityContentUnitInput[],
): Promise<number> {
  let count = 0
  for (const row of rows) {
    const { error } = await supabase
      .schema('indonesian')
      .from('capability_content_units')
      .upsert({
        capability_id: row.capability_id,
        content_unit_id: row.content_unit_id,
        relationship_kind: row.relationship_kind,
      }, { onConflict: 'capability_id,content_unit_id,relationship_kind' })
    if (error) throw error
    count++
  }
  return count
}

// ---------------------------------------------------------------------------
// Dialogue clozes (PR 2 — typed satellite replacing 3 capability_artifacts rows)
// ---------------------------------------------------------------------------

export interface DialogueClozeInput {
  capability_id: string
  /**
   * The `lesson_dialogue_lines.source_line_ref` of the source line. The
   * adapter resolves this to the line's UUID via a single bulk read on the
   * UNIQUE column. We use the ref rather than the raw id so the projector
   * stays pure (no DB lookup) — the resolution happens here at the I/O
   * seam.
   */
  source_line_ref: string
  sentence_with_blank: string
  answer_text: string
  /** The NOT NULL translation leg (the reader contract — byKind/dialogueLine.ts). */
  translation_text: string
  /**
   * R3 (data-arch m-1): the bilingual legs from lesson_dialogue_lines (PR 6).
   * Optional on the input shape so the legacy staging path stays valid; the
   * DB→DB projector populates them and replaceDialogueClozes persists them.
   */
  translation_nl?: string | null
  translation_en?: string | null
}

/**
 * Replace every `dialogue_clozes` row whose capability_id is in `inputs`.
 *
 * Strategy: delete by `capability_id` first (UNIQUE), then bulk-insert.
 * This is safe because `dialogue_clozes` is a regenerable projection of
 * staged cloze contexts + lesson dialogue lines — there is no referenced
 * user state. The 1:1 UNIQUE(capability_id) keeps the row count bounded.
 *
 * Returns the number of rows written.
 */
export async function replaceDialogueClozes(
  supabase: CapabilitySupabaseClient,
  inputs: DialogueClozeInput[],
): Promise<number> {
  if (inputs.length === 0) return 0

  // Bulk-resolve source_line_ref → lesson_dialogue_lines.id via a single
  // chunked read. The column is UNIQUE so the map is 1:1.
  const refs = [...new Set(inputs.map((i) => i.source_line_ref))]
  const idByRef = new Map<string, string>()
  for (let i = 0; i < refs.length; i += 50) {
    const slice = refs.slice(i, i + 50)
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lesson_dialogue_lines')
      .select('id, source_line_ref')
      .in('source_line_ref', slice)
    if (error) throw error
    for (const row of (data ?? []) as Array<{ id: string; source_line_ref: string }>) {
      idByRef.set(row.source_line_ref, row.id)
    }
  }

  const resolved: Array<DialogueClozeInput & { dialogue_line_id: string }> = []
  for (const input of inputs) {
    const dialogueLineId = idByRef.get(input.source_line_ref)
    if (!dialogueLineId) {
      throw new Error(
        `replaceDialogueClozes: no lesson_dialogue_lines row found for source_line_ref="${input.source_line_ref}". ` +
        `Stage A must have written the dialogue line before Stage B writes its cloze. ` +
        `Verify Stage A's lesson_dialogue_lines insert covered this section.`,
      )
    }
    resolved.push({ ...input, dialogue_line_id: dialogueLineId })
  }

  const capabilityIds = resolved.map((r) => r.capability_id)
  const { error: deleteError } = await supabase
    .schema('indonesian')
    .from('dialogue_clozes')
    .delete()
    .in('capability_id', capabilityIds)
  if (deleteError) throw deleteError

  const { error: insertError } = await supabase
    .schema('indonesian')
    .from('dialogue_clozes')
    .insert(
      resolved.map((r) => ({
        capability_id: r.capability_id,
        dialogue_line_id: r.dialogue_line_id,
        sentence_with_blank: r.sentence_with_blank,
        answer_text: r.answer_text,
        translation_text: r.translation_text,
        // R3 (data-arch m-1): persist the bilingual legs when supplied (DB→DB
        // path). undefined → null so the legacy staging path (no nl/en) stays valid.
        translation_nl: r.translation_nl ?? null,
        translation_en: r.translation_en ?? null,
      })),
    )
  if (insertError) throw insertError

  return resolved.length
}

// ---------------------------------------------------------------------------
// Affixed form pairs (PR 3 — typed satellite replacing 2 capability_artifacts
// rows: root_derived_pair + allomorph_rule)
// ---------------------------------------------------------------------------

export interface AffixedFormPairRowInput {
  capability_id: string
  source_ref: string
  lesson_id: string
  root_text: string
  derived_text: string
  allomorph_rule: string
  // Morphology phase-b application-tier payload (projection table NOT NULL on
  // grammar_pattern_id / affix_type / productive; the projector + Layer-2 validator
  // guarantee those are populated before this write).
  grammar_pattern_id: string
  affix: string | null
  affix_type: string | null
  affix_gloss: string | null
  allomorph_class: string | null
  circumfix_left: string | null
  circumfix_right: string | null
  productive: boolean | null
  carrier_text: string | null
  /** Bilingual derived-form meaning (projected from source; null = un-glossed). */
  derived_gloss_nl: string | null
  derived_gloss_en: string | null
}

/**
 * Replace every `affixed_form_pairs` row whose capability_id is in `inputs`.
 *
 * Strategy: delete by `capability_id` first (the column is UNIQUE — one row
 * per cap, 2 caps per linguistic pair), then bulk-insert. Safe because
 * `affixed_form_pairs` is a regenerable projection of staged morphology pairs
 * — no referenced user state. Simpler than replaceDialogueClozes: there is no
 * source_line_ref → id resolution; capability_id is the only key.
 *
 * Returns the number of rows written.
 */
export async function replaceAffixedFormPairs(
  supabase: CapabilitySupabaseClient,
  inputs: AffixedFormPairRowInput[],
): Promise<number> {
  if (inputs.length === 0) return 0

  const capabilityIds = inputs.map((r) => r.capability_id)
  const { error: deleteError } = await supabase
    .schema('indonesian')
    .from('affixed_form_pairs')
    .delete()
    .in('capability_id', capabilityIds)
  if (deleteError) throw deleteError

  const { error: insertError } = await supabase
    .schema('indonesian')
    .from('affixed_form_pairs')
    .insert(
      inputs.map((r) => ({
        capability_id: r.capability_id,
        source_ref: r.source_ref,
        lesson_id: r.lesson_id,
        root_text: r.root_text,
        derived_text: r.derived_text,
        allomorph_rule: r.allomorph_rule,
        grammar_pattern_id: r.grammar_pattern_id,
        affix: r.affix,
        affix_type: r.affix_type,
        affix_gloss: r.affix_gloss,
        allomorph_class: r.allomorph_class,
        circumfix_left: r.circumfix_left,
        circumfix_right: r.circumfix_right,
        productive: r.productive,
        carrier_text: r.carrier_text,
        derived_gloss_nl: r.derived_gloss_nl,
        derived_gloss_en: r.derived_gloss_en,
      })),
    )
  if (insertError) throw insertError

  return inputs.length
}

// ---------------------------------------------------------------------------
// Grammar patterns (PGRST205 fallback preserved verbatim)
// ---------------------------------------------------------------------------

export interface GrammarPatternInput {
  slug: string
  pattern_name: string
  description?: string
  complexity_score: number
  confusion_group?: string | null
  introduced_by_lesson_id: string
}

export async function upsertGrammarPatterns(
  supabase: CapabilitySupabaseClient,
  patterns: GrammarPatternInput[],
): Promise<{ idsBySlug: Map<string, string>; tableMissing: boolean }> {
  const idsBySlug = new Map<string, string>()
  for (const pattern of patterns) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('grammar_patterns')
      .upsert({
        slug: pattern.slug,
        name: pattern.pattern_name,
        short_explanation: pattern.description,
        complexity_score: pattern.complexity_score,
        confusion_group: pattern.confusion_group ?? null,
        introduced_by_lesson_id: pattern.introduced_by_lesson_id,
      }, { onConflict: 'slug' })
      .select('id')
      .single()
    if (error && (error as { code?: string }).code === 'PGRST205') {
      // Grammar patterns table not yet in schema cache — bail out silently.
      // Mirrors legacy 409–412 behaviour.
      return { idsBySlug, tableMissing: true }
    }
    if (error) throw error
    idsBySlug.set(pattern.slug, data.id)
  }
  return { idsBySlug, tableMissing: false }
}

// ---------------------------------------------------------------------------
// Learning items + meanings + anchor contexts
// ---------------------------------------------------------------------------

export interface LearningItemInput {
  base_text: string
  item_type: 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
  language: string
  level: string
  source_type: 'lesson'
  pos?: string | null
  /** Decision R (PR 1): inline translation columns replacing item_meanings rows. */
  translation_nl?: string | null
  translation_en?: string | null
  /** §11 #15 — when set to 'deferred_dialogue', drives the dialogue defer state. */
  review_status?: 'published' | 'deferred_dialogue'
}

export async function upsertLearningItem(
  supabase: CapabilitySupabaseClient,
  item: LearningItemInput,
): Promise<{ id: string; normalized_text: string }> {
  const normalized_text = itemSlug(item.base_text)
  // is_active: true on every projected item. The capability-stage runner is
  // the publish-time gate — if an item reaches upsertLearningItem, the
  // projector has already cleared selectPublishableItems and decided the
  // item is publishable. Without this, the 2026-04-24 incident's residue of
  // is_active=false dialogue_chunks could not be reactivated by a
  // re-publish (the ON CONFLICT DO UPDATE only refreshed listed columns,
  // leaving is_active intact). Deferred items don't reach this path, so
  // they correctly stay inactive.
  const payload: Record<string, unknown> = {
    base_text: item.base_text,
    item_type: item.item_type,
    normalized_text,
    language: item.language,
    level: item.level,
    source_type: item.source_type,
    pos: item.pos ?? null,
    is_active: true,
  }
  // Decision R (PR 1): write inline translation columns when provided.
  if (item.translation_nl != null) payload.translation_nl = item.translation_nl
  if (item.translation_en != null) payload.translation_en = item.translation_en
  if (item.review_status) {
    payload.review_status = item.review_status
  }
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .upsert(payload, { onConflict: 'normalized_text' })
    .select('id, normalized_text')
    .single()
  if (error) throw error
  return { id: data.id, normalized_text: data.normalized_text }
}


export interface AnchorContextInput {
  learning_item_id: string
  context_type: string
  source_text: string
  translation_text: string | null | undefined
  source_lesson_id: string
}

export async function upsertItemAnchorContext(
  supabase: CapabilitySupabaseClient,
  ctx: AnchorContextInput,
): Promise<void> {
  const { error } = await supabase
    .schema('indonesian')
    .from('item_contexts')
    .upsert({
      learning_item_id: ctx.learning_item_id,
      context_type: ctx.context_type,
      source_text: ctx.source_text,
      translation_text: ctx.translation_text,
      is_anchor_context: true,
      source_lesson_id: ctx.source_lesson_id,
    }, { onConflict: 'learning_item_id,source_text' })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Cloze contexts (item_contexts type='cloze')
// ---------------------------------------------------------------------------

// upsertClozeContext + ClozeContextInput retired in Slice 5b (#147): the
// authored cloze item_contexts are DB-authoritative (ADR 0011 seed-once) and
// are #148's item-cloze substrate; the capability stage no longer (re-)seeds
// them. The noClozeWriter enforcement test guards against reintroduction.

/**
 * Insert a typed grammar-exercise row into one of the 4 typed grammar exercise
 * tables (from GRAMMAR_EXERCISE_TABLES). `row` carries grammar_pattern_id +
 * lesson_id + the typed columns built by buildGrammarExerciseRow. This is the
 * SOLE grammar-exercise writer now (Slice 5b #147): the legacy exercise_variants
 * dual-write is retired, and the pattern path (writePatternPath) calls this.
 */
export async function insertGrammarExerciseTyped(
  supabase: CapabilitySupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from(table)
    .insert({ ...row, is_active: true })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data?.id as string | undefined) ?? undefined }
}

// ---------------------------------------------------------------------------
// Slice 2 Task 5 — idempotent typed grammar-exercise writers (NO exercise_variants).
//
// The 4 typed exercise tables are keyless (surrogate id only), so idempotency is
// enforced by the PATTERN-LEVEL gate (patternSeeding.ts), NOT per-row. The
// runner decides skip / delete-first / generate; these helpers do the raw
// write + the delete-by-pattern that the partial-rebuild + --regenerate paths
// need. Physical DELETE is safe: the typed tables are leaf tables (no inbound
// FKs — verified migration.sql:2371-2500), so nothing dangles.
// ---------------------------------------------------------------------------

/** A generated grammar-exercise candidate (camelCase payload shape). */
export interface GrammarExerciseCandidateInput {
  exercise_type: GrammarExerciseType
  payload: Record<string, unknown>
}

export interface WriteGrammarExercisesResult {
  written: number
  /** Per-type count of rows written (the post-write coverage this run produced). */
  byType: Record<GrammarExerciseType, number>
}

/**
 * Insert the typed grammar-exercise rows for ONE pattern across the 4 tables.
 * Each candidate is mapped via the SHARED buildGrammarExerciseRow (so the write
 * path can never drift from the CS13 validator / the bridge) and written with
 * the pattern + lesson keys. A DB error fails loud (the candidate already passed
 * the generator's defensive validation, so a DB reject is a real schema/CHECK
 * surprise worth surfacing — Lesson #2). The caller is responsible for the
 * skip / delete-first decision (patternSeeding.ts).
 */
export async function writeGrammarExercisesForPattern(
  supabase: CapabilitySupabaseClient,
  grammarPatternId: string,
  lessonId: string,
  candidates: GrammarExerciseCandidateInput[],
): Promise<WriteGrammarExercisesResult> {
  const byType: Record<GrammarExerciseType, number> = {
    choose_correct_form_ex: 0,
    transform_sentence_ex: 0,
    translate_sentence_ex: 0,
    choose_missing_word_ex: 0,
  }
  let written = 0
  for (const candidate of candidates) {
    const answerKey = extractAnswerKey(candidate.exercise_type, candidate.payload)
    const built = buildGrammarExerciseRow(candidate.exercise_type, candidate.payload, answerKey)
    if (!built) continue
    const result = await insertGrammarExerciseTyped(supabase, built.table, {
      ...built.columns,
      grammar_pattern_id: grammarPatternId,
      lesson_id: lessonId,
    })
    if (!result.ok) {
      throw new Error(
        `Typed grammar-exercise write failed (${built.table}, ${candidate.exercise_type}, ` +
        `pattern=${grammarPatternId}): ${result.error}`,
      )
    }
    written += 1
    byType[candidate.exercise_type] += 1
  }
  return { written, byType }
}

/**
 * Delete ALL typed grammar-exercise rows for a pattern across the 4 tables (by
 * grammar_pattern_id). Used by the partial-rebuild path (a pattern detected
 * `partial` is wiped before regeneration so no stale type lingers) and by
 * `--regenerate <pattern-slug>`. Physical delete — safe (leaf tables). Returns
 * the total rows removed.
 */
export async function deleteGrammarExercisesForPattern(
  supabase: CapabilitySupabaseClient,
  grammarPatternId: string,
): Promise<number> {
  let deleted = 0
  for (const table of Object.values(GRAMMAR_EXERCISE_TABLES)) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from(table)
      .delete()
      .eq('grammar_pattern_id', grammarPatternId)
      .select('id')
    if (error) {
      throw new Error(
        `Failed to delete typed grammar exercises from ${table} for pattern=${grammarPatternId}: ${error.message}`,
      )
    }
    deleted += (data ?? []).length
  }
  return deleted
}

/**
 * The Task-6 cutover-DELETE (C1/I2): remove the lesson's legacy grammar_patterns
 * whose slug is NOT in the new category-derived set. FK ON DELETE CASCADE
 * (migration.sql:2373/2408/2442/2477 + grammar_pattern_examples +
 * item_context_grammar_patterns) clears their typed exercise rows. This is the
 * piece `retireOrphanedCapabilities` (SOFT, cap-only) cannot do — without it the
 * legacy 47 patterns + their is_active typed rows persist as dead data and
 * "REPLACED" would be a lie. Returns the deleted slugs (for logging).
 *
 * SAFETY: scoped to `introduced_by_lesson_id = lessonId` so it can only ever
 * remove THIS lesson's patterns; `keepSlugs` is the new set to preserve.
 *
 * LEGACY review_events (live-trial finding 2026-06-01): `review_events`
 * .grammar_pattern_id is `ON DELETE SET NULL` (migration.sql:812) but
 * `review_events_source_check` (migration.sql:888) forbids a row with BOTH
 * source columns null — so a grammar review_event blocks the pattern delete
 * (the SET-NULL would violate the check). `review_events` is a DEAD legacy table
 * (zero readers/writers in src/; the live app uses capability_review_events,
 * which is 0 for patterns). So we first DELETE the legacy grammar review_events
 * for the to-delete patterns (operator-approved 2026-06-01), then delete the
 * patterns. This completes the clean hard-delete the cutover intends.
 */
export async function deleteLegacyPatternsForLesson(
  supabase: CapabilitySupabaseClient,
  lessonId: string,
  keepSlugs: string[],
): Promise<string[]> {
  // Fetch this lesson's patterns first so we can compute + return the delete set
  // (PostgREST has no "NOT IN (subquery)" — do the diff in code, delete by id).
  const { data, error } = await supabase
    .schema('indonesian')
    .from('grammar_patterns')
    .select('id, slug')
    .eq('introduced_by_lesson_id', lessonId)
  if (error) {
    throw new Error(`Failed to read grammar_patterns for lesson=${lessonId}: ${error.message}`)
  }
  const keep = new Set(keepSlugs)
  const toDelete = ((data ?? []) as Array<{ id: string; slug: string }>).filter(
    (p) => !keep.has(p.slug),
  )
  if (toDelete.length === 0) return []
  const deleteIds = toDelete.map((p) => p.id)

  // Clear the dead-legacy grammar review_events that would otherwise block the
  // delete via the SET-NULL → source-check violation (see fn docstring).
  const { error: reError } = await supabase
    .schema('indonesian')
    .from('review_events')
    .delete()
    .in('grammar_pattern_id', deleteIds)
  if (reError) {
    throw new Error(`Failed to clear legacy review_events for lesson=${lessonId}: ${reError.message}`)
  }

  const { error: delError } = await supabase
    .schema('indonesian')
    .from('grammar_patterns')
    .delete()
    .in('id', deleteIds)
  if (delError) {
    throw new Error(`Failed to delete legacy grammar_patterns for lesson=${lessonId}: ${delError.message}`)
  }
  return toDelete.map((p) => p.slug)
}

export async function countExerciseVariantsForLesson(
  supabase: CapabilitySupabaseClient,
  lessonId: string,
): Promise<number> {
  const { count } = await supabase
    .schema('indonesian')
    .from('exercise_variants')
    .select('*', { count: 'exact', head: true })
    .eq('lesson_id', lessonId)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Audio coverage (Decision §11 #20: normalize via normalizeTtsText, NOT lower+trim only)
// ---------------------------------------------------------------------------

export interface AudioClipMeta {
  storage_path: string
  voice_id: string
}

/**
 * Read all audio_clips for a lesson, keyed by normalized_text. When multiple
 * voices exist for the same text, `preferredVoiceId` wins; otherwise the first
 * row seen is kept. The capability snapshot uses presence in this map to set
 * `hasAudio` on each item (replacing the legacy hardcoded `false`); the
 * artifact builder reads `storage_path` to populate the `audio_clip` payload.
 *
 * Stage A writes audio_clips with `normalized_text = normalizeTtsText(text)`
 * (audio.ts:71), so callers must look up using the same normalization (see
 * `lookupAudioClip` below).
 */
export async function fetchLessonAudioCoverage(
  supabase: CapabilitySupabaseClient,
  lessonId: string,
  preferredVoiceId: string | null,
): Promise<Map<string, AudioClipMeta>> {
  // audio_clips uses `generated_for_lesson_id` (FK to lessons) — not
  // `lesson_id` — per scripts/migration.sql:948.
  const { data, error } = await supabase
    .schema('indonesian')
    .from('audio_clips')
    .select('normalized_text, storage_path, voice_id')
    .eq('generated_for_lesson_id', lessonId)
  if (error) throw error

  const map = new Map<string, AudioClipMeta>()
  for (const row of (data ?? []) as Array<{ normalized_text: string; storage_path: string; voice_id: string }>) {
    const existing = map.get(row.normalized_text)
    const isPreferred = preferredVoiceId !== null && row.voice_id === preferredVoiceId
    if (!existing || isPreferred) {
      map.set(row.normalized_text, { storage_path: row.storage_path, voice_id: row.voice_id })
    }
  }
  return map
}

export function lookupAudioClip(
  audioClipsByNormalizedText: ReadonlyMap<string, AudioClipMeta>,
  baseText: string,
): AudioClipMeta | undefined {
  return audioClipsByNormalizedText.get(normalizeTtsText(baseText))
}

// ---------------------------------------------------------------------------
// Item distractor tables (Task 6b — typed satellites for recognition/cued-recall/cloze MCQ)
// ---------------------------------------------------------------------------

export interface ItemDistractorRow {
  capability_id: string
  /** Distractor texts for choose_meaning_ex (L1→L2 MCQ wrong choices) */
  recognition: string[]
  /** Distractor texts for choose_form_ex (L2→L1 MCQ wrong choices) */
  choose_form_ex: string[]
  /** Distractor texts for cloze_mcq_item (in-sentence MCQ wrong choices) */
  cloze: string[]
}

export interface UpsertItemDistractorsResult {
  written: number
  skipped: number
}

const DISTRACTOR_TABLES = ['recognition_mcq_distractors', 'cued_recall_distractors', 'cloze_mcq_item_distractors'] as const
type DistractorTable = typeof DISTRACTOR_TABLES[number]

function distractorPayload(table: DistractorTable, rows: ItemDistractorRow[]): Array<{ capability_id: string; distractors: string[] }> {
  if (table === 'recognition_mcq_distractors') return rows.map((r) => ({ capability_id: r.capability_id, distractors: r.recognition }))
  if (table === 'cued_recall_distractors') return rows.map((r) => ({ capability_id: r.capability_id, distractors: r.choose_form_ex }))
  return rows.map((r) => ({ capability_id: r.capability_id, distractors: r.cloze }))
}

/**
 * Skip-if-exists: inserts one row per table per capability_id, using
 * INSERT ... ON CONFLICT DO NOTHING (ignoreDuplicates: true). Existing rows
 * (i.e. from a previous publish or a DB-side correction) are never overwritten.
 * The --regenerate path calls deleteItemDistractors first, then this.
 *
 * written/skipped counts are derived from the recognition table insert with
 * RETURNING * (PostgREST returns only actually-inserted rows).
 *
 * @deprecated Use upsertRecognitionDistractors / upsertCuedRecallDistractors
 * directly for per-cap-1:1 correctness. This function writes ALL 3 tables for
 * every row — only valid when all rows carry all 3 distractor arrays and all
 * cap ids are of matching types. Retained for the --regenerate delete+rewrite
 * path and backward compat.
 */
export async function upsertItemDistractors(
  supabase: CapabilitySupabaseClient,
  rows: ItemDistractorRow[],
): Promise<UpsertItemDistractorsResult> {
  if (rows.length === 0) return { written: 0, skipped: 0 }

  // Upsert recognition table first with .select() to get the count of
  // actually-inserted rows. ignoreDuplicates:true = INSERT ... ON CONFLICT DO NOTHING;
  // PostgREST returns only the rows that were actually inserted.
  const recognitionPayload = distractorPayload('recognition_mcq_distractors', rows)
  const { data: writtenRows, error: recErr } = await supabase
    .schema('indonesian')
    .from('recognition_mcq_distractors')
    .upsert(recognitionPayload, { onConflict: 'capability_id', ignoreDuplicates: true })
    .select()
  if (recErr) throw recErr

  const written = (writtenRows ?? []).length
  const skipped = rows.length - written

  // Upsert the other two tables (also skip-if-exists; no count needed).
  for (const table of ['cued_recall_distractors', 'cloze_mcq_item_distractors'] as const) {
    const payload = distractorPayload(table, rows)
    const { error } = await supabase
      .schema('indonesian')
      .from(table)
      .upsert(payload, { onConflict: 'capability_id', ignoreDuplicates: true })
    if (error) throw error
  }

  return { written, skipped }
}

/**
 * Per-cap-1:1 variant: write recognition_mcq_distractors rows.
 *
 * Only writes to `recognition_mcq_distractors`. Each row carries one
 * capability_id (must be a recognise_meaning_from_text_cap cap) and its `recognition`
 * distractor array. The `choose_form_ex` and `cloze` fields on ItemDistractorRow
 * are ignored by this function.
 *
 * Returns the count of newly-inserted rows (skipped = existing rows untouched).
 */
export async function upsertRecognitionDistractors(
  supabase: CapabilitySupabaseClient,
  rows: Array<{ capability_id: string; distractors: string[] }>,
): Promise<UpsertItemDistractorsResult> {
  if (rows.length === 0) return { written: 0, skipped: 0 }

  const { data: writtenRows, error } = await supabase
    .schema('indonesian')
    .from('recognition_mcq_distractors')
    .upsert(rows, { onConflict: 'capability_id', ignoreDuplicates: true })
    .select()
  if (error) throw error

  const written = (writtenRows ?? []).length
  const skipped = rows.length - written
  return { written, skipped }
}

/**
 * Per-cap-1:1 variant: write cued_recall_distractors rows.
 *
 * Only writes to `cued_recall_distractors`. Each row carries one capability_id
 * (must be an recognise_form_from_meaning_cap cap) and its `distractors` array. Returns the
 * count of newly-inserted rows.
 */
export async function upsertCuedRecallDistractors(
  supabase: CapabilitySupabaseClient,
  rows: Array<{ capability_id: string; distractors: string[] }>,
): Promise<UpsertItemDistractorsResult> {
  if (rows.length === 0) return { written: 0, skipped: 0 }

  const { error } = await supabase
    .schema('indonesian')
    .from('cued_recall_distractors')
    .upsert(rows, { onConflict: 'capability_id', ignoreDuplicates: true })
  if (error) throw error

  // cued_recall_distractors does not need the written count for the runner's
  // itemDistractorSets metric (that uses the recognition table as the signal).
  return { written: rows.length, skipped: 0 }
}

/**
 * Fetch the set of capability_ids that already have rows in
 * `recognition_mcq_distractors`. Used as the generation gate: caps
 * already in this set are skipped (no LLM call, no write). The
 * recognition table is used as the canonical seeded-state signal — all
 * three distractor tables are written atomically by `upsertItemDistractors`,
 * so if recognition has a row the other two will too.
 *
 * @param capabilityIds  The item-capability IDs to check. May be empty.
 * @returns A Set of capability_ids that are already seeded.
 */
export async function fetchSeededDistractorCapIds(
  supabase: CapabilitySupabaseClient,
  capabilityIds: string[],
): Promise<Set<string>> {
  if (capabilityIds.length === 0) return new Set()

  const seeded = new Set<string>()
  const CHUNK = 50
  for (let i = 0; i < capabilityIds.length; i += CHUNK) {
    const chunk = capabilityIds.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .schema('indonesian')
      .from('recognition_mcq_distractors')
      .select('capability_id')
      .in('capability_id', chunk)
    if (error) throw error
    for (const row of (data ?? []) as Array<{ capability_id: string }>) {
      seeded.add(row.capability_id)
    }
  }
  return seeded
}

/**
 * Destructive removal of distractor rows for the given capabilityIds from all
 * three tables. Called by the --regenerate path before re-seeding.
 */
export async function deleteItemDistractors(
  supabase: CapabilitySupabaseClient,
  capabilityIds: string[],
): Promise<void> {
  if (capabilityIds.length === 0) return
  for (const table of DISTRACTOR_TABLES) {
    const { error } = await supabase
      .schema('indonesian')
      .from(table)
      .delete()
      .in('capability_id', capabilityIds)
    if (error) throw error
  }
}

/**
 * Idempotent learning_items write for the item-source path.
 *
 * Uses check-then-write because supabase-js `.upsert` has no `update` option
 * to restrict which columns are refreshed on conflict — a plain `.upsert` with
 * `onConflict` and without `ignoreDuplicates` issues a merge-duplicates UPDATE
 * covering ALL payload columns, which would clobber DB-corrected `pos` with null.
 *
 * On INSERT (new normalized_text): writes the full payload including pos,
 * level, base_text, translations, is_active.
 *
 * On conflict (normalized_text already exists): issues a targeted UPDATE of ONLY
 * the lesson-derived translation columns (translation_nl, translation_en).
 * Capability-authored columns (pos, level, base_text, is_active) are
 * preserved — a DB-side correction or enrichment is never overwritten by
 * a routine re-publish.
 *
 * Single-writer pipeline guarantees no race between the SELECT and the write.
 */
export async function upsertLearningItemIdempotent(
  supabase: CapabilitySupabaseClient,
  item: LearningItemInput,
): Promise<{ id: string; normalized_text: string }> {
  const normalized_text = itemSlug(item.base_text)

  // Check whether the row already exists.
  const { data: existing, error: selectErr } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .select('id, normalized_text')
    .eq('normalized_text', normalized_text)
    .maybeSingle()
  if (selectErr) throw selectErr

  if (existing) {
    // UPDATE only lesson-derived translation columns; pos/level/base_text/is_active preserved.
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .update({
        translation_nl: item.translation_nl ?? null,
        translation_en: item.translation_en ?? null,
      })
      .eq('normalized_text', normalized_text)
      .select('id, normalized_text')
      .single()
    if (error) throw error
    return { id: data.id, normalized_text: data.normalized_text }
  }

  // INSERT full payload for a new item.
  const payload: Record<string, unknown> = {
    base_text: item.base_text,
    item_type: item.item_type,
    normalized_text,
    language: item.language,
    level: item.level,
    source_type: item.source_type,
    pos: item.pos ?? null,
    is_active: true,
    translation_nl: item.translation_nl ?? null,
    translation_en: item.translation_en ?? null,
  }
  if (item.review_status) {
    payload.review_status = item.review_status
  }
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .insert(payload)
    .select('id, normalized_text')
    .single()
  if (error) throw error
  return { id: data.id, normalized_text: data.normalized_text }
}

// ---------------------------------------------------------------------------
// DB-native POS read + write (Task 5a.4)
// ---------------------------------------------------------------------------

/**
 * Read `pos` for a set of `normalized_text` values from `learning_items`.
 * Returns a Map<normalized_text, pos|null>.  Items not found in the DB are
 * absent from the map (not the same as pos=null).
 *
 * Used by the DB-native POS pass (runner step 5b+) to determine which items
 * already have a valid pos and can skip the LLM classification.
 */
export async function fetchLearningItemPosByNormalizedText(
  supabase: CapabilitySupabaseClient,
  normalizedTexts: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()
  if (normalizedTexts.length === 0) return result

  // Chunk the .in() filter: a ~500-item unit makes the GET URL overrun the Kong
  // gateway (502 "invalid response from upstream") before any work is logged.
  const IN_CHUNK = 100
  for (let i = 0; i < normalizedTexts.length; i += IN_CHUNK) {
    const slice = normalizedTexts.slice(i, i + IN_CHUNK)
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('normalized_text, pos')
      .in('normalized_text', slice)
    if (error) throw error
    for (const row of (data ?? []) as Array<{ normalized_text: string; pos: string | null }>) {
      result.set(row.normalized_text, row.pos ?? null)
    }
  }
  return result
}

/**
 * Write `pos` for a single `learning_items` row identified by `normalized_text`.
 * This is the sole pos writer on the DB-native path (Task 5a.4).  Called once
 * per item whose pos was null after insert and was classified by
 * `enrichMissingPos`.
 *
 * The idempotent upsert in `upsertLearningItemIdempotent` preserves pos on
 * UPDATE (never touches it), so this writer is the only thing that fills pos
 * for newly-inserted items on the DB-native path.
 */
export async function updateLearningItemPos(
  supabase: CapabilitySupabaseClient,
  normalizedText: string,
  pos: string,
): Promise<void> {
  const { error } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .update({ pos })
    .eq('normalized_text', normalizedText)
  if (error) throw error
}

/**
 * Skip-if-exists variant of upsertCapabilities for the item source_kind path.
 *
 * Uses INSERT ... ON CONFLICT DO NOTHING (ignoreDuplicates: true) so that:
 * - FSRS state in learner_capability_state is never disturbed on re-publish
 * - DB-side corrections (retired_at, readiness_status) are preserved
 * - retired_at is NOT set in the payload (new rows get NULL from DB default;
 *   existing rows keep whatever the DB says)
 *
 * Returns a Map<canonicalKey, id> for newly-inserted rows only.
 * Skipped (existing) rows do not appear in the map — callers must handle
 * the case where a capability_id is not in the returned map.
 */
export async function upsertCapabilitiesSkipIfExists(
  supabase: CapabilitySupabaseClient,
  capabilities: CapabilityInput[],
): Promise<Map<string, string>> {
  const idsByKey = new Map<string, string>()
  if (capabilities.length === 0) return idsByKey

  const rows = capabilities.map((cap) => ({
    canonical_key: cap.canonicalKey,
    source_kind: cap.sourceKind,
    source_ref: cap.sourceRef,
    capability_type: cap.capabilityType,
    direction: cap.direction,
    modality: cap.modality,
    learner_language: cap.learnerLanguage,
    projection_version: cap.projectionVersion,
    readiness_status: 'unknown',
    publication_status: 'draft',
    lesson_id: cap.lessonId ?? null,
    prerequisite_keys: cap.prerequisiteKeys,
    // NOTE: retired_at is intentionally omitted — new rows get NULL from
    // the DB default; existing rows preserve whatever value the DB has.
    updated_at: new Date().toISOString(),
  }))

  // Chunk the upsert: a single request with every row (a ~500-item Common Words
  // unit yields ~3k cap rows) overruns the Kong gateway → 502 "invalid response
  // from upstream". 200 keeps each request well under the limit; the returned
  // id↔key maps union losslessly (onConflict+ignoreDuplicates is per-row).
  const CAP_UPSERT_CHUNK = 200
  for (let i = 0; i < rows.length; i += CAP_UPSERT_CHUNK) {
    const slice = rows.slice(i, i + CAP_UPSERT_CHUNK)
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .upsert(slice, { onConflict: 'canonical_key', ignoreDuplicates: true })
      .select('id, canonical_key')
    if (error) throw error
    for (const row of (data ?? []) as Array<{ id: string; canonical_key: string }>) {
      idsByKey.set(row.canonical_key, row.id)
    }
  }
  return idsByKey
}

// ---------------------------------------------------------------------------
// Chunked reads (used by verify/seedIntegrity.ts — extracted from legacy 805–923)
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 50

export interface ChunkedMeaningCoverage {
  nlCovered: Set<string>
  enCovered: Set<string>
}

export async function readMeaningCoverage(
  supabase: CapabilitySupabaseClient,
  itemIds: string[],
): Promise<ChunkedMeaningCoverage> {
  const nlCovered = new Set<string>()
  const enCovered = new Set<string>()
  for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
    const chunk = itemIds.slice(i, i + CHUNK_SIZE)
    // Decision R (PR 1): translations moved to inline columns on learning_items.
    // A single query per chunk replaces the prior two item_meanings queries.
    const { data, error } = await supabase
      .schema('indonesian').from('learning_items').select('id, translation_nl, translation_en')
      .in('id', chunk)
    if (error) throw error
    for (const row of (data ?? []) as Array<{ id: string; translation_nl: string | null; translation_en: string | null }>) {
      if (typeof row.translation_nl === 'string' && row.translation_nl.trim() !== '') {
        nlCovered.add(row.id)
      }
      if (typeof row.translation_en === 'string' && row.translation_en.trim() !== '') {
        enCovered.add(row.id)
      }
    }
  }
  return { nlCovered, enCovered }
}

export interface ChunkedContextCoverage {
  ctxCovered: Set<string>
  /** learning_item_id → list of item_contexts.id rows. */
  ctxIdsByItem: Map<string, string[]>
}

export async function readContextCoverage(
  supabase: CapabilitySupabaseClient,
  itemIds: string[],
): Promise<ChunkedContextCoverage> {
  const ctxCovered = new Set<string>()
  const ctxIdsByItem = new Map<string, string[]>()
  for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
    const chunk = itemIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .schema('indonesian').from('item_contexts').select('id, learning_item_id')
      .in('learning_item_id', chunk)
    if (error) throw error
    for (const r of (data ?? []) as Array<{ id: string; learning_item_id: string }>) {
      ctxCovered.add(r.learning_item_id)
      const list = ctxIdsByItem.get(r.learning_item_id) ?? []
      list.push(r.id)
      ctxIdsByItem.set(r.learning_item_id, list)
    }
  }
  return { ctxCovered, ctxIdsByItem }
}

export async function readActiveVariantContextIds(
  supabase: CapabilitySupabaseClient,
  contextIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < contextIds.length; i += CHUNK_SIZE) {
    const chunk = contextIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .schema('indonesian').from('exercise_variants').select('context_id')
      .in('context_id', chunk).eq('is_active', true)
    if (error) throw error
    for (const r of (data ?? []) as Array<{ context_id: string | null }>) {
      if (r.context_id) out.add(r.context_id)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Count helpers (verify/countParity.ts)
// ---------------------------------------------------------------------------

export async function countTableForLesson(
  supabase: CapabilitySupabaseClient,
  table: string,
  filter: { column: string; value: string },
): Promise<number> {
  const { count } = await supabase
    .schema('indonesian')
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(filter.column, filter.value)
  return count ?? 0
}

export async function countRowsByIds(
  supabase: CapabilitySupabaseClient,
  table: string,
  idColumn: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0
  let total = 0
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    const { count, error } = await supabase
      .schema('indonesian')
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in(idColumn, chunk)
    if (error) throw error
    total += count ?? 0
  }
  return total
}

export async function fetchRowsByIds<T extends Record<string, unknown>>(
  supabase: CapabilitySupabaseClient,
  table: string,
  selectColumns: string,
  ids: string[],
): Promise<T[]> {
  if (ids.length === 0) return []
  const out: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .schema('indonesian')
      .from(table)
      .select(selectColumns)
      .in('id', chunk)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
  }
  return out
}
