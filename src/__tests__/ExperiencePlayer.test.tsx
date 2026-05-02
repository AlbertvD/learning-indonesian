import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExperiencePlayer } from '@/components/experience/ExperiencePlayer'
import type {
  CapabilityReviewSessionContext,
  SessionPlan,
  SessionBlock,
} from '@/lib/session/sessionPlan'
import type { CapabilityRenderContext } from '@/services/capabilityContentService'
import type { ExerciseItem } from '@/types/learning'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

// Stub the registry so the dispatcher renders a deterministic test component
// regardless of which exerciseType the block requests. The stub exposes a
// "Mark correct" / "Mark wrong" button that calls onAnswer with the matching
// outcome, plus a "Skip" button for the skipped-outcome path.
vi.mock('@/components/exercises/registry', async () => {
  const actual = await vi.importActual<typeof import('@/components/exercises/registry')>(
    '@/components/exercises/registry',
  )
  function StubExercise(props: { onAnswer: (outcome: { wasCorrect: boolean; isFuzzy: boolean; latencyMs: number; rawResponse: string | null } | { skipped: true; reviewRecorded: false }) => void }) {
    return (
      <div data-testid="stub-exercise">
        <button onClick={() => props.onAnswer({ wasCorrect: true, isFuzzy: false, latencyMs: 1000, rawResponse: 'Correct' })}>
          Mark correct
        </button>
        <button onClick={() => props.onAnswer({ wasCorrect: false, isFuzzy: false, latencyMs: 1000, rawResponse: 'Wrong' })}>
          Mark wrong
        </button>
        <button onClick={() => props.onAnswer({ skipped: true, reviewRecorded: false })}>
          Skip
        </button>
      </div>
    )
  }
  return {
    ...actual,
    resolveExerciseComponent: () => StubExercise as never,
  }
})

const activeReviewContext: CapabilityReviewSessionContext = {
  schedulerSnapshot: {
    stateVersion: 2,
    activationState: 'active',
    stability: 1,
    difficulty: 5,
    lastReviewedAt: '2026-04-24T10:00:00.000Z',
    nextDueAt: '2026-04-25T10:00:00.000Z',
    reviewCount: 1,
    lapseCount: 0,
    consecutiveFailureCount: 0,
  },
  currentStateVersion: 2,
  artifactVersionSnapshot: { artifactFingerprint: 'artifact-v1' },
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
  artifactVersionSnapshot: { artifactFingerprint: 'artifact-v1' },
  capabilityReadinessStatus: 'ready',
  capabilityPublicationStatus: 'published',
}

function plan(): SessionPlan {
  return {
    id: 'session-1',
    mode: 'standard',
    title: 'Dagelijkse Indonesische oefening',
    recapPolicy: 'standard',
    diagnostics: [],
    blocks: [
      {
        id: 'session-1:due:cap-1',
        kind: 'due_review',
        capabilityId: 'cap-1',
        canonicalKeySnapshot: 'item:makan:meaning_recall:id_to_l1',
        stateVersion: 2,
        reviewContext: activeReviewContext,
        renderPlan: {
          capabilityKey: 'item:makan:meaning_recall:id_to_l1',
          sourceRef: 'learning_items/makan',
          exerciseType: 'meaning_recall',
          capabilityType: 'meaning_recall',
          skillType: 'meaning_recall',
          requiredArtifacts: ['meaning:l1'],
        },
      },
      {
        id: 'session-1:new:cap-2',
        kind: 'new_introduction',
        capabilityId: 'cap-2',
        canonicalKeySnapshot: 'item:minum:text_recognition:id_to_l1',
        reviewContext: dormantReviewContext,
        pendingActivation: {
          capabilityId: 'cap-2',
          canonicalKeySnapshot: 'item:minum:text_recognition:id_to_l1',
          activationRequest: { reason: 'eligible_new_capability' },
          requiredActivationOwner: 'review_processor',
        },
        renderPlan: {
          capabilityKey: 'item:minum:text_recognition:id_to_l1',
          sourceRef: 'learning_items/minum',
          exerciseType: 'recognition_mcq',
          capabilityType: 'text_recognition',
          skillType: 'recognition',
          requiredArtifacts: ['base_text', 'meaning:l1'],
        },
      },
    ],
  }
}

function makeExerciseItem(): ExerciseItem {
  return {
    learningItem: { id: 'i', item_type: 'word', base_text: 'x', normalized_text: 'x', language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null, source_card_id: null, notes: null, is_active: true, pos: null, created_at: '', updated_at: '' },
    meanings: [], contexts: [], answerVariants: [],
    skillType: 'recognition', exerciseType: 'recognition_mcq',
  }
}

function ok(block: SessionBlock): CapabilityRenderContext {
  return { blockId: block.id, capabilityId: block.capabilityId, exerciseItem: makeExerciseItem(), audibleTexts: [], diagnostic: null }
}

function fail(block: SessionBlock): CapabilityRenderContext {
  return {
    blockId: block.id, capabilityId: block.capabilityId,
    exerciseItem: null, audibleTexts: [],
    diagnostic: { reasonCode: 'item_inactive', message: '', capabilityKey: block.canonicalKeySnapshot, capabilityId: block.capabilityId, exerciseType: block.renderPlan.exerciseType, blockId: block.id },
  }
}

function contextsAllResolved(p: SessionPlan): Map<string, CapabilityRenderContext> {
  return new Map(p.blocks.map(b => [b.id, ok(b)]))
}

const baseProps = {
  audioMap: new Map(),
  userLanguage: 'nl' as const,
  onAnswer: vi.fn(async () => {}),
  onComplete: vi.fn(),
}

describe('ExperiencePlayer (PR-3 dispatcher path)', () => {
  it('renders structural shell + dispatcher cards for resolved blocks', () => {
    const p = plan()
    render(<ExperiencePlayer {...baseProps} plan={p} contexts={contextsAllResolved(p)} />)

    expect(screen.getByRole('heading', { name: 'Dagelijkse Indonesische oefening' })).toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.textContent === '2 vaardigheidskaarten')).toBeInTheDocument()
    expect(screen.getAllByTestId('stub-exercise')).toHaveLength(2)
    expect(screen.getByRole('complementary', { name: 'Sessievoortgang' })).toBeInTheDocument()
    expect(screen.queryByText('item:makan:meaning_recall:id_to_l1')).not.toBeInTheDocument()
  })

  it('emits answer events with the dispatcher-built AnswerReport', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => {})
    const p = plan()
    render(<ExperiencePlayer {...baseProps} plan={p} contexts={contextsAllResolved(p)} onAnswer={onAnswer} />)

    await user.click(screen.getAllByRole('button', { name: 'Mark correct' })[0])

    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      blockId: 'session-1:due:cap-1',
      blockKind: 'due_review',
      exerciseType: 'meaning_recall',
      pendingActivation: false,
      answerReport: expect.objectContaining({
        wasCorrect: true,
        hintUsed: false,
        rawResponse: 'Correct',
        normalizedResponse: 'correct',  // legacy parity: lowercased + trimmed
      }),
    }))
  })

  it('skip outcome advances the queue without onAnswer', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => {})
    const p = plan()
    render(<ExperiencePlayer {...baseProps} plan={p} contexts={contextsAllResolved(p)} onAnswer={onAnswer} />)

    // Skip both blocks via the stub's Skip button. effectiveTotal (=2) reaches
    // answeredBlocks.size (=2) → "Sessie afronden" enables.
    const skips = screen.getAllByRole('button', { name: 'Skip' })
    await user.click(skips[0])
    await user.click(skips[1])

    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sessie afronden' })).toBeEnabled()
  })

  it('skipped (failed-resolution) blocks are excluded from effectiveTotal', async () => {
    const user = userEvent.setup()
    const p = plan()
    // First block resolves; second block fails resolution → silent skip.
    const contexts = new Map<string, CapabilityRenderContext>([
      [p.blocks[0].id, ok(p.blocks[0])],
      [p.blocks[1].id, fail(p.blocks[1])],
    ])
    render(<ExperiencePlayer {...baseProps} plan={p} contexts={contexts} />)

    // Only one stub-exercise rendered.
    expect(screen.getAllByTestId('stub-exercise')).toHaveLength(1)
    // Warm input shows the corrected count (effectiveTotal = 1, not 2).
    expect(screen.getByText((_, node) => node?.textContent === '1 vaardigheidskaarten')).toBeInTheDocument()

    // Answer the one renderable block; "Sessie afronden" enables — proves the
    // user is NOT stranded when blocks silent-skip.
    await user.click(screen.getByRole('button', { name: 'Mark correct' }))
    expect(screen.getByRole('button', { name: 'Sessie afronden' })).toBeEnabled()
  })

  it('completes via onComplete after all renderable blocks are answered', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    const p = plan()
    render(<ExperiencePlayer {...baseProps} plan={p} contexts={contextsAllResolved(p)} onComplete={onComplete} />)

    expect(screen.getByRole('button', { name: 'Rond af na de kaarten' })).toBeDisabled()

    // Each block has its own "Mark correct" button. Click both — index 0 then
    // index 1 (the array remains stable across re-renders since neither block
    // unmounts on answer; the dispatcher keeps the exercise rendered for the
    // component's own post-answer feedback).
    const buttons = screen.getAllByRole('button', { name: 'Mark correct' })
    await user.click(buttons[0])
    await user.click(buttons[1])
    expect(screen.getByRole('heading', { name: 'Sessieroute afgerond' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sessie afronden' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('shows submission error when onAnswer throws', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => { throw new Error('edge function unavailable') })
    const p = plan()
    render(<ExperiencePlayer {...baseProps} plan={p} contexts={contextsAllResolved(p)} onAnswer={onAnswer} />)

    await user.click(screen.getAllByRole('button', { name: 'Mark correct' })[0])

    expect(await screen.findByRole('alert')).toHaveTextContent('Je antwoord kon niet worden opgeslagen')
    expect(screen.getByText('0/2')).toBeInTheDocument()
  })
})
