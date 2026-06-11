import { describe, it, expect } from 'vitest'
import { deriveSkillModeGaps } from '../masteryModel'
import type { CapabilityMasteryEvidence } from '../masteryModel'

const NOW = new Date('2026-06-11T12:00:00Z')
const RECENT = '2026-06-10T12:00:00Z'

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

const mastered = { reviewCount: 5, stability: 20, lastReviewedAt: RECENT }
const learning = { reviewCount: 1, stability: 1 }

describe('deriveSkillModeGaps (vocabulary skill profile)', () => {
  it('reports a per-mode proportion of solidly-known words (receptive-productive gap), never weakest-wins', () => {
    const evidence = [
      // recognise: 2 of 2 strong → 100%
      ev({ capabilityType: 'text_recognition', ...mastered }),
      ev({ capabilityType: 'meaning_recall', ...mastered }),
      // produce: 1 of 2 strong → 50% (NOT pinned to the weak one)
      ev({ capabilityType: 'form_recall', ...mastered }),
      ev({ capabilityType: 'form_recall', ...learning }),
      // listen: 0 of 1 strong → 0%
      ev({ capabilityType: 'audio_recognition', ...learning }),
    ]

    const gaps = deriveSkillModeGaps({ evidence, now: NOW })
    const byMode = Object.fromEntries(gaps.map((g) => [g.mode, g]))

    expect(byMode.recognise.strongPct).toBe(100)
    expect(byMode.produce.strongPct).toBe(50)
    expect(byMode.listen.strongPct).toBe(0)
  })

  it('only counts vocabulary (item) capabilities — grammar/pattern caps are excluded', () => {
    const evidence = [
      ev({ capabilityType: 'text_recognition', ...mastered }),
      ev({ sourceKind: 'pattern', capabilityType: 'pattern_recognition', ...mastered }),
    ]
    const recognise = deriveSkillModeGaps({ evidence, now: NOW }).find((g) => g.mode === 'recognise')!
    expect(recognise.total).toBe(1)
  })

  it('gates a mode with no words as confidence none', () => {
    const evidence = [ev({ capabilityType: 'text_recognition', ...mastered })]
    const listen = deriveSkillModeGaps({ evidence, now: NOW }).find((g) => g.mode === 'listen')!
    expect(listen.confidence).toBe('none')
    expect(listen.total).toBe(0)
  })
})
