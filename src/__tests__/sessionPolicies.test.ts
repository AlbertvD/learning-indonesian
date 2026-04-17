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
      pos: null,
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
    source: 'vocab' as const,
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

  describe('applyPolicies - Queue trimming', () => {
    it('trims queue to session interaction cap', () => {
      const queue: SessionQueueItem[] = Array.from({ length: 25 }, (_, i) =>
        createQueueItem('recognition_mcq', `item-${i}`, false),
      )

      const context: SessionPoliciesContext = {
        sessionInteractionCap: 15,
      }

      const result = applyPolicies(queue, context)

      expect(result).toHaveLength(15)
    })

    it('preserves queue order when trimming (engine already prioritized)', () => {
      // Engine outputs: due items first, then new items
      // trimQueueToCapacity is a simple slice that respects this order
      const queue: SessionQueueItem[] = [
        ...Array.from({ length: 10 }, (_, i) => createQueueItem('recognition_mcq', `item-due-${i}`, false)),
        ...Array.from({ length: 10 }, (_, i) => createQueueItem('recognition_mcq', `item-new-${i}`, true)),
      ]

      const context: SessionPoliciesContext = {
        sessionInteractionCap: 12,
      }

      const result = applyPolicies(queue, context)

      expect(result).toHaveLength(12)
      // Due items (non-new) come first, so all 10 due items appear and only 2 new items
      const dueCount = result.filter(i => i.source === 'vocab' && i.learnerItemState !== null).length
      const newCount = result.filter(i => i.source === 'vocab' && i.learnerItemState === null).length
      expect(dueCount).toBe(10)
      expect(newCount).toBe(2)
    })

    it('does not trim if queue is under cap', () => {
      const queue: SessionQueueItem[] = [
        createQueueItem('recognition_mcq', 'item-1', false),
        createQueueItem('typed_recall', 'item-2', false),
        createQueueItem('cloze', 'item-3', false),
      ]

      const context: SessionPoliciesContext = {
        sessionInteractionCap: 15,
      }

      const result = applyPolicies(queue, context)

      expect(result).toHaveLength(3)
    })
  })

  describe('applyPolicies - Combined policies', () => {
    it('applies availability gating, consecutive cap, and trimming together', () => {
      const queue: SessionQueueItem[] = [
        createQueueItem('recognition_mcq', 'item-1', false),
        createQueueItem('recognition_mcq', 'item-2', false),
        createQueueItem('recognition_mcq', 'item-3', false),
        createQueueItem('typed_recall', 'item-4', false),
        createQueueItem('typed_recall', 'item-5', false),
        createQueueItem('cloze', 'item-6', false),
      ]

      const context: SessionPoliciesContext = {
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

      // cloze filtered out, result ≤ cap, no cloze items in output
      expect(result.length).toBeLessThanOrEqual(10)
      expect(result.every(i => i.exerciseItem.exerciseType !== 'cloze')).toBe(true)
    })
  })
})
