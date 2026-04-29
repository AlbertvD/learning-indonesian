import { render, screen, waitFor, within } from '@testing-library/react'
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
      getLessonPageBlocks: vi.fn(),
      getLessonSourceProgress: vi.fn(),
      getLessonCapabilityPracticeSummary: vi.fn(),
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

function pageBlock(sourceRef: string) {
  return {
    block_key: `${sourceRef}-grammar`,
    source_ref: sourceRef,
    source_refs: [sourceRef],
    content_unit_slugs: [],
    block_kind: 'section',
    display_order: 10,
    payload_json: { type: 'grammar', title: 'Grammar' },
    source_progress_event: 'section_exposed',
    capability_key_refs: [],
  } as any
}

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
    sessionStorage.clear()
    vi.mocked(lessonService.getLessons).mockResolvedValue(lessons)
    vi.mocked(lessonService.getLessonPageBlocks).mockImplementation(async (sourceRef) => [pageBlock(String(sourceRef))])
    vi.mocked(lessonService.getLessonSourceProgress).mockResolvedValue([])
    vi.mocked(lessonService.getLessonCapabilityPracticeSummary).mockResolvedValue({
      readyCapabilityCount: 0,
      activePracticedCapabilityCount: 0,
    } as any)
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

  it('shows lessons without page blocks as coming later instead of openable', async () => {
    vi.mocked(lessonService.getLessonPageBlocks).mockImplementation(async (sourceRef) => (
      sourceRef === 'lesson-1' ? [pageBlock('lesson-1')] : []
    ))

    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(within(lessonOne).getByRole('link')).toHaveAttribute('href', '/lesson/lesson-1')

    const lessonTwo = screen.getByTestId('lesson-overview-row-lesson-2')
    expect(lessonTwo).toHaveTextContent('Coming later')
    expect(lessonTwo).toHaveTextContent('Not available yet')
    expect(within(lessonTwo).queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not recommend an unprepared first lesson', async () => {
    vi.mocked(lessonService.getLessonPageBlocks).mockImplementation(async (sourceRef) => (
      sourceRef === 'lesson-2' ? [pageBlock('lesson-2')] : []
    ))

    renderLessons()

    expect(await screen.findByTestId('lesson-overview-row-lesson-1')).toHaveTextContent('Coming later')
    expect(screen.queryByText('Recommended lesson')).not.toBeInTheDocument()
    expect(screen.queryByText('Start with Lesson 1')).not.toBeInTheDocument()
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

  it('restores the overview scroll position when returning from a lesson', async () => {
    sessionStorage.setItem('lessons:overview-scroll-y', '420')
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)

    renderLessons()

    await screen.findByTestId('lesson-overview-row-lesson-1')
    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalledWith(0, 420)
    })

    scrollToSpy.mockRestore()
  })

  it('does not show search or filter controls on the compact lesson overview', async () => {
    renderLessons()

    await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/search|filter/i)).not.toBeInTheDocument()
  })

  it('uses v2 source progress and capability counts to show a ready-to-practice lesson status', async () => {
    vi.mocked(lessonService.getLessonPageBlocks).mockImplementation(async (sourceRef) => {
      if (sourceRef !== 'lesson-1') return []
      return [
        {
          block_key: 'lesson-1-grammar',
          source_ref: 'lesson-1',
          source_refs: ['lesson-1'],
          content_unit_slugs: [],
          block_kind: 'section',
          display_order: 10,
          payload_json: { type: 'grammar', title: 'Grammar' },
          source_progress_event: 'section_exposed',
          capability_key_refs: ['capability-1', 'capability-2'],
        },
      ] as any
    })
    vi.mocked(lessonService.getLessonSourceProgress).mockResolvedValue([
      {
        source_ref: 'lesson-1',
        source_section_ref: 'lesson-1-grammar',
        current_state: 'heard_once',
        completed_event_types: ['heard_once'],
        last_event_at: '2026-04-29T10:00:00Z',
      },
    ])
    vi.mocked(lessonService.getLessonCapabilityPracticeSummary).mockImplementation(async (_userId, sourceRefs) => (
      sourceRefs.includes('lesson-1')
        ? { readyCapabilityCount: 2, activePracticedCapabilityCount: 0 } as any
        : { readyCapabilityCount: 0, activePracticedCapabilityCount: 0 } as any
    ))

    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(lessonOne).toHaveTextContent('Ready to practice')
    expect(lessonOne).toHaveTextContent('Open lesson')
    expect(lessonOne).not.toHaveTextContent(/Review this lesson|Practice this lesson|\d+\s+ready/i)
  })

  it('does not use stale legacy lesson progress as v2 practice readiness exposure', async () => {
    vi.mocked(lessonService.getUserLessonProgress).mockResolvedValue([
      {
        lesson_id: 'lesson-1',
        sections_completed: ['legacy-section-1'],
        completed_at: null,
      },
    ] as any)
    vi.mocked(lessonService.getLessonCapabilityPracticeSummary).mockImplementation(async (_userId, sourceRefs) => (
      sourceRefs.includes('lesson-1')
        ? { readyCapabilityCount: 2, activePracticedCapabilityCount: 0 } as any
        : { readyCapabilityCount: 0, activePracticedCapabilityCount: 0 } as any
    ))

    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(lessonOne).toHaveTextContent('In progress')
    expect(lessonOne).not.toHaveTextContent('Ready to practice')
  })

  it('uses practiced capability counts to show in-practice and practiced lesson statuses', async () => {
    vi.mocked(lessonService.getLessonPageBlocks).mockImplementation(async (sourceRef) => [
      {
        block_key: `${sourceRef}-grammar`,
        source_ref: sourceRef,
        source_refs: [sourceRef],
        content_unit_slugs: [],
        block_kind: 'section',
        display_order: 10,
        payload_json: { type: 'grammar', title: 'Grammar' },
        source_progress_event: 'section_exposed',
        capability_key_refs: [],
      },
    ] as any)
    vi.mocked(lessonService.getLessonSourceProgress).mockResolvedValue([
      {
        source_ref: 'lesson-1',
        source_section_ref: 'lesson-1-grammar',
        current_state: 'heard_once',
        completed_event_types: ['heard_once'],
        last_event_at: '2026-04-29T10:00:00Z',
      },
      {
        source_ref: 'lesson-2',
        source_section_ref: 'lesson-2-grammar',
        current_state: 'intro_completed',
        completed_event_types: ['intro_completed'],
        last_event_at: '2026-04-29T10:05:00Z',
      },
    ])
    vi.mocked(lessonService.getLessonCapabilityPracticeSummary).mockImplementation(async (_userId, sourceRefs) => {
      if (sourceRefs.includes('lesson-1')) return { readyCapabilityCount: 2, activePracticedCapabilityCount: 2 } as any
      if (sourceRefs.includes('lesson-2')) return { readyCapabilityCount: 4, activePracticedCapabilityCount: 1 } as any
      return { readyCapabilityCount: 0, activePracticedCapabilityCount: 0 } as any
    })

    renderLessons()

    expect(await screen.findByTestId('lesson-overview-row-lesson-1')).toHaveTextContent('Practiced')
    expect(screen.getByTestId('lesson-overview-row-lesson-2')).toHaveTextContent('In practice')
    expect(screen.queryByRole('link', { name: /Review this lesson|Practice this lesson/i })).not.toBeInTheDocument()
  })
})
