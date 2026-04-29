import { describe, expect, it } from 'vitest'
import {
  sourceProgressEventForLessonExposure,
  type LessonExposureKind,
} from '@/lib/lessons/lessonExposureProgress'
import type { SourceProgressEventType } from '@/services/sourceProgressService'

const eventTypesByKind: Record<LessonExposureKind, SourceProgressEventType> = {
  grammar_audio: 'heard_once',
  grammar_text: 'intro_completed',
  dialogue_audio: 'heard_once',
  dialogue_text: 'section_exposed',
}

describe('lesson exposure progress adapter', () => {
  it.each(Object.entries(eventTypesByKind) as Array<[LessonExposureKind, SourceProgressEventType]>)(
    'maps %s exposure to %s source progress',
    (exposureKind, eventType) => {
      expect(sourceProgressEventForLessonExposure({
        userId: 'user-1',
        lessonId: 'lesson-4',
        sourceRef: 'lesson-4',
        sourceSectionRef: 'lesson-4-grammar',
        exposureKind,
        occurredAt: '2026-04-29T10:00:00.000Z',
      })).toEqual({
        userId: 'user-1',
        sourceRef: 'lesson-4',
        sourceSectionRef: 'lesson-4-grammar',
        eventType,
        occurredAt: '2026-04-29T10:00:00.000Z',
        metadataJson: {
          lessonId: 'lesson-4',
          exposureKind,
        },
        idempotencyKey: `lesson-exposure:user-1:lesson-4:lesson-4-grammar:${exposureKind}`,
      })
    },
  )

  it('keeps threshold events idempotent for the same user, source, section, and exposure kind', () => {
    const first = sourceProgressEventForLessonExposure({
      userId: 'user-1',
      lessonId: 'lesson-4',
      sourceRef: 'lesson-4',
      sourceSectionRef: 'lesson-4-dialogue',
      exposureKind: 'dialogue_audio',
      occurredAt: '2026-04-29T10:00:00.000Z',
    })
    const second = sourceProgressEventForLessonExposure({
      userId: 'user-1',
      lessonId: 'lesson-4',
      sourceRef: 'lesson-4',
      sourceSectionRef: 'lesson-4-dialogue',
      exposureKind: 'dialogue_audio',
      occurredAt: '2026-04-29T10:05:00.000Z',
    })

    expect(second.idempotencyKey).toBe(first.idempotencyKey)
  })

  it('records read-ahead exposure against only the selected later lesson', () => {
    const event = sourceProgressEventForLessonExposure({
      userId: 'user-1',
      lessonId: 'lesson-8',
      sourceRef: 'lesson-8',
      sourceSectionRef: 'lesson-8-grammar',
      exposureKind: 'grammar_text',
      occurredAt: '2026-04-29T10:00:00.000Z',
      metadata: { openedFrom: 'lessons_overview' },
    })

    expect(event.sourceRef).toBe('lesson-8')
    expect(event.sourceSectionRef).toBe('lesson-8-grammar')
    expect(event.metadataJson).toEqual({
      lessonId: 'lesson-8',
      exposureKind: 'grammar_text',
      openedFrom: 'lessons_overview',
    })
  })
})
