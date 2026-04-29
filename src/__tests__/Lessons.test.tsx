import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Lessons } from '@/pages/Lessons'
import { lessonService } from '@/services/lessonService'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: any) => unknown) =>
    selector({
      user: { id: 'user-1', email: 'learner@example.test' },
      profile: { language: 'en' },
    }),
  ),
}))

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('@/services/lessonService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/lessonService')>()
  return {
    ...actual,
    lessonService: {
      ...actual.lessonService,
      getLessons: vi.fn(),
      getUserLessonProgress: vi.fn(),
    },
  }
})

const lessons = [
  {
    id: 'lesson-1',
    title: 'Lesson 1 (Di pasar)',
    order_index: 1,
    lesson_sections: [
      {
        id: 'section-1',
        lesson_id: 'lesson-1',
        title: 'Grammar: word order',
        order_index: 1,
        content: { type: 'grammar', body: 'Word order notes.' },
      },
    ],
  },
  {
    id: 'lesson-2',
    title: 'Lesson 2',
    order_index: 2,
    lesson_sections: [
      {
        id: 'section-2',
        lesson_id: 'lesson-2',
        title: 'Grammar: negation',
        order_index: 1,
        content: { type: 'grammar', categories: [{ title: 'negation' }] },
      },
    ],
  },
] as any[]

function renderLessons() {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <Notifications />
        <Lessons />
      </MantineProvider>
    </MemoryRouter>,
  )
}

describe('Lessons overview', () => {
  beforeEach(() => {
    vi.mocked(lessonService.getLessons).mockResolvedValue(lessons)
    vi.mocked(lessonService.getUserLessonProgress).mockResolvedValue([])
  })

  it('renders a recommended lesson card and keeps that lesson in the ordered list', async () => {
    const { container } = renderLessons()

    expect(await screen.findByText('Recommended lesson')).toBeInTheDocument()
    expect(screen.getByText('Start with Lesson 1')).toBeInTheDocument()
    expect(screen.getByText('Listen to the explanation and read the first examples to prepare your first practice.')).toBeInTheDocument()

    const list = screen.getByRole('list', { name: 'Lessons' })
    expect(within(list).getByText('Lesson 1')).toBeInTheDocument()
    expect(within(list).getByText('Lesson 2')).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/no lessons completed/i)
  })

  it('shows title, status, action, and grammar tag without overview practice clutter', async () => {
    const { container } = renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(lessonOne).toHaveTextContent('Lesson 1')
    expect(lessonOne).toHaveTextContent('Not started')
    expect(lessonOne).toHaveTextContent('Open lesson')
    expect(lessonOne).toHaveTextContent('Grammar: word order')

    const lessonTwo = screen.getByTestId('lesson-overview-row-lesson-2')
    expect(lessonTwo).toHaveTextContent('Later')
    expect(lessonTwo).toHaveTextContent('Open lesson')

    expect(container.querySelector('[class*="progressBar"]')).toBeNull()
    expect(screen.queryByRole('link', { name: /^Practice$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+\s+ready/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+\s+min/i)).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent(/source progress|fsrs|content health|eligible/i)
  })

  it('uses Continue for in-progress lessons', async () => {
    vi.mocked(lessonService.getUserLessonProgress).mockResolvedValue([
      {
        lesson_id: 'lesson-1',
        sections_completed: ['section-1'],
        completed_at: null,
      },
    ] as any)

    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(lessonOne).toHaveTextContent('In progress')
    expect(lessonOne).toHaveTextContent('Continue')
  })

  it('keeps lessons openable when progress cannot be refreshed', async () => {
    vi.mocked(lessonService.getUserLessonProgress).mockRejectedValue(new Error('progress unavailable'))

    renderLessons()

    expect(await screen.findByText('Lesson progress could not be refreshed.')).toBeInTheDocument()
    expect(screen.getByTestId('lesson-overview-row-lesson-1')).toHaveTextContent('Open lesson')
    expect(screen.getByTestId('lesson-overview-row-lesson-2')).toHaveTextContent('Open lesson')
  })
})
