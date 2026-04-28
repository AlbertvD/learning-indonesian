import { describe, expect, it } from 'vitest'
import {
  isLessonContentIntroduced,
  isLessonCurrentByExposure,
} from '@/lib/pedagogy/lessonIntroduction'

describe('lesson introduction helpers', () => {
  it('introduces vocabulary through recognition or Dutch-to-Indonesian choice success', () => {
    expect(isLessonContentIntroduced({
      contentKind: 'vocabulary',
      reviewEvidence: [{
        capabilityKey: 'choice-cap',
        sourceRef: 'learning_items/rumah',
        skillType: 'meaning_recall',
        capabilityType: 'l1_to_id_choice',
        successfulReviews: 1,
      }],
    })).toBe(true)

    expect(isLessonContentIntroduced({
      contentKind: 'vocabulary',
      reviewEvidence: [{
        capabilityKey: 'meaning-cap',
        sourceRef: 'learning_items/rumah',
        skillType: 'meaning_recall',
        capabilityType: 'meaning_recall',
        successfulReviews: 1,
      }],
    })).toBe(false)
  })

  it('introduces grammar or morphology only after explanation exposure plus noticing success', () => {
    expect(isLessonContentIntroduced({
      contentKind: 'grammar',
      explanationExposed: true,
      reviewEvidence: [{
        capabilityKey: 'pattern-cap',
        sourceRef: 'lesson-1/pattern-meN',
        skillType: 'recognition',
        capabilityType: 'pattern_recognition',
        successfulReviews: 1,
      }],
    })).toBe(true)

    expect(isLessonContentIntroduced({
      contentKind: 'morphology',
      explanationExposed: true,
      reviewEvidence: [],
    })).toBe(false)
  })

  it('uses exposure for sentences and heard-once for audio', () => {
    expect(isLessonContentIntroduced({ contentKind: 'sentence', exposed: true })).toBe(true)
    expect(isLessonContentIntroduced({ contentKind: 'dialogue', exposed: true })).toBe(true)
    expect(isLessonContentIntroduced({ contentKind: 'audio', heardOnce: true })).toBe(true)
    expect(isLessonContentIntroduced({ contentKind: 'audio', exposed: true })).toBe(false)
  })

  it('marks a lesson current after explicit start, two minutes, or lesson audio', () => {
    expect(isLessonCurrentByExposure({ explicitlyStarted: true, exposureSeconds: 0, lessonAudioExplanationHeard: false })).toBe(true)
    expect(isLessonCurrentByExposure({ explicitlyStarted: false, exposureSeconds: 120, lessonAudioExplanationHeard: false })).toBe(true)
    expect(isLessonCurrentByExposure({ explicitlyStarted: false, exposureSeconds: 30, lessonAudioExplanationHeard: true })).toBe(true)
    expect(isLessonCurrentByExposure({ explicitlyStarted: false, exposureSeconds: 119, lessonAudioExplanationHeard: false })).toBe(false)
  })
})
