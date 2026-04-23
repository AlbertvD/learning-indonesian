// src/components/exercises/primitives/ExerciseFrame.tsx
// 4-zone container for every exercise. Declares @container exercise so all
// primitive responsive behavior below reads width via @container queries.
// See docs/plans/2026-04-23-exercise-framework-design.md §6.1

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  FrameFooterContext,
  FOOTER_SLOT_SYMBOL,
  FrameInstructionIdContext,
  FrameVariantContext,
  type FrameVariant,
  type FrameInstructionIdContextValue,
} from './context'
import classes from './ExerciseFrame.module.css'

export interface ExerciseFrameProps {
  children: ReactNode
  /** 'live' (default) or 'preview' (admin preview mode — question + answer halves). */
  mode?: 'live' | 'preview'
  /** 'session' opts children into auto-focus on <ExerciseInstruction>. Default 'preview'. */
  variant?: FrameVariant
  /** Required on any frame containing <ExerciseSubmitButton> — wraps it in a sticky bottom slot. */
  footer?: ReactNode
  /** Absolutely-positioned top-right; typically <FlagButton> for admin sessions. */
  adminOverlay?: ReactNode
}

export function ExerciseFrame({
  children,
  mode = 'live',
  variant = 'preview',
  footer,
  adminOverlay,
}: ExerciseFrameProps) {
  const [instructionId, setInstructionId] = useState<string | null>(null)
  const instructionCtx: FrameInstructionIdContextValue = useMemo(
    () => ({ instructionId, setInstructionId }),
    [instructionId],
  )

  return (
    <FrameVariantContext.Provider value={variant}>
      <FrameInstructionIdContext.Provider value={instructionCtx}>
        <main
          role="main"
          aria-label="Oefening"
          className={`${classes.root} ${mode === 'preview' ? classes.preview : classes.live}`}
        >
          {adminOverlay && (
            <div className={classes.adminOverlay}>{adminOverlay}</div>
          )}
          <div className={`${classes.content} ${footer ? classes.contentWithFooter : ''}`}>
            {children}
          </div>
          {footer && (
            <div className={classes.footer}>
              <div className={classes.footerFade} aria-hidden="true" />
              <FrameFooterContext.Provider value={FOOTER_SLOT_SYMBOL}>
                {footer}
              </FrameFooterContext.Provider>
            </div>
          )}
        </main>
      </FrameInstructionIdContext.Provider>
    </FrameVariantContext.Provider>
  )
}
