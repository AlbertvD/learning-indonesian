// src/lib/stages.ts
import type { LearnerItemState, LearnerSkillState, LearnerStage, LearnerGrammarState } from '@/types/learning'

// Promotion thresholds (tuned for language learning progression)
// Anchoring → Retrieving: Recognition only, lower threshold for faster progression
const ANCHORING_RECOGNITION_STABILITY = 1.8 // Lowered from 2.0 for quicker anchor phase
const ANCHORING_RECOGNITION_SUCCESS = 3    // 3 correct reviews
// Retrieving → Productive: Both recognition and recall needed
const RETRIEVING_STABILITY = 4.5            // Lowered from 5.0 for natural progression
const RETRIEVING_SUCCESS_GATE_PASSED = 3    // After passing first test
const RETRIEVING_SUCCESS_GATE_FAILED = 5    // After failing first test
// Productive → Maintenance: Very strong, no lapses
const PRODUCTIVE_STABILITY = 21.0

const STAGE_ORDER: LearnerStage[] = ['new', 'anchoring', 'retrieving', 'productive', 'maintenance']

/**
 * Check if an item should be promoted to a higher stage.
 * Returns the new stage, or null if no promotion.
 */
export function checkPromotion(
  item: LearnerItemState,
  recognition: LearnerSkillState | null,
  recall: LearnerSkillState | null,
): LearnerStage | null {
  switch (item.stage) {
    case 'new':
      return 'anchoring'

    case 'anchoring': {
      if (!recognition) return null
      if (recognition.stability >= ANCHORING_RECOGNITION_STABILITY && recognition.success_count >= ANCHORING_RECOGNITION_SUCCESS) {
        return 'retrieving'
      }
      return null
    }

    case 'retrieving': {
      if (!recognition || !recall) return null
      const threshold = item.gate_check_passed ? RETRIEVING_SUCCESS_GATE_PASSED : RETRIEVING_SUCCESS_GATE_FAILED
      if (
        recognition.stability >= RETRIEVING_STABILITY &&
        recognition.success_count >= threshold &&
        recall.stability >= RETRIEVING_STABILITY &&
        recall.success_count >= threshold
      ) {
        return 'productive'
      }
      return null
    }

    case 'productive': {
      if (!recognition || !recall) return null
      if (
        recognition.stability >= PRODUCTIVE_STABILITY &&
        recognition.lapse_count === 0 &&
        recall.stability >= PRODUCTIVE_STABILITY &&
        recall.lapse_count === 0
      ) {
        return 'maintenance'
      }
      return null
    }

    default:
      return null
  }
}

/**
 * Check if an item should be demoted due to consecutive failures.
 * Returns the new stage, or null if no demotion.
 * Demotion floors at anchoring — items never go back to new.
 */
export function checkDemotion(
  item: LearnerItemState,
  skill: LearnerSkillState,
): LearnerStage | null {
  if (skill.consecutive_failures < 2) return null

  const currentIndex = STAGE_ORDER.indexOf(item.stage)
  // Floor at anchoring (index 1)
  if (currentIndex <= 1) return null

  return STAGE_ORDER[currentIndex - 1]
}

// ── Grammar pattern stage transitions ────────────────────────────────────────
// Single FSRS state per pattern (no skill decomposition).

const GRAMMAR_ANCHORING_STABILITY = 1.8
const GRAMMAR_ANCHORING_REVIEWS = 3
const GRAMMAR_RETRIEVING_STABILITY = 4.5
const GRAMMAR_RETRIEVING_REVIEWS = 5
const GRAMMAR_PRODUCTIVE_STABILITY = 21.0

/**
 * Check if a grammar pattern should be promoted.
 * Returns the new stage, or null if no promotion.
 */
export function checkGrammarPromotion(state: LearnerGrammarState): LearnerStage | null {
  switch (state.stage) {
    case 'new':
      return 'anchoring'

    case 'anchoring':
      if (
        (state.stability ?? 0) >= GRAMMAR_ANCHORING_STABILITY &&
        state.review_count >= GRAMMAR_ANCHORING_REVIEWS
      ) return 'retrieving'
      return null

    case 'retrieving':
      if (
        (state.stability ?? 0) >= GRAMMAR_RETRIEVING_STABILITY &&
        state.review_count >= GRAMMAR_RETRIEVING_REVIEWS
      ) return 'productive'
      return null

    case 'productive':
      if (
        (state.stability ?? 0) >= GRAMMAR_PRODUCTIVE_STABILITY &&
        state.lapse_count === 0
      ) return 'maintenance'
      return null

    default:
      return null
  }
}

/**
 * Check if a grammar pattern should be demoted due to consecutive failures.
 * Mirrors vocab checkDemotion: trigger on consecutive_failures >= 2, floor at anchoring.
 */
export function checkGrammarDemotion(state: LearnerGrammarState): LearnerStage | null {
  if (state.consecutive_failures < 2) return null
  const idx = STAGE_ORDER.indexOf(state.stage)
  if (idx <= 1) return null  // floor at anchoring
  return STAGE_ORDER[idx - 1]
}
