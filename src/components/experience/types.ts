import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import type { SessionBlock } from '@/lib/session/sessionPlan'

export interface SessionAnswerEvent {
  sessionId: string
  blockId: string
  blockKind: SessionBlock['kind']
  capabilityId: string
  canonicalKeySnapshot: string
  exerciseType: SessionBlock['renderPlan']['exerciseType']
  answerReport: AnswerReport
  pendingActivation: boolean
}
