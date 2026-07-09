import { describe, it, expect } from 'vitest'
import { deriveTroublesomeWords, STUBBORN_THRESHOLD } from '../masteryModel'
import type { CapabilityMasteryEvidence } from '../masteryModel'

function ev(p: Partial<CapabilityMasteryEvidence>): CapabilityMasteryEvidence {
  return {
    capabilityId: p.capabilityId ?? 'cap',
    canonicalKey: p.canonicalKey ?? 'k',
    sourceKind: p.sourceKind ?? 'vocabulary_src',
    sourceRef: p.sourceRef ?? 'ref',
    capabilityType: p.capabilityType ?? 'recognise_meaning_from_text_cap',
    modality: p.modality ?? 'text',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    lessonActivated: p.lessonActivated ?? true,
    lessonNumber: p.lessonNumber ?? null,
    reviewCount: p.reviewCount ?? 0,
    lapseCount: p.lapseCount ?? 0,
    consecutiveFailureCount: p.consecutiveFailureCount ?? 0,
    stability: p.stability ?? null,
    lastReviewedAt: p.lastReviewedAt ?? null,
  }
}

describe('deriveTroublesomeWords', () => {
  it('includes an at-risk word (genuine lapse, consecutiveFailureCount > 0)', () => {
    const words = deriveTroublesomeWords({
      evidence: [ev({ sourceRef: 'a', lapseCount: 1, reviewCount: 5, consecutiveFailureCount: 2 })],
    })
    expect(words).toEqual([{ sourceRef: 'a', sourceKind: 'vocabulary_src' }])
  })

  it('includes a stubborn word (never lapsed, failed >= threshold)', () => {
    const words = deriveTroublesomeWords({
      evidence: [ev({ sourceRef: 'b', lapseCount: 0, reviewCount: STUBBORN_THRESHOLD, consecutiveFailureCount: STUBBORN_THRESHOLD })],
    })
    expect(words).toEqual([{ sourceRef: 'b', sourceKind: 'vocabulary_src' }])
  })

  it('excludes a word that is neither at-risk nor stubborn (below threshold, never lapsed)', () => {
    const words = deriveTroublesomeWords({
      evidence: [ev({ sourceRef: 'c', lapseCount: 0, reviewCount: 2, consecutiveFailureCount: 2 })],
    })
    expect(words).toEqual([])
  })

  it('the two signals are mutually exclusive at the cap level — no double-counting one cap', () => {
    // A lapsed, failing cap is at_risk (lapseCount > 0), so it can never also
    // satisfy isStubborn (which requires lapseCount === 0) — this cap qualifies
    // via exactly one branch, and the word still appears exactly once.
    const words = deriveTroublesomeWords({
      evidence: [ev({ sourceRef: 'd', lapseCount: 2, reviewCount: 8, consecutiveFailureCount: STUBBORN_THRESHOLD })],
    })
    expect(words).toEqual([{ sourceRef: 'd', sourceKind: 'vocabulary_src' }])
  })

  it('dedupes a word with multiple qualifying capabilities to one entry', () => {
    const words = deriveTroublesomeWords({
      evidence: [
        ev({ capabilityId: 'cap-1', sourceRef: 'pintar', lapseCount: 0, reviewCount: 5, consecutiveFailureCount: 5 }),
        ev({ capabilityId: 'cap-2', sourceRef: 'pintar', lapseCount: 1, reviewCount: 6, consecutiveFailureCount: 2 }),
      ],
    })
    expect(words).toEqual([{ sourceRef: 'pintar', sourceKind: 'vocabulary_src' }])
  })

  it('excludes grammar-pattern-sourced caps from scope (funnelBucket === grammar)', () => {
    const words = deriveTroublesomeWords({
      evidence: [ev({ sourceRef: 'g', sourceKind: 'grammar_pattern_src', lapseCount: 0, reviewCount: 5, consecutiveFailureCount: 5 })],
    })
    expect(words).toEqual([])
  })

  it('excludes dialogue/podcast-sourced caps from scope (funnelBucket === null)', () => {
    const words = deriveTroublesomeWords({
      evidence: [
        ev({ sourceRef: 'dl', sourceKind: 'dialogue_line_src', lapseCount: 1, reviewCount: 5, consecutiveFailureCount: 2 }),
        ev({ sourceRef: 'ps', sourceKind: 'podcast_segment_src', lapseCount: 0, reviewCount: 5, consecutiveFailureCount: 5 }),
      ],
    })
    expect(words).toEqual([])
  })

  it('includes affixed word forms (word_form_pair_src is in scope, morphology bucket)', () => {
    const words = deriveTroublesomeWords({
      evidence: [ev({ sourceRef: 'wf', sourceKind: 'word_form_pair_src', lapseCount: 0, reviewCount: 5, consecutiveFailureCount: 5 })],
    })
    expect(words).toEqual([{ sourceRef: 'wf', sourceKind: 'word_form_pair_src' }])
  })

  it('sorts words descending by each word\'s max consecutiveFailureCount, most-stuck first', () => {
    const words = deriveTroublesomeWords({
      evidence: [
        ev({ capabilityId: 'cap-1', sourceRef: 'a', lapseCount: 0, reviewCount: 4, consecutiveFailureCount: 4 }),
        ev({ capabilityId: 'cap-2', sourceRef: 'b', lapseCount: 0, reviewCount: 9, consecutiveFailureCount: 9 }),
        // 'c' qualifies via a low-failure cap AND a higher-failure cap — the word's
        // rank uses its max, not its first-seen cap.
        ev({ capabilityId: 'cap-3', sourceRef: 'c', lapseCount: 0, reviewCount: 4, consecutiveFailureCount: 4 }),
        ev({ capabilityId: 'cap-4', sourceRef: 'c', lapseCount: 1, reviewCount: 12, consecutiveFailureCount: 6 }),
      ],
    })
    expect(words.map((w) => w.sourceRef)).toEqual(['b', 'c', 'a'])
  })
})
