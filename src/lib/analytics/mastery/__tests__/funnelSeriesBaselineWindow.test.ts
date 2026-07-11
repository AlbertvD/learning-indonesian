import { describe, it, expect } from 'vitest'
import { deriveFunnelSeries, type FunnelSeriesEvent, type WeekEnd } from '../masteryModel'

// Baseline ∪ window equivalence (docs/plans/2026-07-11-mastery-evidence-rpc-
// narrowing.md §2, §6): get_funnel_series_events replaces the lifetime
// capability_review_events fetch with a bounded {baseline, window_events}
// pair. This property test proves deriveFunnelSeries(full history) deep-
// equals deriveFunnelSeries(baseline ∪ window_events) for every week-end,
// across the four event-timing shapes the proof depends on, plus the
// same-instant tiebreak the SQL DISTINCT ON collapse relies on.

const WINDOW_START = new Date('2026-06-08T00:00:00Z')

const cap = (id: string, sourceRef: string) => ({
  id,
  canonical_key: `k-${id}`,
  source_kind: 'vocabulary_src' as const,
  source_ref: sourceRef,
  capability_type: 'recognise_meaning_from_text_cap' as const,
  modality: 'text' as const,
  readiness_status: 'ready',
  publication_status: 'published',
  lesson_id: 'lesson-a',
})

function event(capabilityId: string, createdAt: string, over: Partial<FunnelSeriesEvent> = {}): FunnelSeriesEvent {
  return {
    id: `${capabilityId}-${createdAt}`,
    capabilityId,
    createdAt,
    reviewCount: 5,
    lapseCount: 0,
    consecutiveFailureCount: 0,
    stability: 40,
    lastReviewedAt: createdAt,
    ...over,
  }
}

const wk = (weekStart: string, cutoff: string): WeekEnd => ({ weekStart, cutoff: new Date(cutoff) })
// Both week-ends are >= WINDOW_START, matching the real invariant: every
// cutoff getFunnelSeries ever derives is >= p_window_start (weekEndsBackFrom
// only ever asks for weeks at-or-after the requested window).
const WEEK_ENDS = [wk('2026-06-01', WINDOW_START.toISOString()), wk('2026-06-08', '2026-06-15T00:00:00Z')]

describe('deriveFunnelSeries — baseline ∪ window equivalence', () => {
  it('matches full-history reconstruction across all-before / straddling / all-inside-window / no-events caps', () => {
    const CAPS = [
      cap('cap-before', 'word-before'),     // event entirely BEFORE the window
      cap('cap-straddle', 'word-straddle'), // one event before, one after
      cap('cap-inside', 'word-inside'),     // both events AFTER the window start
      cap('cap-none', 'word-none'),         // no events at all
    ]
    const CTX = {
      capabilities: CAPS,
      activatedLessons: new Set(['lesson-a']),
      lessonOrderById: new Map([['lesson-a', 1]]),
    }

    const beforeEvent = event('cap-before', '2026-06-01T00:00:00Z', { reviewCount: 1, stability: 1 })
    const straddleBefore = event('cap-straddle', '2026-06-02T00:00:00Z', { reviewCount: 1, lapseCount: 1, consecutiveFailureCount: 1, stability: 1 })
    const straddleAfter = event('cap-straddle', '2026-06-10T00:00:00Z', { reviewCount: 5, stability: 40 })
    const insideEvent1 = event('cap-inside', '2026-06-09T00:00:00Z', { reviewCount: 1, stability: 1 })
    const insideEvent2 = event('cap-inside', '2026-06-12T00:00:00Z', { reviewCount: 5, stability: 40 })

    // SQL simulation: baseline = latest event per capability with created_at <
    // p_window_start (DISTINCT ON); window_events = created_at >= p_window_start.
    const baseline = [beforeEvent, straddleBefore]
    const windowEvents = [straddleAfter, insideEvent1, insideEvent2]
    const boundedEvents = [...baseline, ...windowEvents]

    const fullEvents = [beforeEvent, straddleBefore, straddleAfter, insideEvent1, insideEvent2]

    const boundedSeries = deriveFunnelSeries({ events: boundedEvents, weekEnds: WEEK_ENDS, ...CTX })
    const fullSeries = deriveFunnelSeries({ events: fullEvents, weekEnds: WEEK_ENDS, ...CTX })

    expect(boundedSeries).toEqual(fullSeries)

    // Sanity: the two week-ends actually differ (cap-inside only appears in
    // week 2) — otherwise this test would pass vacuously on two empty weeks.
    const totalWeek1 = Object.values(boundedSeries[0]!.vocabulary).reduce((a, b) => a + b, 0)
    const totalWeek2 = Object.values(boundedSeries[1]!.vocabulary).reduce((a, b) => a + b, 0)
    expect(totalWeek1).toBe(2) // cap-before, cap-straddle (as of its BEFORE-window state)
    expect(totalWeek2).toBe(3) // + cap-inside; cap-none never appears
  })

  it('resolves same-instant events via the id DESC tiebreak identically whether reconstructed from the SQL-deduped baseline or the full (undeduped) event log', () => {
    const CAPS = [cap('cap-tie', 'word-tie')]
    const CTX = {
      capabilities: CAPS,
      activatedLessons: new Set(['lesson-a']),
      lessonOrderById: new Map([['lesson-a', 1]]),
    }

    // Two events at the EXACT SAME instant (before the window), differing only
    // by id and by the state they carry. SQL's DISTINCT ON (capability_id)
    // ORDER BY capability_id, created_at DESC, id DESC picks the higher id
    // ('evt-tie-b') — reviewCount 9, stability null (not mastered) -> rung
    // 'strengthening'. The lower id ('evt-tie-a', reviewCount 1) would rung as
    // 'learning' -- a DIFFERENT bucket, so this actually pins the winner
    // instead of passing vacuously on either choice.
    const evtA = event('cap-tie', '2026-06-03T00:00:00Z', { id: 'evt-tie-a', reviewCount: 1, stability: null })
    const evtB = event('cap-tie', '2026-06-03T00:00:00Z', { id: 'evt-tie-b', reviewCount: 9, stability: null })

    // SQL simulation: DISTINCT ON already collapsed the tie server-side --
    // baseline carries ONLY the id-DESC winner.
    const boundedEvents = [evtB]
    // Full history never deduped -- BOTH rows are present; deriveFunnelSeries'
    // own id-DESC tiebreak must independently arrive at the same winner.
    const fullEvents = [evtA, evtB]

    const boundedSeries = deriveFunnelSeries({ events: boundedEvents, weekEnds: WEEK_ENDS, ...CTX })
    const fullSeries = deriveFunnelSeries({ events: fullEvents, weekEnds: WEEK_ENDS, ...CTX })

    expect(boundedSeries).toEqual(fullSeries)
    // Pin the actual winner: 'strengthening' (reviewCount 9), not 'learning'
    // (reviewCount 1) -- proves the tiebreak picked evt-tie-b, not evt-tie-a.
    expect(boundedSeries[0]!.vocabulary.strengthening).toBe(1)
    expect(boundedSeries[0]!.vocabulary.learning).toBe(0)
  })
})
