import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression guard (#215 hotfix): the mastery model's capability fetch must chunk
// its .in() — a learner with thousands of capabilities otherwise blows the request
// URL length and the browser throws "TypeError: Load failed", which broke all
// three mastery voortgang cards (funnel / skill-gaps / grammar-topics) after deploy.
vi.mock('@/lib/chunkedQuery', () => ({ chunkedIn: vi.fn(async () => []) }))
vi.mock('@/lib/lessons', () => ({ listActivatedLessons: vi.fn(async () => new Set<string>()) }))

import { createMasteryModel } from '../masteryModel'
import { chunkedIn } from '@/lib/chunkedQuery'
import { listActivatedLessons } from '@/lib/lessons'

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

  // Regression: getGrammarTopics must strip the `lesson-N/pattern-` envelope off
  // the cap source_ref before joining grammar_patterns (keyed by the bare slug).
  // The old code queried with the raw source_ref → no match → the row printed the
  // raw "lesson-N/pattern-…" source_ref instead of the real pattern name.
  it('getGrammarTopics resolves the real pattern name (strips the source_ref envelope before the join)', async () => {
    vi.mocked(listActivatedLessons).mockResolvedValueOnce(new Set(['L2']))
    vi.mocked(chunkedIn).mockResolvedValueOnce([
      {
        id: 'cap-1',
        canonical_key: 'k',
        source_kind: 'pattern',
        source_ref: 'lesson-2/pattern-l2-ini-itu-demonstrative',
        capability_type: 'pattern_recognition',
        modality: 'text',
        readiness_status: 'ready',
        publication_status: 'published',
        lesson_id: 'L2',
      },
    ] as never)

    const queriedSlugs: string[] = []
    const client = {
      schema: () => ({
        from: (table: string) => {
          if (table === 'learner_capability_state') {
            return {
              select: () => ({
                eq: async () => ({
                  data: [{
                    capability_id: 'cap-1',
                    review_count: 1,
                    lapse_count: 0,
                    consecutive_failure_count: 0,
                    stability: null,
                    last_reviewed_at: null,
                  }],
                  error: null,
                }),
              }),
            }
          }
          if (table === 'grammar_patterns') {
            return {
              select: () => ({
                in: async (_col: string, slugs: string[]) => {
                  queriedSlugs.push(...slugs)
                  return {
                    data: [{
                      slug: 'l2-ini-itu-demonstrative',
                      name: 'ini/itu als aanwijzend voornaamwoord',
                      short_explanation: 'dit/dat',
                    }],
                    error: null,
                  }
                },
              }),
            }
          }
          throw new Error(`unexpected table ${table}`)
        },
      }),
    }

    const model = createMasteryModel(client as never)
    const topics = await model.getGrammarTopics('user-1')

    // Joined by the BARE slug, not the noisy source_ref.
    expect(queriedSlugs).toContain('l2-ini-itu-demonstrative')
    expect(queriedSlugs).not.toContain('lesson-2/pattern-l2-ini-itu-demonstrative')
    expect(topics).toHaveLength(1)
    expect(topics[0]!.name).toBe('ini/itu als aanwijzend voornaamwoord')
    expect(topics[0]!.shortExplanation).toBe('dit/dat')
  })
})
