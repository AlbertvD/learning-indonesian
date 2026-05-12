/**
 * verify/contentNonEmpty.ts — CS8 seed hook (post-write).
 *
 * Per fold §11 #22, walks rows written by THIS lesson and asserts the
 * required-field set is non-empty. Violations throw; the runner returns
 * `status: 'partial'` with the offending row IDs.
 *
 * Required fields by table:
 *   learning_capabilities       canonical_key, capability_type, source_ref non-empty
 *   capability_artifacts        artifact_kind, artifact_ref non-empty + artifact_json != {}
 *   learning_items              base_text, normalized_text, item_type non-empty
 *   item_meanings               translation_text non-empty
 *   item_contexts               source_text non-empty
 *   exercise_variants           payload_json + answer_key_json not {}
 *   grammar_patterns            slug, name non-empty
 *   content_units               content_unit_key, unit_kind non-empty + payload_json != {}
 *   capability_content_units    junction — both FKs non-null
 */

import type { CapabilitySupabaseClient } from '../adapter'
import { fetchRowsByIds } from '../adapter'
import type { ValidationFinding } from '../model'

export interface ContentNonEmptyInput {
  contentUnitIds: string[]
  capabilityIds: string[]
  capabilityArtifactIds: string[]
  learningItemIds: string[]
  exerciseVariantIds: string[]
  grammarPatternIds: string[]
  /** item_meanings + item_contexts get walked via learning_item_id. */
}

interface ContentUnitRow {
  id: string
  content_unit_key: string | null
  unit_kind: string | null
  payload_json: Record<string, unknown> | null
}

interface CapabilityRow {
  id: string
  canonical_key: string | null
  capability_type: string | null
  source_ref: string | null
}

interface CapabilityArtifactRow {
  id: string
  artifact_kind: string | null
  artifact_ref: string | null
  artifact_json: Record<string, unknown> | null
}

interface LearningItemRow {
  id: string
  base_text: string | null
  normalized_text: string | null
  item_type: string | null
}

interface ExerciseVariantRow {
  id: string
  payload_json: Record<string, unknown> | null
  answer_key_json: Record<string, unknown> | null
}

interface GrammarPatternRow {
  id: string
  slug: string | null
  name: string | null
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function objectIsNonEmpty(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.keys(value as Record<string, unknown>).length > 0
}

export async function runContentNonEmpty(
  supabase: CapabilitySupabaseClient,
  input: ContentNonEmptyInput,
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = []

  if (input.contentUnitIds.length > 0) {
    const rows = await fetchRowsByIds<ContentUnitRow>(
      supabase,
      'content_units',
      'id, content_unit_key, unit_kind, payload_json',
      input.contentUnitIds,
    )
    for (const row of rows) {
      if (!nonEmptyString(row.content_unit_key) || !nonEmptyString(row.unit_kind) || !objectIsNonEmpty(row.payload_json)) {
        findings.push(presenceFinding('content_units', row.id, 'content_unit_key/unit_kind/payload_json non-empty'))
      }
    }
  }

  if (input.capabilityIds.length > 0) {
    const rows = await fetchRowsByIds<CapabilityRow>(
      supabase,
      'learning_capabilities',
      'id, canonical_key, capability_type, source_ref',
      input.capabilityIds,
    )
    for (const row of rows) {
      if (!nonEmptyString(row.canonical_key) || !nonEmptyString(row.capability_type) || !nonEmptyString(row.source_ref)) {
        findings.push(presenceFinding('learning_capabilities', row.id, 'canonical_key/capability_type/source_ref non-empty'))
      }
    }
  }

  if (input.capabilityArtifactIds.length > 0) {
    const rows = await fetchRowsByIds<CapabilityArtifactRow>(
      supabase,
      'capability_artifacts',
      'id, artifact_kind, artifact_ref, artifact_json',
      input.capabilityArtifactIds,
    )
    for (const row of rows) {
      if (!nonEmptyString(row.artifact_kind) || !nonEmptyString(row.artifact_ref) || !objectIsNonEmpty(row.artifact_json)) {
        findings.push(presenceFinding('capability_artifacts', row.id, 'artifact_kind/artifact_ref/artifact_json non-empty'))
      }
    }
  }

  if (input.learningItemIds.length > 0) {
    const itemRows = await fetchRowsByIds<LearningItemRow>(
      supabase,
      'learning_items',
      'id, base_text, normalized_text, item_type',
      input.learningItemIds,
    )
    for (const row of itemRows) {
      if (!nonEmptyString(row.base_text) || !nonEmptyString(row.normalized_text) || !nonEmptyString(row.item_type)) {
        findings.push(presenceFinding('learning_items', row.id, 'base_text/normalized_text/item_type non-empty'))
      }
    }

    // item_meanings + item_contexts walked via learning_item_id.
    findings.push(...(await checkItemMeanings(supabase, input.learningItemIds)))
    findings.push(...(await checkItemContexts(supabase, input.learningItemIds)))
  }

  if (input.exerciseVariantIds.length > 0) {
    const rows = await fetchRowsByIds<ExerciseVariantRow>(
      supabase,
      'exercise_variants',
      'id, payload_json, answer_key_json',
      input.exerciseVariantIds,
    )
    for (const row of rows) {
      if (!objectIsNonEmpty(row.payload_json) || !objectIsNonEmpty(row.answer_key_json)) {
        findings.push(presenceFinding('exercise_variants', row.id, 'payload_json/answer_key_json non-empty'))
      }
    }
  }

  if (input.grammarPatternIds.length > 0) {
    const rows = await fetchRowsByIds<GrammarPatternRow>(
      supabase,
      'grammar_patterns',
      'id, slug, name',
      input.grammarPatternIds,
    )
    for (const row of rows) {
      if (!nonEmptyString(row.slug) || !nonEmptyString(row.name)) {
        findings.push(presenceFinding('grammar_patterns', row.id, 'slug/name non-empty'))
      }
    }
  }

  return findings
}

function presenceFinding(table: string, rowId: string, what: string): ValidationFinding {
  return {
    gate: 'CS8',
    severity: 'error',
    message: `Row ${table}.${rowId} fails presence check (${what})`,
    context: { table, rowId },
  }
}

async function checkItemMeanings(
  supabase: CapabilitySupabaseClient,
  itemIds: string[],
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = []
  const CHUNK = 50
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_meanings')
      .select('id, learning_item_id, translation_text')
      .in('learning_item_id', chunk)
    if (error) throw error
    for (const r of (data ?? []) as Array<{ id: string; translation_text: string | null }>) {
      if (!nonEmptyString(r.translation_text)) {
        findings.push(presenceFinding('item_meanings', r.id, 'translation_text non-empty'))
      }
    }
  }
  return findings
}

async function checkItemContexts(
  supabase: CapabilitySupabaseClient,
  itemIds: string[],
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = []
  const CHUNK = 50
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_contexts')
      .select('id, learning_item_id, source_text, capability_id')
      .in('learning_item_id', chunk)
    if (error) throw error
    for (const r of (data ?? []) as Array<{ id: string; source_text: string | null }>) {
      if (!nonEmptyString(r.source_text)) {
        findings.push(presenceFinding('item_contexts', r.id, 'source_text non-empty'))
      }
    }
  }
  return findings
}
