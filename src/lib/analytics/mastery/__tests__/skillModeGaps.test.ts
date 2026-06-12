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
    lessonNumber: p.lessonNumber ?? null,
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
  it('counts DISTINCT WORDS per mode (a word with several caps counts once), known if any cap is solid', () => {
    const evidence = [
      // word A, recognise: two caps, both solid → 1 known word
      ev({ sourceRef: 'A', capabilityType: 'text_recognition', ...mastered }),
      ev({ sourceRef: 'A', capabilityType: 'meaning_recall', ...mastered }),
      // word B, recognise: one solid cap, one weak cap → still 1 known word (any-cap-solid)
      ev({ sourceRef: 'B', capabilityType: 'text_recognition', ...mastered }),
      ev({ sourceRef: 'B', capabilityType: 'meaning_recall', ...learning }),
      // word C, recognise: only a weak cap → practised but not known
      ev({ sourceRef: 'C', capabilityType: 'l1_to_id_choice', ...learning }),
    ]

    const recognise = deriveSkillModeGaps({ evidence, now: NOW }).find((g) => g.mode === 'recognise')!
    expect(recognise.practisedWords).toBe(3) // A, B, C
    expect(recognise.knownWords).toBe(2) // A, B
    expect(recognise.strongPct).toBe(67) // 2/3
  })

  it('reports the receptive→productive→aural gap as word counts (never weakest-wins)', () => {
    const evidence = [
      // recognise: 2 known words
      ev({ sourceRef: 'A', capabilityType: 'text_recognition', ...mastered }),
      ev({ sourceRef: 'B', capabilityType: 'meaning_recall', ...mastered }),
      // produce: 1 known word
      ev({ sourceRef: 'A', capabilityType: 'form_recall', ...mastered }),
      ev({ sourceRef: 'B', capabilityType: 'form_recall', ...learning }),
      // listen: 0 known words
      ev({ sourceRef: 'A', capabilityType: 'audio_recognition', ...learning }),
    ]
    const byMode = Object.fromEntries(
      deriveSkillModeGaps({ evidence, now: NOW }).map((g) => [g.mode, g]),
    )
    expect(byMode.recognise.knownWords).toBe(2)
    expect(byMode.produce.knownWords).toBe(1)
    expect(byMode.listen.knownWords).toBe(0)
  })

  it('only counts vocabulary (item) capabilities — grammar/pattern caps are excluded', () => {
    const evidence = [
      ev({ capabilityType: 'text_recognition', ...mastered }),
      ev({ sourceKind: 'pattern', capabilityType: 'pattern_recognition', ...mastered }),
    ]
    const recognise = deriveSkillModeGaps({ evidence, now: NOW }).find((g) => g.mode === 'recognise')!
    expect(recognise.practisedWords).toBe(1)
  })

  it('gates a mode with no words as confidence none, and uses WORD counts for the thresholds', () => {
    const evidence = [ev({ capabilityType: 'text_recognition', ...mastered })]
    const gaps = deriveSkillModeGaps({ evidence, now: NOW })
    const listen = gaps.find((g) => g.mode === 'listen')!
    expect(listen.confidence).toBe('none')
    expect(listen.practisedWords).toBe(0)
    // 1 practised word < 5 → low, even though it is solidly known
    expect(gaps.find((g) => g.mode === 'recognise')!.confidence).toBe('low')
  })
})
