import { describe, it, expect, vi } from 'vitest'
import { processReview } from '@/lib/reviewHandler'
import type { ExerciseItem, LearnerSkillState } from '@/types/learning'
import { learnerStateService } from '@/services/learnerStateService'
import { reviewEventService } from '@/services/reviewEventService'

// Mock all external services
vi.mock('@/services/reviewEventService', () => ({
  reviewEventService: {
    logReviewEvent: vi.fn(async (event: any) => ({ ...event, id: 'rev1', created_at: new Date().toISOString() })),
  },
}))

// Mock atomic skill-state RPC so we can assert on the inputs and shape the
// returned row to match what the DB function would compute.
vi.mock('@/services/learnerStateService', () => ({
  learnerStateService: {
    upsertItemState: vi.fn(async (state: any) => ({ ...state, id: 'lis1', updated_at: new Date().toISOString() })),
    applyReviewToSkillState: vi.fn(async (input: any) => ({
      id: 'lss1',
      user_id: input.userId,
      learning_item_id: input.learningItemId,
      skill_type: input.skillType,
      stability: input.stability,
      difficulty: input.difficulty,
      retrievability: input.retrievability,
      last_reviewed_at: input.lastReviewedAt,
      next_due_at: input.nextDueAt,
      success_count: input.wasCorrect ? 1 : 0,
      failure_count: input.wasCorrect ? 0 : 1,
      lapse_count: 0,
      consecutive_failures: input.wasCorrect ? 0 : 1,
      mean_latency_ms: input.meanLatencyMs,
      hint_rate: null,
      updated_at: new Date().toISOString(),
    })),
    getSkillStates: vi.fn(async () => []),
    logStageEvent: vi.fn(async () => {}),
  },
}))

describe('processReview', () => {
  const exerciseItem: ExerciseItem = {
    learningItem: { id: 'li1', item_type: 'word', base_text: 'rumah', normalized_text: 'rumah', language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, pos: null, created_at: '', updated_at: '' },
    meanings: [],
    contexts: [],
    answerVariants: [],
    skillType: 'recognition',
    exerciseType: 'recognition_mcq',
  }

  it('returns updated state after correct answer', async () => {
    const result = await processReview({
      userId: 'u1',
      sessionId: 's1',
      exerciseItem,
      currentItemState: null,
      currentSkillState: null,
      wasCorrect: true,
      isFuzzy: false,
      hintUsed: false,
      latencyMs: 1200,
      rawResponse: 'house',
      normalizedResponse: 'house',
    })

    expect(result.updatedSkillState.success_count).toBe(1)
    expect(result.updatedSkillState.consecutive_failures).toBe(0)
    expect(result.updatedItemState.stage).toBe('anchoring')
    expect(result.updatedItemState.times_seen).toBe(1)
  })

  it('persists skill state, item state, and logs review event', async () => {
    await processReview({
      userId: 'u1',
      sessionId: 's1',
      exerciseItem,
      currentItemState: null,
      currentSkillState: null,
      wasCorrect: true,
      isFuzzy: false,
      hintUsed: false,
      latencyMs: 1200,
      rawResponse: 'house',
      normalizedResponse: 'house',
    })

    // Verify skill state was persisted via the atomic RPC. Counters are
    // computed DB-side now, so we assert on the inputs (wasCorrect) instead.
    expect(learnerStateService.applyReviewToSkillState).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        learningItemId: 'li1',
        skillType: 'recognition',
        wasCorrect: true,
      })
    )

    // Verify item state was persisted
    expect(learnerStateService.upsertItemState).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        learning_item_id: 'li1',
        stage: 'anchoring',
        times_seen: 1,
      })
    )

    // Verify review event was logged
    expect(reviewEventService.logReviewEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        learning_item_id: 'li1',
        session_id: 's1',
        skill_type: 'recognition',
        exercise_type: 'recognition_mcq',
        was_correct: true,
      })
    )
  })

  it('passes wasCorrect=false to the atomic RPC for incorrect answers', async () => {
    const existingSkill: LearnerSkillState = {
      id: 'lss1', user_id: 'u1', learning_item_id: 'li1', skill_type: 'recognition',
      stability: 2, difficulty: 5, retrievability: 0.8,
      last_reviewed_at: new Date().toISOString(), next_due_at: new Date().toISOString(),
      success_count: 3, failure_count: 0, lapse_count: 0, consecutive_failures: 0,
      mean_latency_ms: null, hint_rate: null, updated_at: '',
    }

    const result = await processReview({
      userId: 'u1',
      sessionId: 's1',
      exerciseItem,
      currentItemState: { id: 'lis1', user_id: 'u1', learning_item_id: 'li1', stage: 'retrieving', introduced_at: '', last_seen_at: '', priority: null, origin: null, times_seen: 5, is_leech: false, suspended: false, gate_check_passed: true, updated_at: '' },
      currentSkillState: existingSkill,
      wasCorrect: false,
      isFuzzy: false,
      hintUsed: false,
      latencyMs: 3000,
      rawResponse: 'wrong',
      normalizedResponse: 'wrong',
    })

    // Mock returns 1 for failure_count when wasCorrect=false (DB does the actual increment in prod)
    expect(result.updatedSkillState.failure_count).toBe(1)
    expect(result.updatedSkillState.consecutive_failures).toBe(1)

    expect(learnerStateService.applyReviewToSkillState).toHaveBeenCalledWith(
      expect.objectContaining({
        skillType: 'recognition',
        wasCorrect: false,
      })
    )
  })
})
