// src/lib/fsrs.ts
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade, type FSRSParameters } from 'ts-fsrs'

/**
 * Custom FSRS parameters tuned for language learning.
 *
 * Compared to defaults:
 * - Lower request_retention (0.85 vs 0.9) → more frequent reviews
 * - Adjusted weights to accelerate stability growth in early stages
 * - Shorter intervals allow anchoring items to progress faster
 *
 * This creates a natural learning progression:
 * - First review: 1 day
 * - Anchoring (3 successes): ~4-6 days between reviews
 * - Retrieving: ~1-2 weeks between reviews
 * - Productive: longer intervals for maintenance
 */
const languageLearningParams: FSRSParameters = {
  ...generatorParameters(),
  request_retention: 0.85, // More frequent reviews than 0.9 default
  // Weights control how stability and difficulty evolve
  // These are tuned to make stability growth faster for language learners
  w: [
    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.52, 0.62, 0.4, 1.26, 0.29, 2.52
  ]
}

const params = languageLearningParams
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

  // Compute pre-review retrievability from old state (before scheduling).
  // This records how well the learner remembered the item at review time.
  // A new item has no prior state, so retrievability is 1 (never been forgotten).
  const preReviewRetrievability = currentState?.lastReviewedAt
    ? getRetrievability(currentState.stability, currentState.lastReviewedAt)
    : 1

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
    retrievability: preReviewRetrievability,
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

/**
 * Apply grammar-based adjustments to stability growth.
 * Used for items tagged with grammar patterns to slow down expansion
 * and ensure deeper learning before moving to longer intervals.
 *
 * @param stability - Current stability value
 * @param rating - FSRS rating (Again, Hard, Good, Easy)
 * @param isConfusable - Whether this item is in a confusion group
 * @returns Adjusted stability
 */
export function applyGrammarAdjustment(
  stability: number,
  rating: Grade,
  isConfusable: boolean = false
): number {
  // Only apply adjustment for explicitly confusable items.
  // Non-confusable items get no reduction — applying a blanket penalty to all
  // items causes stability to decay even on consecutive correct answers.
  if (!isConfusable || rating === Rating.Again || rating === Rating.Hard) {
    return stability
  }

  // Confusable items with Good/Easy ratings: 30% reduction to slow interval growth
  return stability * 0.7
}

