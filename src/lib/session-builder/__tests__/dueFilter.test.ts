import { describe, expect, it } from 'vitest'
import { getDueCapabilities, getDueCapabilitiesFromRows, type LearnerCapabilityStateRow } from '../dueFilter'

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

  it('orders the more-overdue day-bucket ahead of fresher ones', () => {
    // 2 days overdue vs 1h overdue → different 24h buckets → deterministic order,
    // most-overdue first, independent of the within-bucket shuffle.
    expect(getDueCapabilitiesFromRows({
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 10,
      rows: [
        state({ id: 'fresh', nextDueAt: '2026-04-25T11:00:00.000Z' }),
        state({ id: 'stale', nextDueAt: '2026-04-23T08:00:00.000Z' }),
      ],
    }).map(item => item.stateId)).toEqual(['stale', 'fresh'])
  })

  it('shuffles cards within the same day-bucket using the injected rng', () => {
    // Both cards are <24h overdue → same bucket. Fisher-Yates with random()=>0
    // swaps the only pair, so input order [a, b] presents as [b, a]; a strict
    // next_due_at sort would have kept [a, b].
    expect(getDueCapabilitiesFromRows({
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 10,
      random: () => 0,
      rows: [
        state({ id: 'a', nextDueAt: '2026-04-25T01:00:00.000Z' }),
        state({ id: 'b', nextDueAt: '2026-04-25T11:00:00.000Z' }),
      ],
    }).map(item => item.stateId)).toEqual(['b', 'a'])
  })

  it('respects the limit, draining the most-overdue bucket first', () => {
    expect(getDueCapabilitiesFromRows({
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 1,
      random: () => 0,
      rows: [
        state({ id: 'fresh', nextDueAt: '2026-04-25T11:00:00.000Z' }),
        state({ id: 'stale', nextDueAt: '2026-04-23T01:00:00.000Z' }),
      ],
    }).map(item => item.stateId)).toEqual(['stale'])
  })

})
