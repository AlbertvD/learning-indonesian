import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression guard (#215 hotfix): the mastery model's capability fetch must chunk
// its .in() — a learner with thousands of capabilities otherwise blows the request
// URL length and the browser throws "TypeError: Load failed", which broke all
// three mastery voortgang cards (funnel / skill-gaps / grammar-topics) after deploy.
vi.mock('@/lib/chunkedQuery', () => ({ chunkedIn: vi.fn(async () => []) }))
vi.mock('@/lib/lessons', () => ({ listActivatedLessons: vi.fn(async () => new Set<string>()) }))

import { createMasteryModel } from '../masteryModel'
import { chunkedIn } from '@/lib/chunkedQuery'

function clientWithStates(count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({
    capability_id: `cap-${i}`,
    review_count: 0,
    lapse_count: 0,
    consecutive_failure_count: 0,
    stability: null,
    last_reviewed_at: null,
  }))
  const eq = vi.fn(async () => ({ data: rows, error: null }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { schema: () => ({ from }) }
}

describe('mastery model — capability fetch chunking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('routes capabilityRowsByIds through chunkedIn (never an un-chunked .in)', async () => {
    const client = clientWithStates(1500)
    const model = createMasteryModel(client as never)

    await model.getMasteryFunnel('user-1')

    expect(chunkedIn).toHaveBeenCalledWith(
      'learning_capabilities',
      'id',
      expect.any(Array),
      expect.any(Function),
      client,
    )
  })
})
