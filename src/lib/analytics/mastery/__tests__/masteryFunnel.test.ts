import { describe, it, expect } from 'vitest'
import { deriveMasteryFunnel, deriveGrammarTopics } from '../masteryModel'
import type { CapabilityMasteryEvidence } from '../masteryModel'

const NOW = new Date('2026-06-10T12:00:00Z')

function ev(p: Partial<CapabilityMasteryEvidence>): CapabilityMasteryEvidence {
  return {
    capabilityId: p.capabilityId ?? Math.random().toString(36),
    canonicalKey: p.canonicalKey ?? 'k',
    sourceKind: p.sourceKind ?? 'item',
    sourceRef: p.sourceRef ?? 'ref',
    capabilityType: p.capabilityType ?? 'text_recognition',
    modality: p.modality ?? 'text',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    lessonActivated: p.lessonActivated ?? true,
    reviewCount: p.reviewCount ?? 0,
    lapseCount: p.lapseCount ?? 0,
    consecutiveFailureCount: p.consecutiveFailureCount ?? 0,
    stability: p.stability ?? null,
    lastReviewedAt: p.lastReviewedAt ?? null,
  }
}

describe('deriveMasteryFunnel', () => {
  it('rolls each word up weakest-wins and counts words per rung in the vocabulary funnel', () => {
    const evidence = [
      // word "makan": one mastered cap + one learning cap → weakest-wins = learning
      ev({ sourceKind: 'item', sourceRef: 'makan', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'item', sourceRef: 'makan', reviewCount: 1, stability: 1 }),
      // word "minum": single cap, never reviewed, lesson active → introduced
      ev({ sourceKind: 'item', sourceRef: 'minum', reviewCount: 0, lessonActivated: true }),
    ]

    const funnel = deriveMasteryFunnel({ evidence, now: NOW })

    expect(funnel.vocabulary.learning).toBe(1)
    expect(funnel.vocabulary.introduced).toBe(1)
    expect(funnel.vocabulary.mastered).toBe(0)
  })

  it('counts grammar patterns + morphology in the grammar funnel, not vocabulary', () => {
    const evidence = [
      ev({ sourceKind: 'pattern', sourceRef: 'meN-prefix', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'affixed_form_pair', sourceRef: 'baca-membaca', reviewCount: 1, stability: 1 }),
    ]

    const funnel = deriveMasteryFunnel({ evidence, now: NOW })

    expect(funnel.grammar.mastered).toBe(1)
    expect(funnel.grammar.learning).toBe(1)
    expect(funnel.vocabulary.mastered).toBe(0)
    expect(funnel.vocabulary.learning).toBe(0)
  })

  it('marks a word at_risk when any of its caps has lapsed', () => {
    const evidence = [
      ev({ sourceKind: 'item', sourceRef: 'pergi', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'item', sourceRef: 'pergi', reviewCount: 2, lapseCount: 1 }),
    ]

    const funnel = deriveMasteryFunnel({ evidence, now: NOW })

    expect(funnel.vocabulary.at_risk).toBe(1)
    expect(funnel.vocabulary.mastered).toBe(0)
  })
})

describe('deriveGrammarTopics', () => {
  it('rolls each grammar pattern (by slug) up weakest-wins to one ladder label', () => {
    const evidence = [
      ev({ sourceKind: 'pattern', sourceRef: 'l3-meN-prefix', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'pattern', sourceRef: 'l3-meN-prefix', reviewCount: 1, stability: 1 }),
      ev({ sourceKind: 'pattern', sourceRef: 'l4-ber-prefix', reviewCount: 0, lessonActivated: true }),
      // not a grammar pattern → excluded
      ev({ sourceKind: 'item', sourceRef: 'makan', reviewCount: 5, stability: 20 }),
    ]

    const topics = deriveGrammarTopics({ evidence, now: NOW })

    expect(topics).toEqual([
      { slug: 'l3-meN-prefix', label: 'learning' },
      { slug: 'l4-ber-prefix', label: 'introduced' },
    ])
  })
})
