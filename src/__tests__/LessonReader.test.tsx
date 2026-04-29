import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LessonReader } from '@/components/lessons/LessonReader'
import type { LessonExperience } from '@/lib/lessons/lessonExperience'

function experience(): LessonExperience {
  return {
    lessonId: 'lesson-id-1',
    sourceRef: 'lesson-1',
    title: 'Les 1 - Di Pasar',
    level: 'A1',
    sourceRefs: ['lesson-1', 'learning_items/makan'],
    blocks: [
      {
        id: 'lesson-1-hero',
        kind: 'lesson_hero',
        title: 'Les 1 - Di Pasar',
        sourceRef: 'lesson-1',
        sourceRefs: ['lesson-1'],
        contentUnitSlugs: [],
        displayOrder: 0,
        payload: { title: 'Les 1 - Di Pasar' },
        sourceProgressEvent: 'opened',
        capabilityKeyRefs: [],
      },
      {
        id: 'lesson-1-item-makan',
        kind: 'vocab_strip',
        title: 'Makan',
        sourceRef: 'lesson-1',
        sourceRefs: ['learning_items/makan'],
        contentUnitSlugs: ['item-makan'],
        displayOrder: 10,
        payload: { items: [{ indonesian: 'makan', dutch: 'eten' }] },
        sourceProgressEvent: 'section_exposed',
        capabilityKeyRefs: ['capability:makan'],
      },
      {
        id: 'lesson-1-practice',
        kind: 'practice_bridge',
        title: 'Practice',
        sourceRef: 'lesson-1',
        sourceRefs: ['learning_items/makan'],
        contentUnitSlugs: ['item-makan'],
        displayOrder: 20,
        payload: { label: 'Practice this content' },
        sourceProgressEvent: 'intro_completed',
        capabilityKeyRefs: ['capability:makan'],
      },
    ],
  }
}

describe('LessonReader', () => {
  it('renders a responsive web-native lesson flow with companion and progress rail', () => {
    render(
      <LessonReader
        experience={experience()}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onPractice={vi.fn()}
        onSourceProgress={vi.fn()}
      />
    )

    expect(screen.getAllByRole('heading', { name: 'Les 1 - Di Pasar' })[0]).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Lesvoortgang' })).toBeInTheDocument()
    expect(screen.getByLabelText('Lescontext')).toHaveTextContent('Oefenbruggen verwijzen naar vaardigheden')
    expect(screen.getByText('makan')).toBeInTheDocument()
  })

  it('emits source progress without activating FSRS', async () => {
    const user = userEvent.setup()
    const onSourceProgress = vi.fn()

    render(
      <LessonReader
        experience={experience()}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onPractice={vi.fn()}
        onSourceProgress={onSourceProgress}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Markeer sectie als gezien' }))

    expect(onSourceProgress).toHaveBeenCalledWith(expect.objectContaining({
      id: 'lesson-1-item-makan',
    }), 'section_exposed')
  })

  it('routes practice bridge through onPractice instead of creating review state', async () => {
    const user = userEvent.setup()
    const onPractice = vi.fn()

    render(
      <LessonReader
        experience={experience()}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onPractice={onPractice}
        onSourceProgress={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Oefen deze inhoud' }))

    expect(onPractice).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'practice_bridge',
      capabilityKeyRefs: ['capability:makan'],
    }))
  })
})
