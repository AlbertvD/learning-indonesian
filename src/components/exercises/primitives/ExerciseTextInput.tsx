// src/components/exercises/primitives/ExerciseTextInput.tsx
// Canonical typed-answer input. Applies the `.exerciseInput` class whose rule
// in primitives/global.css pins font-size to max(16px, --fs-lg) and kills
// iOS Safari's focus-zoom.
// See docs/plans/2026-04-23-exercise-framework-design.md §6.6

import { forwardRef } from 'react'
import type { KeyboardEvent } from 'react'
import classes from './ExerciseTextInput.module.css'

export type InputState = 'idle' | 'correct' | 'wrong' | 'fuzzy' | 'disabled'

export interface ExerciseTextInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  state?: InputState
  placeholder?: string
  autoFocus?: boolean
  label: string
  /** Cloze mode — renders as inline-block span-input inside flowing text. */
  inline?: boolean
  /** Cloze: width set to max(4ch, hintedAnswerLength + 1 ch). */
  hintedAnswerLength?: number
}

const STATE_CLASS: Record<InputState, string> = {
  idle:     classes.idle,
  correct:  classes.correct,
  wrong:    classes.wrong,
  fuzzy:    classes.fuzzy,
  disabled: classes.disabled,
}

export const ExerciseTextInput = forwardRef<HTMLInputElement, ExerciseTextInputProps>(
  function ExerciseTextInput(
    {
      value,
      onChange,
      onSubmit,
      state = 'idle',
      placeholder,
      autoFocus = true,
      label,
      inline = false,
      hintedAnswerLength,
    },
    ref,
  ) {
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onSubmit) {
        e.preventDefault()
        onSubmit()
      }
    }

    const inlineStyle = inline
      ? { width: `max(4ch, ${(hintedAnswerLength ?? 4) + 1}ch)` }
      : undefined

    return (
      <>
        <label className={classes.srOnly} htmlFor={undefined}>
          {label}
        </label>
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={state === 'disabled'}
          aria-label={label}
          aria-invalid={state === 'wrong'}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          className={[
            'exerciseInput',
            classes.root,
            inline ? classes.inline : classes.block,
            STATE_CLASS[state],
          ].join(' ')}
          style={inlineStyle}
        />
      </>
    )
  },
)
