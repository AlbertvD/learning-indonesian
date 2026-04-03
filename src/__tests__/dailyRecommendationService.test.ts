import { describe, it, expect } from 'vitest'
import { dailyRecommendationService } from '@/services/dailyRecommendationService'
import type { WeeklyGoal } from '@/types/learning'

describe('dailyRecommendationService', () => {
  describe('computeRecommendation', () => {
    it('recommends full session when no due load', () => {
      const rec = dailyRecommendationService.computeRecommendation({
        dueNow: 0,
        overdue: 0,
        preferredSessionSize: 15,
        weeklyGoals: null,
        recallAccuracyPercent: null,
        completedSessionsToday: 0,
        recallSampleSize: 0,
      })

      expect(rec.newItemsTarget).toBeGreaterThan(0)
      expect(rec.dueReviewsTarget).toBeLessThanOrEqual(15)
    })

    it('prioritizes due work when backlog exists', () => {
      const rec = dailyRecommendationService.computeRecommendation({
        dueNow: 5,
        overdue: 3,
        preferredSessionSize: 15,
        weeklyGoals: null,
        recallAccuracyPercent: null,
        completedSessionsToday: 0,
        recallSampleSize: 0,
      })

      expect(rec.dueReviewsTarget).toBeGreaterThanOrEqual(5)
    })

    it('caps new items at 2 when due > 20', () => {
      const rec = dailyRecommendationService.computeRecommendation({
        dueNow: 15,
        overdue: 10,
        preferredSessionSize: 15,
        weeklyGoals: null,
        recallAccuracyPercent: null,
        completedSessionsToday: 0,
        recallSampleSize: 0,
      })

      expect(rec.newItemsTarget).toBeLessThanOrEqual(2)
    })

    it('caps new items at 0 when due > 40', () => {
      const rec = dailyRecommendationService.computeRecommendation({
        dueNow: 30,
        overdue: 15,
        preferredSessionSize: 15,
        weeklyGoals: null,
        recallAccuracyPercent: null,
        completedSessionsToday: 0,
        recallSampleSize: 0,
      })

      expect(rec.newItemsTarget).toBe(0)
    })

    it('reduces new items when recall quality is at risk', () => {
      const goals: WeeklyGoal[] = [
        {
          id: '1',
          goal_set_id: '1',
          goal_type: 'recall_quality',
          status: 'at_risk',
          current_value_numeric: 50,
          target_value_numeric: 70,
        } as WeeklyGoal,
      ]

      const recWithGoal = dailyRecommendationService.computeRecommendation({
        dueNow: 5,
        overdue: 0,
        preferredSessionSize: 15,
        weeklyGoals: goals,
        recallAccuracyPercent: 50,
        completedSessionsToday: 0,
        recallSampleSize: 5,
      })

      const recWithoutGoal = dailyRecommendationService.computeRecommendation({
        dueNow: 5,
        overdue: 0,
        preferredSessionSize: 15,
        weeklyGoals: null,
        recallAccuracyPercent: 50,
        completedSessionsToday: 0,
        recallSampleSize: 5,
      })

      expect(recWithGoal.newItemsTarget).toBeLessThan(recWithoutGoal.newItemsTarget)
    })

    it('reduces targets if session already completed today', () => {
      const recNoSession = dailyRecommendationService.computeRecommendation({
        dueNow: 10,
        overdue: 5,
        preferredSessionSize: 15,
        weeklyGoals: null,
        recallAccuracyPercent: null,
        completedSessionsToday: 0,
        recallSampleSize: 0,
      })

      const recWithSession = dailyRecommendationService.computeRecommendation({
        dueNow: 10,
        overdue: 5,
        preferredSessionSize: 15,
        weeklyGoals: null,
        recallAccuracyPercent: null,
        completedSessionsToday: 1,
        recallSampleSize: 0,
      })

      expect(recWithSession.newItemsTarget).toBeLessThanOrEqual(recNoSession.newItemsTarget)
    })

    it('provides recall interaction minimum', () => {
      const rec = dailyRecommendationService.computeRecommendation({
        dueNow: 5,
        overdue: 0,
        preferredSessionSize: 15,
        weeklyGoals: null,
        recallAccuracyPercent: null,
        completedSessionsToday: 0,
        recallSampleSize: 0,
      })

      expect(rec.recallInteractionsTarget).toBeGreaterThanOrEqual(3)
    })

    it('estimates time based on interactions', () => {
      const rec = dailyRecommendationService.computeRecommendation({
        dueNow: 10,
        overdue: 0,
        preferredSessionSize: 15,
        weeklyGoals: null,
        recallAccuracyPercent: null,
        completedSessionsToday: 0,
        recallSampleSize: 0,
      })

      const expectedMin = (rec.dueReviewsTarget + rec.newItemsTarget) * 1.5
      expect(rec.estimatedMinutes).toBe(Math.round(expectedMin))
    })
  })
})
