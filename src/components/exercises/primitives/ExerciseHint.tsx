// src/components/exercises/primitives/ExerciseHint.tsx
// Secondary guidance surface. Used by sentence_transformation after N failures
// today; future hint patterns can opt in.
// See docs/plans/2026-04-23-exercise-framework-design.md §6.11

import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { IconBulb, IconChevronDown } from '@tabler/icons-react'
import classes from './ExerciseHint.module.css'

export interface ExerciseHintProps {
  children: ReactNode
  icon?: ReactNode
  /** default true — shown unconditionally. Set false for disclosure pattern. */
  defaultRevealed?: boolean
}

export function ExerciseHint({
  children,
  icon = <IconBulb size={16} />,
  defaultRevealed = true,
}: ExerciseHintProps) {
  const [revealed, setRevealed] = useState(defaultRevealed)
  const contentId = useId()

  if (!revealed) {
    return (
      <button
        type="button"
        className={classes.trigger}
        aria-expanded={false}
        aria-controls={contentId}
        onClick={() => setRevealed(true)}
      >
        <span className={classes.icon} aria-hidden="true">{icon}</span>
        <span>Toon hint</span>
        <IconChevronDown size={14} aria-hidden="true" />
      </button>
    )
  }

  return (
    <div
      id={contentId}
      role="note"
      className={classes.root}
      aria-live={defaultRevealed ? undefined : 'polite'}
    >
      <span className={classes.icon} aria-hidden="true">{icon}</span>
      <span className={classes.content}>{children}</span>
    </div>
  )
}
