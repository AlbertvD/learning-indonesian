/**
 * patternSeeding.test.ts — the OQ2-2 (option B) pattern-level generation gate
 * (Slice 2, Task 5). The headline guard: a MID-WRITE CRASH (a strict subset of
 * the required types present) must classify as `partial`, never `seeded` — that
 * is what forces the delete-first + full regenerate that the keyless typed
 * tables can't get from per-row skip-if-exists.
 */

import { describe, it, expect } from 'vitest'
import {
  classifyPatternSeedState,
  patternNeedsGeneration,
  patternNeedsDeleteFirst,
  REQUIRED_PATTERN_EXERCISE_TYPES,
} from '../patternSeeding'
import type { GrammarExerciseType } from '../loadFromDb'

const ALL: GrammarExerciseType[] = [
  'contrast_pair',
  'sentence_transformation',
  'constrained_translation',
  'cloze_mcq',
]

describe('REQUIRED_PATTERN_EXERCISE_TYPES', () => {
  it('is the full set of 4 generated exercise types', () => {
    expect([...REQUIRED_PATTERN_EXERCISE_TYPES].sort()).toEqual([...ALL].sort())
  })
})

describe('classifyPatternSeedState', () => {
  it('absent when the coverage set is undefined (no active rows)', () => {
    expect(classifyPatternSeedState(undefined)).toBe('absent')
  })

  it('absent when the coverage set is empty', () => {
    expect(classifyPatternSeedState(new Set())).toBe('absent')
  })

  it('seeded when all 4 required types are covered', () => {
    expect(classifyPatternSeedState(new Set(ALL))).toBe('seeded')
  })

  it('partial when a MID-WRITE CRASH left 2 of 4 types (the crash-safety guard)', () => {
    // Crash after writing contrast_pair + sentence_transformation, before the
    // other two → must be partial, NOT seeded.
    const covered = new Set<GrammarExerciseType>(['contrast_pair', 'sentence_transformation'])
    expect(classifyPatternSeedState(covered)).toBe('partial')
  })

  it('partial when exactly one required type is missing', () => {
    const covered = new Set<GrammarExerciseType>([
      'contrast_pair',
      'sentence_transformation',
      'constrained_translation',
    ])
    expect(classifyPatternSeedState(covered)).toBe('partial')
  })

  it('respects a caller-supplied required subset', () => {
    const covered = new Set<GrammarExerciseType>(['contrast_pair'])
    expect(classifyPatternSeedState(covered, ['contrast_pair'])).toBe('seeded')
  })
})

describe('patternNeedsGeneration', () => {
  it('false for a fully seeded pattern (skip)', () => {
    expect(patternNeedsGeneration(new Set(ALL))).toBe(false)
  })
  it('true for absent + partial', () => {
    expect(patternNeedsGeneration(undefined)).toBe(true)
    expect(patternNeedsGeneration(new Set<GrammarExerciseType>(['cloze_mcq']))).toBe(true)
  })
})

describe('patternNeedsDeleteFirst', () => {
  it('true only for partial (delete stragglers before regenerate)', () => {
    expect(patternNeedsDeleteFirst(new Set<GrammarExerciseType>(['cloze_mcq']))).toBe(true)
  })
  it('false for absent (nothing to delete) and seeded (skip)', () => {
    expect(patternNeedsDeleteFirst(undefined)).toBe(false)
    expect(patternNeedsDeleteFirst(new Set(ALL))).toBe(false)
  })
})
