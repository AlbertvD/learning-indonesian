import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { ExerciseShell } from '@/components/exercises/ExerciseShell'
import { processReview } from '@/lib/reviewHandler'
import type { SessionQueueItem } from '@/types/learning'
import type { User } from '@supabase/supabase-js'
import type { ReactElement } from 'react'

// Registry-path integration test for PR #4a migrations. Validates that a
// registered exercise type (recognition_mcq) renders via the new primitives +
// useExerciseScoring path and that the AnswerReport → processReview
// translation in ExerciseShell works end-to-end.

vi.mock('@/lib/reviewHandler', () => ({
  processReview: vi.fn().mockResolvedValue({
    newItemState: null,
    newSkillState: null,
    promotion: null,
    demotion: null,
  }),
  processGrammarReview: vi.fn(),
}))

vi.mock('@/services/contentFlagService', () => ({
  contentFlagService: {
    getFlagForItem: vi.fn().mockResolvedValue(null),
    getFlagForGrammarPattern: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'u-1' },
    profile: { isAdmin: false },
  }),
}))

vi.mock('@/contexts/SessionAudioContext', () => ({
  useSessionAudio: () => ({ audioMap: new Map() }),
}))

vi.mock('@/contexts/AutoplayContext', () => ({
  useAutoplay: () => ({ autoPlay: false, setAutoPlay: () => {} }),
}))

function wrap(ui: ReactElement) {
  return render(
    <MantineProvider>
      <Notifications />
      {ui}
    </MantineProvider>
  )
}

function makeRecognitionMcqItem(): SessionQueueItem {
  return {
    source: 'vocab',
    learnerItemState: null,
    learnerSkillState: null,
    exerciseItem: {
      learningItem: {
        id: 'li-1',
        base_text: 'rumah',
        item_type: 'word',
        source_type: 'lesson',
        lesson_id: 'les-1',
        pos: 'noun',
      } as never,
      meanings: [{
        id: 'm-1',
        learning_item_id: 'li-1',
        translation_text: 'huis',
        translation_language: 'nl',
        is_primary: true,
      } as never],
      contexts: [],
      answerVariants: [],
      skillType: 'recognition',
      exerciseType: 'recognition_mcq',
      distractors: ['auto', 'boek', 'vriend'],
    } as never,
  } as never
}

describe('ExerciseShell — registry path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a Tier 1 migrated exercise via the registry', async () => {
    const onAnswer = vi.fn()
    const onContinueToNext = vi.fn()

    wrap(
      <ExerciseShell
        currentItem={makeRecognitionMcqItem()}
        sessionId="sess-1"
        user={{ id: 'u-1' } as User}
        userLanguage="nl"
        onAnswer={onAnswer}
        onContinueToNext={onContinueToNext}
        onSkip={() => {}}
      />
    )

    // Primitive-backed: instruction renders as <h2>
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
    })
    // Word prompt renders
    expect(screen.getByText('rumah')).toBeInTheDocument()
  })

  it('routes a correct answer through processReview with the right args', async () => {
    const onAnswer = vi.fn()
    const onContinueToNext = vi.fn()

    wrap(
      <ExerciseShell
        currentItem={makeRecognitionMcqItem()}
        sessionId="sess-1"
        user={{ id: 'u-1' } as User}
        userLanguage="nl"
        onAnswer={onAnswer}
        onContinueToNext={onContinueToNext}
        onSkip={() => {}}
      />
    )

    // Wait for suspense to resolve the lazy chunk
    const correctOption = await screen.findByRole('button', { name: /huis/ })
    await userEvent.click(correctOption)

    await waitFor(() => {
      expect(vi.mocked(processReview)).toHaveBeenCalled()
    }, { timeout: 3000 })

    const call = vi.mocked(processReview).mock.calls[0][0]
    expect(call.userId).toBe('u-1')
    expect(call.sessionId).toBe('sess-1')
    expect(call.wasCorrect).toBe(true)
    expect(call.rawResponse).toBe('huis')
  })
})
