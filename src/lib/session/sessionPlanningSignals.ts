import { isMeaningfulPractice } from '@/lib/pedagogy/sessionPosture'

export interface SessionPlanningSignals {
  lastMeaningfulPracticeAt: string | null
  lastMeaningfulExposureAt: string | null
  dueCount: number
  eligibleNewMaterialCount: number
}

export interface LearningSessionSignalRow {
  id: string
  startedAt: string
  endedAt: string | null
}

export interface ReviewAttemptSignalRow {
  sessionId: string
  createdAt?: string | null
}

export interface SourceProgressSignalRow {
  currentState: string
  completedEventTypes?: string[] | null
  lastEventAt: string | null
}

export interface DeriveSessionPlanningSignalsInput {
  learningSessions: LearningSessionSignalRow[]
  legacyReviewEvents: ReviewAttemptSignalRow[]
  capabilityReviewEvents: ReviewAttemptSignalRow[]
  sourceProgressRows: SourceProgressSignalRow[]
  dueCount: number
  eligibleNewMaterialCount: number
}

const meaningfulExposureStates = new Set([
  'section_exposed',
  'intro_completed',
  'heard_once',
  'pattern_noticing_seen',
  'guided_practice_completed',
  'lesson_completed',
])

function durationMinutes(session: LearningSessionSignalRow): number {
  if (!session.endedAt) return 0
  const started = new Date(session.startedAt).getTime()
  const ended = new Date(session.endedAt).getTime()
  if (Number.isNaN(started) || Number.isNaN(ended) || ended < started) return 0
  return (ended - started) / (60 * 1000)
}

function reviewCountForSession(
  sessionId: string,
  legacyReviewEvents: ReviewAttemptSignalRow[],
  capabilityReviewEvents: ReviewAttemptSignalRow[],
): number {
  return legacyReviewEvents.filter(event => event.sessionId === sessionId).length
    + capabilityReviewEvents.filter(event => event.sessionId === sessionId).length
}

function latestIso(values: Array<string | null | undefined>): string | null {
  const valid = values
    .filter((value): value is string => Boolean(value) && !Number.isNaN(new Date(value!).getTime()))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  return valid[0] ?? null
}

function hasMeaningfulExposure(row: SourceProgressSignalRow): boolean {
  return meaningfulExposureStates.has(row.currentState)
    || (row.completedEventTypes ?? []).some(eventType => meaningfulExposureStates.has(eventType))
}

export function deriveSessionPlanningSignals(input: DeriveSessionPlanningSignalsInput): SessionPlanningSignals {
  const meaningfulSessionEnds = input.learningSessions
    .filter(session => session.endedAt)
    .filter(session => isMeaningfulPractice({
      completedExercises: reviewCountForSession(session.id, input.legacyReviewEvents, input.capabilityReviewEvents),
      durationMinutes: durationMinutes(session),
    }))
    .map(session => session.endedAt)

  return {
    lastMeaningfulPracticeAt: latestIso(meaningfulSessionEnds),
    lastMeaningfulExposureAt: latestIso(
      input.sourceProgressRows
        .filter(hasMeaningfulExposure)
        .map(row => row.lastEventAt),
    ),
    dueCount: input.dueCount,
    eligibleNewMaterialCount: input.eligibleNewMaterialCount,
  }
}
