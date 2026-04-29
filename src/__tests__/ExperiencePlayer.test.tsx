import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExperiencePlayer } from '@/components/experience/ExperiencePlayer'
import type { CapabilityReviewSessionContext } from '@/lib/session/sessionPlan'
import type { SessionPlan } from '@/lib/session/sessionPlan'

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

describe('ExperiencePlayer', () => {
  it('renders a warm input, capability blocks, and recap for desktop/mobile flow', () => {
    render(<ExperiencePlayer plan={plan()} onAnswer={vi.fn()} onComplete={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Dagelijkse Indonesische oefening' })).toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.textContent === '2 vaardigheidskaarten')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Betekenis ophalen' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tekst herkennen' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sessieroute bezig' })).toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.queryByText('item:makan:meaning_recall:id_to_l1')).not.toBeInTheDocument()
    expect(screen.queryByText('item:minum:text_recognition:id_to_l1')).not.toBeInTheDocument()
  })

  it('emits answer events without directly committing review state', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => {})

    render(<ExperiencePlayer plan={plan()} onAnswer={onAnswer} onComplete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Dit wist ik' }))

    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      blockId: 'session-1:due:cap-1',
      blockKind: 'due_review',
      capabilityId: 'cap-1',
      exerciseType: 'meaning_recall',
      pendingActivation: false,
      answerReport: expect.objectContaining({
        wasCorrect: true,
        hintUsed: false,
        rawResponse: 'self_check_known',
      }),
    }))
    expect(screen.getByText('Antwoord opgeslagen. Je herhalingsplanning is bijgewerkt.')).toBeInTheDocument()
  })

  it('keeps the card unanswered and shows a save error when review commit fails', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => {
      throw new Error('edge function unavailable')
    })

    render(<ExperiencePlayer plan={plan()} onAnswer={onAnswer} onComplete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Dit wist ik' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Je antwoord kon niet worden opgeslagen')
    expect(screen.getByText('0/2')).toBeInTheDocument()
    expect(screen.queryByText('Antwoord opgeslagen. Je herhalingsplanning is bijgewerkt.')).not.toBeInTheDocument()
  })

  it('marks new introductions as pending Review Processor activation', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => {})

    render(<ExperiencePlayer plan={plan()} onAnswer={onAnswer} onComplete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Rustig opbouwen' }))

    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({
      blockKind: 'new_introduction',
      pendingActivation: true,
      answerReport: expect.objectContaining({
        wasCorrect: false,
        rawResponse: 'self_check_needs_practice',
      }),
    }))
    expect(screen.getByText('Introductie opgeslagen. Je planning wordt bijgewerkt door de reviewverwerker.')).toBeInTheDocument()
  })

  it('only completes from recap after all capability cards are answered', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()

    render(<ExperiencePlayer plan={plan()} onAnswer={vi.fn(async () => {})} onComplete={onComplete} />)
    expect(screen.getByRole('button', { name: 'Rond af na de kaarten' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Dit wist ik' }))
    await user.click(screen.getByRole('button', { name: 'Voelt bekend' }))
    expect(screen.getByRole('heading', { name: 'Sessieroute afgerond' })).toBeInTheDocument()
    expect(screen.getByText('Herhaling opgeslagen')).toBeInTheDocument()
    expect(screen.getByText('Introductie gestart')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sessie afronden' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
