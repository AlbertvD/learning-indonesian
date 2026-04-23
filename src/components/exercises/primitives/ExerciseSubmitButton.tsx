// src/components/exercises/primitives/ExerciseSubmitButton.tsx
// Full-width primary action. Not self-sticky — the parent <ExerciseFrame footer>
// slot handles positioning. Warns in dev when rendered outside the slot.
// See docs/plans/2026-04-23-exercise-framework-design.md §6.7

import { useContext, useEffect } from 'react'
import type { ReactNode, MouseEventHandler } from 'react'
import { IconArrowRight } from '@tabler/icons-react'
import { Loader } from '@mantine/core'
import { FrameFooterContext, FOOTER_SLOT_SYMBOL } from './context'
import { triggerHaptic } from './haptics'
import classes from './ExerciseSubmitButton.module.css'

export interface ExerciseSubmitButtonProps {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  rightIcon?: ReactNode
}

export function ExerciseSubmitButton({
  children,
  onClick,
  disabled = false,
  loading = false,
  rightIcon,
}: ExerciseSubmitButtonProps) {
  const insideFooter = useContext(FrameFooterContext)

  // Warn once on mount when rendered outside the <ExerciseFrame footer> slot.
  // React de-dupes identical console.error messages across renders, so no ref
  // guard is needed.
  useEffect(() => {
    if (insideFooter !== FOOTER_SLOT_SYMBOL && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error(
        '<ExerciseSubmitButton> must be rendered inside <ExerciseFrame footer={...}>. ' +
        'See docs/plans/2026-04-23-exercise-framework-design.md §3.7 / §6.7'
      )
    }
  }, [insideFooter])

  const handleClick: MouseEventHandler<HTMLButtonElement> = () => {
    if (disabled || loading) return
    triggerHaptic('selection')
    onClick()
  }

  return (
    <button
      type="button"
      className={classes.root}
      onClick={handleClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-disabled={disabled || undefined}
    >
      <span className={classes.label}>{children}</span>
      <span className={classes.icon} aria-hidden="true">
        {loading ? <Loader size="xs" color="var(--text-on-accent)" /> : (rightIcon ?? <IconArrowRight size={18} />)}
      </span>
    </button>
  )
}
