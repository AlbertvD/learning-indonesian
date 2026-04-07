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
import { logError } from '@/lib/logger'

export interface SessionImpactMessages {
  sessionLocalFacts: string[]
  weeklyImpactChanges: string[]
}

type Lang = 'en' | 'nl'

const msg = {
  en: {
    recallCompleted: (correct: number, total: number) => `You completed ${correct} of ${total} recall prompts`,
    recognitionPracticed: (count: number) => `You practiced ${count} recognition question${count > 1 ? 's' : ''}`,
    becameProductive: (count: number) => `${count} item${count > 1 ? 's' : ''} became productive`,
    reachedMaintenance: (count: number) => `${count} item${count > 1 ? 's' : ''} reached maintenance`,
    goalAchieved: (label: string) => `🎉 ${label} goal achieved!`,
    goalBackOnTrack: (label: string) => `${label} is back on track`,
    goalAtRisk: (label: string) => `${label} is now at risk`,
    goalMissed: (label: string) => `${label} goal missed for the week`,
    goalLabels: {
      consistency: 'Study consistency',
      recall_quality: 'Recall quality',
      usable_vocabulary: 'Vocabulary growth',
      review_health: 'Review backlog',
    } as Record<string, string>,
  },
  nl: {
    recallCompleted: (correct: number, total: number) => `Je voltooide ${correct} van ${total} herhaalprompts`,
    recognitionPracticed: (count: number) => `Je oefende ${count} herkenningsvragen`,
    becameProductive: (count: number) => `${count} item${count > 1 ? 's' : ''} werd productief`,
    reachedMaintenance: (count: number) => `${count} item${count > 1 ? 's' : ''} bereikte onderhoud`,
    goalAchieved: (label: string) => `🎉 ${label} doel behaald!`,
    goalBackOnTrack: (label: string) => `${label} is weer op schema`,
    goalAtRisk: (label: string) => `${label} loopt risico`,
    goalMissed: (label: string) => `${label} doel gemist deze week`,
    goalLabels: {
      consistency: 'Studieconsistentie',
      recall_quality: 'Herinnerkwaliteit',
      usable_vocabulary: 'Woordenschatgroei',
      review_health: 'Herhalingsachterstand',
    } as Record<string, string>,
  },
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
    afterGoals: WeeklyGoal[] | null,
    language: Lang = 'nl'
  ): Promise<SessionImpactMessages> {
    const sessionLocalFacts = await this.getSessionLocalFacts(userId, sessionId, language)
    const weeklyImpactChanges = this.getWeeklyImpactChanges(beforeGoals, afterGoals, language)

    return {
      sessionLocalFacts,
      weeklyImpactChanges
    }
  },

  /**
   * Get session-local fact messages from review events and stage transitions.
   * These facts are specific to what happened in this session.
   */
  async getSessionLocalFacts(userId: string, sessionId: string, language: Lang = 'nl'): Promise<string[]> {
    const facts: string[] = []
    const t = msg[language]

    try {
      // Fetch review events from this session
      const { data: reviews } = await supabase
        .schema('indonesian')
        .from('review_events')
        .select('id, skill_type, was_correct')
        .eq('user_id', userId)
        .eq('session_id', sessionId)

      if (reviews && reviews.length > 0) {
        const recallCount = reviews.filter(r => r.skill_type === 'form_recall').length
        if (recallCount > 0) {
          const recallCorrect = reviews.filter(r => r.skill_type === 'form_recall' && r.was_correct).length
          facts.push(t.recallCompleted(recallCorrect, recallCount))
        }

        const recognitionCount = reviews.filter(r => r.skill_type === 'recognition').length
        if (recognitionCount > 0) {
          facts.push(t.recognitionPracticed(recognitionCount))
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

        if (productiveCount > 0) facts.push(t.becameProductive(productiveCount))
        if (maintenanceCount > 0) facts.push(t.reachedMaintenance(maintenanceCount))
      }
    } catch (err) {
      logError({ page: 'sessionSummaryService', action: 'fetchSessionFacts', error: err })
    }

    return facts
  },

  /**
   * Get weekly goal impact messages by comparing before/after goal state.
   * These messages show progress toward weekly targets.
   */
  getWeeklyImpactChanges(beforeGoals: WeeklyGoal[] | null, afterGoals: WeeklyGoal[] | null, language: Lang = 'nl'): string[] {
    const messages: string[] = []
    const t = msg[language]

    if (!beforeGoals || !afterGoals || beforeGoals.length === 0 || afterGoals.length === 0) {
      return messages
    }

    const goalTypes = ['consistency', 'recall_quality', 'usable_vocabulary', 'review_health']

    for (const goalType of goalTypes) {
      const beforeGoal = beforeGoals.find(g => g.goal_type === goalType)
      const afterGoal = afterGoals.find(g => g.goal_type === goalType)

      if (!beforeGoal || !afterGoal) continue

      const beforeStatus = beforeGoal.status
      const afterStatus = afterGoal.status
      const label = t.goalLabels[goalType] ?? goalType

      if (beforeStatus !== afterStatus) {
        if (afterStatus === 'achieved') {
          messages.push(t.goalAchieved(label))
        } else if (afterStatus === 'on_track' && beforeStatus === 'at_risk') {
          messages.push(t.goalBackOnTrack(label))
        } else if (afterStatus === 'at_risk') {
          messages.push(t.goalAtRisk(label))
        } else if (afterStatus === 'missed') {
          messages.push(t.goalMissed(label))
        }
      }
    }

    return messages
  },
}
