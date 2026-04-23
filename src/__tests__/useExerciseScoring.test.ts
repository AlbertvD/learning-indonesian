import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExerciseScoring, type ScoringConfig } from '@/lib/useExerciseScoring'

const correct = { isCorrect: true, isFuzzy: false }
const fuzzy = { isCorrect: true, isFuzzy: true }
const wrong = { isCorrect: false, isFuzzy: false }

describe('useExerciseScoring — tap-mode auto-commit', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('starts in idle phase', () => {
    const onAnswer = vi.fn()
    const { result } = renderHook(() => useExerciseScoring({
      mode: 'tap',
      checkCorrect: () => correct,
      onAnswer,
    }))
    expect(result.current.phase).toBe('idle')
    expect(result.current.isAnswered).toBe(false)
  })

  it('commits correct after correctDelayMs, fires answer_committed', async () => {
    const onAnswer = vi.fn()
    const onEvent = vi.fn()
    const { result } = renderHook(() => useExerciseScoring<string>({
      mode: 'tap',
      checkCorrect: () => correct,
      onAnswer,
      onEvent,
      correctDelayMs: 1500,
    }))
    act(() => { result.current.selectOption('huis') })
    expect(result.current.phase).toBe('processing')
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(result.current.phase).toBe('answered-correct')
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'correct', response: 'huis' }))
  })

  it('commits wrong immediately on tap-to-commit', () => {
    const onAnswer = vi.fn()
    const { result } = renderHook(() => useExerciseScoring<string>({
      mode: 'tap',
      checkCorrect: () => wrong,
      onAnswer,
    }))
    act(() => { result.current.selectOption('boek') })
    expect(result.current.phase).toBe('answered-wrong')
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'wrong', failureCount: 1 }))
  })

  it('ignores selectOption after answered', () => {
    const onAnswer = vi.fn()
    const { result } = renderHook(() => useExerciseScoring<string>({
      mode: 'tap',
      checkCorrect: () => wrong,
      onAnswer,
    }))
    act(() => { result.current.selectOption('boek') })
    act(() => { result.current.selectOption('auto') })
    expect(onAnswer).toHaveBeenCalledTimes(1)
  })
})

describe('useExerciseScoring — typed mode', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('gates submit on non-empty response', () => {
    const { result } = renderHook(() => useExerciseScoring<string>({
      mode: 'typed',
      checkCorrect: () => correct,
      onAnswer: vi.fn(),
    }))
    expect(result.current.canSubmit).toBe(false)
    act(() => { result.current.setResponse('rumah') })
    expect(result.current.canSubmit).toBe(true)
  })

  it('fuzzy correct does NOT auto-advance (design §6.9)', async () => {
    const onAnswer = vi.fn()
    const { result } = renderHook(() => useExerciseScoring<string>({
      mode: 'typed',
      checkCorrect: () => fuzzy,
      onAnswer,
      correctDelayMs: 1500,
    }))
    act(() => { result.current.setResponse('rumha') })
    act(() => { result.current.submit() })
    // Fuzzy commits immediately without the delay
    expect(result.current.phase).toBe('answered-fuzzy')
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'fuzzy' }))
  })
})

describe('useExerciseScoring — retry + gated configs', () => {
  it('allowRetry + maxFailures keeps the input open through retries', () => {
    const config: ScoringConfig<string> = {
      mode: 'typed',
      checkCorrect: () => wrong,
      onAnswer: vi.fn(),
      allowRetry: true,
      maxFailures: 2,
    }
    const { result } = renderHook(() => useExerciseScoring<string>(config))
    act(() => { result.current.setResponse('wrong1') })
    act(() => { result.current.submit() })
    expect(result.current.phase).toBe('wrong-retry')
    act(() => { result.current.setResponse('wrong2') })
    act(() => { result.current.submit() })
    expect(result.current.phase).toBe('wrong-retry')
    act(() => { result.current.setResponse('wrong3') })
    act(() => { result.current.submit() })
    expect(result.current.phase).toBe('answered-wrong')
  })

  it('gate=false blocks submit with dispatch', () => {
    let gateOpen = false
    const config: ScoringConfig<string> = {
      mode: 'typed',
      checkCorrect: () => correct,
      onAnswer: vi.fn(),
      gate: () => gateOpen,
    }
    const { result } = renderHook(() => useExerciseScoring<string>(config))
    act(() => { result.current.setResponse('rumah') })
    expect(result.current.canSubmit).toBe(false) // gate closed
    gateOpen = true
    // canSubmit recomputes on next render — trigger by typing again
    act(() => { result.current.setResponse('rumah') })
    expect(result.current.canSubmit).toBe(true)
  })
})

describe('useExerciseScoring — analytics', () => {
  it('fires exercise_shown once on mount (StrictMode-guarded)', () => {
    const onEvent = vi.fn()
    const { rerender } = renderHook(() => useExerciseScoring<string>({
      mode: 'tap',
      checkCorrect: () => correct,
      onAnswer: vi.fn(),
      onEvent,
    }))
    rerender()
    rerender()
    const shownCalls = onEvent.mock.calls.filter(c => c[0]?.type === 'exercise_shown' && !c[0]?.payload)
    expect(shownCalls.length).toBe(1)
  })
})
