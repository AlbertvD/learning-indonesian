import { describe, expect, it } from 'vitest'
import { createSessionBuilderAdapter } from '@/lib/session-builder/adapter'

// Generic chainable mock: every query-builder method returns the same builder,
// which is a thenable resolving to { data: rowsForTable, error: null }. This
// covers all the loadCapabilitySessionData reads (Promise.all db() calls,
// listActivatedLessons, and resolveActivatedMemberRefs) uniformly.
function mockClient(dataByTable: Record<string, unknown[]>) {
  function builder(rows: unknown[]): any {
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      is: () => b,
      gte: () => b,
      limit: () => b,
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    }
    return b
  }
  return {
    schema: () => ({ from: (table: string) => builder(dataByTable[table] ?? []) }),
  }
}

const baseRequest = {
  userId: 'user-1',
  mode: 'standard' as const,
  now: new Date('2026-04-25T00:00:00.000Z'),
  limit: 100,
  preferredSessionSize: 15,
}

describe('session-builder adapter — collections wiring', () => {
  it('resolves plannerInput.activatedCollectionRefs from the learner activated collections', async () => {
    const client = mockClient({
      learning_capabilities: [],
      learner_capability_state: [],
      lessons: [],
      capability_review_events: [],
      learner_lesson_activation: [],
      learner_collection_activation: [{ collection_id: 'top-100' }],
      collection_items: [
        { learning_items: { normalized_text: 'yang' } },
        { learning_items: { normalized_text: 'di' } },
      ],
    })
    const adapter = createSessionBuilderAdapter(client as any)

    const snapshot = await adapter.loadCapabilitySessionData(baseRequest)

    expect(snapshot.plannerInput.activatedCollectionRefs).toEqual(
      new Set(['learning_items/yang', 'learning_items/di']),
    )
  })

  it('resolves an empty set when the learner has activated no collections', async () => {
    const client = mockClient({
      learning_capabilities: [],
      learner_capability_state: [],
      lessons: [],
      capability_review_events: [],
      learner_lesson_activation: [],
      learner_collection_activation: [],
      collection_items: [],
    })
    const adapter = createSessionBuilderAdapter(client as any)

    const snapshot = await adapter.loadCapabilitySessionData(baseRequest)

    expect(snapshot.plannerInput.activatedCollectionRefs).toEqual(new Set())
  })
})
