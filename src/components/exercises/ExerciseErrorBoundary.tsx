// src/components/exercises/ExerciseErrorBoundary.tsx
// Per-exercise error isolation. One broken exercise can't kill a session.
// On catch: logs, emits exercise_skipped, and calls onAnswer({skipped: true})
// so Session's accounting stays consistent (counts toward session length but
// NOT toward FSRS — no review_events row is written).
//
// See docs/plans/2026-04-23-exercise-framework-design.md §7.3

import { Component } from 'react'
import type { ReactNode } from 'react'
import { IconMoodConfuzed } from '@tabler/icons-react'
import { logError } from '@/lib/logger'
import type { ExerciseType } from '@/types/learning'
import type { AnswerOutcome, ExerciseEventPayload } from './registry'
import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseSubmitButton,
} from './primitives'

interface Props {
  children: ReactNode
  exerciseType: ExerciseType
  onAnswer: (outcome: AnswerOutcome) => void
  onEvent?: (event: ExerciseEventPayload) => void
  userLanguage: 'en' | 'nl'
}

interface State {
  hasError: boolean
  errorMessage: string | null
  /** Prevents `componentDidCatch` + manual Skip-button tap from both firing
   *  onAnswer — which would double-advance Session's currentIndex. */
  skipReported: boolean
}

export class ExerciseErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null, skipReported: false }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, errorMessage: err.message, skipReported: false }
  }

  componentDidCatch(error: Error): void {
    logError({
      page: 'exercise',
      action: `render:${this.props.exerciseType}`,
      error,
    })
    // Defend against side-effect callbacks throwing during error handling —
    // React would otherwise re-throw outside the boundary.
    try {
      this.props.onEvent?.({
        type: 'exercise_skipped',
        payload: {
          exerciseType: this.props.exerciseType,
          reason: 'render-error',
          error: error.message,
        },
      })
    } catch (err) {
      logError({ page: 'exercise', action: 'boundary:onEvent', error: err })
    }
    try {
      // FSRS consistency: treat as skip, not as a wrong answer. Session counts
      // it toward session length but no review_events row is written.
      this.props.onAnswer({ skipped: true, reviewRecorded: false })
      this.setState({ skipReported: true })
    } catch (err) {
      logError({ page: 'exercise', action: 'boundary:onAnswer', error: err })
    }
  }

  private handleSkip = () => {
    // Idempotent — if componentDidCatch already reported, don't double-advance.
    if (this.state.skipReported) return
    try {
      this.props.onAnswer({ skipped: true, reviewRecorded: false })
      this.setState({ skipReported: true })
    } catch (err) {
      logError({ page: 'exercise', action: 'boundary:handleSkip', error: err })
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const isNl = this.props.userLanguage === 'nl'
    const title = isNl ? 'Even overslaan' : "Let's skip this one"
    const body = isNl
      ? 'We gaan door met de volgende oefening.'
      : "We're moving to the next exercise."
    const cta = isNl ? 'Volgende' : 'Next'

    return (
      <ExerciseFrame
        variant="session"
        footer={<ExerciseSubmitButton onClick={this.handleSkip}>{cta}</ExerciseSubmitButton>}
      >
        <ExerciseInstruction icon={<IconMoodConfuzed size={20} />}>
          {title}
        </ExerciseInstruction>
        <ExercisePromptCard variant="sentence">
          {body}
        </ExercisePromptCard>
      </ExerciseFrame>
    )
  }
}
