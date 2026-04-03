/**
 * Default parameters for new learner sessions.
 * These settings ensure beginner learners don't get overwhelmed while building confidence.
 */

export interface NewLearnerDefaults {
  // Session sizing (minutes)
  targetSessionMinutes: number
  minSessionMinutes: number
  maxSessionMinutes: number

  // Interaction capacity
  estimatedBeginnerSecondsPerInteraction: number
  sessionInteractionCap: number

  // Detection thresholds
  accountAgeDaysThreshold: number
  stableItemCountThreshold: number
}

/**
 * Compute new learner defaults based on target session time.
 * Defaults: 15 minutes (clamped 10–20)
 * Estimated time per interaction: 18 seconds
 */
export function computeNewLearnerDefaults(
  targetSessionMinutesInput: number = 15
): NewLearnerDefaults {
  // Clamp to 10–20 minute range
  const targetSessionMinutes = Math.max(10, Math.min(20, targetSessionMinutesInput))

  // Compute interaction cap: floor(target_minutes * 60 / 18)
  const sessionInteractionCap = Math.floor((targetSessionMinutes * 60) / 18)

  return {
    targetSessionMinutes,
    minSessionMinutes: 10,
    maxSessionMinutes: 20,
    estimatedBeginnerSecondsPerInteraction: 18,
    sessionInteractionCap,
    // New learner thresholds (account age < 30 days, < 50 stable items)
    accountAgeDaysThreshold: 30,
    stableItemCountThreshold: 50,
  }
}

// Default instance with 15-minute target
export const newLearnerDefaults = computeNewLearnerDefaults(15)
