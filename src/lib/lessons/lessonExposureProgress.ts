import type { SourceProgressEventInput, SourceProgressEventType } from '@/services/sourceProgressService'

export type LessonExposureKind =
  | 'grammar_audio'
  | 'grammar_text'
  | 'dialogue_audio'
  | 'dialogue_text'

export interface LessonExposureProgressInput {
  userId: string
  lessonId: string
  sourceRef: string
  sourceSectionRef: string
  exposureKind: LessonExposureKind
  occurredAt: string
  metadata?: Record<string, unknown>
}

const eventTypeByExposureKind: Record<LessonExposureKind, SourceProgressEventType> = {
  grammar_audio: 'heard_once',
  grammar_text: 'intro_completed',
  dialogue_audio: 'heard_once',
  dialogue_text: 'section_exposed',
}

export function sourceProgressEventForLessonExposure(
  input: LessonExposureProgressInput,
): SourceProgressEventInput {
  return {
    userId: input.userId,
    sourceRef: input.sourceRef,
    sourceSectionRef: input.sourceSectionRef,
    eventType: eventTypeByExposureKind[input.exposureKind],
    occurredAt: input.occurredAt,
    metadataJson: {
      lessonId: input.lessonId,
      exposureKind: input.exposureKind,
      ...(input.metadata ?? {}),
    },
    idempotencyKey: [
      'lesson-exposure',
      input.userId,
      input.sourceRef,
      input.sourceSectionRef,
      input.exposureKind,
    ].join(':'),
  }
}
