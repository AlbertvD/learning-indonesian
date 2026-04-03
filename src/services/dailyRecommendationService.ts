/**
 * Daily Recommendation Service
 *
 * Computes adaptive daily study targets based on:
 * - Due load (overdue + today)
 * - Weekly goal state and progress
 * - Recent recall accuracy
 * - Session history today
 *
 * Outputs:
 * - due_reviews_today_target: How many due items to study
 * - new_items_today_target: How many new items to introduce
 * - recall_interactions_today_target: Minimum recall prompts
 * - estimated_minutes_today: Time estimate for session
 */

import type { WeeklyGoal } from '@/types/learning'

export interface DailyRecommendationInput {
  dueNow: number              // Items due today
  overdue: number             // Items overdue
  preferredSessionSize: number // User's preferred session size
  weeklyGoals: WeeklyGoal[] | null
  recallAccuracyPercent: number | null // 0-100 or null if no data
  completedSessionsToday: number // How many sessions already done
  recallSampleSize: number    // Number of recall reviews this week
}

export interface DailyRecommendation {
  dueReviewsTarget: number
  newItemsTarget: number
  recallInteractionsTarget: number
  estimatedMinutes: number
}

function calculateNewItemsTarget(totalDue: number, preferredSessionSize: number): number {
  if (totalDue === 0) {
    // No backlog: allow full new item allocation
    return Math.round(preferredSessionSize * 0.3)
  } else if (totalDue <= 10) {
    // Low backlog: some new items
    return Math.round(preferredSessionSize * 0.25)
  } else if (totalDue <= 20) {
    // Moderate backlog: reduce new items
    return Math.round(preferredSessionSize * 0.15)
  } else if (totalDue <= 40) {
    // High backlog: very few new items
    return Math.min(2, Math.round(preferredSessionSize * 0.1))
  } else {
    // Very high backlog: no new items, focus on clearing due
    return 0
  }
}

export const dailyRecommendationService = {
  /**
   * Compute daily study recommendations.
   * Adapts targets based on due load, goals, and accuracy.
   */
  computeRecommendation(input: DailyRecommendationInput): DailyRecommendation {
    const {
      dueNow,
      overdue,
      preferredSessionSize,
      weeklyGoals,
      completedSessionsToday,
    } = input

    const totalDue = dueNow + overdue

    // Step 1: Determine how much due work is needed
    // Priority: always clear overdue items
    let dueReviewsTarget = Math.min(preferredSessionSize, Math.max(dueNow, overdue > 0 ? overdue : 0))

    // Step 2: Adapt new item targets based on due load
    // High due load → reduce/eliminate new items to focus on catching up
    let newItemsTarget = calculateNewItemsTarget(totalDue, preferredSessionSize)

    // Step 3: Reduce new items if recall quality goal is at risk
    // If recall quality goal is at risk or missed, prioritize depth over breadth
    if (weeklyGoals) {
      const recallGoal = weeklyGoals.find(g => g.goal_type === 'recall_quality')
      if (recallGoal && (recallGoal.status === 'at_risk' || recallGoal.status === 'missed')) {
        newItemsTarget = Math.max(0, Math.floor(newItemsTarget * 0.5))
      }
    }

    // Step 4: Reduce targets if user already studied today
    // Avoid overwhelming users who already did sessions
    if (completedSessionsToday > 0) {
      newItemsTarget = Math.max(0, newItemsTarget - 1)
      dueReviewsTarget = Math.max(dueReviewsTarget - 2, Math.ceil(dueReviewsTarget * 0.7))
    }

    // Step 5: Calculate recall interaction target
    // Recall interactions are already included in due reviews (both recognition and recall skills)
    // We just ensure a minimum for healthy skill development
    const recallInteractionsTarget = Math.max(
      3, // Minimum 3 recall prompts per day for skill development
      Math.floor(dueReviewsTarget * 0.4) // ~40% of due work should be recall
    )

    // Step 6: Estimate time (roughly 1.5 min per interaction)
    const estimatedMinutes = Math.round((dueReviewsTarget + newItemsTarget) * 1.5)

    return {
      dueReviewsTarget,
      newItemsTarget,
      recallInteractionsTarget,
      estimatedMinutes,
    }
  },
}
