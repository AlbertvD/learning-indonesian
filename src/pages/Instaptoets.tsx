// src/pages/Instaptoets.tsx
//
// The placement probe (Bet-1 slice 2, docs/plans/2026-07-06-loanword-bridge-
// placement-onboarding.md §4.1-§4.2). Reached from Welkom's quiet branch link
// ("Ik ken al wat Indonesisch"). A short adaptive staircase over the
// frequency-band ladder (lib/placement/staircase.ts) presented as recognition
// MCQ (v1 — typed recall is a later hardening per spec §4.1); on convergence,
// assembles the result (lib/placement/result.ts) and writes it via the single
// apply_placement_result RPC (lib/placement/applyResult.ts).
//
// Abandon-safe: nothing is written until that final call — leaving mid-probe
// writes nothing (spec §4.1). Skippable at every step via a quiet "Overslaan"
// link.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  PageContainer,
  PageBody,
  LoadingState,
  HeroCard,
} from '@/components/page/primitives'
import {
  ExerciseFrame,
  ExerciseInstruction,
  ExercisePromptCard,
  ExerciseOptionGroup,
  ExerciseOption,
  ExerciseSubmitButton,
} from '@/components/exercises/primitives'
import { useExerciseScoring } from '@/lib/useExerciseScoring'
import { fetchPlacementPool, type PlacementItemDetail, type PlacementPool } from '@/lib/placement/adapter'
import { selectNextItem, type AnswerOutcome, type PlacementItem } from '@/lib/placement/staircase'
import { assemblePlacementResult, type PlacementResult } from '@/lib/placement/result'
import { applyPlacementResult } from '@/lib/placement/applyResult'
import { buildOptions } from '@/lib/placement/options'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import classes from './Instaptoets.module.css'

type Phase = 'loading' | 'empty' | 'active' | 'finishing' | 'save-failed' | 'done'

interface ProbeQuestionProps {
  item: PlacementItemDetail
  options: string[]
  question: string
  nextLabel: string
  userLanguage: 'nl' | 'en'
  onResolved: (correct: boolean) => void
}

/** One presented item. The caller keys this by normalizedText so each new
 *  item mounts fresh scoring state (mirrors RecognitionMCQ.tsx's per-mount
 *  pattern). A correct answer auto-advances (useExerciseScoring's built-in
 *  correct-delay, then this component's onAnswer fires); a wrong answer holds
 *  on the highlighted correct option (ExerciseOption's `answer` state) until
 *  the learner taps Volgende — the same auto-advance/explicit-continue split
 *  every session exercise uses (feedback_exercise_answer_screen), without the
 *  full ExerciseFeedback screen's audio/mnemonic machinery this no-FSRS-
 *  commit probe doesn't need (spec §4.1). */
function ProbeQuestion({ item, options, question, nextLabel, userLanguage, onResolved }: ProbeQuestionProps) {
  const [awaitingContinue, setAwaitingContinue] = useState(false)

  const scoring = useExerciseScoring<string>({
    mode: 'tap',
    checkCorrect: (response) => ({ isCorrect: response === item.translationNl, isFuzzy: false }),
    onAnswer: (result) => {
      if (result.outcome === 'correct') {
        onResolved(true)
      } else {
        setAwaitingContinue(true)
      }
    },
  })

  return (
    <ExerciseFrame
      userLanguage={userLanguage}
      variant="session"
      footer={awaitingContinue
        ? <ExerciseSubmitButton onClick={() => onResolved(false)}>{nextLabel}</ExerciseSubmitButton>
        : undefined}
    >
      <ExerciseInstruction>{question}</ExerciseInstruction>
      <ExercisePromptCard variant="word" userLanguage={userLanguage}>{item.baseText}</ExercisePromptCard>
      <ExerciseOptionGroup>
        {options.map(option => (
          <ExerciseOption
            key={option}
            state={scoring.optionState(option, item.translationNl)}
            variant="word"
            onClick={() => scoring.selectOption(option)}
          >
            {option}
          </ExerciseOption>
        ))}
      </ExerciseOptionGroup>
    </ExerciseFrame>
  )
}

export function Instaptoets() {
  const navigate = useNavigate()
  const T = useT()
  const userLanguage = useAuthStore((s) => s.profile?.language ?? 'nl')

  const [phase, setPhase] = useState<Phase>('loading')
  const [pool, setPool] = useState<PlacementPool | null>(null)
  const [outcomes, setOutcomes] = useState<AnswerOutcome[]>([])
  const [currentItem, setCurrentItem] = useState<PlacementItem | null>(null)
  const [pendingResult, setPendingResult] = useState<PlacementResult | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const loaded = await fetchPlacementPool()
        if (cancelled) return
        setPool(loaded)
        const first = selectNextItem({ bands: loaded.bands, itemsByBand: loaded.itemsByBand, outcomes: [] })
        setCurrentItem(first)
        setPhase(first ? 'active' : 'empty')
      } catch (err) {
        if (cancelled) return
        notifications.show({ color: 'red', title: T.common.error, message: T.instaptoets.loadFailed })
        logError({ page: 'Instaptoets', action: 'fetchPlacementPool', error: err })
        setPhase('empty')
      }
    }
    load()
    return () => { cancelled = true }
  }, [T.common.error, T.instaptoets.loadFailed])

  async function attemptSave(result: PlacementResult) {
    setPendingResult(result)
    setPhase('finishing')
    try {
      await applyPlacementResult(result.clearedBandSlugs, result.knownTexts)
      setPhase('done')
    } catch (err) {
      notifications.show({ color: 'red', title: T.common.error, message: T.instaptoets.saveFailed })
      logError({ page: 'Instaptoets', action: 'applyPlacementResult', error: err })
      setPhase('save-failed')
    }
  }

  function handleResolved(correct: boolean) {
    if (!pool || !currentItem) return
    const outcome: AnswerOutcome = { normalizedText: currentItem.normalizedText, bandSlug: currentItem.bandSlug, correct }
    const nextOutcomes = [...outcomes, outcome]
    setOutcomes(nextOutcomes)
    const next = selectNextItem({ bands: pool.bands, itemsByBand: pool.itemsByBand, outcomes: nextOutcomes })
    if (next) {
      setCurrentItem(next)
      return
    }
    attemptSave(assemblePlacementResult(pool.bands, nextOutcomes))
  }

  function handleRetrySave() {
    if (pendingResult) attemptSave(pendingResult)
  }

  function handleSkip() {
    navigate('/')
  }

  if (phase === 'loading') {
    return (
      <PageContainer size="md">
        <PageBody><LoadingState caption={T.instaptoets.loadingCaption} /></PageBody>
      </PageContainer>
    )
  }

  if (phase === 'empty') {
    return (
      <PageContainer size="md">
        <PageBody>
          <HeroCard title={T.instaptoets.emptyTitle}>
            <p className={classes.summaryBody}>{T.instaptoets.emptyBody}</p>
            <div className={classes.ctaBlock}>
              <button type="button" className={classes.heroSkipLink} onClick={handleSkip}>
                {T.instaptoets.skip}
              </button>
            </div>
          </HeroCard>
        </PageBody>
      </PageContainer>
    )
  }

  if (phase === 'finishing') {
    return (
      <PageContainer size="md">
        <PageBody><LoadingState caption={T.instaptoets.savingCaption} /></PageBody>
      </PageContainer>
    )
  }

  if (phase === 'save-failed') {
    return (
      <PageContainer size="md">
        <PageBody>
          <HeroCard title={T.common.error}>
            <p className={classes.summaryBody}>{T.instaptoets.saveFailed}</p>
            <div className={classes.ctaBlock}>
              <Button size="lg" onClick={handleRetrySave}>{T.instaptoets.retry}</Button>
              <button type="button" className={classes.heroSkipLink} onClick={handleSkip}>
                {T.instaptoets.skip}
              </button>
            </div>
          </HeroCard>
        </PageBody>
      </PageContainer>
    )
  }

  if (phase === 'done') {
    const knownCount = pendingResult?.knownTexts.length ?? 0
    return (
      <PageContainer size="md">
        <PageBody>
          <HeroCard title={T.instaptoets.resultTitle}>
            <p className={classes.summaryBody}>
              {knownCount > 0 ? T.instaptoets.resultBody(knownCount) : T.instaptoets.resultBodyZero}
            </p>
            {knownCount > 0 && <p className={classes.summaryHint}>{T.instaptoets.resultHint}</p>}
            <div className={classes.ctaBlock}>
              <Button size="lg" onClick={() => navigate('/session')}>{T.instaptoets.startSession}</Button>
            </div>
          </HeroCard>
        </PageBody>
      </PageContainer>
    )
  }

  // phase === 'active' — currentItem + pool are guaranteed set once we got here
  if (!pool || !currentItem) return null
  const detail = pool.detailsByNormalizedText.get(currentItem.normalizedText)
  if (!detail) return null // defensive — itemsByBand and detailsByNormalizedText come from the same fetch

  return (
    <PageContainer size="md">
      <PageBody>
        <button type="button" className={classes.plainSkipLink} onClick={handleSkip}>
          {T.instaptoets.skip}
        </button>
        <ProbeQuestion
          key={currentItem.normalizedText}
          item={detail}
          options={buildOptions(detail, pool.allItems, outcomes.length)}
          question={T.session.recognition.question}
          nextLabel={T.instaptoets.next}
          userLanguage={userLanguage}
          onResolved={handleResolved}
        />
      </PageBody>
    </PageContainer>
  )
}
