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

// Anchoring → Retrieving: Recognition + at least 1 successful meaning_recall review
const ANCHORING_MEANING_RECALL_SUCCESS = 1  // Must have seen word from NL→ID direction at least once

/**
 * Check if an item should be promoted to a higher stage.
 * Returns the new stage, or null if no promotion.
 *
 * Three skills are checked at different stages:
 * - recognition: ID→NL passive knowledge (anchoring gate)
 * - meaningRecall: NL→ID recognition/recall (anchoring gate + retrieving/productive)
 * - formRecall: typed production (retrieving gate + productive/maintenance)
 *
 * This matches the SLA acquisitional sequence (Laufer & Goldstein 2004):
 * receptive recognition → productive recognition → receptive recall → productive recall
 */
export function checkPromotion(
  item: LearnerItemState,
  recognition: LearnerSkillState | null,
  formRecall: LearnerSkillState | null,
  meaningRecall?: LearnerSkillState | null,
): LearnerStage | null {
  switch (item.stage) {
    case 'new':
      return 'anchoring'

    case 'anchoring': {
      if (!recognition) return null
      // Recognition must be stable
      if (recognition.stability < ANCHORING_RECOGNITION_STABILITY || recognition.success_count < ANCHORING_RECOGNITION_SUCCESS) {
        return null
      }
      // Must have at least 1 successful meaning_recall review (seen word from NL→ID direction).
      // If no meaning_recall skill exists yet, the learner hasn't been tested in that direction.
      if (!meaningRecall || meaningRecall.success_count < ANCHORING_MEANING_RECALL_SUCCESS) {
        return null
      }
      return 'retrieving'
    }

    case 'retrieving': {
      if (!recognition || !formRecall) return null
      const threshold = item.gate_check_passed ? RETRIEVING_SUCCESS_GATE_PASSED : RETRIEVING_SUCCESS_GATE_FAILED
      // All three skills must meet the threshold for full bidirectional knowledge
      const meaningOk = meaningRecall
        ? meaningRecall.stability >= RETRIEVING_STABILITY && meaningRecall.success_count >= threshold
        : false
      if (
        recognition.stability >= RETRIEVING_STABILITY &&
        recognition.success_count >= threshold &&
        formRecall.stability >= RETRIEVING_STABILITY &&
        formRecall.success_count >= threshold &&
        meaningOk
      ) {
        return 'productive'
      }
      return null
    }

    case 'productive': {
      if (!recognition || !formRecall) return null
      const meaningOk = meaningRecall
        ? meaningRecall.stability >= PRODUCTIVE_STABILITY && meaningRecall.lapse_count === 0
        : false
      if (
        recognition.stability >= PRODUCTIVE_STABILITY &&
        recognition.lapse_count === 0 &&
        formRecall.stability >= PRODUCTIVE_STABILITY &&
        formRecall.lapse_count === 0 &&
        meaningOk
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
