// src/components/exercises/primitives/ExerciseOptionGroup.tsx
// Flex column of <ExerciseOption>. role="group" with aria-labelledby pointing
// at <ExerciseInstruction>'s h2 so SRs announce the instruction as the group's
// accessible name.
// See docs/plans/2026-04-23-exercise-framework-design.md §6.5

import { useContext } from 'react'
import type { ReactNode } from 'react'
import { FrameInstructionIdContext } from './context'
import classes from './ExerciseOptionGroup.module.css'

export interface ExerciseOptionGroupProps {
  children: ReactNode
  /** Fallback aria-label when no <ExerciseInstruction> is present. */
  'aria-label'?: string
}

export function ExerciseOptionGroup({
  children,
  'aria-label': ariaLabel,
}: ExerciseOptionGroupProps) {
  const { instructionId } = useContext(FrameInstructionIdContext)

  return (
    <div
      role="group"
      aria-labelledby={instructionId ?? undefined}
      aria-label={!instructionId ? ariaLabel : undefined}
      className={classes.root}
    >
      {children}
    </div>
  )
}
