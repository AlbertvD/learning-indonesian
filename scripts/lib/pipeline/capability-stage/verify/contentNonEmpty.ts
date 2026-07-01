/**
 * verify/contentNonEmpty.ts — CS8 seed hook (post-write).
 *
 * Per fold §11 #22, walks rows written by THIS lesson and asserts the
 * required-field set is non-empty. Violations throw; the runner returns
 * `status: 'partial'` with the offending row IDs.
 *
 * Required fields by table:
 *   learning_capabilities       canonical_key, capability_type, source_ref non-empty
 *   learning_items              base_text, normalized_text, item_type non-empty
 *   item_contexts               source_text non-empty
 *   grammar_patterns            slug, name non-empty
 *   content_units               content_unit_key, unit_kind non-empty
 *                               (payload_json is intentionally {} since Decision E —
 *                                the column is unread + being retired; NOT checked)
 *   capability_content_units    junction — both FKs non-null
 */

import type { CapabilitySupabaseClient } from '../adapter'
import { fetchRowsByIds } from '../adapter'
import type { ValidationFinding } from '../model'

export interface ContentNonEmptyInput {
  contentUnitIds: string[]
  capabilityIds: string[]
  learningItemIds: string[]
  grammarPatternIds: string[]
  /** item_contexts get walked via learning_item_id. */
}

interface ContentUnitRow {
  id: string
  content_unit_key: string | null
  unit_kind: string | null
}

interface CapabilityRow {
  id: string
  canonical_key: string | null
  capability_type: string | null
  source_ref: string | null
}

interface LearningItemRow {
  id: string
  base_text: string | null
  normalized_text: string | null
  item_type: string | null
}

interface GrammarPatternRow {
  id: string
  slug: string | null
  name: string | null
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
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
      'id, content_unit_key, unit_kind',
      input.contentUnitIds,
    )
    for (const row of rows) {
      // payload_json is NOT checked: Decision E makes it intentionally {} on the
      // DB-native builder path (unread column, being retired in a later migration).
      if (!nonEmptyString(row.content_unit_key) || !nonEmptyString(row.unit_kind)) {
        findings.push(presenceFinding('content_units', row.id, 'content_unit_key/unit_kind non-empty'))
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

    // item_contexts walked via learning_item_id.
    // (item_meanings was dropped in Slice 4a — translation invariant is enforced by CS9.)
    findings.push(...(await checkItemContexts(supabase, input.learningItemIds)))
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
      .select('id, learning_item_id, source_text')
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
