import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LessonReader } from '@/components/lessons/LessonReader'
import type { LessonExperience } from '@/lib/lessons'

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
      },
    ],
  }
}

function renderReader(props: Partial<Parameters<typeof LessonReader>[0]> = {}) {
  return render(
    <MemoryRouter>
      <LessonReader
        experience={experience()}
        onBack={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('LessonReader', () => {
  it('renders a responsive web-native lesson flow with companion and progress rail', () => {
    renderReader()

    expect(screen.getAllByRole('heading', { name: 'Les 1 - Di Pasar' })[0]).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Lesvoortgang' })).toBeInTheDocument()
    expect(screen.getByLabelText('Lescontext')).toHaveTextContent('Oefenbruggen verwijzen naar vaardigheden')
    expect(screen.getByText('makan')).toBeInTheDocument()
  })

  it('renders block titles in display order', () => {
    renderReader()
    const headings = screen.getAllByRole('heading')
      .map(node => node.textContent)
      .filter((text): text is string => Boolean(text))
    expect(headings.indexOf('Makan')).toBeLessThan(headings.indexOf('Practice'))
  })

  it('does not render any "mark as seen" affordances after retirement #6', () => {
    renderReader()

    expect(screen.queryByRole('button', { name: /Markeer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /opmerkt/i })).not.toBeInTheDocument()
  })

  it('renders the lesson audio panel when an audio URL is provided', () => {
    renderReader({
      lessonAudioUrl: '/lesson.mp3',
      lessonDurationSeconds: 600,
    })

    const player = screen.getByTestId('lesson-audio-player')
    expect(player).toHaveAttribute('src', '/lesson.mp3')
    expect(screen.getByText('10 min')).toBeInTheDocument()
  })

  it('renders practice action links from the supplied actions array', () => {
    renderReader({
      actions: [
        {
          kind: 'practice',
          label: 'Oefen deze les · 3 klaar',
          href: '/session?lesson=lesson-1&mode=lesson_practice',
          priority: 'primary',
        },
      ],
    })

    const link = screen.getByRole('link', { name: /Oefen deze les · 3 klaar/i })
    expect(link).toHaveAttribute('href', '/session?lesson=lesson-1&mode=lesson_practice')
  })
})
