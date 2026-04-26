import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExperiencePlayer } from '@/components/experience/ExperiencePlayer'
import type { SessionPlan } from '@/lib/session/sessionPlan'

function plan(): SessionPlan {
  return {
    id: 'session-1',
    mode: 'standard',
    title: 'Daily Indonesian practice',
    recapPolicy: 'standard',
    diagnostics: [],
    blocks: [
      {
        id: 'session-1:due:cap-1',
        kind: 'due_review',
        capabilityId: 'cap-1',
        canonicalKeySnapshot: 'item:makan:meaning_recall:id_to_l1',
        stateVersion: 2,
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

    expect(screen.getByRole('heading', { name: 'Daily Indonesian practice' })).toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.textContent === '2 capability cards')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'meaning recall' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'text recognition' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Session path in progress' })).toBeInTheDocument()
  })

  it('emits answer events without directly committing review state', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => {})

    render(<ExperiencePlayer plan={plan()} onAnswer={onAnswer} onComplete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'I knew this' }))

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
    expect(screen.getByText('Self-check captured for this preview. No FSRS review was written from this UI.')).toBeInTheDocument()
  })

  it('marks new introductions as pending Review Processor activation', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn(async () => {})

    render(<ExperiencePlayer plan={plan()} onAnswer={onAnswer} onComplete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Keep it gentle' }))

    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({
      blockKind: 'new_introduction',
      pendingActivation: true,
      answerReport: expect.objectContaining({
        wasCorrect: false,
        rawResponse: 'self_check_needs_practice',
      }),
    }))
    expect(screen.getByText('Preview self-check captured. Pending activation remains owned by the Review Processor.')).toBeInTheDocument()
  })

  it('only completes from recap after all capability cards are answered', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()

    render(<ExperiencePlayer plan={plan()} onAnswer={vi.fn(async () => {})} onComplete={onComplete} />)
    expect(screen.getByRole('button', { name: 'Finish after cards' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'I knew this' }))
    await user.click(screen.getByRole('button', { name: 'Feels familiar' }))
    expect(screen.getByRole('heading', { name: 'Session path complete' })).toBeInTheDocument()
    expect(screen.getByText('Reviewed preview')).toBeInTheDocument()
    expect(screen.getByText('Introduced preview')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Finish session' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
