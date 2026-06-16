import { describe, it, expect } from 'vitest'
import { isStubborn, deriveStubbornWords, STUBBORN_THRESHOLD } from '../masteryModel'
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

describe('isStubborn / deriveStubbornWords', () => {
  it('flags a never-learned word failed >= threshold times', () => {
    expect(isStubborn(ev({ lapseCount: 0, reviewCount: STUBBORN_THRESHOLD, consecutiveFailureCount: STUBBORN_THRESHOLD }))).toBe(true)
  })

  it('does NOT flag below the threshold', () => {
    expect(isStubborn(ev({ lapseCount: 0, reviewCount: 3, consecutiveFailureCount: 3 }))).toBe(false)
  })

  it('does NOT flag a genuine lapse (lapseCount > 0) — that is at_risk, not moeilijk', () => {
    expect(isStubborn(ev({ lapseCount: 1, reviewCount: 8, consecutiveFailureCount: STUBBORN_THRESHOLD }))).toBe(false)
  })

  it('self-clears on a correct answer (consecutiveFailureCount reset to 0)', () => {
    expect(isStubborn(ev({ lapseCount: 0, reviewCount: 5, consecutiveFailureCount: 0 }))).toBe(false)
  })

  it('lists stubborn caps hardest-first, naming the specific failing skill', () => {
    const words = deriveStubbornWords({
      evidence: [
        ev({ sourceRef: 'a', capabilityType: 'recognise_meaning_from_text_cap', lapseCount: 0, reviewCount: 4, consecutiveFailureCount: 4 }),
        ev({ sourceRef: 'b', capabilityType: 'produce_form_from_audio_cap', lapseCount: 0, reviewCount: 6, consecutiveFailureCount: 6 }),
        ev({ sourceRef: 'c', lapseCount: 0, reviewCount: 1, consecutiveFailureCount: 1 }), // below threshold → excluded
      ],
    })
    expect(words.map(w => w.sourceRef)).toEqual(['b', 'a'])
    expect(words[0]).toMatchObject({ sourceRef: 'b', capabilityType: 'produce_form_from_audio_cap', consecutiveFailures: 6 })
  })
})
