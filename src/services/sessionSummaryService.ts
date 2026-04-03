/**
 * Session Summary Service
 *
 * Computes goal impact messages for session completion.
 * Messages are derived from two sources:
 * 1. Session-local facts: review events and stage transitions in this session
 * 2. Weekly-impact changes: before/after comparison of goal state
 */

import { supabase } from '@/lib/supabase'
import type { WeeklyGoal } from '@/types/learning'

export interface SessionImpactMessages {
  sessionLocalFacts: string[]
  weeklyImpactChanges: string[]
}

export const sessionSummaryService = {
  /**
   * Compute goal impact messages for a completed session.
   *
   * Requires:
   * - Session must be ended/closed in the database
   * - Goal state must be up-to-date
   */
  async computeSessionImpactMessages(
    userId: string,
    sessionId: string,
    beforeGoals: WeeklyGoal[] | null,
    afterGoals: WeeklyGoal[] | null
  ): Promise<SessionImpactMessages> {
    const sessionLocalFacts = await this.getSessionLocalFacts(userId, sessionId)
    const weeklyImpactChanges = this.getWeeklyImpactChanges(beforeGoals, afterGoals)

    return {
      sessionLocalFacts,
      weeklyImpactChanges
    }
  },

  /**
   * Get session-local fact messages from review events and stage transitions.
   * These facts are specific to what happened in this session.
   */
  async getSessionLocalFacts(userId: string, sessionId: string): Promise<string[]> {
    const facts: string[] = []

    try {
      // Fetch review events from this session
      const { data: reviews } = await supabase
        .schema('indonesian')
        .from('review_events')
        .select('id, skill_type, was_correct')
        .eq('user_id', userId)
        .eq('session_id', sessionId)

      if (reviews && reviews.length > 0) {
        // Count recalls completed
        const recallCount = reviews.filter(r => r.skill_type === 'recall').length
        if (recallCount > 0) {
          const recallCorrect = reviews.filter(r => r.skill_type === 'recall' && r.was_correct).length
          facts.push(`You completed ${recallCorrect} of ${recallCount} recall prompts`)
        }

        // Count recognition completed
        const recognitionCount = reviews.filter(r => r.skill_type === 'recognition').length
        if (recognitionCount > 0) {
          facts.push(`You practiced ${recognitionCount} recognition questions`)
        }
      }

      // Fetch stage events from this session
      const { data: stageEvents } = await supabase
        .schema('indonesian')
        .from('learner_stage_events')
        .select('to_stage')
        .eq('user_id', userId)
        .in('source_review_event_id', reviews?.map(r => r.id) ?? [])

      if (stageEvents && stageEvents.length > 0) {
        const productiveCount = stageEvents.filter(e => e.to_stage === 'productive').length
        const maintenanceCount = stageEvents.filter(e => e.to_stage === 'maintenance').length

        if (productiveCount > 0) {
          facts.push(`${productiveCount} item${productiveCount > 1 ? 's' : ''} became productive`)
        }
        if (maintenanceCount > 0) {
          facts.push(`${maintenanceCount} item${maintenanceCount > 1 ? 's' : ''} reached maintenance`)
        }
      }
    } catch (err) {
      console.error('[sessionSummaryService] Failed to fetch session facts:', err)
    }

    return facts
  },

  /**
   * Get weekly goal impact messages by comparing before/after goal state.
   * These messages show progress toward weekly targets.
   */
  getWeeklyImpactChanges(beforeGoals: WeeklyGoal[] | null, afterGoals: WeeklyGoal[] | null): string[] {
    const messages: string[] = []

    if (!beforeGoals || !afterGoals || beforeGoals.length === 0 || afterGoals.length === 0) {
      return messages
    }

    // Compare each goal type
    const goalTypes = ['consistency', 'recall_quality', 'usable_vocabulary', 'review_health']

    for (const goalType of goalTypes) {
      const beforeGoal = beforeGoals.find(g => g.goal_type === goalType)
      const afterGoal = afterGoals.find(g => g.goal_type === goalType)

      if (!beforeGoal || !afterGoal) continue

      const beforeStatus = beforeGoal.status
      const afterStatus = afterGoal.status

      // Message 1: Status transitions (e.g., at_risk → on_track)
      if (beforeStatus !== afterStatus) {
        if (afterStatus === 'achieved') {
          messages.push(`🎉 ${this.getGoalLabel(goalType)} goal achieved!`)
        } else if (afterStatus === 'on_track' && beforeStatus === 'at_risk') {
          messages.push(`${this.getGoalLabel(goalType)} is back on track`)
        } else if (afterStatus === 'at_risk') {
          messages.push(`${this.getGoalLabel(goalType)} is now at risk`)
        } else if (afterStatus === 'missed') {
          messages.push(`${this.getGoalLabel(goalType)} goal missed for the week`)
        }
      }
    }

    return messages
  },

  /**
   * User-friendly label for a goal type.
   */
  getGoalLabel(goalType: string): string {
    const labels: Record<string, string> = {
      consistency: 'Study consistency',
      recall_quality: 'Recall quality',
      usable_vocabulary: 'Vocabulary growth',
      review_health: 'Review backlog'
    }
    return labels[goalType] ?? goalType
  }
}
