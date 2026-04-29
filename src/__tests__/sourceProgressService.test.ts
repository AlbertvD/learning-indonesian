import { describe, expect, it, vi } from 'vitest'
import { createSourceProgressService, reduceSourceProgressEvent } from '@/services/sourceProgressService'

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: vi.fn() },
}))

describe('source progress reducer', () => {
  it('creates section-aware state from an event', () => {
    const state = reduceSourceProgressEvent(null, {
      userId: 'user-1',
      sourceRef: 'lesson-1',
      sourceSectionRef: 'section-1',
      eventType: 'section_exposed',
      occurredAt: '2026-04-25T00:00:00.000Z',
    })

    expect(state).toEqual({
      userId: 'user-1',
      sourceRef: 'lesson-1',
      sourceSectionRef: 'section-1',
      currentState: 'section_exposed',
      completedEventTypes: ['section_exposed'],
      lastEventAt: '2026-04-25T00:00:00.000Z',
    })
  })

  it('is idempotent for repeated events', () => {
    const first = reduceSourceProgressEvent(null, {
      userId: 'user-1',
      sourceRef: 'lesson-1',
      sourceSectionRef: '__lesson__',
      eventType: 'opened',
      occurredAt: '2026-04-25T00:00:00.000Z',
    })
    const second = reduceSourceProgressEvent(first, {
      userId: 'user-1',
      sourceRef: 'lesson-1',
      sourceSectionRef: '__lesson__',
      eventType: 'opened',
      occurredAt: '2026-04-25T00:00:00.000Z',
    })

    expect(second.completedEventTypes).toEqual(['opened'])
  })

  it('keeps later progress when an older duplicate event arrives', () => {
    const existing = reduceSourceProgressEvent(null, {
      userId: 'user-1',
      sourceRef: 'lesson-1',
      sourceSectionRef: 'section-1',
      eventType: 'guided_practice_completed',
      occurredAt: '2026-04-25T00:05:00.000Z',
    })
    const reduced = reduceSourceProgressEvent(existing, {
      userId: 'user-1',
      sourceRef: 'lesson-1',
      sourceSectionRef: 'section-1',
      eventType: 'section_exposed',
      occurredAt: '2026-04-25T00:01:00.000Z',
    })

    expect(reduced.currentState).toBe('guided_practice_completed')
    expect(reduced.completedEventTypes).toEqual(['section_exposed', 'guided_practice_completed'])
    expect(reduced.lastEventAt).toBe('2026-04-25T00:05:00.000Z')
  })

  it('records events through the atomic source-progress RPC', async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: {
        user_id: 'user-1',
        source_ref: 'lesson-1',
        source_section_ref: 'section-1',
        current_state: 'section_exposed',
        completed_event_types: ['section_exposed'],
        last_event_at: '2026-04-25T00:00:00.000Z',
      },
      error: null,
    }))
    const schema = vi.fn(() => ({ from: vi.fn(), rpc }))
    const service = createSourceProgressService({ schema })

    const result = await service.recordEvent({
      userId: 'user-1',
      sourceRef: 'lesson-1',
      sourceSectionRef: 'section-1',
      eventType: 'section_exposed',
      occurredAt: '2026-04-25T00:00:00.000Z',
      idempotencyKey: 'lesson-1:section-1:section_exposed',
    })

    expect(schema).toHaveBeenCalledWith('indonesian')
    expect(rpc).toHaveBeenCalledWith('record_source_progress_event', {
      p_event: expect.objectContaining({
        userId: 'user-1',
        sourceRef: 'lesson-1',
        sourceSectionRef: 'section-1',
        eventType: 'section_exposed',
        idempotencyKey: 'lesson-1:section-1:section_exposed',
      }),
    })
    expect(result.currentState).toBe('section_exposed')
  })

  it('returns the RPC materialized state for duplicate idempotency keys without client-side state writes', async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: {
        user_id: 'user-1',
        source_ref: 'lesson-1',
        source_section_ref: '__lesson__',
        current_state: 'opened',
        completed_event_types: ['opened'],
        last_event_at: '2026-04-25T00:00:00.000Z',
        metadata_json: {},
      },
      error: null,
    }))
    const from = vi.fn()
    const schema = vi.fn(() => ({ from, rpc }))
    const service = createSourceProgressService({ schema })

    await expect(service.recordEvent({
      userId: 'user-1',
      sourceRef: 'lesson-1',
      eventType: 'lesson_completed',
      occurredAt: '2026-04-25T00:00:00.000Z',
      idempotencyKey: 'duplicate-key',
    })).resolves.toEqual(expect.objectContaining({
      currentState: 'opened',
      completedEventTypes: ['opened'],
    }))
    expect(from).not.toHaveBeenCalledWith('learner_source_progress_events')
    expect(from).not.toHaveBeenCalledWith('learner_source_progress_state')
  })
})
