// src/components/exercises/primitives/ExerciseInstruction.tsx
// Small instruction line above the prompt. Renders as <h2>. Auto-focuses its
// heading when inside <ExerciseFrame variant="session"> so screen readers
// announce the new exercise on next-exercise transitions.
// See docs/plans/2026-04-23-exercise-framework-design.md §6.2

import { useContext, useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { FrameInstructionIdContext, FrameVariantContext } from './context'
import classes from './ExerciseInstruction.module.css'

export interface ExerciseInstructionProps {
  children: ReactNode
  icon?: ReactNode
}

export function ExerciseInstruction({ children, icon }: ExerciseInstructionProps) {
  const id = useId()
  const variant = useContext(FrameVariantContext)
  const { setInstructionId } = useContext(FrameInstructionIdContext)
  const ref = useRef<HTMLHeadingElement>(null)

  // Publish id for <ExerciseOptionGroup>'s aria-labelledby + auto-focus in
  // session variant. useEffect (not useLayoutEffect) so StrictMode's
  // double-invoke doesn't yank focus twice before paint.
  useEffect(() => {
    setInstructionId(id)
    if (variant === 'session') {
      // preventScroll avoids yanking the viewport on next-exercise mount.
      // :focus:not(:focus-visible) in the stylesheet suppresses the ring
      // for pointer users; keyboard users still see it via :focus-visible.
      ref.current?.focus({ preventScroll: true })
    }
    return () => setInstructionId(null)
  }, [id, variant, setInstructionId])

  return (
    <h2 ref={ref} id={id} tabIndex={-1} className={classes.root}>
      {icon && <span className={classes.icon} aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </h2>
  )
}
