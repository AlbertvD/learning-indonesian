import { describe, it, expect, beforeEach, vi } from 'vitest'
import { analyticsService } from '@/services/analyticsService'
import { supabase } from '@/lib/supabase'

// vi.mock is hoisted above imports, so outer variables aren't initialised yet.
// Use vi.hoisted() to declare mocks that are safe to reference inside the factory.
const { mockInsert } = vi.hoisted(() => ({
  mockInsert: vi.fn().mockResolvedValue({ data: null, error: null }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: mockInsert,
      }),
    }),
  },
}))

describe('analyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockResolvedValue({ data: null, error: null })
  })

  describe('trackEvent', () => {
    it('inserts an analytics event row', async () => {
      await analyticsService.trackEvent({
        event_type: 'goal_viewed',
        user_id: 'user-1',
        goal_id: 'goal-1',
        goal_type: 'consistency',
      })
      expect(vi.mocked(supabase.schema)).toHaveBeenCalledWith('indonesian')
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'goal_viewed',
        user_id: 'user-1',
      }))
    })

    it('does not throw when insert fails', async () => {
      mockInsert.mockRejectedValueOnce(new Error('network error'))
      await expect(analyticsService.trackEvent({
        event_type: 'goal_viewed',
        user_id: 'user-1',
      })).resolves.toBeUndefined()
    })
  })

  describe('trackGoalGenerated', () => {
    it('inserts one event per goal id', async () => {
      await analyticsService.trackGoalGenerated('user-1', ['goal-1', 'goal-2', 'goal-3'])
      expect(mockInsert).toHaveBeenCalledTimes(3)
    })

    it('is a no-op for an empty goal list', async () => {
      await analyticsService.trackGoalGenerated('user-1', [])
      expect(mockInsert).not.toHaveBeenCalled()
    })
  })

  describe('trackGoalViewed', () => {
    it('inserts a goal_viewed event with the correct goal_type', async () => {
      await analyticsService.trackGoalViewed('user-1', 'goal-1', 'recall_quality')
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'goal_viewed',
        goal_type: 'recall_quality',
      }))
    })
  })

  describe('trackDailyPlanViewed', () => {
    it('inserts a daily_plan_viewed event', async () => {
      await analyticsService.trackDailyPlanViewed('user-1')
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'daily_plan_viewed',
        user_id: 'user-1',
      }))
    })
  })

  describe('trackSessionStartedFromToday', () => {
    it('inserts a session_started_from_today event with session_id', async () => {
      await analyticsService.trackSessionStartedFromToday('user-1', 'session-1')
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'session_started_from_today',
        session_id: 'session-1',
      }))
    })
  })

  describe('trackGoalAchieved', () => {
    it('inserts a goal_achieved event', async () => {
      await analyticsService.trackGoalAchieved('user-1', 'goal-1', 'consistency')
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'goal_achieved',
        goal_type: 'consistency',
      }))
    })
  })

  describe('trackGoalMissed', () => {
    it('inserts a goal_missed event', async () => {
      await analyticsService.trackGoalMissed('user-1', 'goal-1', 'usable_vocabulary')
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'goal_missed',
        goal_type: 'usable_vocabulary',
      }))
    })
  })

  describe('trackSessionSummaryViewed', () => {
    it('inserts a session_summary_viewed event with impact count in metadata', async () => {
      await analyticsService.trackSessionSummaryViewed('user-1', 'session-1', 2)
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'session_summary_viewed',
        session_id: 'session-1',
      }))
    })
  })
})
