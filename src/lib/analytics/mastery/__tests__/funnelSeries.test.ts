import { describe, it, expect } from 'vitest'
import {
  deriveFunnelSeries,
  deriveMasteryFunnel,
  weekEndsBackFrom,
  type FunnelSeriesEvent,
  type WeekEnd,
} from '../masteryModel'
import type { CapabilityMasteryEvidence } from '../masteryModel'

// A vocabulary recognition cap for word "makan", introduced by an activated lesson.
const CAP = {
  id: 'cap-1',
  canonical_key: 'k1',
  source_kind: 'vocabulary_src' as const,
  source_ref: 'makan',
  capability_type: 'recognise_meaning_from_text_cap' as const,
  modality: 'text' as const,
  readiness_status: 'ready',
  publication_status: 'published',
  lesson_id: 'lesson-a',
}
const CTX = {
  capabilities: [CAP],
  activatedLessons: new Set(['lesson-a']),
  lessonOrderById: new Map([['lesson-a', 1]]),
}

// A review event carrying the cap into a mastered-looking state.
function event(createdAt: string, over: Partial<FunnelSeriesEvent> = {}): FunnelSeriesEvent {
  return {
    capabilityId: 'cap-1',
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

describe('deriveFunnelSeries', () => {
  it('zero-fills weeks with no events', () => {
    const series = deriveFunnelSeries({
      events: [],
      weekEnds: [wk('2026-06-01', '2026-06-08T00:00:00Z'), wk('2026-06-08', '2026-06-15T00:00:00Z')],
      ...CTX,
    })
    expect(series).toHaveLength(2)
    for (const w of series) {
      expect(w.vocabulary).toEqual({
        not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0,
      })
    }
  })

  it('a cap is absent from week-ends before its first review, then present after', () => {
    // Reviewed on 2026-06-10 (mastered-looking). Week ending 06-08 is before → absent;
    // week ending 06-15 is after → counted.
    const series = deriveFunnelSeries({
      events: [event('2026-06-10T09:00:00Z')],
      weekEnds: [wk('2026-06-01', '2026-06-08T00:00:00Z'), wk('2026-06-08', '2026-06-15T00:00:00Z')],
      ...CTX,
    })
    // Week 1: no event ≤ cutoff → the cap does not appear at all (not counted as introduced).
    const w1total = Object.values(series[0].vocabulary).reduce((a, b) => a + b, 0)
    expect(w1total).toBe(0)
    // Week 2: the mastered-state event is counted (in mastered, given recency vs cutoff).
    const w2total = Object.values(series[1].vocabulary).reduce((a, b) => a + b, 0)
    expect(w2total).toBe(1)
    expect(series[1].vocabulary.mastered).toBe(1)
  })

  it('uses the LAST event as of each week-end (not the newest overall)', () => {
    // Two reviews: an early at-risk one, a later mastered one. Week ending between them
    // should reflect the early state, the later week the mastered state.
    const events: FunnelSeriesEvent[] = [
      event('2026-06-03T09:00:00Z', { reviewCount: 1, lapseCount: 1, consecutiveFailureCount: 1, stability: 1 }),
      event('2026-06-11T09:00:00Z'),
    ]
    const series = deriveFunnelSeries({
      events,
      weekEnds: [wk('2026-06-01', '2026-06-08T00:00:00Z'), wk('2026-06-08', '2026-06-15T00:00:00Z')],
      ...CTX,
    })
    expect(series[0].vocabulary.at_risk).toBe(1) // early week reflects the at-risk review
    expect(series[1].vocabulary.mastered).toBe(1) // later week reflects the mastered review
  })

  it("newest week-end equals deriveMasteryFunnel over the same last-known evidence (parity)", () => {
    const events = [event('2026-06-11T09:00:00Z')]
    const cutoff = '2026-06-15T00:00:00Z'
    const series = deriveFunnelSeries({ events, weekEnds: [wk('2026-06-08', cutoff)], ...CTX })
    // Reconstruct the equivalent evidence by hand and run the live deriver directly.
    const evidence: CapabilityMasteryEvidence[] = [{
      capabilityId: 'cap-1', canonicalKey: 'k1', sourceKind: 'vocabulary_src', sourceRef: 'makan',
      capabilityType: 'recognise_meaning_from_text_cap', modality: 'text',
      readinessStatus: 'ready', publicationStatus: 'published',
      lessonActivated: true, lessonNumber: 1,
      reviewCount: 5, lapseCount: 0, consecutiveFailureCount: 0, stability: 40, lastReviewedAt: '2026-06-11T09:00:00Z',
    }]
    const direct = deriveMasteryFunnel({ evidence, now: new Date(cutoff) })
    expect(series[0].vocabulary).toEqual(direct.vocabulary)
  })
})

describe('weekEndsBackFrom', () => {
  it('returns `weeks` boundaries oldest→newest, Monday-aligned, newest cutoff clamped to now', () => {
    const now = new Date('2026-06-17T12:00:00Z') // a Wednesday
    const wks = weekEndsBackFrom(now, 'UTC', 4)
    expect(wks).toHaveLength(4)
    // Oldest → newest weekStarts ascending, each a Monday, 7 days apart.
    const starts = wks.map(w => w.weekStart)
    expect(starts).toEqual(['2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15'])
    // The current (last) week's cutoff is clamped to `now`, not next Monday.
    expect(wks[3].cutoff.getTime()).toBe(now.getTime())
    // Prior weeks' cutoffs are their following Monday 00:00 UTC.
    expect(wks[2].cutoff.toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })

  it('honours a non-UTC timezone for the week-boundary instants', () => {
    const now = new Date('2026-06-17T12:00:00Z')
    const wks = weekEndsBackFrom(now, 'Europe/Amsterdam', 3)
    // Amsterdam is UTC+2 in June, so local Monday 00:00 is 22:00 UTC the prior Sunday.
    expect(wks[1].cutoff.toISOString()).toBe('2026-06-14T22:00:00.000Z')
  })
})
