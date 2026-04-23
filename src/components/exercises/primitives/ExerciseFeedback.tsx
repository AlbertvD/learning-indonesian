// src/components/exercises/primitives/ExerciseFeedback.tsx
// Single canonical correct/fuzzy/wrong feedback screen. Replaces the legacy
// ExerciseShell.tsx feedback block with a role-labeled, language-tagged,
// learning-science-ordered layout (user's wrong attempt dimmed above the
// correct answer).
// See docs/plans/2026-04-23-exercise-framework-design.md §6.9 / §8

import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconX, IconAlertTriangle } from '@tabler/icons-react'
import { LanguagePill, type PillLanguage } from './LanguagePill'
import { ExerciseAudioButton } from './ExerciseAudioButton'
import classes from './ExerciseFeedback.module.css'

export type FeedbackOutcome = 'correct' | 'fuzzy' | 'wrong'
export type FeedbackLayout = 'vocab-pair' | 'grammar-reveal'
export type FeedbackDirection = 'ID→L1' | 'L1→ID' | 'audio→ID' | 'ID→ID'
export type PromptShownRole = 'heard' | 'shown'
export type CorrectAnswerRole = 'said' | 'target'
export type UserAnswerRole = 'typed' | 'picked'

export interface FeedbackTextField {
  text: string
  lang: PillLanguage
}

export interface FeedbackPromptShown extends FeedbackTextField {
  role: PromptShownRole
}

export interface FeedbackCorrectAnswer extends FeedbackTextField {
  role: CorrectAnswerRole
}

export interface FeedbackUserAnswer extends FeedbackTextField {
  role: UserAnswerRole
}

export interface ExerciseFeedbackProps {
  outcome: FeedbackOutcome
  layout: FeedbackLayout
  direction: FeedbackDirection
  promptShown: FeedbackPromptShown
  correctAnswer: FeedbackCorrectAnswer
  userAnswer?: FeedbackUserAnswer
  /** Max 3 shown inline, sorted by relevance by the caller. */
  acceptedVariants?: string[]
  /** Grammar-reveal only. */
  meaning?: string
  explanation?: string
  /** audio→ID direction — replay button inside promptShown card. */
  audio?: { url: string }
  /** Rendered above the outcome badge when processReview threw. */
  commitFailed?: boolean
  onContinue: () => void
  /** Bubbles audio_replayed etc. upstream to analytics. */
  onEvent?: (event: { type: string; payload?: Record<string, unknown> }) => void
  /** Continue button label — consumers pass their i18n'd string. */
  continueLabel: string
  /** i18n bundle — only the feedback-specific keys are used here. */
  copy: FeedbackCopy
}

export interface FeedbackCopy {
  outcomeCorrect: string
  outcomeAlmost: string
  outcomeWrong: string
  announceCorrect: string
  announceWrong: string  // expected template with {x}
  announceFuzzy: string  // expected template with {x}
  roleLabelHeard: string
  roleLabelShown: string
  roleLabelSaid: string
  roleLabelTarget: string
  roleLabelYourAnswer: string
  roleLabelMeaning: string
  roleLabelExplanation: string
  alsoAccepted: string
  replayAudio: string
  commitFailed: string
  emptyAnswer: string
}

/**
 * Derive the default role label for promptShown + correctAnswer from the
 * direction enum, with a runtime invariant check in dev (design §6.9 table).
 */
function rolesForDirection(
  direction: FeedbackDirection,
  promptRole: PromptShownRole,
  correctRole: CorrectAnswerRole,
  copy: FeedbackCopy,
): { promptLabel: string; correctLabel: string } {
  const valid = (
    (direction === 'ID→L1' && promptRole === 'shown' && correctRole === 'target') ||
    (direction === 'L1→ID' && promptRole === 'shown' && correctRole === 'target') ||
    (direction === 'audio→ID' && promptRole === 'heard' && correctRole === 'said') ||
    (direction === 'ID→ID' && (promptRole === 'heard' || promptRole === 'shown') && correctRole === 'target')
  )
  if (!valid && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(
      `<ExerciseFeedback> invalid role combo: direction=${direction}, ` +
      `promptShown.role=${promptRole}, correctAnswer.role=${correctRole}. ` +
      'See docs/plans/2026-04-23-exercise-framework-design.md §6.9'
    )
  }
  const promptLabel =
    promptRole === 'heard' ? copy.roleLabelHeard : copy.roleLabelShown
  const correctLabel =
    correctRole === 'said' ? copy.roleLabelSaid :
    direction === 'ID→L1' ? copy.roleLabelMeaning :
    copy.roleLabelTarget
  return { promptLabel, correctLabel }
}

export function ExerciseFeedback(props: ExerciseFeedbackProps) {
  const {
    outcome, layout, direction,
    promptShown, correctAnswer, userAnswer,
    acceptedVariants, meaning, explanation, audio,
    commitFailed = false,
    onContinue, onEvent, continueLabel, copy,
  } = props

  const continueRef = useRef<HTMLButtonElement>(null)
  const [continueReady, setContinueReady] = useState(false)

  // Focus Continue on mount, but wait 400ms so the aria-live assertive
  // announcement fires first. Pointer-events:none for the same window to
  // prevent accidental double-advance if the user's finger is mid-flight.
  useEffect(() => {
    const t = setTimeout(() => {
      setContinueReady(true)
      continueRef.current?.focus({ preventScroll: true })
    }, 400)
    return () => clearTimeout(t)
  }, [])

  const { promptLabel, correctLabel } = rolesForDirection(
    direction, promptShown.role, correctAnswer.role, copy,
  )

  const outcomeAnnouncement =
    outcome === 'correct' ? copy.announceCorrect :
    outcome === 'fuzzy' ? copy.announceFuzzy.replace('{x}', correctAnswer.text) :
    copy.announceWrong.replace('{x}', correctAnswer.text)

  const outcomeBadgeText =
    outcome === 'correct' ? copy.outcomeCorrect :
    outcome === 'fuzzy' ? copy.outcomeAlmost :
    copy.outcomeWrong

  const userWasWrong = outcome === 'wrong' || (outcome === 'fuzzy')
  const userText = userAnswer?.text?.trim() || copy.emptyAnswer

  // Fuzzy-typed diff-pair: collapses userAnswer + correctAnswer into one card.
  const showDiffPair = outcome === 'fuzzy' && (userAnswer?.role === 'typed')

  return (
    <section role="region" aria-label="Feedback" className={classes.root}>
      {/* Service-failure warning chip (§6.9) */}
      {commitFailed && (
        <div role="status" aria-live="polite" className={classes.commitFailed}>
          <IconAlertTriangle size={16} aria-hidden="true" />
          <span>{copy.commitFailed}</span>
        </div>
      )}

      {/* Outcome badge — aria-live assertive, full-sentence announcement */}
      <div
        role="status"
        aria-live="assertive"
        className={`${classes.badge} ${classes[outcome]}`}
      >
        {outcome === 'correct' || outcome === 'fuzzy' ? (
          <IconCheck size={18} aria-hidden="true" />
        ) : (
          <IconX size={18} aria-hidden="true" />
        )}
        <span className={classes.badgeText}>{outcomeBadgeText}</span>
        <span className={classes.srOnly}>{outcomeAnnouncement}</span>
      </div>

      {/* promptShown card */}
      <div className={classes.card}>
        <div className={classes.cardLabel}>
          <LanguagePill lang={promptShown.lang} />
          <span className={classes.cardLabelSeparator} aria-hidden="true">·</span>
          <span>{promptLabel}</span>
        </div>
        <div className={classes.cardRow}>
          <div className={classes.cardValue}>{promptShown.text}</div>
          {audio && direction === 'audio→ID' && (
            <ExerciseAudioButton
              variant="primary"
              audioUrl={audio.url}
              aria-label={copy.replayAudio}
              onReplay={() => onEvent?.({ type: 'audio_replayed' })}
            />
          )}
        </div>
      </div>

      {showDiffPair ? (
        // Fuzzy diff-pair card occupies BOTH userAnswer and correctAnswer slots
        <dl className={classes.diffPair}>
          <div className={classes.diffPairCell}>
            <dt className={classes.cardLabel}>
              <LanguagePill lang={userAnswer!.lang} />
              <span className={classes.cardLabelSeparator} aria-hidden="true">·</span>
              <span>{copy.roleLabelYourAnswer}</span>
            </dt>
            <dd className={classes.diffPairValue}>{userText}</dd>
          </div>
          <span className={classes.diffArrow} aria-hidden="true">→</span>
          <div className={classes.diffPairCell}>
            <dt className={classes.cardLabel}>
              <LanguagePill lang={correctAnswer.lang} />
              <span className={classes.cardLabelSeparator} aria-hidden="true">·</span>
              <span>{correctLabel}</span>
            </dt>
            <dd className={classes.diffPairValue}>{correctAnswer.text}</dd>
          </div>
        </dl>
      ) : (
        <>
          {/* userAnswer card — dimmed, strikethrough if differs. Always rendered
              on wrong; hidden on correct. Empty user answer renders placeholder. */}
          {userWasWrong && (
            <div className={`${classes.card} ${classes.userAnswerCard}`}>
              <div className={classes.cardLabel}>
                {userAnswer && <LanguagePill lang={userAnswer.lang} />}
                {userAnswer && <span className={classes.cardLabelSeparator} aria-hidden="true">·</span>}
                <span>{copy.roleLabelYourAnswer}</span>
              </div>
              <div
                className={`${classes.cardValue} ${classes.userAnswerValue} ${
                  userAnswer && userAnswer.text !== correctAnswer.text ? classes.strike : ''
                }`}
              >
                {userText}
              </div>
            </div>
          )}

          {/* 1px hairline separates wrong attempt from correct answer (§6.9) */}
          {userWasWrong && <div className={classes.hairline} aria-hidden="true" />}

          {/* correctAnswer card — prominent */}
          <div className={`${classes.card} ${classes.correctCard}`}>
            <div className={classes.cardLabel}>
              <LanguagePill lang={correctAnswer.lang} />
              <span className={classes.cardLabelSeparator} aria-hidden="true">·</span>
              <span>{correctLabel}</span>
            </div>
            <div className={`${classes.cardValue} ${classes.correctValue}`}>{correctAnswer.text}</div>
            {acceptedVariants && acceptedVariants.length > 0 && (
              <div className={classes.alsoAccepted}>
                {copy.alsoAccepted}: {acceptedVariants.slice(0, 3).join(', ')}
                {acceptedVariants.length > 3 && <span> +{acceptedVariants.length - 3}</span>}
              </div>
            )}
          </div>
        </>
      )}

      {/* Grammar-only — meaning line + explanation card */}
      {layout === 'grammar-reveal' && meaning && (
        <div className={classes.meaningLine}>
          <span className={classes.meaningLabel}>{copy.roleLabelMeaning}:</span> {meaning}
        </div>
      )}

      {layout === 'grammar-reveal' && explanation && (
        <div className={classes.explanationCard}>
          <div className={classes.cardLabel}>{copy.roleLabelExplanation}</div>
          <div className={classes.explanationText}>{explanation}</div>
        </div>
      )}

      {/* Continue — rendered as-is (consumers wrap in <ExerciseFrame footer>
          to get the sticky + safe-area behavior). Pointer-events gated for
          400ms to prevent accidental double-advance. */}
      <div
        className={`${classes.continueHost} ${continueReady ? classes.continueReady : ''}`}
      >
        <button
          ref={continueRef}
          type="button"
          className={classes.continueButton}
          onClick={onContinue}
          // pointer-events is set via CSS class
        >
          {continueLabel}
        </button>
      </div>
    </section>
  )
}
