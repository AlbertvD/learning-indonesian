import { describe, it, expect } from 'vitest'
import { deriveSkillModeGaps } from '../masteryModel'
import type { CapabilityMasteryEvidence } from '../masteryModel'

const NOW = new Date('2026-06-11T12:00:00Z')

function ev(p: Partial<CapabilityMasteryEvidence>): CapabilityMasteryEvidence {
  return {
    capabilityId: p.capabilityId ?? Math.random().toString(36),
    canonicalKey: 'k',
    sourceKind: p.sourceKind ?? 'item',
    sourceRef: p.sourceRef ?? 'ref',
    capabilityType: p.capabilityType ?? 'text_recognition',
    modality: 'text',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    lessonActivated: true,
    reviewCount: p.reviewCount ?? 0,
    lapseCount: p.lapseCount ?? 0,
    consecutiveFailureCount: p.consecutiveFailureCount ?? 0,
    stability: p.stability ?? null,
    lastReviewedAt: p.lastReviewedAt ?? null,
  }
}

describe('deriveSkillModeGaps', () => {
  it('groups the 11 dimensions into recognise / produce / listen and labels each weakest-wins', () => {
    const evidence = [
      // recognise: text_recognition mastered
      ev({ capabilityType: 'text_recognition', sourceRef: 'a', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-10T12:00:00Z' }),
      // produce: form_recall at_risk
      ev({ capabilityType: 'form_recall', sourceRef: 'b', reviewCount: 3, lapseCount: 1 }),
      // listen: audio_recognition (→ listening dimension) learning
      ev({ capabilityType: 'audio_recognition', sourceRef: 'c', reviewCount: 1, stability: 1 }),
    ]

    const gaps = deriveSkillModeGaps({ evidence, now: NOW })
    const byMode = Object.fromEntries(gaps.map((g) => [g.mode, g]))

    expect(byMode.recognise.label).toBe('mastered')
    expect(byMode.produce.label).toBe('at_risk')
    expect(byMode.listen.label).toBe('learning')
  })

  it('marks a mode with no evidence as confidence none (not a false gap)', () => {
    const evidence = [
      ev({ capabilityType: 'text_recognition', sourceRef: 'a', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-10T12:00:00Z' }),
    ]

    const gaps = deriveSkillModeGaps({ evidence, now: NOW })
    const listen = gaps.find((g) => g.mode === 'listen')!

    expect(listen.confidence).toBe('none')
  })

  it('classifies l1_to_id_choice as recognise (receptive), not produce (Q-A)', () => {
    const evidence = [
      ev({ capabilityType: 'l1_to_id_choice', sourceRef: 'a', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-10T12:00:00Z' }),
    ]
    const gaps = deriveSkillModeGaps({ evidence, now: NOW })
    const byMode = Object.fromEntries(gaps.map((g) => [g.mode, g]))

    expect(byMode.recognise.label).toBe('mastered')
    expect(byMode.produce.confidence).toBe('none')
  })
})
