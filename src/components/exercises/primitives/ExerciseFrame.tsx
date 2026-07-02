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
import { translations } from '@/lib/i18n'
import classes from './ExerciseFrame.module.css'

export interface ExerciseFrameProps {
  children: ReactNode
  /**
   * MAJ-1 (docs/audits/2026-07-02-a11y-i18n-audit.md): every ExerciseFrame
   * consumer renders inside the app shell's own <main> (Layout.tsx/
   * MobileLayout.tsx wrap <Outlet/> in <main>) — there is no call site left
   * where ExerciseFrame is the page's top-level landmark. Defaulting to
   * 'section' avoids the invalid nested-<main> pair PageContainer.tsx already
   * documents avoiding. Pass as='main' explicitly for a future standalone
   * (non-Layout) consumer that genuinely owns the page's main landmark.
   */
  as?: 'main' | 'section' | 'div'
  /** 'live' (default) or 'preview' (admin preview mode — question + answer halves). */
  mode?: 'live' | 'preview'
  /** 'session' opts children into auto-focus on <ExerciseInstruction>. Default 'preview'. */
  variant?: FrameVariant
  /** Required on any frame containing <ExerciseSubmitButton> — wraps it in a sticky bottom slot. */
  footer?: ReactNode
  /** Absolutely-positioned top-right; typically <FlagButton> for admin sessions. */
  adminOverlay?: ReactNode
  /** MAJ-2: the landmark's SR-only aria-label is language-tagged. Default 'nl' (unchanged for callers that don't pass it). */
  userLanguage?: 'nl' | 'en'
}

export function ExerciseFrame({
  children,
  as = 'section',
  mode = 'live',
  variant = 'preview',
  footer,
  adminOverlay,
  userLanguage = 'nl',
}: ExerciseFrameProps) {
  const [instructionId, setInstructionId] = useState<string | null>(null)
  const instructionCtx: FrameInstructionIdContextValue = useMemo(
    () => ({ instructionId, setInstructionId }),
    [instructionId],
  )

  const frameLabel = translations[userLanguage].exercisePrimitives.frameLabel
  const FrameElement = as
  const landmarkProps = as === 'main'
    ? { role: 'main' as const, 'aria-label': frameLabel }
    : as === 'section'
      ? { 'aria-label': frameLabel }
      : {}

  return (
    <FrameVariantContext.Provider value={variant}>
      <FrameInstructionIdContext.Provider value={instructionCtx}>
        <FrameElement
          {...landmarkProps}
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
        </FrameElement>
      </FrameInstructionIdContext.Provider>
    </FrameVariantContext.Provider>
  )
}
