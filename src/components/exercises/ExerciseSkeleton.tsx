// src/components/exercises/ExerciseSkeleton.tsx
// Renders inside a real <ExerciseFrame> during lazy chunk load. Matches the
// variant the real prompt will take so there's no layout shift when content
// arrives.
//
// See docs/plans/2026-04-23-exercise-framework-design.md §7.3

import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseOptionGroup,
  ExerciseOption,
  type PromptCardVariant,
} from './primitives'
import classes from './ExerciseSkeleton.module.css'

export interface ExerciseSkeletonProps {
  /** Which prompt-card shape to skeletonize. Comes from `exerciseSkeletonVariant`. */
  variant: 'word' | 'sentence' | 'audio'
}

export function ExerciseSkeleton({ variant }: ExerciseSkeletonProps) {
  const cardVariant: PromptCardVariant = variant === 'audio' ? 'audio' : variant
  return (
    <ExerciseFrame variant="session">
      <ExerciseInstruction>
        <span className={classes.shimmer} style={{ width: '60%', height: 20, display: 'inline-block' }} />
      </ExerciseInstruction>
      <ExercisePromptCard variant={cardVariant}>
        <span className={classes.shimmer} style={{ width: '50%', height: variant === 'word' ? 36 : 28, display: 'inline-block' }} />
      </ExercisePromptCard>
      <ExerciseOptionGroup aria-label="Laden...">
        <ExerciseOption state="disabled" variant="word" onClick={() => {}}>
          <span className={classes.shimmer} style={{ width: '70%', height: 18, display: 'inline-block' }} />
        </ExerciseOption>
        <ExerciseOption state="disabled" variant="word" onClick={() => {}}>
          <span className={classes.shimmer} style={{ width: '55%', height: 18, display: 'inline-block' }} />
        </ExerciseOption>
        <ExerciseOption state="disabled" variant="word" onClick={() => {}}>
          <span className={classes.shimmer} style={{ width: '65%', height: 18, display: 'inline-block' }} />
        </ExerciseOption>
        <ExerciseOption state="disabled" variant="word" onClick={() => {}}>
          <span className={classes.shimmer} style={{ width: '60%', height: 18, display: 'inline-block' }} />
        </ExerciseOption>
      </ExerciseOptionGroup>
    </ExerciseFrame>
  )
}
