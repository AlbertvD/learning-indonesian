import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression guard (#215 hotfix): the mastery model's capability fetch must chunk
// its .in() — a learner with thousands of capabilities otherwise blows the request
// URL length and the browser throws "TypeError: Load failed", which broke all
// three mastery voortgang cards (funnel / skill-gaps / grammar-topics) after deploy.
// Post-2026-07-11 RPC narrowing (docs/plans/2026-07-11-mastery-evidence-rpc-
// narrowing.md): allLearnerEvidence (and therefore getMasteryFunnel/
// getGrammarTopics) no longer chunks at all — it's one get_mastery_evidence RPC
// call, server-side-joined. The chunking guarantee this regression test protects
// still lives, just at a NARROWER surface: getContentUnitMastery/getPatternMastery
// (the content-unit/pattern readers), which keep the direct capabilityRowsByIds/
// learnerStates chunkedIn reads (masteryModel.ts §HC52). Retargeted accordingly.
vi.mock('@/lib/chunkedQuery', () => ({ chunkedIn: vi.fn(async () => []) }))
vi.mock('@/lib/lessons', () => ({ listActivatedLessons: vi.fn(async () => new Set<string>()) }))

import { createMasteryModel } from '../masteryModel'
import { chunkedIn } from '@/lib/chunkedQuery'

function clientWithContentUnitLinks(count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({
    content_unit_id: 'unit-1',
    capability_id: `cap-${i}`,
    relationship_kind: 'introduced_by',
  }))
  const from = vi.fn((table: string) => {
    if (table === 'capability_content_units') {
      return { select: () => ({ eq: async () => ({ data: rows, error: null }) }) }
    }
    if (table === 'lessons') {
      // lessonOrderMap(): db().from('lessons').select(...) awaited directly
      return { select: () => Promise.resolve({ data: [], error: null }) }
    }
    throw new Error(`unexpected table ${table}`)
  })
  return { schema: () => ({ from }) }
}

describe('mastery model — capability fetch chunking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('routes capabilityRowsByIds through chunkedIn (never an un-chunked .in)', async () => {
    const client = clientWithContentUnitLinks(1500)
    const model = createMasteryModel(client as never)

    await model.getContentUnitMastery('unit-1', 'user-1')

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
    const queriedSlugs: string[] = []
    const client = {
      schema: () => ({
        rpc: async (fn: string) => {
          if (fn !== 'get_mastery_evidence') throw new Error(`unexpected rpc ${fn}`)
          return {
            data: {
              states: [{
                capability_id: 'cap-1',
                review_count: 1,
                lapse_count: 0,
                consecutive_failure_count: 0,
                stability: null,
                last_reviewed_at: null,
              }],
              capabilities: [{
                id: 'cap-1',
                canonical_key: 'k',
                source_kind: 'grammar_pattern_src',
                source_ref: 'lesson-2/pattern-l2-ini-itu-demonstrative',
                capability_type: 'recognise_grammar_pattern_cap',
                modality: 'text',
                readiness_status: 'ready',
                publication_status: 'published',
                lesson_id: 'L2',
              }],
              activated_lesson_ids: ['L2'],
              lessons: [],
            },
            error: null,
          }
        },
        from: (table: string) => {
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
    expect(topics[0]!.lessonNumber).toBe(2) // parsed from the source_ref for grouping
  })
})
