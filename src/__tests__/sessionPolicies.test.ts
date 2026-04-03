import { describe, it, expect } from 'vitest'
import { applyPolicies, type SessionPoliciesContext } from '@/lib/sessionPolicies'
import type { SessionQueueItem, ExerciseItem } from '@/types/learning'
import type { LearnerItemState } from '@/types/learning'

// Helper to create minimal SessionQueueItem
function createQueueItem(
  exerciseType: string,
  itemId: string,
  isNew: boolean,
): SessionQueueItem {
  const learnerItemState: LearnerItemState | null = isNew
    ? null
    : {
        id: `state-${itemId}`,
        user_id: 'user-1',
        learning_item_id: itemId,
        stage: 'retrieving',
        introduced_at: '2024-01-01T00:00:00Z',
        last_seen_at: '2024-01-01T00:00:00Z',
        priority: null,
        origin: null,
        times_seen: 1,
        is_leech: false,
        suspended: false,
        gate_check_passed: null,
        updated_at: '2024-01-01T00:00:00Z',
      }

  const exerciseItem: ExerciseItem = {
    learningItem: {
      id: itemId,
      item_type: 'word',
      base_text: `item-${itemId}`,
      normalized_text: `item-${itemId}`,
      language: 'id',
      level: 'A1',
      source_type: 'lesson',
      source_vocabulary_id: null,
      source_card_id: null,
      notes: null,
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    meanings: [],
    contexts: [],
    answerVariants: [],
    skillType: 'recognition',
    exerciseType: exerciseType as any,
  }

  return {
    exerciseItem,
    learnerItemState,
    learnerSkillState: null,
  }
}

describe('Session Policies', () => {
  describe('applyPolicies - Exercise availability gating', () => {
    it('filters out disabled exercise types', () => {
      const queue: SessionQueueItem[] = [
        createQueueItem('recognition_mcq', 'item-1', false),
        createQueueItem('typed_recall', 'item-2', false),
        createQueueItem('cloze', 'item-3', false),
      ]

      const context: SessionPoliciesContext = {
        accountAgeDays: 5,
        stableItemCount: 10,
        sessionInteractionCap: 15,
        exerciseTypeAvailability: {
          recognition_mcq: {
            exercise_type: 'recognition_mcq',
            session_enabled: true,
            authoring_enabled: true,
            requires_approved_content: false,
            rollout_phase: 'full',
            notes: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
          typed_recall: {
            exercise_type: 'typed_recall',
            session_enabled: false,
            authoring_enabled: true,
            requires_approved_content: false,
            rollout_phase: 'beta',
            notes: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
          cloze: {
            exercise_type: 'cloze',
            session_enabled: true,
            authoring_enabled: true,
            requires_approved_content: false,
            rollout_phase: 'full',
            notes: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
      }

      const result = applyPolicies(queue, context)

      expect(result).toHaveLength(2)
      expect(result.map(i => i.exerciseItem.exerciseType)).toEqual(['recognition_mcq', 'cloze'])
    })

    it('passes all items when no availability data provided', () => {
      const queue: SessionQueueItem[] = [
        createQueueItem('recognition_mcq', 'item-1', false),
        createQueueItem('typed_recall', 'item-2', false),
      ]

      const context: SessionPoliciesContext = {
        accountAgeDays: 5,
        stableItemCount: 10,
        sessionInteractionCap: 15,
      }

      const result = applyPolicies(queue, context)

      expect(result).toHaveLength(2)
    })
  })

  describe('applyPolicies - Consecutive type cap', () => {
    it('avoids more than 2 consecutive items of same type', () => {
      const queue: SessionQueueItem[] = [
        createQueueItem('recognition_mcq', 'item-1', false),
        createQueueItem('recognition_mcq', 'item-2', false),
        createQueueItem('recognition_mcq', 'item-3', false),
        createQueueItem('typed_recall', 'item-4', false),
        createQueueItem('typed_recall', 'item-5', false),
      ]

      const context: SessionPoliciesContext = {
        accountAgeDays: 100,
        stableItemCount: 100,
        sessionInteractionCap: 20,
      }

      const result = applyPolicies(queue, context)

      // Check that no more than 2 consecutive items of same type
      for (let i = 0; i < result.length - 2; i++) {
        const type1 = result[i].exerciseItem.exerciseType
        const type2 = result[i + 1].exerciseItem.exerciseType
        const type3 = result[i + 2].exerciseItem.exerciseType

        if (type1 === type2) {
          expect(type2).not.toBe(type3)
        }
      }
    })
  })

  describe('applyPolicies - New learner detection', () => {
    it('removes new items for new learners', () => {
      const queue: SessionQueueItem[] = [
        createQueueItem('recognition_mcq', 'item-1', false),
        createQueueItem('recognition_mcq', 'item-2', true), // new
        createQueueItem('recognition_mcq', 'item-3', true), // new
        createQueueItem('typed_recall', 'item-4', false),
      ]

      const context: SessionPoliciesContext = {
        accountAgeDays: 10, // < 30
        stableItemCount: 30, // < 50
        sessionInteractionCap: 20,
      }

      const result = applyPolicies(queue, context)

      // Should only have non-new items
      expect(result).toHaveLength(2)
      expect(result.every(i => i.learnerItemState !== null)).toBe(true)
    })

    it('keeps all items for experienced learners', () => {
      const queue: SessionQueueItem[] = [
        createQueueItem('recognition_mcq', 'item-1', false),
        createQueueItem('recognition_mcq', 'item-2', true), // new
        createQueueItem('recognition_mcq', 'item-3', true), // new
      ]

      const context: SessionPoliciesContext = {
        accountAgeDays: 40, // >= 30
        stableItemCount: 100,
        sessionInteractionCap: 20,
      }

      const result = applyPolicies(queue, context)

      expect(result).toHaveLength(3)
    })

    it('keeps items if stable count threshold met despite low account age', () => {
      const queue: SessionQueueItem[] = [
        createQueueItem('recognition_mcq', 'item-1', false),
        createQueueItem('recognition_mcq', 'item-2', true), // new
      ]

      const context: SessionPoliciesContext = {
        accountAgeDays: 10, // < 30
        stableItemCount: 100, // >= 50
        sessionInteractionCap: 20,
      }

      const result = applyPolicies(queue, context)

      // Not a new learner (one threshold is met)
      expect(result).toHaveLength(2)
    })
  })

  describe('applyPolicies - Queue trimming', () => {
    it('trims queue to session interaction cap', () => {
      const queue: SessionQueueItem[] = Array.from({ length: 25 }, (_, i) =>
        createQueueItem('recognition_mcq', `item-${i}`, false),
      )

      const context: SessionPoliciesContext = {
        accountAgeDays: 100,
        stableItemCount: 100,
        sessionInteractionCap: 15,
      }

      const result = applyPolicies(queue, context)

      expect(result).toHaveLength(15)
    })

    it('prioritizes due items when trimming', () => {
      // Create mixed items: some due, some weak, some new
      const queue: SessionQueueItem[] = [
        ...Array.from({ length: 10 }, (_, i) => createQueueItem('recognition_mcq', `item-new-${i}`, true)),
        ...Array.from({ length: 10 }, (_, i) => createQueueItem('recognition_mcq', `item-due-${i}`, false)),
      ]

      const context: SessionPoliciesContext = {
        accountAgeDays: 100,
        stableItemCount: 100,
        sessionInteractionCap: 12,
      }

      const result = applyPolicies(queue, context)

      expect(result).toHaveLength(12)
      // Due items (non-new) should be prioritized
      const newCount = result.filter(i => !i.learnerItemState).length
      const dueCount = result.filter(i => i.learnerItemState).length
      expect(dueCount).toBeGreaterThanOrEqual(newCount)
    })

    it('does not trim if queue is under cap', () => {
      const queue: SessionQueueItem[] = [
        createQueueItem('recognition_mcq', 'item-1', false),
        createQueueItem('typed_recall', 'item-2', false),
        createQueueItem('cloze', 'item-3', false),
      ]

      const context: SessionPoliciesContext = {
        accountAgeDays: 100,
        stableItemCount: 100,
        sessionInteractionCap: 15,
      }

      const result = applyPolicies(queue, context)

      expect(result).toHaveLength(3)
    })
  })

  describe('applyPolicies - Combined policies', () => {
    it('applies all policies in correct order', () => {
      const queue: SessionQueueItem[] = [
        createQueueItem('recognition_mcq', 'item-1', true),
        createQueueItem('recognition_mcq', 'item-2', true),
        createQueueItem('recognition_mcq', 'item-3', true),
        createQueueItem('typed_recall', 'item-4', false),
        createQueueItem('typed_recall', 'item-5', false),
        createQueueItem('cloze', 'item-6', false),
      ]

      const context: SessionPoliciesContext = {
        accountAgeDays: 10, // < 30
        stableItemCount: 30, // < 50 (new learner)
        sessionInteractionCap: 10,
        exerciseTypeAvailability: {
          recognition_mcq: {
            exercise_type: 'recognition_mcq',
            session_enabled: true,
            authoring_enabled: true,
            requires_approved_content: false,
            rollout_phase: 'full',
            notes: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
          typed_recall: {
            exercise_type: 'typed_recall',
            session_enabled: true,
            authoring_enabled: true,
            requires_approved_content: false,
            rollout_phase: 'full',
            notes: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
          cloze: {
            exercise_type: 'cloze',
            session_enabled: false, // disabled
            authoring_enabled: true,
            requires_approved_content: false,
            rollout_phase: 'alpha',
            notes: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
      }

      const result = applyPolicies(queue, context)

      // Should:
      // 1. Filter disabled types (cloze out)
      // 2. Apply new learner rules (remove new items)
      // 3. Apply consecutive cap
      // 4. Trim to cap (10)
      expect(result.length).toBeLessThanOrEqual(10)
      expect(result.every(i => i.exerciseItem.exerciseType !== 'cloze')).toBe(true)
      expect(result.every(i => i.learnerItemState !== null)).toBe(true)
    })
  })
})
