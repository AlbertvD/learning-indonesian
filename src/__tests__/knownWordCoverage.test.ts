import { describe, expect, it } from 'vitest'
import { isKnownWordCoverageSatisfied } from '@/lib/pedagogy/knownWordCoverage'

describe('known-word coverage', () => {
  it('allows reading/context recognition when at least 70% of key words are known or recognizable', () => {
    expect(isKnownWordCoverageSatisfied({
      activity: 'reading_context',
      keyWords: [
        { text: 'saya', introduced: true },
        { text: 'makan', recognizable: true },
        { text: 'nasi', introduced: true },
        { text: 'di', introduced: true },
        { text: 'rumah', introduced: false },
      ],
    })).toEqual({ satisfied: true, knownRatio: 0.8, reason: 'coverage_satisfied' })
  })

  it('blocks reading/context recognition when too many key words are unknown', () => {
    expect(isKnownWordCoverageSatisfied({
      activity: 'reading_context',
      keyWords: [
        { text: 'saya', introduced: true },
        { text: 'membeli', introduced: false },
        { text: 'sayur', introduced: false },
      ],
    })).toEqual({ satisfied: false, knownRatio: 1 / 3, reason: 'insufficient_known_words' })
  })

  it('requires the cloze target to be introduced and the surrounding context mostly familiar', () => {
    expect(isKnownWordCoverageSatisfied({
      activity: 'cloze_context',
      keyWords: [
        { text: 'saya', introduced: true },
        { text: 'makan', introduced: true, isTarget: true },
        { text: 'nasi', introduced: true },
        { text: 'pagi', introduced: true },
        { text: 'ini', introduced: false },
      ],
    })).toEqual({ satisfied: true, knownRatio: 3 / 4, reason: 'coverage_satisfied' })

    expect(isKnownWordCoverageSatisfied({
      activity: 'cloze_context',
      keyWords: [
        { text: 'saya', introduced: true },
        { text: 'makan', introduced: false, isTarget: true },
        { text: 'nasi', introduced: true },
      ],
    })).toEqual({ satisfied: false, knownRatio: 1, reason: 'target_not_introduced' })
  })

  it('requires key vocabulary to be recallable for production', () => {
    expect(isKnownWordCoverageSatisfied({
      activity: 'sentence_production',
      keyWords: [
        { text: 'saya', recallable: true },
        { text: 'makan', recallable: true },
      ],
    }).satisfied).toBe(true)

    expect(isKnownWordCoverageSatisfied({
      activity: 'sentence_production',
      keyWords: [
        { text: 'saya', recallable: true },
        { text: 'makan', introduced: true },
      ],
    })).toEqual({ satisfied: false, knownRatio: 0.5, reason: 'key_words_not_recallable' })
  })

  it('lets lesson exposure bypass known-word thresholds', () => {
    expect(isKnownWordCoverageSatisfied({
      activity: 'lesson_exposure',
      keyWords: [
        { text: 'membicarakan', introduced: false },
      ],
    })).toEqual({ satisfied: true, knownRatio: 0, reason: 'exposure_bypass' })
  })
})
