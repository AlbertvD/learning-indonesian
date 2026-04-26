import { describe, expect, it } from 'vitest'
import { getDueCapabilities, getDueCapabilitiesFromRows, previewScheduleUpdate, type LearnerCapabilityStateRow } from '@/lib/capabilities/capabilityScheduler'

function state(overrides: Partial<LearnerCapabilityStateRow> = {}): LearnerCapabilityStateRow {
  return {
    id: 'state-1',
    userId: 'user-1',
    capabilityId: 'capability-1',
    canonicalKeySnapshot: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
    activationState: 'active',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    stability: 2.4,
    difficulty: 5,
    lastReviewedAt: '2026-04-20T00:00:00.000Z',
    nextDueAt: '2026-04-25T00:00:00.000Z',
    reviewCount: 3,
    lapseCount: 0,
    consecutiveFailureCount: 0,
    stateVersion: 2,
    ...overrides,
  }
}

describe('capability scheduler', () => {
  it('loads due rows through a request-level read adapter', async () => {
    const due = await getDueCapabilities({
      userId: 'user-1',
      now: new Date('2026-04-25T12:00:00.000Z'),
      mode: 'standard',
      limit: 10,
    }, {
      listLearnerCapabilityStates: async request => [
        state({ userId: request.userId }),
        state({ id: 'future', userId: request.userId, nextDueAt: '2026-04-26T00:00:00.000Z' }),
      ],
    })

    expect(due.map(item => item.stateId)).toEqual(['state-1'])
  })

  it('returns only active ready published capabilities that are due', () => {
    const due = getDueCapabilitiesFromRows({
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 10,
      rows: [
        state(),
        state({ id: 'dormant', activationState: 'dormant' }),
        state({ id: 'blocked', readinessStatus: 'blocked' }),
        state({ id: 'future', nextDueAt: '2026-04-26T00:00:00.000Z' }),
      ],
    })

    expect(due.map(item => item.stateId)).toEqual(['state-1'])
  })

  it('sorts by next due date and respects limits', () => {
    expect(getDueCapabilitiesFromRows({
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 1,
      rows: [
        state({ id: 'later', nextDueAt: '2026-04-25T11:00:00.000Z' }),
        state({ id: 'earlier', nextDueAt: '2026-04-25T01:00:00.000Z' }),
      ],
    }).map(item => item.stateId)).toEqual(['earlier'])
  })

  it('previews schedule updates without mutating input state', () => {
    const before = state()
    const preview = previewScheduleUpdate({
      state: before,
      rating: 3,
      reviewedAt: new Date('2026-04-25T12:00:00.000Z'),
    })

    expect(preview.stateAfter.stateVersion).toBe(3)
    expect(before.stateVersion).toBe(2)
  })
})
