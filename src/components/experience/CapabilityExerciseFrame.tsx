import { useEffect, useRef } from 'react'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import type { SessionBlock } from '@/lib/session/sessionPlan'
import { ExerciseFrame } from '@/components/exercises/primitives/ExerciseFrame'
import { ExerciseInstruction } from '@/components/exercises/primitives/ExerciseInstruction'
import { ExerciseOption } from '@/components/exercises/primitives/ExerciseOption'
import { ExerciseOptionGroup } from '@/components/exercises/primitives/ExerciseOptionGroup'
import { ExercisePromptCard } from '@/components/exercises/primitives/ExercisePromptCard'
import classes from './ExperiencePlayer.module.css'

interface CapabilityExerciseFrameProps {
  block: SessionBlock
  answered: boolean
  submitting: boolean
  prompt: string
  positiveLabel: string
  negativeLabel: string
  completionCopy: string
  onAnswerReport: (report: AnswerReport) => void
}

export function CapabilityExerciseFrame({
  block,
  answered,
  submitting,
  prompt,
  positiveLabel,
  negativeLabel,
  completionCopy,
  onAnswerReport,
}: CapabilityExerciseFrameProps) {
  const startedAtRef = useRef(0)

  useEffect(() => {
    startedAtRef.current = performance.now()
  }, [])

  const submit = (wasCorrect: boolean) => {
    if (answered || submitting) return
    const rawResponse = wasCorrect ? 'self_check_known' : 'self_check_needs_practice'
    const submittedAt = performance.now()
    const startedAt = startedAtRef.current || submittedAt
    onAnswerReport({
      wasCorrect,
      hintUsed: false,
      isFuzzy: false,
      rawResponse,
      normalizedResponse: rawResponse,
      latencyMs: Math.round(submittedAt - startedAt),
    })
  }

  return (
    <ExerciseFrame variant="session">
      <ExerciseInstruction>{prompt}</ExerciseInstruction>
      <ExercisePromptCard variant="sentence">
        <span className={classes.exercisePrompt}>{block.renderPlan.exerciseType.replaceAll('_', ' ')}</span>
        <span className={classes.exercisePromptMeta}>{block.renderPlan.capabilityType.replaceAll('_', ' ')}</span>
      </ExercisePromptCard>
      <ExerciseOptionGroup>
        <ExerciseOption
          state={answered || submitting ? 'disabled' : 'idle'}
          variant="sentence"
          onClick={() => submit(true)}
        >
          {positiveLabel}
        </ExerciseOption>
        <ExerciseOption
          state={answered || submitting ? 'disabled' : 'idle'}
          variant="sentence"
          onClick={() => submit(false)}
        >
          {negativeLabel}
        </ExerciseOption>
      </ExerciseOptionGroup>
      {answered && <p className={classes.recorded}>{completionCopy}</p>}
    </ExerciseFrame>
  )
}
