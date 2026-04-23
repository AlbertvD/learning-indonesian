// src/components/exercises/primitives/ExerciseOption.tsx
// MCQ option button. Tap-to-commit — role="button" inside parent role="group".
// See docs/plans/2026-04-23-exercise-framework-design.md §6.4

import type { ReactNode, MouseEventHandler } from 'react'
import { IconCheck, IconX } from '@tabler/icons-react'
import { triggerHaptic } from './haptics'
import { ExerciseAudioButton } from './ExerciseAudioButton'
import classes from './ExerciseOption.module.css'

export type OptionState = 'idle' | 'focused' | 'disabled' | 'correct' | 'wrong' | 'answer'
export type OptionVariant = 'word' | 'sentence'

export interface ExerciseOptionProps {
  children: ReactNode
  state: OptionState
  variant: OptionVariant
  onClick: () => void
  /** Row-attached decorative audio button (contrast_pair). */
  audio?: { url: string; onPlay?: () => void }
}

const STATE_CLASS: Record<OptionState, string> = {
  idle:     classes.idle,
  focused:  classes.focused,
  disabled: classes.disabled,
  correct:  classes.correct,
  wrong:    classes.wrong,
  answer:   classes.answer,
}

export function ExerciseOption({
  children,
  state,
  variant,
  onClick,
  audio,
}: ExerciseOptionProps) {
  const disabled = state === 'disabled' || state === 'correct' || state === 'wrong' || state === 'answer'

  const handleClick: MouseEventHandler<HTMLButtonElement> = () => {
    if (disabled) return
    triggerHaptic('selection')
    onClick()
  }

  const label = ariaLabelForState(state)
  const pressed = state === 'correct' || state === 'wrong'

  const button = (
    <button
      type="button"
      aria-pressed={pressed || undefined}
      className={`${classes.root} ${classes[variant]} ${STATE_CLASS[state]}`}
      onClick={handleClick}
      disabled={disabled && state !== 'correct' && state !== 'wrong' && state !== 'answer' ? true : undefined}
      // Keep the element focusable even when it represents a committed answer,
      // so screen readers can re-announce it; `aria-disabled` prevents further
      // activation.
      aria-disabled={disabled || undefined}
    >
      <span className={classes.content}>{children}</span>
      {state === 'correct' && <IconCheck className={classes.glyph} size={20} aria-label={label ?? undefined} />}
      {state === 'wrong' && <IconX className={classes.glyph} size={20} aria-label={label ?? undefined} />}
      {state === 'answer' && <IconCheck className={`${classes.glyph} ${classes.glyphMuted}`} size={20} aria-label={label ?? undefined} />}
    </button>
  )

  if (!audio) return button

  return (
    <div className={classes.row}>
      {button}
      <ExerciseAudioButton variant="decorative" audioUrl={audio.url} onPlay={audio.onPlay} />
    </div>
  )
}

function ariaLabelForState(state: OptionState): string | null {
  switch (state) {
    case 'correct': return 'correct'
    case 'wrong':   return 'incorrect'
    case 'answer':  return 'this was the correct answer'
    default: return null
  }
}
