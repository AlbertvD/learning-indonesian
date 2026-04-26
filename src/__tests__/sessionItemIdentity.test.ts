import { describe, expect, it } from 'vitest'
import type { ExerciseItem, LearningItem, SessionQueueItem } from '@/types/learning'
import { buildReviewIdempotencyKey, getStableSessionItemIdentity } from '@/lib/session/sessionItemIdentity'

function learningItem(id: string): LearningItem {
  return {
    id,
    item_type: 'word',
    base_text: 'makan',
    normalized_text: 'makan',
    language: 'id',
    level: 'A1',
    source_type: 'manual',
    source_vocabulary_id: null,
    source_card_id: null,
    notes: null,
    is_active: true,
    pos: null,
    created_at: '2026-04-25T00:00:00.000Z',
    updated_at: '2026-04-25T00:00:00.000Z',
  }
}

function exerciseItem(overrides: Partial<ExerciseItem> = {}): ExerciseItem {
  return {
    learningItem: learningItem('item-1'),
    meanings: [],
    contexts: [],
    answerVariants: [],
    skillType: 'meaning_recall',
    exerciseType: 'meaning_recall',
    ...overrides,
  }
}

describe('stable session item identity', () => {
  it('creates deterministic vocab item identity independent of queue position', () => {
    const item: SessionQueueItem = {
      source: 'vocab',
      exerciseItem: exerciseItem(),
      learnerItemState: null,
      learnerSkillState: null,
    }

    expect(getStableSessionItemIdentity(item)).toEqual({
      sessionItemId: 'vocab:item-1:meaning_recall:meaning_recall',
      source: 'vocab',
      sourceId: 'item-1',
      skillType: 'meaning_recall',
    })
  })

  it('distinguishes two exercises for the same vocab item', () => {
    const meaning: SessionQueueItem = {
      source: 'vocab',
      exerciseItem: exerciseItem({ skillType: 'meaning_recall', exerciseType: 'meaning_recall' }),
      learnerItemState: null,
      learnerSkillState: null,
    }
    const form: SessionQueueItem = {
      source: 'vocab',
      exerciseItem: exerciseItem({ skillType: 'form_recall', exerciseType: 'typed_recall' }),
      learnerItemState: null,
      learnerSkillState: null,
    }

    expect(getStableSessionItemIdentity(meaning).sessionItemId).not.toBe(
      getStableSessionItemIdentity(form).sessionItemId,
    )
  })

  it('creates deterministic grammar item identity', () => {
    const item: SessionQueueItem = {
      source: 'grammar',
      exerciseItem: exerciseItem({ learningItem: null, skillType: 'recognition', exerciseType: 'cloze' }),
      grammarState: null,
      grammarPatternId: 'pattern-meN',
    }

    expect(getStableSessionItemIdentity(item)).toEqual({
      sessionItemId: 'grammar:pattern-meN:recognition:cloze',
      source: 'grammar',
      sourceId: 'pattern-meN',
      skillType: 'recognition',
      grammarPatternId: 'pattern-meN',
    })
  })

  it('requires explicit attempt number in idempotency key', () => {
    expect(buildReviewIdempotencyKey({
      sessionId: 'session-1',
      sessionItemId: 'vocab:item-1:meaning_recall:meaning_recall',
      attemptNumber: 2,
    })).toBe('session-1:vocab%3Aitem-1%3Ameaning_recall%3Ameaning_recall:2')
  })
})
