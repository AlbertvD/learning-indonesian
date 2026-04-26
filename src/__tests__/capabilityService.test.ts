import { describe, expect, it, vi } from 'vitest'
import { createCapabilityService } from '@/services/capabilityService'

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: vi.fn() },
}))

describe('capability service', () => {
  it('uses the indonesian schema for capability reads', async () => {
    const select = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const from = vi.fn(() => ({ select }))
    const schema = vi.fn(() => ({ from }))
    const service = createCapabilityService({ schema })

    await service.listCapabilities()

    expect(schema).toHaveBeenCalledWith('indonesian')
    expect(from).toHaveBeenCalledWith('learning_capabilities')
  })

  it('upserts capabilities by canonical key without touching learner state', async () => {
    const single = vi.fn(() => Promise.resolve({ data: { id: 'capability-1' }, error: null }))
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))
    const schema = vi.fn(() => ({ from }))
    const service = createCapabilityService({ schema })

    await service.upsertCapability({
      canonical_key: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
      source_kind: 'item',
      source_ref: 'learning_items/item-1',
      capability_type: 'meaning_recall',
      direction: 'id_to_l1',
      modality: 'text',
      learner_language: 'nl',
      projection_version: 'capability-v1',
      readiness_status: 'ready',
      publication_status: 'published',
      source_fingerprint: 'source',
      artifact_fingerprint: 'artifact',
      metadata_json: {},
    })

    expect(from).toHaveBeenCalledWith('learning_capabilities')
    expect(from).not.toHaveBeenCalledWith('learner_capability_state')
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      canonical_key: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
    }), { onConflict: 'canonical_key' })
  })
})
