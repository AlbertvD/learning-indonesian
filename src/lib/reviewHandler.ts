// src/lib/reviewHandler.ts
import type { ExerciseItem, LearnerItemState, LearnerSkillState } from '@/types/learning'
import { inferRating, computeNextState } from '@/lib/fsrs'
import { checkPromotion, checkDemotion } from '@/lib/stages'
import { reviewEventService } from '@/services/reviewEventService'
import { learnerStateService } from '@/services/learnerStateService'

export interface ReviewInput {
  userId: string
  sessionId: string
  exerciseItem: ExerciseItem
  currentItemState: LearnerItemState | null
  currentSkillState: LearnerSkillState | null
  wasCorrect: boolean
  isFuzzy: boolean
  hintUsed: boolean
  latencyMs: number | null
  rawResponse: string | null
  normalizedResponse: string | null
}

export interface ReviewResult {
  updatedItemState: LearnerItemState
  updatedSkillState: LearnerSkillState
  stageChanged: boolean
  previousStage: string | null
}

export async function processReview(input: ReviewInput): Promise<ReviewResult> {
  const { userId, sessionId, exerciseItem, currentItemState, currentSkillState, wasCorrect, isFuzzy, hintUsed, latencyMs, rawResponse, normalizedResponse } = input
  const { learningItem, skillType, exerciseType } = exerciseItem

  // 1. Compute FSRS rating and next state
  const rating = inferRating({ wasCorrect, hintUsed, isFuzzy })
  const fsrsState = currentSkillState
    ? { stability: currentSkillState.stability, difficulty: currentSkillState.difficulty, lastReviewedAt: currentSkillState.last_reviewed_at ? new Date(currentSkillState.last_reviewed_at) : null }
    : null
  const nextFSRS = computeNextState(fsrsState, rating)

  // 2. Build updated skill state
  const now = new Date().toISOString()
  const updatedSkillState: Omit<LearnerSkillState, 'id' | 'updated_at'> = {
    user_id: userId,
    learning_item_id: learningItem.id,
    skill_type: skillType,
    stability: nextFSRS.stability,
    difficulty: nextFSRS.difficulty,
    retrievability: nextFSRS.retrievability,
    last_reviewed_at: now,
    next_due_at: nextFSRS.nextDueAt.toISOString(),
    success_count: (currentSkillState?.success_count ?? 0) + (wasCorrect ? 1 : 0),
    failure_count: (currentSkillState?.failure_count ?? 0) + (wasCorrect ? 0 : 1),
    lapse_count: (currentSkillState?.lapse_count ?? 0) + (!wasCorrect && (currentSkillState?.success_count ?? 0) > 0 ? 1 : 0),
    consecutive_failures: wasCorrect ? 0 : (currentSkillState?.consecutive_failures ?? 0) + 1,
    mean_latency_ms: latencyMs ?? currentSkillState?.mean_latency_ms ?? null,
    hint_rate: currentSkillState?.hint_rate ?? null,
  }

  // 3. Build updated item state
  const previousStage = currentItemState?.stage ?? 'new'
  const updatedItemState: Omit<LearnerItemState, 'id' | 'updated_at'> = {
    user_id: userId,
    learning_item_id: learningItem.id,
    stage: previousStage === 'new' ? 'anchoring' : previousStage,
    introduced_at: currentItemState?.introduced_at ?? now,
    last_seen_at: now,
    priority: currentItemState?.priority ?? null,
    origin: currentItemState?.origin ?? null,
    times_seen: (currentItemState?.times_seen ?? 0) + 1,
    is_leech: (currentSkillState?.lapse_count ?? 0) >= 8,
    suspended: currentItemState?.suspended ?? false,
    gate_check_passed: currentItemState?.gate_check_passed ?? null,
  }

  // 4. Persist skill state first (needed for promotion check)
  const savedSkill = await learnerStateService.upsertSkillState(updatedSkillState)

  // 5. Check promotion/demotion
  // Get all skill states for this item to check both facets.
  // Use savedSkill for the skill we just updated (authoritative),
  // fetch the other skill type from DB.
  const allSkills = await learnerStateService.getSkillStates(userId, learningItem.id)
  const recognition = skillType === 'recognition' ? savedSkill : (allSkills.find(s => s.skill_type === 'recognition') ?? null)
  const recall = skillType === 'form_recall' ? savedSkill : (allSkills.find(s => s.skill_type === 'form_recall') ?? null)

  const itemStateForCheck = { ...updatedItemState, id: currentItemState?.id ?? '' } as LearnerItemState

  // Check demotion first (takes priority)
  const demotionTarget = checkDemotion(itemStateForCheck, savedSkill)
  if (demotionTarget) {
    updatedItemState.stage = demotionTarget
  } else {
    // Check promotion
    const promotionTarget = checkPromotion(itemStateForCheck, recognition, recall)
    if (promotionTarget) {
      updatedItemState.stage = promotionTarget
    }
  }

  // 6. Persist item state
  const savedItem = await learnerStateService.upsertItemState(updatedItemState)

  // 7. Log review event
  const reviewEvent = await reviewEventService.logReviewEvent({
    user_id: userId,
    learning_item_id: learningItem.id,
    skill_type: skillType,
    exercise_type: exerciseType,
    session_id: sessionId,
    was_correct: wasCorrect,
    score: null,
    latency_ms: latencyMs,
    hint_used: hintUsed,
    attempt_number: 1,
    raw_response: rawResponse,
    normalized_response: normalizedResponse,
    feedback_type: null,
    scheduler_snapshot: {
      stability: nextFSRS.stability,
      difficulty: nextFSRS.difficulty,
      retrievability: nextFSRS.retrievability,
      next_due_at: nextFSRS.nextDueAt.toISOString(),
    },
  })

  // 8. Log stage transition if changed
  if (savedItem.stage !== previousStage) {
    await learnerStateService.logStageEvent(
      userId,
      learningItem.id,
      previousStage,
      savedItem.stage,
      reviewEvent.id
    )
  }

  return {
    updatedItemState: savedItem,
    updatedSkillState: savedSkill,
    stageChanged: savedItem.stage !== previousStage,
    previousStage,
  }
}
