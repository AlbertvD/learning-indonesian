// src/lib/sessionQueue.ts
// STUB — implementation pending (see task 3)
import type {
  LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant,
  LearnerItemState, LearnerSkillState,
  SessionQueueItem,
} from '@/types/learning'

export type SessionMode = 'standard' | 'backlog_clear' | 'quick'

export interface SessionBuildInput {
  allItems: LearningItem[]
  meaningsByItem: Record<string, ItemMeaning[]>
  contextsByItem: Record<string, ItemContext[]>
  variantsByItem: Record<string, ItemAnswerVariant[]>
  itemStates: Record<string, LearnerItemState>
  skillStates: Record<string, LearnerSkillState[]>
  preferredSessionSize: number
  dailyNewItemsLimit: number
  lessonFilter: string | null
  userLanguage: 'en' | 'nl'
  sessionMode?: SessionMode
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildSessionQueue(_input: SessionBuildInput): SessionQueueItem[] {
  throw new Error('sessionQueue not implemented yet')
}
