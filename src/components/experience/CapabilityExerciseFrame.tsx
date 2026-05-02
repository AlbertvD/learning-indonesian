// CapabilityExerciseFrame — thin dispatcher.
// Replaces the v1 placeholder (label + 2 self-rate buttons) with a real
// exercise component lookup. Receives the resolved CapabilityRenderContext
// for the block; if exerciseItem is null (resolution failed per spec §9.1),
// renders nothing and the block is silent-skipped.
//
// See docs/plans/2026-05-02-capability-content-service-spec.md §11.2.

import { Suspense, useMemo } from 'react'
import {
  resolveExerciseComponent,
  exerciseSkeletonVariant,
  type AnswerOutcome,
} from '@/components/exercises/registry'
import { ExerciseSkeleton } from '@/components/exercises/ExerciseSkeleton'
import { ExerciseErrorBoundary } from '@/components/exercises/ExerciseErrorBoundary'
import { normalizeAnswerResponse } from '@/lib/answers/normalizeAnswerResponse'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import type { SessionBlock } from '@/lib/session/sessionPlan'
import type { CapabilityRenderContext } from '@/services/capabilityContentService'

interface CapabilityExerciseFrameProps {
  block: SessionBlock
  context: CapabilityRenderContext
  userLanguage: 'nl' | 'en'
  onAnswerReport: (report: AnswerReport) => void
  onSkip: (blockId: string) => void
}

export function CapabilityExerciseFrame({
  block,
  context,
  userLanguage,
  onAnswerReport,
  onSkip,
}: CapabilityExerciseFrameProps) {
  // Stabilize the lazy reference across renders — React 19 compiler flags
  // inline `resolveExerciseComponent(...)` calls in JSX as component-created-
  // during-render, even though the registry is static.
  const LazyExercise = useMemo(
    () => resolveExerciseComponent(block.renderPlan.exerciseType),
    [block.renderPlan.exerciseType],
  )

  // Silent skip per spec §9.1 — failure is logged via the service; the player
  // already excludes this block from effectiveTotal so completion isn't gated.
  if (!context.exerciseItem) return null
  if (!LazyExercise) return null

  const handleOutcome = (outcome: AnswerOutcome) => {
    if (outcome && 'skipped' in outcome) {
      onSkip(block.id)
      return
    }
    onAnswerReport({
      wasCorrect: outcome.wasCorrect,
      hintUsed: false,
      isFuzzy: outcome.isFuzzy,
      rawResponse: outcome.rawResponse,
      normalizedResponse: normalizeAnswerResponse(outcome.rawResponse),
      latencyMs: outcome.latencyMs,
    })
  }

  return (
    <ExerciseErrorBoundary
      exerciseType={block.renderPlan.exerciseType}
      userLanguage={userLanguage}
      onAnswer={handleOutcome}
    >
      <Suspense fallback={<ExerciseSkeleton variant={exerciseSkeletonVariant[block.renderPlan.exerciseType]} />}>
        {/* eslint-disable-next-line react-hooks/static-components -- LazyExercise
            is a React.lazy reference stable per exerciseType via useMemo above;
            the compiler can't statically verify this. */}
        <LazyExercise
          exerciseItem={context.exerciseItem}
          userLanguage={userLanguage}
          onAnswer={handleOutcome}
        />
      </Suspense>
    </ExerciseErrorBoundary>
  )
}
