// src/lib/adaptiveDifficulty.ts
//
// Adaptive difficulty engine for exercise selection.
// Pure logic module — no Supabase calls, no side effects.
//
// The engine looks at recent learner performance (skill states, review history)
// and adjusts which exercise types are selected and how hard they are.
// It integrates with the session queue builder via `getAdaptiveExerciseWeights`.

import type { LearnerItemState, LearnerSkillState, ExerciseType } from '@/types/learning'

// ── Public types ────────────────────────────────────────────────────────────────

export type DifficultyTier = 'easy' | 'medium' | 'hard'

/**
 * Weights for each exercise type — higher weight = more likely to be selected.
 * Weights are relative (they don't need to sum to 1).
 */
export type ExerciseWeights = Partial<Record<ExerciseType, number>>

/**
 * Performance snapshot for a single item, computed from skill states.
 * Used as input to the adaptive engine.
 */
export interface ItemPerformanceSnapshot {
  averageStability: number
  averageDifficulty: number
  totalSuccesses: number
  totalFailures: number
  totalLapses: number
  consecutiveFailures: number
  averageLatencyMs: number | null
  hintRate: number | null
}

/**
 * Session-level performance summary, computed from all items in the current
 * or recent sessions. Drives overall difficulty adjustment.
 */
export interface SessionPerformanceSummary {
  /** Accuracy over the last N interactions (0–1) */
  recentAccuracy: number
  /** Number of interactions in the sample */
  sampleSize: number
  /** Average response latency in ms (null if no data) */
  averageLatencyMs: number | null
  /** Fraction of items that are leeches (lapse_count >= 3) */
  leechFraction: number
  /** Current learner stage distribution */
  stageDistribution: Record<string, number>
}

// ── Constants ───────────────────────────────────────────────────────────────────

/**
 * Accuracy thresholds that determine difficulty adjustment.
 * If accuracy is above the ceiling, exercises get harder.
 * If accuracy is below the floor, exercises get easier.
 * In between is the "sweet spot" — no adjustment.
 */
const ACCURACY_CEILING = 0.85
const ACCURACY_FLOOR = 0.60
const MIN_SAMPLE_SIZE = 5

/**
 * Latency thresholds (ms). Fast responses with high accuracy suggest
 * the exercises are too easy (learner is coasting).
 */
const FAST_LATENCY_MS = 2000
const SLOW_LATENCY_MS = 8000

// Exported for testing only
export const _constants = { ACCURACY_CEILING, ACCURACY_FLOOR, MIN_SAMPLE_SIZE, FAST_LATENCY_MS, SLOW_LATENCY_MS }

// ── Core functions ──────────────────────────────────────────────────────────────

/**
 * Determine the overall difficulty tier based on session performance.
 * This is the primary entry point for the adaptive engine.
 */
export function determineDifficultyTier(summary: SessionPerformanceSummary): DifficultyTier {
  // Not enough data — stay at medium
  if (summary.sampleSize < MIN_SAMPLE_SIZE) {
    return 'medium'
  }

  // High leech fraction → ease off regardless of accuracy
  if (summary.leechFraction > 0.3) {
    return 'easy'
  }

  const { recentAccuracy, averageLatencyMs } = summary

  // High accuracy + fast responses = learner is coasting → make harder
  if (recentAccuracy >= ACCURACY_CEILING) {
    if (averageLatencyMs !== null && averageLatencyMs < FAST_LATENCY_MS) {
      return 'hard'
    }
    return 'hard'
  }

  // Low accuracy = struggling → make easier
  if (recentAccuracy < ACCURACY_FLOOR) {
    return 'easy'
  }

  // Slow responses at medium accuracy suggest cognitive load — stay medium
  if (averageLatencyMs !== null && averageLatencyMs > SLOW_LATENCY_MS) {
    return 'medium'
  }

  return 'medium'
}

/**
 * Get exercise type weights adjusted for the current difficulty tier.
 *
 * - Easy: favors recognition-based exercises (MCQ, cued recall, cloze MCQ)
 * - Medium: balanced mix of recognition and production
 * - Hard: favors production exercises (typed recall, cloze fill, constrained translation)
 */
export function getAdaptiveExerciseWeights(tier: DifficultyTier): ExerciseWeights {
  switch (tier) {
    case 'easy':
      return {
        recognition_mcq: 3.0,
        cued_recall: 2.5,
        cloze_mcq: 2.0,
        meaning_recall: 1.5,
        typed_recall: 0.5,
        cloze: 0.5,
        contrast_pair: 0.5,
        sentence_transformation: 0.0,
        constrained_translation: 0.0,
        speaking: 0.0,
      }
    case 'medium':
      return {
        recognition_mcq: 1.5,
        cued_recall: 1.5,
        cloze_mcq: 1.5,
        meaning_recall: 1.5,
        typed_recall: 1.5,
        cloze: 1.5,
        contrast_pair: 1.0,
        sentence_transformation: 1.0,
        constrained_translation: 1.0,
        speaking: 0.5,
      }
    case 'hard':
      return {
        recognition_mcq: 0.5,
        cued_recall: 0.5,
        cloze_mcq: 0.5,
        meaning_recall: 1.0,
        typed_recall: 3.0,
        cloze: 2.5,
        contrast_pair: 1.5,
        sentence_transformation: 2.0,
        constrained_translation: 2.5,
        speaking: 1.0,
      }
  }
}

/**
 * Select an exercise type based on weighted random selection.
 * Uses the adaptive weights and filters by available exercise types.
 *
 * @param weights - Exercise type weights from getAdaptiveExerciseWeights
 * @param availableTypes - Exercise types that are actually available for this item
 * @returns The selected exercise type, or null if no type is available
 */
export function selectWeightedExerciseType(
  weights: ExerciseWeights,
  availableTypes: ExerciseType[],
): ExerciseType | null {
  if (availableTypes.length === 0) return null

  // Filter weights to only available types and compute total
  const candidates: Array<{ type: ExerciseType; weight: number }> = []
  let totalWeight = 0

  for (const type of availableTypes) {
    const weight = weights[type] ?? 1.0
    if (weight > 0) {
      candidates.push({ type, weight })
      totalWeight += weight
    }
  }

  if (candidates.length === 0 || totalWeight === 0) {
    // All available types have zero weight — fall back to first available
    return availableTypes[0]
  }

  // Weighted random selection
  let roll = Math.random() * totalWeight
  for (const candidate of candidates) {
    roll -= candidate.weight
    if (roll <= 0) {
      return candidate.type
    }
  }

  // Floating-point edge case — return last candidate
  return candidates[candidates.length - 1].type
}

/**
 * Compute a performance snapshot for a single item from its skill states.
 */
export function computeItemPerformance(skills: LearnerSkillState[]): ItemPerformanceSnapshot {
  if (skills.length === 0) {
    return {
      averageStability: 0,
      averageDifficulty: 5,
      totalSuccesses: 0,
      totalFailures: 0,
      totalLapses: 0,
      consecutiveFailures: 0,
      averageLatencyMs: null,
      hintRate: null,
    }
  }

  const totalSuccesses = skills.reduce((sum, s) => sum + s.success_count, 0)
  const totalFailures = skills.reduce((sum, s) => sum + s.failure_count, 0)
  const totalLapses = skills.reduce((sum, s) => sum + s.lapse_count, 0)
  const maxConsecutiveFailures = Math.max(...skills.map(s => s.consecutive_failures))
  const avgStability = skills.reduce((sum, s) => sum + s.stability, 0) / skills.length
  const avgDifficulty = skills.reduce((sum, s) => sum + s.difficulty, 0) / skills.length

  const latencies = skills.filter(s => s.mean_latency_ms !== null).map(s => s.mean_latency_ms!)
  const avgLatency = latencies.length > 0
    ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
    : null

  const hintRates = skills.filter(s => s.hint_rate !== null).map(s => s.hint_rate!)
  const avgHintRate = hintRates.length > 0
    ? hintRates.reduce((sum, r) => sum + r, 0) / hintRates.length
    : null

  return {
    averageStability: avgStability,
    averageDifficulty: avgDifficulty,
    totalSuccesses,
    totalFailures,
    totalLapses,
    consecutiveFailures: maxConsecutiveFailures,
    averageLatencyMs: avgLatency,
    hintRate: avgHintRate,
  }
}

/**
 * Compute a session-level performance summary from item states and skill states.
 * This is the primary input to determineDifficultyTier.
 */
export function computeSessionPerformanceSummary(
  itemStates: Record<string, LearnerItemState>,
  skillStates: Record<string, LearnerSkillState[]>,
): SessionPerformanceSummary {
  const allSkills = Object.values(skillStates).flat()

  // Accuracy from success/failure counts across all skills
  const totalSuccesses = allSkills.reduce((sum, s) => sum + s.success_count, 0)
  const totalFailures = allSkills.reduce((sum, s) => sum + s.failure_count, 0)
  const totalInteractions = totalSuccesses + totalFailures
  const recentAccuracy = totalInteractions > 0
    ? totalSuccesses / totalInteractions
    : 0.5 // default to 50% if no data

  // Average latency
  const latencies = allSkills.filter(s => s.mean_latency_ms !== null).map(s => s.mean_latency_ms!)
  const averageLatencyMs = latencies.length > 0
    ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
    : null

  // Leech fraction
  const totalItems = Object.keys(itemStates).length
  const leechCount = Object.values(itemStates).filter(s => s.is_leech).length
  const leechFraction = totalItems > 0 ? leechCount / totalItems : 0

  // Stage distribution
  const stageDistribution: Record<string, number> = {}
  for (const state of Object.values(itemStates)) {
    stageDistribution[state.stage] = (stageDistribution[state.stage] ?? 0) + 1
  }

  return {
    recentAccuracy,
    sampleSize: totalInteractions,
    averageLatencyMs,
    leechFraction,
    stageDistribution,
  }
}

/**
 * Determine per-item difficulty adjustment.
 * Items with high consecutive failures or high lapse counts should get
 * easier exercises than items the learner handles well.
 *
 * Returns a DifficultyTier override for this specific item.
 */
export function getItemDifficultyOverride(
  performance: ItemPerformanceSnapshot,
  sessionTier: DifficultyTier,
): DifficultyTier {
  // Item is struggling hard — always ease off
  if (performance.consecutiveFailures >= 2) {
    return 'easy'
  }

  // Item is a leech — ease off
  if (performance.totalLapses >= 3 && performance.averageStability < 2.0) {
    return 'easy'
  }

  // Item has very high stability and no lapses — can go harder
  if (
    performance.averageStability > 10 &&
    performance.totalLapses === 0 &&
    performance.totalSuccesses >= 5
  ) {
    if (sessionTier === 'easy') return 'medium'
    if (sessionTier === 'medium') return 'hard'
    return 'hard'
  }

  // Default: follow session-level tier
  return sessionTier
}
