/**
 * projectors/grammar.ts — staged grammar patterns + exercise candidates →
 * adapter write plans.
 *
 * Source-of-truth mapping (legacy → here):
 *   386–420 grammar pattern upsert (introduced_by_lesson_id rule)
 *   566–579 GRAMMAR_EXERCISE_TYPES + approved candidate filter
 *   580–698 candidate publish loop — routing rule (grammar via lesson_id+pattern,
 *           vocab via context_id lookup) is encoded here as plan items the
 *           adapter executes.
 */

import type { GrammarPatternInput } from '../adapter'
import { extractAnswerKey, GRAMMAR_EXERCISE_TYPES } from '../validators/candidatePayload'

export interface GrammarStagingPattern {
  slug: string
  pattern_name: string
  description?: string
  complexity_score: number
  confusion_group?: string | null
}

export interface CandidateStagingItem {
  exercise_type: string
  grammar_pattern_slug?: string | null
  payload: Record<string, unknown> | null | undefined
  review_status?: string
}

export interface GrammarProjectionInput {
  lessonNumber: number
  lessonId: string
  grammarPatterns: GrammarStagingPattern[]
  candidates: CandidateStagingItem[]
}

export type ExerciseVariantPlan =
  | {
      kind: 'grammar'
      exercise_type: string
      grammarPatternSlug: string | null
      lessonId: string
      payload_json: Record<string, unknown>
      answer_key_json: Record<string, unknown>
    }
  | {
      kind: 'vocab'
      exercise_type: string
      sourceText: string
      grammarPatternSlug: string | null
      payload_json: Record<string, unknown>
      answer_key_json: Record<string, unknown>
    }

export interface GrammarProjectionOutput {
  grammarPatterns: GrammarPatternInput[]
  exerciseVariants: ExerciseVariantPlan[]
}

export function projectGrammar(input: GrammarProjectionInput): GrammarProjectionOutput {
  const grammarPatterns: GrammarPatternInput[] = input.grammarPatterns.map((pattern) => ({
    slug: pattern.slug,
    pattern_name: pattern.pattern_name,
    description: pattern.description,
    complexity_score: pattern.complexity_score,
    confusion_group: pattern.confusion_group ?? null,
    introduced_by_lesson_id: input.lessonId,
  }))

  const approved = input.candidates.filter((c) =>
    c.review_status === 'pending_review' || c.review_status === 'approved',
  )

  const exerciseVariants: ExerciseVariantPlan[] = []
  for (const candidate of approved) {
    if (!candidate.payload) continue
    const answerKey = extractAnswerKey(candidate.exercise_type, candidate.payload)
    if (GRAMMAR_EXERCISE_TYPES.has(candidate.exercise_type)) {
      exerciseVariants.push({
        kind: 'grammar',
        exercise_type: candidate.exercise_type,
        grammarPatternSlug: candidate.grammar_pattern_slug ?? null,
        lessonId: input.lessonId,
        payload_json: candidate.payload,
        answer_key_json: answerKey,
      })
    } else {
      const sourceText = typeof candidate.payload.sentence === 'string'
        ? candidate.payload.sentence
        : typeof candidate.payload.sourceSentence === 'string'
          ? candidate.payload.sourceSentence
          : typeof candidate.payload.sourceLanguageSentence === 'string'
            ? candidate.payload.sourceLanguageSentence
            : ''
      if (!sourceText) continue
      exerciseVariants.push({
        kind: 'vocab',
        exercise_type: candidate.exercise_type,
        sourceText,
        grammarPatternSlug: candidate.grammar_pattern_slug ?? null,
        payload_json: candidate.payload,
        answer_key_json: answerKey,
      })
    }
  }

  return { grammarPatterns, exerciseVariants }
}

export { GRAMMAR_EXERCISE_TYPES }
