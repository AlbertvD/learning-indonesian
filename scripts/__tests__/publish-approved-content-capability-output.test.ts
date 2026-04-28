import { describe, expect, it, vi } from 'vitest'
import { publishCapabilityPipelineOutput } from '../publish-approved-content'

const capabilityKey = 'cap:v1:item:learning_items/akhir:text_recognition:id_to_l1:text:nl'

const validContentUnits = [{
  content_unit_key: 'lesson-1::lesson-1/section-vocabulary::item-akhir',
  source_ref: 'learning_items/akhir',
  source_section_ref: 'lesson-1/section-vocabulary',
  unit_kind: 'learning_item',
  unit_slug: 'item-akhir',
  display_order: 1000,
  payload_json: { baseText: 'akhir' },
  source_fingerprint: 'content-unit-fingerprint',
}]

const validCapabilities = [{
  canonicalKey: capabilityKey,
  sourceKind: 'item',
  sourceRef: 'learning_items/akhir',
  capabilityType: 'text_recognition',
  skillType: 'recognition',
  direction: 'id_to_l1',
  modality: 'text',
  learnerLanguage: 'nl',
  requiredArtifacts: ['base_text'],
  requiredSourceProgress: null,
  prerequisiteKeys: [],
  difficultyLevel: 1,
  goalTags: ['lesson-1'],
  projectionVersion: 'v1',
  sourceFingerprint: 'source-fingerprint',
  artifactFingerprint: 'artifact-fingerprint',
  contentUnitSlugs: ['item-akhir'],
  relationshipKind: 'introduced_by',
}]

const validBlocks = [{
  block_key: 'lesson-1-exposure',
  source_ref: 'lesson-1',
  source_refs: ['learning_items/akhir'],
  content_unit_slugs: ['item-akhir'],
  block_kind: 'exposure',
  display_order: 10,
  payload_json: { title: 'Akhir' },
  source_progress_event: 'section_exposed',
  capability_key_refs: [capabilityKey],
}]

const validAssets = [{
  asset_key: `${capabilityKey}:base_text`,
  capability_key: capabilityKey,
  artifact_kind: 'base_text',
  quality_status: 'approved',
  payload_json: { value: 'akhir', reviewedBy: 'human', reviewedAt: '2026-04-26' },
}]

function fakeSupabase(input: {
  onUpsert: (table: string, payload: Record<string, unknown>) => {
    data?: Record<string, unknown>
    error?: unknown
  }
}) {
  return {
    schema: () => ({
      from: (table: string) => ({
        upsert: (payload: Record<string, unknown>) => {
          const result = input.onUpsert(table, payload)
          return {
            data: result.data ?? null,
            error: result.error ?? null,
            select: () => ({
              single: async () => ({
                data: result.data ?? null,
                error: result.error ?? null,
              }),
            }),
          }
        },
      }),
    }),
  }
}

describe('publish-approved-content capability output', () => {
  it('publishes capability rows as draft/unknown and hands off to explicit promotion', async () => {
    const capabilityUpserts: Record<string, unknown>[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const supabase = fakeSupabase({
      onUpsert(table, payload) {
        if (table === 'content_units') {
          return { data: { id: 'unit-1', unit_slug: payload.unit_slug } }
        }
        if (table === 'learning_capabilities') {
          capabilityUpserts.push(payload)
          return { data: { id: 'cap-1', canonical_key: payload.canonical_key } }
        }
        return { data: { id: `${table}-1` } }
      },
    })

    await publishCapabilityPipelineOutput({
      supabase: supabase as never,
      dryRun: false,
      contentUnits: validContentUnits as never,
      capabilities: validCapabilities as never,
      lessonPageBlocks: validBlocks as never,
      exerciseAssets: validAssets as never,
    })

    expect(capabilityUpserts).toHaveLength(1)
    expect(capabilityUpserts[0]).toMatchObject({
      readiness_status: 'unknown',
      publication_status: 'draft',
    })
    expect(consoleSpy.mock.calls.flat().join('\n')).toContain(
      'npx tsx scripts/promote-capabilities.ts --lesson 1 --dry-run',
    )
    consoleSpy.mockRestore()
  })

  it('publishes Dutch-to-Indonesian choice rows as draft/unknown bridge capabilities', async () => {
    const capabilityUpserts: Record<string, unknown>[] = []
    const supabase = fakeSupabase({
      onUpsert(table, payload) {
        if (table === 'content_units') {
          return { data: { id: 'unit-1', unit_slug: payload.unit_slug } }
        }
        if (table === 'learning_capabilities') {
          capabilityUpserts.push(payload)
          return { data: { id: 'choice-cap', canonical_key: payload.canonical_key } }
        }
        return { data: { id: `${table}-1` } }
      },
    })
    const bridgeKey = 'cap:v1:item:learning_items/akhir:l1_to_id_choice:l1_to_id:text:nl'

    await publishCapabilityPipelineOutput({
      supabase: supabase as never,
      dryRun: false,
      contentUnits: validContentUnits as never,
      capabilities: [{
        ...validCapabilities[0],
        canonicalKey: bridgeKey,
        capabilityType: 'l1_to_id_choice',
        skillType: 'meaning_recall',
        direction: 'l1_to_id',
        requiredArtifacts: ['meaning:l1', 'base_text'],
        relationshipKind: 'introduced_by',
      }] as never,
      lessonPageBlocks: [{ ...validBlocks[0], capability_key_refs: [bridgeKey] }] as never,
      exerciseAssets: [{
        ...validAssets[0],
        asset_key: `${bridgeKey}:base_text`,
        capability_key: bridgeKey,
      }, {
        ...validAssets[0],
        asset_key: `${bridgeKey}:meaning:l1`,
        capability_key: bridgeKey,
        artifact_kind: 'meaning:l1',
        payload_json: { value: 'einde', reviewedBy: 'human', reviewedAt: '2026-04-26' },
      }] as never,
    })

    expect(capabilityUpserts).toHaveLength(1)
    expect(capabilityUpserts[0]).toMatchObject({
      canonical_key: bridgeKey,
      capability_type: 'l1_to_id_choice',
      readiness_status: 'unknown',
      publication_status: 'draft',
    })
  })
})
