// src/lib/stages.ts
import type { LearnerItemState, LearnerSkillState, LearnerStage } from '@/types/learning'

// Promotion thresholds (tunable)
const ANCHORING_RECOGNITION_STABILITY = 2.0
const ANCHORING_RECOGNITION_SUCCESS = 3
const RETRIEVING_STABILITY = 5.0
const RETRIEVING_SUCCESS_GATE_PASSED = 3
const RETRIEVING_SUCCESS_GATE_FAILED = 5
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
