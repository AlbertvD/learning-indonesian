import { describe, it, expect } from 'vitest'
import { sessionSummaryService } from '@/services/sessionSummaryService'
import type { WeeklyGoal } from '@/types/learning'

describe('sessionSummaryService', () => {
  describe('getWeeklyImpactChanges (English)', () => {
    it('returns empty array when before/after goals are null', () => {
      const changes = sessionSummaryService.getWeeklyImpactChanges(null, null, 'en')
      expect(changes).toEqual([])
    })

    it('returns empty array when goals have no changes', () => {
      const goals: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'on_track' } as WeeklyGoal,
        { id: '2', goal_set_id: '1', goal_type: 'recall_quality', status: 'on_track' } as WeeklyGoal
      ]

      const changes = sessionSummaryService.getWeeklyImpactChanges(goals, goals, 'en')
      expect(changes).toEqual([])
    })

    it('detects goal achievement', () => {
      const before: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'on_track' } as WeeklyGoal
      ]
      const after: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'achieved' } as WeeklyGoal
      ]

      const changes = sessionSummaryService.getWeeklyImpactChanges(before, after, 'en')
      expect(changes).toContain('🎉 Study consistency goal achieved!')
    })

    it('detects recovery from at_risk to on_track', () => {
      const before: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'recall_quality', status: 'at_risk' } as WeeklyGoal
      ]
      const after: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'recall_quality', status: 'on_track' } as WeeklyGoal
      ]

      const changes = sessionSummaryService.getWeeklyImpactChanges(before, after, 'en')
      expect(changes).toContain('Recall quality is back on track')
    })

    it('detects goal at_risk status', () => {
      const before: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'usable_vocabulary', status: 'on_track' } as WeeklyGoal
      ]
      const after: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'usable_vocabulary', status: 'at_risk' } as WeeklyGoal
      ]

      const changes = sessionSummaryService.getWeeklyImpactChanges(before, after, 'en')
      expect(changes).toContain('Vocabulary growth is now at risk')
    })

    it('detects goal missed status', () => {
      const before: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'review_health', status: 'on_track' } as WeeklyGoal
      ]
      const after: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'review_health', status: 'missed' } as WeeklyGoal
      ]

      const changes = sessionSummaryService.getWeeklyImpactChanges(before, after, 'en')
      expect(changes).toContain('Review backlog goal missed for the week')
    })

    it('handles multiple goal changes', () => {
      const before: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'on_track' } as WeeklyGoal,
        { id: '2', goal_set_id: '1', goal_type: 'recall_quality', status: 'at_risk' } as WeeklyGoal
      ]
      const after: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'achieved' } as WeeklyGoal,
        { id: '2', goal_set_id: '1', goal_type: 'recall_quality', status: 'on_track' } as WeeklyGoal
      ]

      const changes = sessionSummaryService.getWeeklyImpactChanges(before, after, 'en')
      expect(changes).toContain('🎉 Study consistency goal achieved!')
      expect(changes).toContain('Recall quality is back on track')
      expect(changes).toHaveLength(2)
    })
  })

  describe('getWeeklyImpactChanges (Dutch)', () => {
    it('detects goal achievement in Dutch', () => {
      const before: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'on_track' } as WeeklyGoal
      ]
      const after: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'achieved' } as WeeklyGoal
      ]

      const changes = sessionSummaryService.getWeeklyImpactChanges(before, after, 'nl')
      expect(changes).toContain('🎉 Studieconsistentie doel behaald!')
    })
  })

  describe('computeSessionImpactMessages', () => {
    it('returns message objects with empty arrays when goals are null', async () => {
      const messages = await sessionSummaryService.computeSessionImpactMessages(
        'user-1',
        'session-1',
        null,
        null
      )

      expect(messages.sessionLocalFacts).toEqual([])
      expect(messages.weeklyImpactChanges).toEqual([])
    })

    it('computes both session facts and weekly impact', async () => {
      const before: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'on_track' } as WeeklyGoal
      ]
      const after: WeeklyGoal[] = [
        { id: '1', goal_set_id: '1', goal_type: 'consistency', status: 'achieved' } as WeeklyGoal
      ]

      const messages = await sessionSummaryService.computeSessionImpactMessages(
        'user-1',
        'session-1',
        before,
        after,
        'en'
      )

      expect(messages.sessionLocalFacts).toBeDefined()
      expect(Array.isArray(messages.sessionLocalFacts)).toBe(true)
      expect(messages.weeklyImpactChanges).toContain('🎉 Study consistency goal achieved!')
    })
  })
})
