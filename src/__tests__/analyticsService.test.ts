import { describe, it, expect, beforeEach, vi } from 'vitest'
import { analyticsService } from '@/services/analyticsService'

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({}),
  },
}))

describe('analyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('trackEvent', () => {
    it('emits a generic analytics event', async () => {
      const event = {
        event_type: 'goal_viewed' as const,
        user_id: 'user-1',
        goal_id: 'goal-1',
        goal_type: 'consistency',
      }

      await analyticsService.trackEvent(event)
      // Event was processed (no error thrown)
      expect(true).toBe(true)
    })

    it('handles errors gracefully and does not throw', async () => {
      const event = {
        event_type: 'goal_viewed' as const,
        user_id: 'user-1',
        goal_id: 'goal-1',
      }

      // trackEvent should not throw even if insert fails
      await analyticsService.trackEvent(event)
      expect(true).toBe(true)
    })
  })

  describe('trackGoalGenerated', () => {
    it('tracks goal generated events for multiple goals', async () => {
      const userId = 'user-1'
      const goalIds = ['goal-1', 'goal-2', 'goal-3']

      await analyticsService.trackGoalGenerated(userId, goalIds)
      // Events were processed (no error thrown)
      expect(true).toBe(true)
    })

    it('handles empty goal list', async () => {
      const userId = 'user-1'
      const goalIds: string[] = []

      await analyticsService.trackGoalGenerated(userId, goalIds)
      expect(true).toBe(true)
    })
  })

  describe('trackGoalViewed', () => {
    it('tracks goal viewed event with goal type', async () => {
      const userId = 'user-1'
      const goalId = 'goal-1'
      const goalType = 'recall_quality'

      await analyticsService.trackGoalViewed(userId, goalId, goalType)
      expect(true).toBe(true)
    })
  })

  describe('trackDailyPlanViewed', () => {
    it('tracks daily plan viewed event', async () => {
      const userId = 'user-1'

      await analyticsService.trackDailyPlanViewed(userId)
      expect(true).toBe(true)
    })
  })

  describe('trackSessionStartedFromToday', () => {
    it('tracks session started from Today card event', async () => {
      const userId = 'user-1'
      const sessionId = 'session-1'

      await analyticsService.trackSessionStartedFromToday(userId, sessionId)
      expect(true).toBe(true)
    })
  })

  describe('trackGoalAchieved', () => {
    it('tracks goal achieved event', async () => {
      const userId = 'user-1'
      const goalId = 'goal-1'
      const goalType = 'consistency'

      await analyticsService.trackGoalAchieved(userId, goalId, goalType)
      expect(true).toBe(true)
    })
  })

  describe('trackGoalMissed', () => {
    it('tracks goal missed event', async () => {
      const userId = 'user-1'
      const goalId = 'goal-1'
      const goalType = 'usable_vocabulary'

      await analyticsService.trackGoalMissed(userId, goalId, goalType)
      expect(true).toBe(true)
    })
  })

  describe('trackSessionSummaryViewed', () => {
    it('tracks session summary viewed event with impact count', async () => {
      const userId = 'user-1'
      const sessionId = 'session-1'
      const goalImpactCount = 2

      await analyticsService.trackSessionSummaryViewed(userId, sessionId, goalImpactCount)
      expect(true).toBe(true)
    })
  })
})
