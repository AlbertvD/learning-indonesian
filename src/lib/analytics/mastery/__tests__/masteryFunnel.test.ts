import { describe, it, expect } from 'vitest'
import { deriveMasteryFunnel, deriveMasteryFunnelByLesson, deriveGrammarTopics } from '../masteryModel'
import type { CapabilityMasteryEvidence } from '../masteryModel'

const NOW = new Date('2026-06-10T12:00:00Z')

function ev(p: Partial<CapabilityMasteryEvidence>): CapabilityMasteryEvidence {
  return {
    capabilityId: p.capabilityId ?? Math.random().toString(36),
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

describe('deriveMasteryFunnel', () => {
  it('rolls each word up weakest-wins and counts words per rung in the vocabulary funnel', () => {
    const evidence = [
      // word "makan": one mastered cap + one learning cap → weakest-wins = learning
      ev({ sourceKind: 'vocabulary_src', sourceRef: 'makan', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'vocabulary_src', sourceRef: 'makan', reviewCount: 1, stability: 1 }),
      // word "minum": single cap, never reviewed, lesson active → introduced
      ev({ sourceKind: 'vocabulary_src', sourceRef: 'minum', reviewCount: 0, lessonActivated: true }),
    ]

    const funnel = deriveMasteryFunnel({ evidence, now: NOW })

    expect(funnel.vocabulary.learning).toBe(1)
    expect(funnel.vocabulary.introduced).toBe(1)
    expect(funnel.vocabulary.mastered).toBe(0)
  })

  it('counts grammar patterns + morphology in the grammar funnel, not vocabulary', () => {
    const evidence = [
      ev({ sourceKind: 'grammar_pattern_src', sourceRef: 'meN-prefix', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'word_form_pair_src', sourceRef: 'baca-membaca', reviewCount: 1, stability: 1 }),
    ]

    const funnel = deriveMasteryFunnel({ evidence, now: NOW })

    expect(funnel.grammar.mastered).toBe(1)
    expect(funnel.grammar.learning).toBe(1)
    expect(funnel.vocabulary.mastered).toBe(0)
    expect(funnel.vocabulary.learning).toBe(0)
  })

  it('marks a word at_risk when any of its caps has genuinely lapsed (failing AND lapsed)', () => {
    const evidence = [
      ev({ sourceKind: 'vocabulary_src', sourceRef: 'pergi', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      // a cap that had been learned (lapseCount > 0) and is now failing → a real lapse
      ev({ sourceKind: 'vocabulary_src', sourceRef: 'pergi', reviewCount: 4, lapseCount: 1, consecutiveFailureCount: 1 }),
    ]

    const funnel = deriveMasteryFunnel({ evidence, now: NOW })

    expect(funnel.vocabulary.at_risk).toBe(1)
    expect(funnel.vocabulary.mastered).toBe(0)
  })

  it('a never-learned word that is currently failing is introduced, not at_risk', () => {
    const evidence = [
      // failing on first acquisition (lapseCount 0) — never learned yet
      ev({ sourceKind: 'vocabulary_src', sourceRef: 'becak', reviewCount: 2, lapseCount: 0, consecutiveFailureCount: 2 }),
    ]

    const funnel = deriveMasteryFunnel({ evidence, now: NOW })

    expect(funnel.vocabulary.at_risk).toBe(0)
    expect(funnel.vocabulary.introduced).toBe(1)
  })
})

describe('deriveMasteryFunnelByLesson', () => {
  it('splits the vocab/grammar funnels per introducing lesson, skipping caps with no lessonNumber', () => {
    const evidence = [
      // lesson 2 vocab: makan mastered, minum introduced
      ev({ sourceKind: 'vocabulary_src', sourceRef: 'makan', lessonNumber: 2, reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'vocabulary_src', sourceRef: 'minum', lessonNumber: 2, reviewCount: 0, lessonActivated: true }),
      // lesson 3 vocab: pagi learning + a grammar pattern introduced
      ev({ sourceKind: 'vocabulary_src', sourceRef: 'pagi', lessonNumber: 3, reviewCount: 1, stability: 1 }),
      ev({ sourceKind: 'grammar_pattern_src', capabilityType: 'recognise_grammar_pattern_cap', sourceRef: 'lesson-3/pattern-x', lessonNumber: 3, reviewCount: 0, lessonActivated: true }),
      // no lessonNumber → excluded from every bucket
      ev({ sourceKind: 'vocabulary_src', sourceRef: 'orphan', lessonNumber: null, reviewCount: 3 }),
    ]

    const byLesson = deriveMasteryFunnelByLesson({ evidence, now: NOW })

    expect(byLesson.get(2)!.vocabulary.mastered).toBe(1)
    expect(byLesson.get(2)!.vocabulary.introduced).toBe(1)
    expect(byLesson.get(3)!.vocabulary.learning).toBe(1)
    expect(byLesson.get(3)!.grammar.introduced).toBe(1)
    // orphan (no lessonNumber) created no bucket
    expect([...byLesson.keys()].sort()).toEqual([2, 3])
  })
})

describe('deriveGrammarTopics', () => {
  it('splits each pattern into recognise/use dimensions, rolls up weakest-wins, sums reviews, sorts by lesson', () => {
    const evidence = [
      // meN-prefix: recognition mastered, use still learning → overall learning
      ev({ sourceKind: 'grammar_pattern_src', capabilityType: 'recognise_grammar_pattern_cap', sourceRef: 'lesson-3/pattern-l3-meN-prefix', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'grammar_pattern_src', capabilityType: 'contrast_grammar_pattern_cap', sourceRef: 'lesson-3/pattern-l3-meN-prefix', reviewCount: 1, stability: 1 }),
      // ber-prefix: only a recognition cap, never reviewed → introduced, no use dimension
      ev({ sourceKind: 'grammar_pattern_src', capabilityType: 'recognise_grammar_pattern_cap', sourceRef: 'lesson-4/pattern-l4-ber-prefix', reviewCount: 0, lessonActivated: true }),
      // not a grammar pattern → excluded
      ev({ sourceKind: 'vocabulary_src', sourceRef: 'makan', reviewCount: 5, stability: 20 }),
    ]

    const topics = deriveGrammarTopics({ evidence, now: NOW })

    expect(topics).toEqual([
      {
        slug: 'lesson-3/pattern-l3-meN-prefix',
        lessonNumber: 3,
        label: 'learning',
        reviewCount: 6,
        recognise: { label: 'mastered', reviewCount: 5 },
        contrast: { label: 'learning', reviewCount: 1 },
      },
      {
        slug: 'lesson-4/pattern-l4-ber-prefix',
        lessonNumber: 4,
        label: 'introduced',
        reviewCount: 0,
        recognise: { label: 'introduced', reviewCount: 0 },
        contrast: null,
      },
    ])
  })
})
