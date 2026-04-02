// src/lib/sm2.ts
export type ReviewQuality = 'again' | 'hard' | 'good' | 'easy'

export interface SM2Result {
  easinessFactor: number
  intervalDays: number
  repetitions: number
  nextReviewAt: Date
}

/**
 * SM-2 Spaced Repetition Algorithm
 * 
 * @param quality - User's self-assessed quality of recall
 * @param currentEF - Current easiness factor (default 2.5)
 * @param currentInterval - Current interval in days (default 1)
 * @param currentRepetitions - Current number of successful repetitions (default 0)
 */
export function calculateNextReview(
  quality: ReviewQuality,
  currentEF: number,
  currentInterval: number,
  currentRepetitions: number
): SM2Result {
  const qualityScore = { again: 0, hard: 1, good: 2, easy: 3 }[quality]

  // Calculate new easiness factor
  // EF' = EF + (0.1 - (3 - q) * (0.08 + (3 - q) * 0.02))
  let ef = currentEF + (0.1 - (3 - qualityScore) * (0.08 + (3 - qualityScore) * 0.02))
  ef = Math.max(1.3, ef)

  let interval: number
  let repetitions: number

  if (qualityScore === 0) {
    // Quality "again" - reset
    interval = 1
    repetitions = 0
  } else if (currentRepetitions === 0) {
    interval = 1
    repetitions = 1
  } else if (currentRepetitions === 1) {
    interval = 6
    repetitions = 2
  } else {
    interval = Math.round(currentInterval * ef)
    // Bonus for "easy"
    if (qualityScore === 3) interval = Math.round(interval * 1.3)
    repetitions = currentRepetitions + 1
  }

  const nextReviewAt = new Date()
  nextReviewAt.setDate(nextReviewAt.getDate() + interval)

  return { 
    easinessFactor: ef, 
    intervalDays: interval, 
    repetitions, 
    nextReviewAt 
  }
}
