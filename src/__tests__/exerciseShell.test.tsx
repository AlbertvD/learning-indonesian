import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { ExerciseShell } from '@/components/exercises/ExerciseShell'
import type { SessionQueueItem } from '@/types/learning'
import type { User } from '@supabase/supabase-js'

vi.mock('@/lib/reviewHandler', () => ({
  processReview: vi.fn().mockResolvedValue({
    newItemState: null,
    newSkillState: null,
    promotion: null,
    demotion: null,
  }),
  processGrammarReview: vi.fn().mockResolvedValue({
    newGrammarState: null,
    promotion: null,
    demotion: null,
  }),
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

function wrap(ui: React.ReactElement) {
  return render(
    <MantineProvider>
      <Notifications />
      {ui}
    </MantineProvider>
  )
}

function makeGrammarClozeMcqItem(explanationText?: string): SessionQueueItem {
  return {
    source: 'grammar',
    grammarPatternId: 'pat-1',
    grammarState: null,
    exerciseItem: {
      learningItem: null,
      meanings: [],
      contexts: [],
      answerVariants: [],
      skillType: 'recognition',
      exerciseType: 'cloze_mcq',
      clozeMcqData: {
        sentence: 'Saya ___ nasi.',
        translation: 'Ik eet rijst.',
        options: ['makan', 'minum'],
        correctOptionId: 'makan',
        ...(explanationText !== undefined ? { explanationText } : {}),
      },
    },
  }
}

describe('ExerciseShell feedback — grammar cloze_mcq explanation', () => {
  it('shows the authored explanation on wrong-answer feedback screen', async () => {
    const currentItem = makeGrammarClozeMcqItem('Makan = eten; minum = drinken.')

    wrap(
      <ExerciseShell
        currentItem={currentItem}
        sessionId="s-1"
        user={{ id: 'u-1' } as User}
        userLanguage="nl"
        onAnswer={vi.fn()}
        onContinueToNext={vi.fn()}
      />
    )

    // Pick the wrong option to trigger the feedback screen
    await userEvent.click(await screen.findByRole('button', { name: 'minum' }, { timeout: 5000 }))

    await waitFor(() => {
      expect(screen.getByText('Makan = eten; minum = drinken.')).toBeInTheDocument()
    })
  })

  it('does not render an explanation box when explanationText is absent', async () => {
    const currentItem = makeGrammarClozeMcqItem()

    wrap(
      <ExerciseShell
        currentItem={currentItem}
        sessionId="s-1"
        user={{ id: 'u-1' } as User}
        userLanguage="nl"
        onAnswer={vi.fn()}
        onContinueToNext={vi.fn()}
      />
    )

    await userEvent.click(await screen.findByRole('button', { name: 'minum' }))

    await waitFor(() => {
      // Doorgaan button appears → feedback screen is rendered
      expect(screen.getByRole('button', { name: /doorgaan|continue/i })).toBeInTheDocument()
    })
    // Explanation label should not appear when no explanation text
    expect(screen.queryByText('Uitleg:')).toBeNull()
  })
})
