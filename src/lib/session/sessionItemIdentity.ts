import type { SessionQueueItem, SkillType } from '@/types/learning'

export interface StableSessionItemIdentity {
  sessionItemId: string
  source: 'vocab'
  sourceId: string
  skillType?: SkillType
  capabilityKeyHint?: string
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value)
}

export function getStableSessionItemIdentity(item: SessionQueueItem): StableSessionItemIdentity {
  const skillType = item.exerciseItem.skillType
  const exerciseType = item.exerciseItem.exerciseType

  const sourceId = item.exerciseItem.learningItem?.id
  if (!sourceId) {
    throw new Error('Vocab session item is missing learning item id')
  }

  return {
    sessionItemId: `vocab:${sourceId}:${skillType}:${exerciseType}`,
    source: 'vocab',
    sourceId,
    skillType,
  }
}

export function buildReviewIdempotencyKey(input: {
  sessionId: string
  sessionItemId: string
  attemptNumber: number
}): string {
  return [
    encodeSegment(input.sessionId),
    encodeSegment(input.sessionItemId),
    String(input.attemptNumber),
  ].join(':')
}
