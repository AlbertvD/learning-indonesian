// src/lib/fsrs.ts
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs'

const params = generatorParameters()
const scheduler = fsrs(params)

export { Rating }

export interface ReviewOutcome {
  wasCorrect: boolean
  hintUsed: boolean
  isFuzzy: boolean
}

export interface FSRSState {
  stability: number
  difficulty: number
  lastReviewedAt: Date | null
}

export interface FSRSResult {
  stability: number
  difficulty: number
  retrievability: number
  nextDueAt: Date
}

/**
 * Map exercise outcome to FSRS rating.
 * No Easy rating at launch — only Again/Hard/Good.
 */
export function inferRating(outcome: ReviewOutcome): Grade {
  if (!outcome.wasCorrect) return Rating.Again
  if (outcome.hintUsed || outcome.isFuzzy) return Rating.Hard
  return Rating.Good
}

/**
 * Compute next FSRS state after a review.
 * Pass null for currentState on first review of a new skill.
 */
export function computeNextState(currentState: FSRSState | null, rating: Grade): FSRSResult {
  const now = new Date()

  let card: Card
  if (currentState) {
    card = {
      ...createEmptyCard(now),
      stability: currentState.stability,
      difficulty: currentState.difficulty,
      last_review: currentState.lastReviewedAt ?? undefined,
      state: 2, // Assume Review state if it has been reviewed before
    } as Card
  } else {
    card = createEmptyCard(now)
  }

  const result = scheduler.next(card, now, rating)
  const scheduled = result

  return {
    stability: scheduled.card.stability,
    difficulty: scheduled.card.difficulty,
    retrievability: scheduled.card.last_review ? (scheduler as any).get_retrievability(scheduled.card, now) ?? 1 : 1,
    nextDueAt: scheduled.card.due,
  }
}

/**
 * Compute current retrievability for a skill state.
 * Returns a number between 0 and 1.
 */
export function getRetrievability(stability: number, lastReviewedAt: Date): number {
  const now = new Date()
  const elapsedDays = (now.getTime() - lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24)
  if (elapsedDays <= 0) return 1
  // FSRS power forgetting curve: R = (1 + t / (9 * s))^(-1)
  return Math.pow(1 + elapsedDays / (9 * stability), -1)
}
