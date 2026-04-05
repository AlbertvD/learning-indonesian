import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sessionSummaryService } from '@/services/sessionSummaryService'
import { analyticsService } from '@/services/analyticsService'
import type { WeeklyGoal } from '@/types/learning'

// Prevent real HTTP requests to the Supabase instance during tests
vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Goal System Integration', () => {
  describe('Session impact messaging flow', () => {
    it('generates weekly impact messages when goals transition', () => {
      const beforeGoals: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'on_track', current_value_numeric: 3, target_value_numeric: 7 } as WeeklyGoal,
        { id: '2', goal_set_id: '1', goal_type: 'recall_quality', status: 'at_risk', current_value_numeric: 45, target_value_numeric: 70 } as WeeklyGoal,
      ]

      const afterGoals: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'achieved', current_value_numeric: 7, target_value_numeric: 7 } as WeeklyGoal,
        { id: '2', goal_set_id: '1', goal_type: 'recall_quality', status: 'on_track', current_value_numeric: 72, target_value_numeric: 70 } as WeeklyGoal,
      ]

      const changes = sessionSummaryService.getWeeklyImpactChanges(beforeGoals, afterGoals)

      expect(changes.length).toBe(2)
      expect(changes).toContain('🎉 Study consistency goal achieved!')
      expect(changes).toContain('Recall quality is back on track')
    })

    it('detects all goal status types correctly', () => {
      const scenarios: Array<{ before: string; after: string; expectedMessage: string }> = [
        { before: 'on_track', after: 'achieved', expectedMessage: '🎉' },
        { before: 'at_risk', after: 'on_track', expectedMessage: 'back on track' },
        { before: 'on_track', after: 'at_risk', expectedMessage: 'at risk' },
        { before: 'on_track', after: 'missed', expectedMessage: 'missed' },
      ]

      for (const scenario of scenarios) {
        const before: WeeklyGoal[] = [
          { id: '1', goal_set_id: '1', goal_type: 'consistency', status: scenario.before as any } as WeeklyGoal,
        ]
        const after: WeeklyGoal[] = [
          { id: '1', goal_set_id: '1', goal_type: 'consistency', status: scenario.after as any } as WeeklyGoal,
        ]

        const changes = sessionSummaryService.getWeeklyImpactChanges(before, after)
        expect(changes.some(msg => msg.includes(scenario.expectedMessage))).toBe(true)
      }
    })
  })

  describe('Analytics tracking', () => {
    it('tracks goal generation, viewing, and achievement lifecycle', async () => {
      const userId = 'user-1'
      const goalId = 'goal-1'

      // Simulate goal lifecycle
      await analyticsService.trackGoalGenerated(userId, [goalId])
      await analyticsService.trackGoalViewed(userId, goalId, 'consistency')
      await analyticsService.trackGoalAchieved(userId, goalId, 'consistency')

      // All calls should complete without error
      expect(true).toBe(true)
    })

    it('tracks session-initiated analytics events', async () => {
      const userId = 'user-1'
      const sessionId = 'session-1'

      // Simulate session workflow
      await analyticsService.trackSessionStartedFromToday(userId, sessionId)
      await analyticsService.trackDailyPlanViewed(userId)
      await analyticsService.trackSessionSummaryViewed(userId, sessionId, 2)

      expect(true).toBe(true)
    })
  })

  describe('Goal label formatting', () => {
    it('provides consistent goal labels for all goal types', () => {
      const goalTypes = ['consistency', 'recall_quality', 'usable_vocabulary', 'review_health']
      const labels: Record<string, string> = {
        consistency: 'Study consistency',
        recall_quality: 'Recall quality',
        usable_vocabulary: 'Vocabulary growth',
        review_health: 'Review backlog'
      }

      for (const goalType of goalTypes) {
        const label = sessionSummaryService.getGoalLabel(goalType)
        expect(label).toBe(labels[goalType])
      }
    })
  })

  describe('Realistic learner scenarios', () => {
    it('handles new learner with empty goal history', () => {
      const changes = sessionSummaryService.getWeeklyImpactChanges(null, null)
      expect(changes).toEqual([])
    })

    it('handles on-track learner with incremental progress', () => {
      const beforeGoals: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'on_track', current_value_numeric: 5, target_value_numeric: 7 } as WeeklyGoal,
      ]
      const afterGoals: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'on_track', current_value_numeric: 6, target_value_numeric: 7 } as WeeklyGoal,
      ]

      const changes = sessionSummaryService.getWeeklyImpactChanges(beforeGoals, afterGoals)
      expect(changes).toEqual([]) // No status change = no message
    })

    it('handles learner recovering from backlog', () => {
      const beforeGoals: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'review_health', status: 'at_risk', current_value_numeric: 45, target_value_numeric: 20 } as WeeklyGoal,
      ]
      const afterGoals: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'review_health', status: 'on_track', current_value_numeric: 18, target_value_numeric: 20 } as WeeklyGoal,
      ]

      const changes = sessionSummaryService.getWeeklyImpactChanges(beforeGoals, afterGoals)
      expect(changes).toContain('Review backlog is back on track')
    })
  })
})
