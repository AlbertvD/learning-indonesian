import { describe, expect, it } from 'vitest'
import {
  decideBacklogPressure,
  decideSessionPosture,
  isMeaningfulPractice,
} from '@/lib/pedagogy/sessionPosture'

const now = new Date('2026-04-25T12:00:00.000Z')

describe('session posture', () => {
  it('requires both enough exercises and enough time for meaningful practice', () => {
    expect(isMeaningfulPractice({ completedExercises: 8, durationMinutes: 5 })).toBe(true)
    expect(isMeaningfulPractice({ completedExercises: 7, durationMinutes: 5 })).toBe(false)
    expect(isMeaningfulPractice({ completedExercises: 8, durationMinutes: 4.9 })).toBe(false)
  })

  it.each([
    ['2026-04-25T09:00:00.000Z', 'balanced'],
    ['2026-04-24T09:00:00.000Z', 'balanced'],
    ['2026-04-23T09:00:00.000Z', 'light_recovery'],
    ['2026-04-21T09:00:00.000Z', 'review_first'],
    ['2026-04-17T09:00:00.000Z', 'comeback'],
  ] as const)('maps practice recency %s to %s', (lastMeaningfulPracticeAt, expected) => {
    expect(decideSessionPosture({
      now,
      mode: 'standard',
      lastMeaningfulPracticeAt,
      lastMeaningfulExposureAt: null,
      dueCount: 2,
      preferredSessionSize: 12,
      eligibleNewMaterialCount: 6,
    })).toBe(expected)
  })

  it('measures backlog pressure relative to preferred session size', () => {
    expect(decideBacklogPressure({ dueCount: 6, preferredSessionSize: 12 })).toBe('light')
    expect(decideBacklogPressure({ dueCount: 12, preferredSessionSize: 12 })).toBe('medium')
    expect(decideBacklogPressure({ dueCount: 30, preferredSessionSize: 12 })).toBe('heavy')
    expect(decideBacklogPressure({ dueCount: 37, preferredSessionSize: 12 })).toBe('huge')
  })

  it('uses huge backlog as review-first pressure even after recent practice', () => {
    expect(decideSessionPosture({
      now,
      mode: 'standard',
      lastMeaningfulPracticeAt: '2026-04-25T09:00:00.000Z',
      lastMeaningfulExposureAt: null,
      dueCount: 40,
      preferredSessionSize: 12,
      eligibleNewMaterialCount: 6,
    })).toBe('review_first')
  })
})
