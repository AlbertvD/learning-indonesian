// src/lib/useExerciseScoring.ts
// Reducer hook consolidating the 12-copy scoring state machine into one
// implementation. Handles: auto-commit MCQ, typed-commit, retry-with-hint,
// gated (dictation), and no-op (speaking).
//
// See docs/plans/2026-04-23-exercise-framework-design.md §7.1

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { OptionState } from '@/components/exercises/primitives'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScoringMode = 'tap' | 'typed'

export interface CheckResult {
  isCorrect: boolean
  isFuzzy: boolean
}

export interface AnswerResult<TResponse = string> {
  outcome: 'correct' | 'fuzzy' | 'wrong'
  response: TResponse
  latencyMs: number
  failureCount: number
  hintWasShown: boolean
}

export interface ExerciseEvent {
  type:
    | 'exercise_shown'
    | 'answer_committed'
    | 'exercise_skipped'
    | 'exercise_commit_failed'
    | 'audio_replayed'
    | 'continue_pressed'
    | 'flag_created'
    | 'content_gap'
  payload?: Record<string, unknown>
}

export interface ScoringConfig<TResponse = string> {
  mode: ScoringMode
  /** Evaluate user input. MCQ: response is the selected option. Typed: raw string. */
  checkCorrect: (response: TResponse) => CheckResult
  /** Called once per commit. Throws on Supabase failure → UI still advances. */
  onAnswer: (result: AnswerResult<TResponse>) => Promise<void> | void
  /** default false — wrong answers commit immediately */
  allowRetry?: boolean
  /** default 0 — after N failures, commit wrong even if allowRetry */
  maxFailures?: number
  /** after N failures, showHint flips to true */
  hintAfter?: number
  /** precondition gate (dictation: () => hasPlayedOnce) */
  gate?: () => boolean
  /** ms to pause on correct answer before firing onAnswer. default 1500. */
  correctDelayMs?: number
  /** analytics sink */
  onEvent?: (event: ExerciseEvent) => void
}

export type ScoringPhase =
  | 'idle'
  | 'gated'
  | 'wrong-retry'
  | 'processing'
  | 'answered-correct'
  | 'answered-fuzzy'
  | 'answered-wrong'

interface ScoringState<TResponse = string> {
  phase: ScoringPhase
  response: string                        // only meaningful in typed mode
  failureCount: number
  startedAt: number
  committedResponse?: TResponse
  latencyMs?: number
}

type Action<TResponse = string> =
  | { type: 'TYPE', value: string }
  | { type: 'GATE_OPENED' }
  | { type: 'GATE_CLOSED', reason: string }
  | { type: 'MARK_PROCESSING', response: TResponse, latencyMs: number }
  | { type: 'COMMIT_CORRECT', response: TResponse, latencyMs: number }
  | { type: 'COMMIT_FUZZY',   response: TResponse, latencyMs: number }
  | { type: 'COMMIT_WRONG',   response: TResponse, latencyMs: number }
  | { type: 'WRONG_RETRY',    response: TResponse, latencyMs: number }

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reduce<TResponse = string>(
  state: ScoringState<TResponse>,
  action: Action<TResponse>,
): ScoringState<TResponse> {
  // Terminal phases ignore all actions.
  if (
    state.phase === 'answered-correct' ||
    state.phase === 'answered-fuzzy' ||
    state.phase === 'answered-wrong'
  ) return state

  // Global actions handled the same in every non-terminal phase.
  switch (action.type) {
    case 'TYPE':
      return { ...state, response: action.value }
    case 'GATE_OPENED':
      return state.phase === 'gated' ? { ...state, phase: 'idle' } : state
    case 'GATE_CLOSED':
      return { ...state, phase: 'gated' }
    case 'MARK_PROCESSING':
      return {
        ...state,
        phase: 'processing',
        committedResponse: action.response,
        latencyMs: action.latencyMs,
      }
    case 'COMMIT_CORRECT':
      return {
        ...state,
        phase: 'answered-correct',
        committedResponse: action.response,
        latencyMs: action.latencyMs,
      }
    case 'COMMIT_FUZZY':
      return {
        ...state,
        phase: 'answered-fuzzy',
        committedResponse: action.response,
        latencyMs: action.latencyMs,
      }
    case 'COMMIT_WRONG':
      return {
        ...state,
        phase: 'answered-wrong',
        committedResponse: action.response,
        latencyMs: action.latencyMs,
        failureCount: state.failureCount + 1,
      }
    case 'WRONG_RETRY':
      return {
        ...state,
        phase: 'wrong-retry',
        response: '',
        committedResponse: action.response,
        latencyMs: action.latencyMs,
        failureCount: state.failureCount + 1,
      }
  }
}

function initialState<TResponse = string>(): ScoringState<TResponse> {
  return {
    phase: 'idle',
    response: '',
    failureCount: 0,
    startedAt: Date.now(),
  }
}

// ─── API exposed to exercise implementations ────────────────────────────────

export interface ScoringAPI<TResponse = string> {
  // State introspection
  phase: ScoringPhase
  failureCount: number
  showHint: boolean
  isProcessing: boolean
  isAnswered: boolean
  result: AnswerResult<TResponse> | null

  // Typed-mode inputs
  response: string
  setResponse: (v: string) => void
  submit: () => void
  canSubmit: boolean

  // MCQ-mode input
  selectOption: (option: TResponse) => void

  // UI-derived state mappings
  inputState: 'idle' | 'correct' | 'wrong' | 'fuzzy' | 'disabled'
  optionState: (option: TResponse, correctOption: TResponse) => OptionState
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useExerciseScoring<TResponse = string>(
  config: ScoringConfig<TResponse>,
): ScoringAPI<TResponse> {
  type S = ScoringState<TResponse>
  type A = Action<TResponse>

  const [state, dispatch] = useReducer(
    reduce as (s: S, a: A) => S,
    undefined,
    initialState as () => S,
  )

  const {
    mode, checkCorrect, onAnswer,
    allowRetry = false, maxFailures = 0, hintAfter,
    gate, correctDelayMs = 1500, onEvent,
  } = config

  // Keep latest callbacks in refs so the reducer helpers don't need deps.
  const configRef = useRef({ checkCorrect, onAnswer, gate, onEvent })
  useEffect(() => {
    configRef.current = { checkCorrect, onAnswer, gate, onEvent }
  }, [checkCorrect, onAnswer, gate, onEvent])

  // ─ exercise_shown — fire once on mount, guard against StrictMode double-invoke
  const didEmitShownRef = useRef(false)
  useEffect(() => {
    if (didEmitShownRef.current) return
    didEmitShownRef.current = true
    configRef.current.onEvent?.({ type: 'exercise_shown' })
  }, [])

  // ─ Gate polling — re-evaluate when phase or gate identity changes
  useEffect(() => {
    if (!gate) return
    if (state.phase === 'gated' && gate()) {
      dispatch({ type: 'GATE_OPENED' })
    }
  })

  // ─ Timer cleanup guard — holds the active correct-delay timeout so unmount
  //   clears it. Also used to cancel if the user remounts mid-delay.
  const timerRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  // ─ Internal: run scoring + dispatch commits + call onAnswer
  const runScoring = useCallback((response: TResponse, isTypedSubmit: boolean) => {
    const { checkCorrect: check, onAnswer: onAns, onEvent: onEv } = configRef.current
    const result = check(response)
    const latencyMs = Date.now() - state.startedAt
    const hintWasShown = hintAfter !== undefined && state.failureCount >= hintAfter

    const commit = (outcome: 'correct' | 'fuzzy' | 'wrong') => {
      const r: AnswerResult<TResponse> = {
        outcome,
        response,
        latencyMs,
        failureCount: outcome === 'wrong' ? state.failureCount + 1 : state.failureCount,
        hintWasShown,
      }
      // Reducer dispatches commit synchronously; onAnswer runs as a microtask.
      // answer_committed fires only if onAnswer resolves; exercise_commit_failed
      // fires on rejection. UI is `answered-*` in both cases (commit succeeds
      // optimistically; FSRS cache writes are gated on onAnswer success).
      Promise.resolve(onAns(r))
        .then(() => {
          onEv?.({ type: 'answer_committed', payload: {
            outcome, latencyMs, failureCount: r.failureCount, hintWasShown: r.hintWasShown,
          }})
        })
        .catch((err: unknown) => {
          onEv?.({ type: 'exercise_commit_failed', payload: { error: String(err) } })
        })
      if (outcome === 'correct') {
        dispatch({ type: 'COMMIT_CORRECT', response, latencyMs })
      } else if (outcome === 'fuzzy') {
        dispatch({ type: 'COMMIT_FUZZY', response, latencyMs })
      } else {
        dispatch({ type: 'COMMIT_WRONG', response, latencyMs })
      }
    }

    if (result.isCorrect && !result.isFuzzy) {
      // Show processing briefly to enable the correct-pulse animation, then
      // commit + advance via the delay.
      dispatch({ type: 'MARK_PROCESSING', response, latencyMs })
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        commit('correct')
      }, correctDelayMs)
      return
    }
    if (result.isCorrect && result.isFuzzy) {
      // Fuzzy — does NOT auto-advance (design decision: learner must see diff
      // before proceeding). Commit immediately so feedback renders.
      commit('fuzzy')
      return
    }
    // Wrong branch
    const nextFailures = state.failureCount + 1
    const shouldRetry = allowRetry && nextFailures <= maxFailures && isTypedSubmit
    if (shouldRetry) {
      // Stay in wrong-retry; update failure count for hint gating.
      dispatch({ type: 'WRONG_RETRY', response, latencyMs })
      return
    }
    commit('wrong')
  }, [state.startedAt, state.failureCount, allowRetry, maxFailures, correctDelayMs, hintAfter])

  // ─ Public handlers
  const setResponse = useCallback((v: string) => {
    dispatch({ type: 'TYPE', value: v })
  }, [])

  const submit = useCallback(() => {
    if (state.phase !== 'idle' && state.phase !== 'wrong-retry') return
    if (mode !== 'typed') return
    if (!state.response.trim()) return
    if (gate && !gate()) {
      dispatch({ type: 'GATE_CLOSED', reason: 'precondition' })
      return
    }
    // Typed mode — response is the raw string.
    runScoring(state.response as unknown as TResponse, true)
  }, [state.phase, state.response, mode, gate, runScoring])

  const selectOption = useCallback((option: TResponse) => {
    if (state.phase !== 'idle' && state.phase !== 'wrong-retry') return
    if (mode !== 'tap') return
    runScoring(option, false)
  }, [state.phase, mode, runScoring])

  // ─ UI-derived state
  const isAnswered =
    state.phase === 'answered-correct' ||
    state.phase === 'answered-fuzzy' ||
    state.phase === 'answered-wrong'

  const isProcessing = state.phase === 'processing'

  const canSubmit =
    mode === 'typed' &&
    (state.phase === 'idle' || state.phase === 'wrong-retry') &&
    state.response.trim().length > 0 &&
    (!gate || gate())

  const inputState: ScoringAPI<TResponse>['inputState'] =
    state.phase === 'answered-correct' ? 'correct' :
    state.phase === 'answered-fuzzy'   ? 'fuzzy' :
    state.phase === 'answered-wrong'   ? 'wrong' :
    state.phase === 'processing'       ? 'disabled' :
    'idle'

  const optionState = useCallback(
    (option: TResponse, correctOption: TResponse): OptionState => {
      if (!isAnswered && !isProcessing) return 'idle'
      const wasCommitted = state.committedResponse
      if (option === wasCommitted) {
        if (state.phase === 'answered-correct' || state.phase === 'processing') return 'correct'
        if (state.phase === 'answered-fuzzy') return 'correct'
        if (state.phase === 'answered-wrong') return 'wrong'
      }
      if (option === correctOption && state.phase === 'answered-wrong') return 'answer'
      return 'disabled'
    },
    [isAnswered, isProcessing, state.committedResponse, state.phase],
  )

  const showHint = hintAfter !== undefined && state.failureCount >= hintAfter

  const result: AnswerResult<TResponse> | null = isAnswered && state.committedResponse !== undefined && state.latencyMs !== undefined
    ? {
        outcome: state.phase === 'answered-correct' ? 'correct' :
                 state.phase === 'answered-fuzzy' ? 'fuzzy' :
                 'wrong',
        response: state.committedResponse,
        latencyMs: state.latencyMs,
        failureCount: state.failureCount,
        hintWasShown: hintAfter !== undefined && state.failureCount >= hintAfter,
      }
    : null

  return {
    phase: state.phase,
    failureCount: state.failureCount,
    showHint,
    isProcessing,
    isAnswered,
    result,
    response: state.response,
    setResponse,
    submit,
    canSubmit,
    selectOption,
    inputState,
    optionState,
  }
}
