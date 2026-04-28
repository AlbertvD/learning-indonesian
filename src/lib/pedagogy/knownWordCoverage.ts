export type KnownWordCoverageActivity =
  | 'reading_context'
  | 'cloze_context'
  | 'sentence_production'
  | 'lesson_exposure'

export interface KeyWordCoverageState {
  text: string
  introduced?: boolean
  recognizable?: boolean
  recallable?: boolean
  isTarget?: boolean
}

export type KnownWordCoverageReason =
  | 'coverage_satisfied'
  | 'insufficient_known_words'
  | 'target_not_introduced'
  | 'key_words_not_recallable'
  | 'exposure_bypass'

export interface KnownWordCoverageResult {
  satisfied: boolean
  knownRatio: number
  reason: KnownWordCoverageReason
}

export interface KnownWordCoverageInput {
  activity: KnownWordCoverageActivity
  keyWords: KeyWordCoverageState[]
  minimumKnownRatio?: number
}

function ratio(input: {
  keyWords: KeyWordCoverageState[]
  known: (word: KeyWordCoverageState) => boolean
}): number {
  if (input.keyWords.length === 0) return 1
  return input.keyWords.filter(input.known).length / input.keyWords.length
}

function isRecognizable(word: KeyWordCoverageState): boolean {
  return word.introduced === true || word.recognizable === true || word.recallable === true
}

function isRecallable(word: KeyWordCoverageState): boolean {
  return word.recallable === true
}

function targetIsIntroduced(keyWords: KeyWordCoverageState[]): boolean {
  const target = keyWords.find(word => word.isTarget)
  return target ? isRecognizable(target) : true
}

export function isKnownWordCoverageSatisfied(input: KnownWordCoverageInput): KnownWordCoverageResult {
  if (input.activity === 'lesson_exposure') {
    return {
      satisfied: true,
      knownRatio: ratio({ keyWords: input.keyWords, known: isRecognizable }),
      reason: 'exposure_bypass',
    }
  }

  if (input.activity === 'sentence_production') {
    const knownRatio = ratio({ keyWords: input.keyWords, known: isRecallable })
    return {
      satisfied: knownRatio === 1,
      knownRatio,
      reason: knownRatio === 1 ? 'coverage_satisfied' : 'key_words_not_recallable',
    }
  }

  if (input.activity === 'cloze_context' && !targetIsIntroduced(input.keyWords)) {
    return {
      satisfied: false,
      knownRatio: ratio({
        keyWords: input.keyWords.filter(word => !word.isTarget),
        known: isRecognizable,
      }),
      reason: 'target_not_introduced',
    }
  }

  const keyWords = input.activity === 'cloze_context'
    ? input.keyWords.filter(word => !word.isTarget)
    : input.keyWords
  const knownRatio = ratio({ keyWords, known: isRecognizable })
  const minimumKnownRatio = input.minimumKnownRatio ?? 0.7

  return {
    satisfied: knownRatio >= minimumKnownRatio,
    knownRatio,
    reason: knownRatio >= minimumKnownRatio ? 'coverage_satisfied' : 'insufficient_known_words',
  }
}
