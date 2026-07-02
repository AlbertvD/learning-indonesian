// src/components/exercises/primitives/ExercisePromptCard.tsx
// The prompt container. 5 variants cover every current prompt shape.
// See docs/plans/2026-04-23-exercise-framework-design.md §6.3

import type { ReactNode } from 'react'
import { ExerciseAudioButton } from './ExerciseAudioButton'
import { translations } from '@/lib/i18n'
import classes from './ExercisePromptCard.module.css'

export type PromptCardVariant = 'word' | 'sentence' | 'audio' | 'transform' | 'pair'

export interface ExercisePromptCardProps {
  variant: PromptCardVariant
  children: ReactNode
  /** Decorative top-right audio button on non-audio variants. */
  audio?: { url: string; autoplay?: boolean }
  /** Secondary text below the prompt (source-language sentence, etc.). */
  meta?: ReactNode
  /** Transform variant only — e.g. "use past tense" chip. */
  constraint?: ReactNode
  /** Audio variant only — post-answer transcript reveal. */
  revealSlot?: ReactNode
  /** MAJ-2: language for the variant group label + the decorative audio button default label. Default 'nl'. */
  userLanguage?: 'nl' | 'en'
}

export function ExercisePromptCard({
  variant,
  children,
  audio,
  meta,
  constraint,
  revealSlot,
  userLanguage = 'nl',
}: ExercisePromptCardProps) {
  return (
    <div
      className={`${classes.root} ${classes[variant]}`}
      role="group"
      aria-label={ariaLabelForVariant(variant, userLanguage)}
    >
      {constraint && variant === 'transform' && (
        <span className={classes.constraint}>{constraint}</span>
      )}
      {audio && variant !== 'audio' && (
        <div className={classes.audioCorner}>
          <ExerciseAudioButton
            variant="decorative"
            audioUrl={audio.url}
            autoplay={audio.autoplay}
            userLanguage={userLanguage}
          />
        </div>
      )}
      <div className={classes.prompt}>{children}</div>
      {meta && <div className={classes.meta}>{meta}</div>}
      {revealSlot && variant === 'audio' && (
        <div className={classes.reveal}>{revealSlot}</div>
      )}
    </div>
  )
}

function ariaLabelForVariant(v: PromptCardVariant, userLanguage: 'nl' | 'en'): string {
  const T = translations[userLanguage].exercisePrimitives
  switch (v) {
    case 'word':      return T.promptWord
    case 'sentence':  return T.promptSentence
    case 'audio':     return T.promptAudio
    case 'transform': return T.promptTransform
    case 'pair':      return T.promptPair
  }
}
