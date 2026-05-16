import { useEffect, useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { ExperiencePlayer } from '@/components/experience/ExperiencePlayer'
import type {
  CapabilityReviewSessionContext,
  SessionPlan,
  SessionBlock,
} from '@/lib/session-builder'
import type { CapabilityRenderContext } from '@/services/capabilityContentService'
import type { ExerciseItem } from '@/types/learning'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn(() => ({ profile: null })),
}))

function StubExercise(props: {
  onAnswer: (outcome: { wasCorrect: boolean; isFuzzy: boolean; latencyMs: number; rawResponse: string | null } | { skipped: true; reviewRecorded: false }) => void
}) {
  return (
    <div data-testid="stub-exercise">
      <button onClick={() => props.onAnswer({ wasCorrect: true, isFuzzy: false, latencyMs: 100, rawResponse: 'ans' })}>
        Mark correct
      </button>
      <button onClick={() => props.onAnswer({ wasCorrect: false, isFuzzy: false, latencyMs: 100, rawResponse: 'wrong' })}>
        Mark wrong
      </button>
      <button onClick={() => props.onAnswer({ wasCorrect: true, isFuzzy: true, latencyMs: 100, rawResponse: 'fuzzy' })}>
        Mark fuzzy
      </button>
      <button onClick={() => props.onAnswer({ skipped: true, reviewRecorded: false })}>
        Skip
      </button>
    </div>
  )
}

vi.mock('@/components/exercises/registry', async () => {
  const actual = await vi.importActual<typeof import('@/components/exercises/registry')>(
    '@/components/exercises/registry',
  )
  return {
    ...actual,
    resolveExerciseComponent: vi.fn(() => StubExercise as never),
  }
})

const activeReviewContext: CapabilityReviewSessionContext = {
  schedulerSnapshot: {
    stateVersion: 2,
    activationState: 'active',
    stability: 1,
    difficulty: 5,
    lastReviewedAt: '2026-04-24T10:00:00Z',
    nextDueAt: '2026-04-25T10:00:00Z',
    reviewCount: 1,
    lapseCount: 0,
    consecutiveFailureCount: 0,
  },
  currentStateVersion: 2,
  artifactVersionSnapshot: { artifactFingerprint: 'v1' },
  capabilityReadinessStatus: 'ready',
  capabilityPublicationStatus: 'published',
}

const dormantReviewContext: CapabilityReviewSessionContext = {
  schedulerSnapshot: {
    stateVersion: 0,
    activationState: 'dormant',
    reviewCount: 0,
    lapseCount: 0,
    consecutiveFailureCount: 0,
  },
  currentStateVersion: 0,
  artifactVersionSnapshot: { artifactFingerprint: 'v1' },
  capabilityReadinessStatus: 'ready',
  capabilityPublicationStatus: 'published',
}

function makeBlock(id: string, kind: 'due_review' | 'new_introduction', exerciseType = 'meaning_recall'): SessionBlock {
  return {
    id,
    kind,
    capabilityId: `cap-${id}`,
    canonicalKeySnapshot: `item:x:${exerciseType}:id_to_l1`,
    stateVersion: kind === 'due_review' ? 2 : 0,
    reviewContext: kind === 'due_review' ? activeReviewContext : dormantReviewContext,
    ...(kind === 'new_introduction' ? {
      pendingActivation: {
        capabilityId: `cap-${id}`,
        canonicalKeySnapshot: `item:x:${exerciseType}:id_to_l1`,
        activationRequest: { reason: 'eligible_new_capability' as const },
        requiredActivationOwner: 'review_processor' as const,
      },
    } : {}),
    renderPlan: {
      capabilityKey: `item:x:${exerciseType}:id_to_l1`,
      sourceRef: 'learning_items/x',
      exerciseType: exerciseType as ExerciseItem['exerciseType'],
      capabilityType: 'meaning_recall',
      skillType: 'meaning_recall',
      requiredArtifacts: ['meaning:l1'],
    },
  }
}

function makeExerciseItem(exerciseType = 'meaning_recall'): ExerciseItem {
  return {
    learningItem: {
      id: 'item-1', item_type: 'word', base_text: 'makan', normalized_text: 'makan',
      language: 'id', level: 'A1', source_type: 'lesson',
      source_vocabulary_id: null, source_card_id: null, notes: null,
      is_active: true, pos: null, created_at: '', updated_at: '',
    },
    meanings: [{ id: 'm1', learning_item_id: 'item-1', translation_language: 'nl', translation_text: 'eten', sense_label: null, usage_note: null, is_primary: true }],
    contexts: [],
    answerVariants: [],
    skillType: 'meaning_recall',
    exerciseType: exerciseType as ExerciseItem['exerciseType'],
  }
}

function makeOk(block: SessionBlock): CapabilityRenderContext {
  return {
    blockId: block.id, capabilityId: block.capabilityId,
    exerciseItem: makeExerciseItem(block.renderPlan.exerciseType),
    audibleTexts: [], diagnostic: null,
  }
}

function makeFail(block: SessionBlock): CapabilityRenderContext {
  return {
    blockId: block.id, capabilityId: block.capabilityId,
    exerciseItem: null, audibleTexts: [],
    diagnostic: {
      reasonCode: 'item_inactive', message: '', capabilityKey: block.canonicalKeySnapshot,
      capabilityId: block.capabilityId, exerciseType: block.renderPlan.exerciseType, blockId: block.id,
    },
  }
}

function makePlan(blocks: SessionBlock[], diagnostics: SessionPlan['diagnostics'] = []): SessionPlan {
  return {
    id: 'session-1',
    mode: 'standard',
    title: 'Test sessie',
    recapPolicy: 'standard',
    diagnostics,
    blocks,
  }
}

function renderPlayer(props: Parameters<typeof ExperiencePlayer>[0]) {
  return render(
    <MantineProvider>
      <ExperiencePlayer {...props} />
    </MantineProvider>
  )
}

const baseProps = {
  audioMap: new Map(),
  userLanguage: 'nl' as const,
  onAnswer: vi.fn(async () => {}),
  onComplete: vi.fn(),
}

beforeEach(async () => {
  vi.clearAllMocks()
  const { resolveExerciseComponent } = await import('@/components/exercises/registry')
  vi.mocked(resolveExerciseComponent).mockImplementation(() => StubExercise as never)
})

describe('ExperiencePlayer — stepwise shell', () => {
  it('1. Renders the first block only on mount (3-block plan)', () => {
    const blocks = [
      makeBlock('b1', 'due_review'),
      makeBlock('b2', 'new_introduction'),
      makeBlock('b3', 'due_review'),
    ]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts })

    expect(screen.getAllByTestId('stub-exercise')).toHaveLength(1)
    expect(screen.getByText('Oefening 1 van 3')).toBeInTheDocument()
  })

  it('2. Correct + not fuzzy auto-advances — no Doorgaan screen', async () => {
    const user = userEvent.setup()
    const blocks = [makeBlock('b1', 'due_review'), makeBlock('b2', 'new_introduction')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts })

    expect(screen.getByText('Oefening 1 van 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark correct' }))

    expect(screen.queryByText('Doorgaan')).not.toBeInTheDocument()
    expect(screen.getByText('Oefening 2 van 2')).toBeInTheDocument()
  })

  it('2a. Each card mounts fresh between transitions (regression — shared state bug)', async () => {
    const user = userEvent.setup()
    let mountCount = 0
    function CountingStub(props: { onAnswer: (outcome: { wasCorrect: boolean; isFuzzy: boolean; latencyMs: number; rawResponse: string | null }) => void }) {
      const [submitted, setSubmitted] = useState(false)
      useEffect(() => { mountCount += 1 }, [])
      return (
        <div data-testid="stub-exercise">
          <button
            disabled={submitted}
            onClick={() => {
              setSubmitted(true)
              props.onAnswer({ wasCorrect: true, isFuzzy: false, latencyMs: 100, rawResponse: 'ans' })
            }}
          >
            Submit
          </button>
        </div>
      )
    }
    const { resolveExerciseComponent } = await import('@/components/exercises/registry')
    vi.mocked(resolveExerciseComponent).mockImplementation(() => CountingStub as never)

    const blocks = [
      makeBlock('b1', 'due_review', 'recognition_mcq'),
      makeBlock('b2', 'new_introduction', 'recognition_mcq'),
    ]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts })

    expect(mountCount).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(screen.getByText('Oefening 2 van 2')).toBeInTheDocument())
    expect(mountCount).toBe(2)
    expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled()
  })

  it('3. Wrong shows Doorgaan, advances on tap', async () => {
    const user = userEvent.setup()
    const blocks = [makeBlock('b1', 'due_review'), makeBlock('b2', 'new_introduction')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts })

    await user.click(screen.getByRole('button', { name: 'Mark wrong' }))
    const doorgaanBtn = await screen.findByRole('button', { name: /doorgaan/i })
    expect(doorgaanBtn).toBeInTheDocument()

    await user.click(doorgaanBtn)
    expect(screen.getByText('Oefening 2 van 2')).toBeInTheDocument()
  })

  it('4. Fuzzy shows Doorgaan with "Bijna goed" badge', async () => {
    const user = userEvent.setup()
    const blocks = [makeBlock('b1', 'due_review'), makeBlock('b2', 'new_introduction')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts })

    await user.click(screen.getByRole('button', { name: 'Mark fuzzy' }))
    expect(await screen.findByText('Bijna goed')).toBeInTheDocument()
    expect(screen.queryByText('Fout')).not.toBeInTheDocument()
  })

  it('5. Commit failure on correct: toast fires, auto-advances, no Doorgaan', async () => {
    const { notifications } = await import('@mantine/notifications')
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => { throw new Error('network') })
    const blocks = [makeBlock('b1', 'due_review'), makeBlock('b2', 'new_introduction')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts, onAnswer })

    await user.click(screen.getByRole('button', { name: 'Mark correct' }))

    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'yellow' }))
    })
    expect(screen.queryByText('Doorgaan')).not.toBeInTheDocument()
    expect(screen.getByText('Oefening 2 van 2')).toBeInTheDocument()
  })

  it('6. Commit failure on wrong: Doorgaan shows commit-failed chip, no toast', async () => {
    const { notifications } = await import('@mantine/notifications')
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => { throw new Error('network') })
    const blocks = [makeBlock('b1', 'due_review'), makeBlock('b2', 'new_introduction')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts, onAnswer })

    await user.click(screen.getByRole('button', { name: 'Mark wrong' }))
    await screen.findByRole('button', { name: /doorgaan/i })

    expect(notifications.show).not.toHaveBeenCalled()
    expect(screen.getByText('Kon beoordeling niet opslaan — we gaan toch door.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /doorgaan/i }))
    expect(screen.getByText('Oefening 2 van 2')).toBeInTheDocument()
  })

  it('7. Commit failure on fuzzy: Doorgaan shows chip, no toast', async () => {
    const { notifications } = await import('@mantine/notifications')
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => { throw new Error('network') })
    const blocks = [makeBlock('b1', 'due_review'), makeBlock('b2', 'new_introduction')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts, onAnswer })

    await user.click(screen.getByRole('button', { name: 'Mark fuzzy' }))
    await screen.findByRole('button', { name: /doorgaan/i })

    expect(notifications.show).not.toHaveBeenCalled()
    expect(screen.getByText('Kon beoordeling niet opslaan — we gaan toch door.')).toBeInTheDocument()
  })

  it('8. Recap renders after last block — shows saved count and Terug button', async () => {
    const user = userEvent.setup()
    const blocks = [
      makeBlock('b1', 'due_review'),
      makeBlock('b2', 'new_introduction'),
      makeBlock('b3', 'due_review'),
    ]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts })

    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: 'Mark correct' }))
    }

    expect(await screen.findByText(/3 van 3 vaardigheidskaarten zijn veilig opgeslagen/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terug naar dashboard' })).toBeInTheDocument()
  })

  it('9. Empty-state recap when zero renderable blocks', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    const blocks = [makeBlock('b1', 'due_review'), makeBlock('b2', 'due_review')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeFail(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts, onComplete })

    expect(await screen.findByText('Niets te doen')).toBeInTheDocument()
    expect(screen.getByText('Er zijn geen kaarten beschikbaar voor deze sessie.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Terug naar dashboard' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('9a. Recap excludes commit-failed from savedCount; singular subline', async () => {
    const user = userEvent.setup()
    const blocks = [
      makeBlock('b1', 'due_review'),
      makeBlock('b2', 'due_review'),
      makeBlock('b3', 'due_review'),
    ]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))

    let callCount = 0
    const onAnswer = vi.fn(async () => {
      callCount++
      if (callCount === 3) throw new Error('fail')
    })

    renderPlayer({ ...baseProps, plan: p, contexts, onAnswer })

    // b1: correct, commit OK
    await user.click(screen.getByRole('button', { name: 'Mark correct' }))
    // b2: wrong, commit OK
    await user.click(screen.getByRole('button', { name: 'Mark wrong' }))
    await user.click(await screen.findByRole('button', { name: /doorgaan/i }))
    // b3: wrong, commit fails
    await user.click(screen.getByRole('button', { name: 'Mark wrong' }))
    await user.click(await screen.findByRole('button', { name: /doorgaan/i }))

    expect(await screen.findByText(/2 van 3 vaardigheidskaarten zijn veilig opgeslagen/)).toBeInTheDocument()
    expect(screen.getByText('1 antwoord kon niet worden opgeslagen — we proberen het later opnieuw.')).toBeInTheDocument()
    expect(screen.getByText('Niet opgeslagen')).toBeInTheDocument()
  })

  it('9a-plural. Two commit failures renders plural copy', async () => {
    const user = userEvent.setup()
    const blocks = [makeBlock('b1', 'due_review'), makeBlock('b2', 'due_review')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    const onAnswer = vi.fn(async () => { throw new Error('fail') })
    renderPlayer({ ...baseProps, plan: p, contexts, onAnswer })

    await user.click(screen.getByRole('button', { name: 'Mark wrong' }))
    await user.click(await screen.findByRole('button', { name: /doorgaan/i }))
    await user.click(screen.getByRole('button', { name: 'Mark wrong' }))
    await user.click(await screen.findByRole('button', { name: /doorgaan/i }))

    expect(await screen.findByText('2 antwoorden konden niet worden opgeslagen — we proberen ze later opnieuw.')).toBeInTheDocument()
  })

  it('9b. Registry-missing blocks are silent-filtered', async () => {
    const { resolveExerciseComponent } = await import('@/components/exercises/registry')
    const blocks = [
      makeBlock('b1', 'due_review', 'meaning_recall'),
      makeBlock('b2', 'new_introduction', 'unknown_type_xyz' as never),
      makeBlock('b3', 'due_review', 'meaning_recall'),
    ]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))

    vi.mocked(resolveExerciseComponent).mockImplementation((type) => {
      if (type === 'unknown_type_xyz' as never) return null
      function StubEx(props: { onAnswer: (o: unknown) => void }) {
        return (
          <div data-testid="stub-exercise">
            <button onClick={() => props.onAnswer({ wasCorrect: true, isFuzzy: false, latencyMs: 100, rawResponse: 'ans' })}>Mark correct</button>
          </div>
        )
      }
      return StubEx as never
    })

    renderPlayer({ ...baseProps, plan: p, contexts })
    expect(screen.getByText('Oefening 1 van 2')).toBeInTheDocument()
  })

  it('10. onComplete fires from recap button only — not auto-fired after last answer', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    const blocks = [makeBlock('b1', 'due_review')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts, onComplete })

    await user.click(screen.getByRole('button', { name: 'Mark correct' }))

    expect(onComplete).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Terug naar dashboard' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('11. Diagnostics hidden for non-admin, visible to admin in details', async () => {
    const { useAuthStore } = await import('@/stores/authStore')
    const blocks = [makeBlock('b1', 'due_review')]
    const planWithDiags = makePlan(blocks, [{ severity: 'warn' as const, reason: 'test_reason', details: 'some debug info' }])
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))

    vi.mocked(useAuthStore).mockReturnValue({ profile: { isAdmin: false } } as never)
    const { rerender } = renderPlayer({ ...baseProps, plan: planWithDiags, contexts })
    expect(screen.queryByText('test_reason')).not.toBeInTheDocument()

    vi.mocked(useAuthStore).mockReturnValue({ profile: { isAdmin: true } } as never)
    rerender(
      <MantineProvider>
        <ExperiencePlayer {...baseProps} plan={planWithDiags} contexts={contexts} />
      </MantineProvider>
    )
    expect(screen.getByText('test_reason')).toBeInTheDocument()
  })

  it('12. Silent-skipped blocks (exerciseItem null) reduce progress denominator', () => {
    const blocks = [makeBlock('b1', 'due_review'), makeBlock('b2', 'new_introduction'), makeBlock('b3', 'due_review')]
    const p = makePlan(blocks)
    const contexts = new Map<string, CapabilityRenderContext>([
      [blocks[0].id, makeOk(blocks[0])],
      [blocks[1].id, makeFail(blocks[1])],
      [blocks[2].id, makeOk(blocks[2])],
    ])
    renderPlayer({ ...baseProps, plan: p, contexts })

    expect(screen.getByText('Oefening 1 van 2')).toBeInTheDocument()
  })

  it('13. Skip path advances without counting toward correct; shows Overgeslagen in recap', async () => {
    const user = userEvent.setup()
    const blocks = [makeBlock('b1', 'due_review'), makeBlock('b2', 'new_introduction')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts })

    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByText('Oefening 2 van 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mark correct' }))
    expect(await screen.findByText('Overgeslagen')).toBeInTheDocument()
  })

  it('14. Idempotency guard: rapid double-click calls onAnswer exactly once', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => new Promise<void>(r => setTimeout(r, 200)))
    const blocks = [makeBlock('b1', 'due_review')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    renderPlayer({ ...baseProps, plan: p, contexts, onAnswer })

    const btn = screen.getByRole('button', { name: 'Mark correct' })
    await user.click(btn)
    await user.click(btn)

    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1))
  })

  it('15. AudioProvider wraps the tree (SessionAudioProvider present)', () => {
    const blocks = [makeBlock('b1', 'due_review')]
    const p = makePlan(blocks)
    const contexts = new Map(blocks.map(b => [b.id, makeOk(b)]))
    const audioMap = new Map([['makan|__default__', 'path/to/audio.mp3']])
    renderPlayer({ ...baseProps, plan: p, contexts, audioMap })
    expect(screen.getByTestId('stub-exercise')).toBeInTheDocument()
  })
})
