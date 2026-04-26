import type { SessionQueueItem, SkillType } from '@/types/learning'

export interface StableSessionItemIdentity {
  sessionItemId: string
  source: 'vocab' | 'grammar'
  sourceId: string
  skillType?: SkillType
  grammarPatternId?: string
  capabilityKeyHint?: string
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value)
}

export function getStableSessionItemIdentity(item: SessionQueueItem): StableSessionItemIdentity {
  const skillType = item.exerciseItem.skillType
  const exerciseType = item.exerciseItem.exerciseType

  if (item.source === 'vocab') {
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

  const sourceId = item.grammarPatternId
  return {
    sessionItemId: `grammar:${sourceId}:${skillType}:${exerciseType}`,
    source: 'grammar',
    sourceId,
    skillType,
    grammarPatternId: sourceId,
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
