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
 *   legacy 515–545 replaceItemMeanings (delete + insert)
 *   legacy 549–560 upsertItemAnchorContext
 *   legacy 638–648 insertExerciseVariantGrammar (duplicate-row bug preserved per §11 #2)
 *   legacy 679–689 insertExerciseVariantVocab (duplicate-row bug preserved per §11 #2)
 *   legacy 727–803 cloze: upsertClozeContext + findLearningItemBySlug (ilike fallback preserved)
 *   legacy 805–923 supplies the chunked-read helpers used by verify/seedIntegrity.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { candidateSlugs } from './projectors/slugs'
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
  sourceFingerprint?: string | null
  artifactFingerprint?: string | null
  /**
   * Decision 3b (ADR 0006): every lesson-derived capability has lessonId set.
   * Podcast capabilities are the only source kinds permitted to leave it null
   * — see the CHECK constraint in scripts/migration.sql.
   */
  lessonId?: string | null
  metadata: {
    skillType: string
    requiredArtifacts: string[]
    prerequisiteKeys: string[]
    requiredSourceProgress?: unknown
    difficultyLevel: number
    goalTags: string[]
  }
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
        source_fingerprint: capability.sourceFingerprint ?? null,
        artifact_fingerprint: capability.artifactFingerprint ?? null,
        lesson_id: capability.lessonId ?? null,
        metadata_json: {
          skillType: capability.metadata.skillType,
          requiredArtifacts: capability.metadata.requiredArtifacts,
          prerequisiteKeys: capability.metadata.prerequisiteKeys,
          requiredSourceProgress: capability.metadata.requiredSourceProgress ?? null,
          difficultyLevel: capability.metadata.difficultyLevel,
          goalTags: capability.metadata.goalTags ?? [],
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'canonical_key' })
      .select('id, canonical_key')
      .single()
    if (error) throw error
    idsByKey.set(data.canonical_key, data.id)
  }
  return idsByKey
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
// Capability artifacts
// ---------------------------------------------------------------------------

export interface CapabilityArtifactInput {
  capability_id: string
  artifact_kind: string
  quality_status: 'draft' | 'approved' | 'blocked' | 'deprecated'
  artifact_ref: string
  artifact_json: Record<string, unknown>
  artifact_fingerprint: string
}

export async function upsertCapabilityArtifacts(
  supabase: CapabilitySupabaseClient,
  artifacts: CapabilityArtifactInput[],
): Promise<string[]> {
  const ids: string[] = []
  for (const artifact of artifacts) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('capability_artifacts')
      .upsert({
        capability_id: artifact.capability_id,
        artifact_kind: artifact.artifact_kind,
        quality_status: artifact.quality_status,
        artifact_ref: artifact.artifact_ref,
        artifact_json: artifact.artifact_json ?? {},
        artifact_fingerprint: artifact.artifact_fingerprint,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'capability_id,artifact_kind,artifact_fingerprint' })
      .select('id')
      .single()
    if (error) throw error
    if (data?.id) ids.push(data.id as string)
  }
  return ids
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

export async function fetchGrammarPatternIdsBySlug(
  supabase: CapabilitySupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('grammar_patterns')
    .select('id, slug')
  if (error) throw error
  const map = new Map<string, string>()
  for (const row of data ?? []) {
    map.set((row as { slug: string }).slug, (row as { id: string }).id)
  }
  return map
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

export interface MeaningInput {
  learning_item_id: string
  translation_language: 'nl' | 'en'
  translation_text: string
  is_primary: boolean
}

export async function replaceItemMeanings(
  supabase: CapabilitySupabaseClient,
  learningItemId: string,
  meanings: MeaningInput[],
): Promise<number> {
  const { error: deleteError } = await supabase
    .schema('indonesian')
    .from('item_meanings')
    .delete()
    .eq('learning_item_id', learningItemId)
  if (deleteError) throw deleteError

  if (meanings.length === 0) return 0
  const { error: insertError } = await supabase
    .schema('indonesian')
    .from('item_meanings')
    .insert(meanings)
  if (insertError) throw insertError
  return meanings.length
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

export interface ClozeContextInput {
  learning_item_id: string
  source_text: string
  translation_text: string
  difficulty?: number | null
  topic_tag?: string | null
  source_lesson_id: string
}

export async function upsertClozeContext(
  supabase: CapabilitySupabaseClient,
  ctx: ClozeContextInput,
): Promise<{ skipped: boolean; error?: string }> {
  const { error } = await supabase
    .schema('indonesian')
    .from('item_contexts')
    .upsert({
      learning_item_id: ctx.learning_item_id,
      context_type: 'cloze',
      source_text: ctx.source_text,
      translation_text: ctx.translation_text,
      is_anchor_context: false,
      difficulty: ctx.difficulty ?? null,
      topic_tag: ctx.topic_tag ?? null,
      source_lesson_id: ctx.source_lesson_id,
    }, { onConflict: 'learning_item_id,source_text' })
  if (error) return { skipped: true, error: error.message }
  return { skipped: false }
}

/**
 * Find the learning_items.id for a cloze slug. Tries each candidate variant
 * (exact, no-asterisk, no-parens, fully stripped) and falls back to an
 * ilike prefix match on the most-stripped variant. Mirrors legacy 738–773.
 */
export async function findLearningItemBySlug(
  supabase: CapabilitySupabaseClient,
  slug: string,
): Promise<{ id: string; matchedSlug: string | null } | null> {
  const variants = candidateSlugs(slug)

  for (const candidate of variants) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('id')
      .eq('normalized_text', candidate)
      .limit(1)
      .maybeSingle()
    if (!error && data) {
      return { id: (data as { id: string }).id, matchedSlug: candidate }
    }
  }

  // Last resort: prefix match (e.g. "beres" → "beres (bèrès)")
  const prefix = variants[variants.length - 1]
  const { data } = await supabase
    .schema('indonesian')
    .from('learning_items')
    .select('id, normalized_text')
    .ilike('normalized_text', `${prefix}%`)
    .limit(1)
    .maybeSingle()
  if (data) {
    return {
      id: (data as { id: string }).id,
      matchedSlug: (data as { normalized_text: string }).normalized_text,
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Exercise variants (no upsert key — duplicate-row bug preserved per §11 #2)
// ---------------------------------------------------------------------------

export interface GrammarExerciseVariantInput {
  lesson_id: string
  exercise_type: string
  grammar_pattern_id: string | null
  payload_json: Record<string, unknown>
  answer_key_json: Record<string, unknown>
}

export async function insertExerciseVariantGrammar(
  supabase: CapabilitySupabaseClient,
  variant: GrammarExerciseVariantInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('exercise_variants')
    .insert({
      lesson_id: variant.lesson_id,
      exercise_type: variant.exercise_type,
      grammar_pattern_id: variant.grammar_pattern_id,
      payload_json: variant.payload_json,
      answer_key_json: variant.answer_key_json,
      is_active: true,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data?.id as string | undefined) ?? undefined }
}

export interface VocabExerciseVariantInput {
  context_id: string
  exercise_type: string
  grammar_pattern_id: string | null
  payload_json: Record<string, unknown>
  answer_key_json: Record<string, unknown>
}

export async function insertExerciseVariantVocab(
  supabase: CapabilitySupabaseClient,
  variant: VocabExerciseVariantInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('exercise_variants')
    .insert({
      context_id: variant.context_id,
      exercise_type: variant.exercise_type,
      grammar_pattern_id: variant.grammar_pattern_id,
      payload_json: variant.payload_json,
      answer_key_json: variant.answer_key_json,
      is_active: true,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data?.id as string | undefined) ?? undefined }
}

export async function findContextIdBySourceText(
  supabase: CapabilitySupabaseClient,
  sourceText: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('item_contexts')
    .select('id')
    .eq('source_text', sourceText)
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
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
    const { data: nlData, error: nlErr } = await supabase
      .schema('indonesian').from('item_meanings').select('learning_item_id')
      .in('learning_item_id', chunk).eq('translation_language', 'nl')
    if (nlErr) throw nlErr
    for (const row of (nlData ?? []) as Array<{ learning_item_id: string }>) {
      nlCovered.add(row.learning_item_id)
    }

    const { data: enData, error: enErr } = await supabase
      .schema('indonesian').from('item_meanings').select('learning_item_id')
      .in('learning_item_id', chunk).eq('translation_language', 'en')
    if (enErr) throw enErr
    for (const row of (enData ?? []) as Array<{ learning_item_id: string }>) {
      enCovered.add(row.learning_item_id)
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
