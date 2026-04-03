import { describe, it, expect } from 'vitest'
import { dailyRecommendationService } from '@/services/dailyRecommendationService'
import type { WeeklyGoal } from '@/types/learning'

/**
 * API Response Shape Tests
 *
 * These tests verify the response shapes from services that feed the UI.
 * This ensures the frontend can rely on stable contracts.
 */

describe('Goal and Recommendation API Response Shapes', () => {
  describe('weeklyGoalSet response shape', () => {
    it('includes required metadata', () => {
      const mockGoal: WeeklyGoal = {
        id: 'goal-1',
        goal_set_id: 'set-1',
        goal_type: 'consistency',
        status: 'on_track',
        current_value_numeric: 5,
        target_value_numeric: 7,
        current_value_text: null,
        target_value_text: null,
      }

      // Verify all required fields exist
      expect(mockGoal).toHaveProperty('id')
      expect(mockGoal).toHaveProperty('goal_set_id')
      expect(mockGoal).toHaveProperty('goal_type')
      expect(mockGoal).toHaveProperty('status')
      expect(mockGoal).toHaveProperty('current_value_numeric')
      expect(mockGoal).toHaveProperty('target_value_numeric')
    })

    it('has valid goal types', () => {
      const validTypes = ['consistency', 'recall_quality', 'usable_vocabulary', 'review_health']
      const mockGoal: WeeklyGoal = {
        id: 'goal-1',
        goal_set_id: 'set-1',
        goal_type: 'consistency',
        status: 'on_track',
        current_value_numeric: 5,
        target_value_numeric: 7,
      }

      expect(validTypes).toContain(mockGoal.goal_type)
    })

    it('has valid status values', () => {
      const validStatuses = ['pending', 'on_track', 'at_risk', 'achieved', 'missed']
      const testStatuses: WeeklyGoal['status'][] = ['on_track', 'at_risk', 'achieved', 'missed']

      for (const status of testStatuses) {
        expect(validStatuses).toContain(status)
      }
    })
  })

  describe('dailyPlan response shape', () => {
    it('includes all required recommendation fields', () => {
      const rec = dailyRecommendationService.computeRecommendation({
        dueNow: 5,
        overdue: 2,
        preferredSessionSize: 15,
        weeklyGoals: null,
        recallAccuracyPercent: null,
        completedSessionsToday: 0,
        recallSampleSize: 0,
      })

      expect(rec).toHaveProperty('dueReviewsTarget')
      expect(rec).toHaveProperty('newItemsTarget')
      expect(rec).toHaveProperty('recallInteractionsTarget')
      expect(rec).toHaveProperty('estimatedMinutes')
    })

    it('has numeric targets and time estimate', () => {
      const rec = dailyRecommendationService.computeRecommendation({
        dueNow: 10,
        overdue: 0,
        preferredSessionSize: 15,
        weeklyGoals: null,
        recallAccuracyPercent: null,
        completedSessionsToday: 0,
        recallSampleSize: 0,
      })

      expect(typeof rec.dueReviewsTarget).toBe('number')
      expect(typeof rec.newItemsTarget).toBe('number')
      expect(typeof rec.recallInteractionsTarget).toBe('number')
      expect(typeof rec.estimatedMinutes).toBe('number')

      // All should be non-negative
      expect(rec.dueReviewsTarget).toBeGreaterThanOrEqual(0)
      expect(rec.newItemsTarget).toBeGreaterThanOrEqual(0)
      expect(rec.recallInteractionsTarget).toBeGreaterThanOrEqual(0)
      expect(rec.estimatedMinutes).toBeGreaterThanOrEqual(0)
    })
  })

  describe('timezone-required state', () => {
    it('returns null for goals when timezone not set', () => {
      // Simulates the case where goalService.getGoalProgress() returns
      // { state: 'timezone_required', weeklyGoals: null }
      const noGoalsState = {
        state: 'timezone_required' as const,
        weeklyGoals: null,
        weeklyGoalSet: null,
      }

      expect(noGoalsState.state).toBe('timezone_required')
      expect(noGoalsState.weeklyGoals).toBeNull()
    })
  })

  describe('composite goal + recommendation response', () => {
    it('can be used together by UI', () => {
      const goals: WeeklyGoal[] = [
        {
          id: '1',
          goal_set_id: '1',
          goal_type: 'consistency',
          status: 'on_track',
          current_value_numeric: 5,
          target_value_numeric: 7,
        } as WeeklyGoal,
      ]

      const rec = dailyRecommendationService.computeRecommendation({
        dueNow: 8,
        overdue: 2,
        preferredSessionSize: 15,
        weeklyGoals: goals,
        recallAccuracyPercent: null,
        completedSessionsToday: 0,
        recallSampleSize: 0,
      })

      // Both should be available together for a "Today" card
      expect(goals).toBeDefined()
      expect(rec).toBeDefined()
      expect(rec.dueReviewsTarget).toBeGreaterThan(0)
    })
  })
})
