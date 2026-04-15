// src/__tests__/adaptiveDifficulty.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  determineDifficultyTier,
  getAdaptiveExerciseWeights,
  selectWeightedExerciseType,
  computeItemPerformance,
  computeSessionPerformanceSummary,
  getItemDifficultyOverride,
  _constants,
  type SessionPerformanceSummary,
  type ItemPerformanceSnapshot,
} from '@/lib/adaptiveDifficulty'
import type { LearnerItemState, LearnerSkillState } from '@/types/learning'

// ── Helpers ─────────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<SessionPerformanceSummary> = {}): SessionPerformanceSummary {
  return {
    recentAccuracy: 0.75,
    sampleSize: 20,
    averageLatencyMs: 4000,
    leechFraction: 0.05,
    stageDistribution: { anchoring: 5, retrieving: 10, productive: 5 },
    ...overrides,
  }
}

function makeItemPerformance(overrides: Partial<ItemPerformanceSnapshot> = {}): ItemPerformanceSnapshot {
  return {
    averageStability: 3.0,
    averageDifficulty: 5.0,
    totalSuccesses: 8,
    totalFailures: 2,
    totalLapses: 0,
    consecutiveFailures: 0,
    averageLatencyMs: 3000,
    hintRate: null,
    ...overrides,
  }
}

function makeSkillState(overrides: Partial<LearnerSkillState> = {}): LearnerSkillState {
  return {
    id: 's1',
    user_id: 'u1',
    learning_item_id: 'li1',
    skill_type: 'recognition',
    stability: 3.0,
    difficulty: 5.0,
    retrievability: 0.9,
    last_reviewed_at: null,
    next_due_at: null,
    success_count: 5,
    failure_count: 1,
    lapse_count: 0,
    consecutive_failures: 0,
    mean_latency_ms: 3000,
    hint_rate: null,
    updated_at: '',
    ...overrides,
  }
}

function makeItemState(overrides: Partial<LearnerItemState> = {}): LearnerItemState {
  return {
    id: 'is1',
    user_id: 'u1',
    learning_item_id: 'li1',
    stage: 'retrieving',
    introduced_at: null,
    last_seen_at: null,
    priority: null,
    origin: null,
    times_seen: 10,
    is_leech: false,
    suspended: false,
    gate_check_passed: null,
    updated_at: '',
    ...overrides,
  }
}

// ── determineDifficultyTier ─────────────────────────────────────────────────────

describe('determineDifficultyTier', () => {
  it('returns medium when sample size is below threshold', () => {
    const summary = makeSummary({ sampleSize: 3, recentAccuracy: 0.95 })
    expect(determineDifficultyTier(summary)).toBe('medium')
  })

  it('returns easy when leech fraction is high', () => {
    const summary = makeSummary({ leechFraction: 0.4, recentAccuracy: 0.90 })
    expect(determineDifficultyTier(summary)).toBe('easy')
  })

  it('returns hard when accuracy is above ceiling', () => {
    const summary = makeSummary({ recentAccuracy: 0.90 })
    expect(determineDifficultyTier(summary)).toBe('hard')
  })

  it('returns hard when accuracy is at the ceiling boundary', () => {
    const summary = makeSummary({ recentAccuracy: _constants.ACCURACY_CEILING })
    expect(determineDifficultyTier(summary)).toBe('hard')
  })

  it('returns easy when accuracy is below floor', () => {
    const summary = makeSummary({ recentAccuracy: 0.45 })
    expect(determineDifficultyTier(summary)).toBe('easy')
  })

  it('returns medium when accuracy is in the sweet spot', () => {
    const summary = makeSummary({ recentAccuracy: 0.75, averageLatencyMs: 4000 })
    expect(determineDifficultyTier(summary)).toBe('medium')
  })

  it('returns medium when accuracy is in sweet spot and latency is high', () => {
    const summary = makeSummary({ recentAccuracy: 0.75, averageLatencyMs: 10000 })
    expect(determineDifficultyTier(summary)).toBe('medium')
  })

  it('returns medium when latency data is null and accuracy is in sweet spot', () => {
    const summary = makeSummary({ recentAccuracy: 0.75, averageLatencyMs: null })
    expect(determineDifficultyTier(summary)).toBe('medium')
  })

  it('leech fraction takes priority over high accuracy', () => {
    const summary = makeSummary({ leechFraction: 0.35, recentAccuracy: 0.95 })
    expect(determineDifficultyTier(summary)).toBe('easy')
  })
})

// ── getAdaptiveExerciseWeights ──────────────────────────────────────────────────

describe('getAdaptiveExerciseWeights', () => {
  it('easy tier has high recognition weights and zero production weights', () => {
    const weights = getAdaptiveExerciseWeights('easy')
    expect(weights.recognition_mcq).toBeGreaterThan(2)
    expect(weights.sentence_transformation).toBe(0)
    expect(weights.constrained_translation).toBe(0)
  })

  it('hard tier has high production weights and low recognition weights', () => {
    const weights = getAdaptiveExerciseWeights('hard')
    expect(weights.typed_recall).toBeGreaterThan(2)
    expect(weights.cloze).toBeGreaterThan(2)
    expect(weights.recognition_mcq).toBeLessThan(1)
  })

  it('medium tier has balanced weights', () => {
    const weights = getAdaptiveExerciseWeights('medium')
    expect(weights.recognition_mcq).toBe(1.5)
    expect(weights.typed_recall).toBe(1.5)
    expect(weights.cloze).toBe(1.5)
  })
})

// ── selectWeightedExerciseType ──────────────────────────────────────────────────

describe('selectWeightedExerciseType', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when no types are available', () => {
    const weights = getAdaptiveExerciseWeights('medium')
    expect(selectWeightedExerciseType(weights, [])).toBeNull()
  })

  it('returns the only available type when there is one', () => {
    const weights = getAdaptiveExerciseWeights('medium')
    expect(selectWeightedExerciseType(weights, ['cloze'])).toBe('cloze')
  })

  it('falls back to first available type when all weights are zero', () => {
    const weights = { recognition_mcq: 0, cloze: 0 } as const
    expect(selectWeightedExerciseType(weights, ['recognition_mcq', 'cloze'])).toBe('recognition_mcq')
  })

  it('selects based on weight distribution', () => {
    // With Math.random() returning 0, should select first candidate
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const weights = { recognition_mcq: 1.0, cloze: 1.0 } as const
    const result = selectWeightedExerciseType(weights, ['recognition_mcq', 'cloze'])
    expect(result).toBe('recognition_mcq')
  })

  it('selects second type when roll is past first weight', () => {
    // With two types each weight 1.0, total = 2.0
    // roll = 0.6 * 2.0 = 1.2, first candidate subtracts 1.0 → 0.2 > 0, second subtracts 1.0 → -0.8 ≤ 0
    vi.spyOn(Math, 'random').mockReturnValue(0.6)
    const weights = { recognition_mcq: 1.0, cloze: 1.0 } as const
    const result = selectWeightedExerciseType(weights, ['recognition_mcq', 'cloze'])
    expect(result).toBe('cloze')
  })
})

// ── computeItemPerformance ──────────────────────────────────────────────────────

describe('computeItemPerformance', () => {
  it('returns defaults for empty skill array', () => {
    const perf = computeItemPerformance([])
    expect(perf.averageStability).toBe(0)
    expect(perf.totalSuccesses).toBe(0)
    expect(perf.averageLatencyMs).toBeNull()
  })

  it('computes averages from multiple skills', () => {
    const skills = [
      makeSkillState({ stability: 4.0, difficulty: 6.0, success_count: 10, failure_count: 2, lapse_count: 1, mean_latency_ms: 2000 }),
      makeSkillState({ stability: 2.0, difficulty: 4.0, success_count: 5, failure_count: 3, lapse_count: 2, mean_latency_ms: 4000 }),
    ]
    const perf = computeItemPerformance(skills)
    expect(perf.averageStability).toBe(3.0)
    expect(perf.averageDifficulty).toBe(5.0)
    expect(perf.totalSuccesses).toBe(15)
    expect(perf.totalFailures).toBe(5)
    expect(perf.totalLapses).toBe(3)
    expect(perf.averageLatencyMs).toBe(3000)
  })

  it('uses max consecutive failures across skills', () => {
    const skills = [
      makeSkillState({ consecutive_failures: 1 }),
      makeSkillState({ consecutive_failures: 3 }),
    ]
    const perf = computeItemPerformance(skills)
    expect(perf.consecutiveFailures).toBe(3)
  })

  it('handles null latency and hint rate', () => {
    const skills = [
      makeSkillState({ mean_latency_ms: null, hint_rate: null }),
    ]
    const perf = computeItemPerformance(skills)
    expect(perf.averageLatencyMs).toBeNull()
    expect(perf.hintRate).toBeNull()
  })
})

// ── computeSessionPerformanceSummary ────────────────────────────────────────────

describe('computeSessionPerformanceSummary', () => {
  it('computes accuracy from aggregated skill states', () => {
    const itemStates = {
      li1: makeItemState({ learning_item_id: 'li1', stage: 'retrieving' }),
    }
    const skillStates = {
      li1: [
        makeSkillState({ success_count: 8, failure_count: 2 }),
      ],
    }
    const summary = computeSessionPerformanceSummary(itemStates, skillStates)
    expect(summary.recentAccuracy).toBe(0.8)
    expect(summary.sampleSize).toBe(10)
  })

  it('returns 0.5 accuracy when no interactions exist', () => {
    const summary = computeSessionPerformanceSummary({}, {})
    expect(summary.recentAccuracy).toBe(0.5)
    expect(summary.sampleSize).toBe(0)
  })

  it('computes leech fraction correctly', () => {
    const itemStates = {
      li1: makeItemState({ learning_item_id: 'li1', is_leech: true }),
      li2: makeItemState({ learning_item_id: 'li2', is_leech: false }),
      li3: makeItemState({ learning_item_id: 'li3', is_leech: true }),
      li4: makeItemState({ learning_item_id: 'li4', is_leech: false }),
    }
    const summary = computeSessionPerformanceSummary(itemStates, {})
    expect(summary.leechFraction).toBe(0.5)
  })

  it('computes stage distribution', () => {
    const itemStates = {
      li1: makeItemState({ learning_item_id: 'li1', stage: 'anchoring' }),
      li2: makeItemState({ learning_item_id: 'li2', stage: 'retrieving' }),
      li3: makeItemState({ learning_item_id: 'li3', stage: 'retrieving' }),
    }
    const summary = computeSessionPerformanceSummary(itemStates, {})
    expect(summary.stageDistribution).toEqual({ anchoring: 1, retrieving: 2 })
  })
})

// ── getItemDifficultyOverride ───────────────────────────────────────────────────

describe('getItemDifficultyOverride', () => {
  it('returns easy when consecutive failures >= 2', () => {
    const perf = makeItemPerformance({ consecutiveFailures: 2 })
    expect(getItemDifficultyOverride(perf, 'hard')).toBe('easy')
  })

  it('returns easy for leech items with low stability', () => {
    const perf = makeItemPerformance({ totalLapses: 4, averageStability: 1.5 })
    expect(getItemDifficultyOverride(perf, 'medium')).toBe('easy')
  })

  it('does not override to easy for lapsed items with recovered stability', () => {
    const perf = makeItemPerformance({ totalLapses: 4, averageStability: 5.0 })
    // Stability is high enough that the leech rule does not trigger
    expect(getItemDifficultyOverride(perf, 'medium')).toBe('medium')
  })

  it('bumps strong items up one tier', () => {
    const perf = makeItemPerformance({
      averageStability: 15,
      totalLapses: 0,
      totalSuccesses: 10,
    })
    expect(getItemDifficultyOverride(perf, 'easy')).toBe('medium')
    expect(getItemDifficultyOverride(perf, 'medium')).toBe('hard')
    expect(getItemDifficultyOverride(perf, 'hard')).toBe('hard')
  })

  it('follows session tier for average-performing items', () => {
    const perf = makeItemPerformance()
    expect(getItemDifficultyOverride(perf, 'easy')).toBe('easy')
    expect(getItemDifficultyOverride(perf, 'medium')).toBe('medium')
    expect(getItemDifficultyOverride(perf, 'hard')).toBe('hard')
  })
})
