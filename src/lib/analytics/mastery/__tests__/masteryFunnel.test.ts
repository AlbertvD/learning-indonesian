import { describe, it, expect } from 'vitest'
import { deriveMasteryFunnel, deriveMasteryFunnelByLesson, deriveGrammarTopics, deriveSkillModeGaps } from '../masteryModel'
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

  it('splits grammar patterns and morphology into their own buckets, not vocabulary (item C)', () => {
    const evidence = [
      ev({ sourceKind: 'grammar_pattern_src', sourceRef: 'meN-prefix', reviewCount: 5, stability: 20, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'word_form_pair_src', sourceRef: 'baca-membaca', reviewCount: 1, stability: 1 }),
    ]

    const funnel = deriveMasteryFunnel({ evidence, now: NOW })

    // grammar pattern → grammar bucket; affixed pair → its own morphology bucket.
    expect(funnel.grammar.mastered).toBe(1)
    expect(funnel.grammar.learning).toBe(0)
    expect(funnel.morphology.learning).toBe(1)
    expect(funnel.morphology.mastered).toBe(0)
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
        produce: null,
      },
      {
        slug: 'lesson-4/pattern-l4-ber-prefix',
        lessonNumber: 4,
        label: 'introduced',
        reviewCount: 0,
        recognise: { label: 'introduced', reviewCount: 0 },
        contrast: null,
        produce: null,
      },
    ])
  })

  it('ADR 0017: exposes a produce facet and lowers the overall rung to the weakest of three', () => {
    const evidence = [
      ev({ sourceKind: 'grammar_pattern_src', capabilityType: 'recognise_grammar_pattern_cap', sourceRef: 'lesson-5/pattern-l5-x', reviewCount: 6, stability: 30, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'grammar_pattern_src', capabilityType: 'contrast_grammar_pattern_cap', sourceRef: 'lesson-5/pattern-l5-x', reviewCount: 6, stability: 30, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      // produce only strengthening → drags the overall rung below mastered
      ev({ sourceKind: 'grammar_pattern_src', capabilityType: 'produce_grammar_pattern_cap', sourceRef: 'lesson-5/pattern-l5-x', reviewCount: 2, stability: 8, lastReviewedAt: '2026-06-09T12:00:00Z' }),
    ]

    const [topic] = deriveGrammarTopics({ evidence, now: NOW })

    expect(topic.recognise?.label).toBe('mastered')
    expect(topic.contrast?.label).toBe('mastered')
    expect(topic.produce?.label).toBe('strengthening')
    expect(topic.produce?.reviewCount).toBe(2)
    // weakest-wins overall is no longer mastered, because produce isn't
    expect(topic.label).toBe('strengthening')
  })
})

describe('grammar funnel counts the produce rung (ADR 0017)', () => {
  it('a pattern is mastered only once its produce cap is too', () => {
    // recognise + contrast mastered, produce still strengthening → NOT mastered
    const notYet = [
      ev({ sourceKind: 'grammar_pattern_src', capabilityType: 'recognise_grammar_pattern_cap', sourceRef: 'lesson-6/pattern-p', reviewCount: 6, stability: 30, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'grammar_pattern_src', capabilityType: 'contrast_grammar_pattern_cap', sourceRef: 'lesson-6/pattern-p', reviewCount: 6, stability: 30, lastReviewedAt: '2026-06-09T12:00:00Z' }),
      ev({ sourceKind: 'grammar_pattern_src', capabilityType: 'produce_grammar_pattern_cap', sourceRef: 'lesson-6/pattern-p', reviewCount: 2, stability: 8, lastReviewedAt: '2026-06-09T12:00:00Z' }),
    ]
    const f1 = deriveMasteryFunnel({ evidence: notYet, now: NOW })
    expect(f1.grammar.mastered).toBe(0)
    expect(f1.grammar.strengthening).toBe(1)

    // all three mastered → the pattern counts as mastered
    const allMastered = notYet.map((e) =>
      e.capabilityType === 'produce_grammar_pattern_cap'
        ? { ...e, reviewCount: 6, stability: 30 }
        : e,
    )
    const f2 = deriveMasteryFunnel({ evidence: allMastered, now: NOW })
    expect(f2.grammar.mastered).toBe(1)
  })
})

// ADR 0021 — the reuse-safety guarantee: a transparent morphology pair carries a
// VOCABULARY cap type (recognise_meaning_from_text_cap) but on word_form_pair_src.
// It must bucket as MORPHOLOGY (funnel keys on source_kind) and must NOT leak into
// the vocabulary skill profile (which fences to vocabulary_src). This is the
// load-bearing reason we reuse the cap type instead of minting a new one.
describe('ADR 0021 — reused vocab cap type on word_form_pair_src is morphology, not vocab', () => {
  it('counts in the morphology funnel, not the vocabulary funnel', () => {
    const evidence: CapabilityMasteryEvidence[] = [
      ev({
        sourceKind: 'word_form_pair_src',
        sourceRef: 'lesson-11/morphology/ber-jalan-berjalan',
        capabilityType: 'recognise_meaning_from_text_cap',
        reviewCount: 0,
        lessonActivated: true,
      }),
    ]
    const funnel = deriveMasteryFunnel({ evidence, now: NOW })
    expect(funnel.morphology.introduced).toBe(1)
    expect(funnel.vocabulary.introduced).toBe(0)
  })

  it('is excluded from the vocabulary skill profile (fenced to vocabulary_src)', () => {
    const evidence: CapabilityMasteryEvidence[] = [
      ev({
        sourceKind: 'word_form_pair_src',
        sourceRef: 'lesson-11/morphology/ber-jalan-berjalan',
        capabilityType: 'recognise_meaning_from_text_cap',
        reviewCount: 5,
        stability: 20,
        lastReviewedAt: '2026-06-09T12:00:00Z',
      }),
    ]
    const gaps = deriveSkillModeGaps({ evidence, now: NOW })
    const recognise = gaps.find((g) => g.mode === 'recognise')!
    expect(recognise.practisedWords).toBe(0) // never enters the vocab-size count
  })
})
