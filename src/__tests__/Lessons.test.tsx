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
      getLessonsOverview: vi.fn(),
    },
  }
})

const lesson1Sections = [
  {
    id: 'section-1',
    lesson_id: 'lesson-1',
    title: 'Grammar: word order',
    order_index: 1,
    content: { type: 'grammar', body: 'Word order notes.' },
  },
]

const lesson2Sections = [
  {
    id: 'section-2',
    lesson_id: 'lesson-2',
    title: 'Grammar: negation',
    order_index: 1,
    content: { type: 'grammar', categories: [{ title: 'negation' }] },
  },
]

// Helper: synthesize a row matching indonesian.get_lessons_overview's RETURNS TABLE shape.
function overviewRow(opts: {
  lessonId: string
  orderIndex: number
  title: string
  hasStartedLesson?: boolean
  hasMeaningfulExposure?: boolean
  hasPageBlocks?: boolean
  readyCapabilityCount?: number
  practicedEligibleCapabilityCount?: number
  lessonSections?: any[]
}): any {
  return {
    lesson_id: opts.lessonId,
    order_index: opts.orderIndex,
    title: opts.title,
    description: null,
    audio_path: null,
    duration_seconds: null,
    primary_voice: null,
    publication_status: 'published',
    is_published: true,
    lesson_sections: opts.lessonSections ?? [],
    has_started_lesson: opts.hasStartedLesson ?? false,
    has_meaningful_exposure: opts.hasMeaningfulExposure ?? false,
    has_page_blocks: opts.hasPageBlocks ?? true,
    ready_capability_count: opts.readyCapabilityCount ?? 0,
    practiced_eligible_capability_count: opts.practicedEligibleCapabilityCount ?? 0,
  }
}

const defaultOverviewRows = () => [
  overviewRow({ lessonId: 'lesson-1', orderIndex: 1, title: 'Lesson 1 (Di pasar)', lessonSections: lesson1Sections }),
  overviewRow({ lessonId: 'lesson-2', orderIndex: 2, title: 'Lesson 2', lessonSections: lesson2Sections }),
]

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
    vi.mocked(lessonService.getLessonsOverview).mockResolvedValue(defaultOverviewRows())
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
    vi.mocked(lessonService.getLessonsOverview).mockResolvedValue([
      overviewRow({ lessonId: 'lesson-1', orderIndex: 1, title: 'Lesson 1 (Di pasar)', lessonSections: lesson1Sections, hasPageBlocks: true }),
      overviewRow({ lessonId: 'lesson-2', orderIndex: 2, title: 'Lesson 2', lessonSections: lesson2Sections, hasPageBlocks: false }),
    ])

    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(within(lessonOne).getByRole('link')).toHaveAttribute('href', '/lesson/lesson-1')

    const lessonTwo = screen.getByTestId('lesson-overview-row-lesson-2')
    expect(lessonTwo).toHaveTextContent('Coming later')
    expect(lessonTwo).toHaveTextContent('Not available yet')
    expect(within(lessonTwo).queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not recommend an unprepared first lesson', async () => {
    vi.mocked(lessonService.getLessonsOverview).mockResolvedValue([
      overviewRow({ lessonId: 'lesson-1', orderIndex: 1, title: 'Lesson 1 (Di pasar)', lessonSections: lesson1Sections, hasPageBlocks: false }),
      overviewRow({ lessonId: 'lesson-2', orderIndex: 2, title: 'Lesson 2', lessonSections: lesson2Sections, hasPageBlocks: true }),
    ])

    renderLessons()

    expect(await screen.findByTestId('lesson-overview-row-lesson-1')).toHaveTextContent('Coming later')
    expect(screen.queryByText('Recommended lesson')).not.toBeInTheDocument()
    expect(screen.queryByText('Start with Lesson 1')).not.toBeInTheDocument()
  })

  it('uses Continue for in-progress lessons', async () => {
    vi.mocked(lessonService.getLessonsOverview).mockResolvedValue([
      overviewRow({ lessonId: 'lesson-1', orderIndex: 1, title: 'Lesson 1 (Di pasar)', lessonSections: lesson1Sections, hasStartedLesson: true }),
      overviewRow({ lessonId: 'lesson-2', orderIndex: 2, title: 'Lesson 2', lessonSections: lesson2Sections }),
    ])

    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(lessonOne).toHaveTextContent('In progress')
    expect(lessonOne).toHaveTextContent('Continue')
  })

  it('keeps lessons openable when overview load works', async () => {
    // The legacy partial-failure case (progress unavailable but lessons still
    // load) collapses with a single SQL function: either it succeeds end-to-end
    // or the page falls into the loadFailed empty-model state. The "openable
    // when partial fails" guarantee is now the responsibility of the SQL
    // function staying robust against missing per-user data (LEFT JOINs do
    // this correctly — verified by the function definition).
    renderLessons()

    expect(await screen.findByTestId('lesson-overview-row-lesson-1')).toHaveTextContent('Open lesson')
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
    vi.mocked(lessonService.getLessonsOverview).mockResolvedValue([
      overviewRow({
        lessonId: 'lesson-1',
        orderIndex: 1,
        title: 'Lesson 1 (Di pasar)',
        lessonSections: lesson1Sections,
        hasMeaningfulExposure: true,
        hasStartedLesson: true,
        readyCapabilityCount: 2,
        practicedEligibleCapabilityCount: 0,
      }),
      overviewRow({
        lessonId: 'lesson-2',
        orderIndex: 2,
        title: 'Lesson 2',
        lessonSections: lesson2Sections,
      }),
    ])

    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(lessonOne).toHaveTextContent('Ready to practice')
    expect(lessonOne).toHaveTextContent('Open lesson')
    expect(lessonOne).not.toHaveTextContent(/Review this lesson|Practice this lesson|\d+\s+ready/i)
  })

  it('does not use stale legacy lesson progress as v2 practice readiness exposure', async () => {
    // Legacy lesson_progress alone (without source-progress events from the v2
    // reader) should produce "In progress" status — NOT "Ready to practice"
    // even when ready capabilities exist. has_started_lesson=true (lesson_progress)
    // but has_meaningful_exposure=false (no v2 source-progress events).
    vi.mocked(lessonService.getLessonsOverview).mockResolvedValue([
      overviewRow({
        lessonId: 'lesson-1',
        orderIndex: 1,
        title: 'Lesson 1 (Di pasar)',
        lessonSections: lesson1Sections,
        hasStartedLesson: true,
        hasMeaningfulExposure: false,
        readyCapabilityCount: 2,
        practicedEligibleCapabilityCount: 0,
      }),
      overviewRow({ lessonId: 'lesson-2', orderIndex: 2, title: 'Lesson 2', lessonSections: lesson2Sections }),
    ])

    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(lessonOne).toHaveTextContent('In progress')
    expect(lessonOne).not.toHaveTextContent('Ready to practice')
  })

  it('uses practiced capability counts to show in-practice and practiced lesson statuses', async () => {
    vi.mocked(lessonService.getLessonsOverview).mockResolvedValue([
      overviewRow({
        lessonId: 'lesson-1',
        orderIndex: 1,
        title: 'Lesson 1 (Di pasar)',
        lessonSections: lesson1Sections,
        hasMeaningfulExposure: true,
        hasStartedLesson: true,
        readyCapabilityCount: 2,
        practicedEligibleCapabilityCount: 2,
      }),
      overviewRow({
        lessonId: 'lesson-2',
        orderIndex: 2,
        title: 'Lesson 2',
        lessonSections: lesson2Sections,
        hasMeaningfulExposure: true,
        hasStartedLesson: true,
        readyCapabilityCount: 4,
        practicedEligibleCapabilityCount: 1,
      }),
    ])

    renderLessons()

    expect(await screen.findByTestId('lesson-overview-row-lesson-1')).toHaveTextContent('Practiced')
    expect(screen.getByTestId('lesson-overview-row-lesson-2')).toHaveTextContent('In practice')
    expect(screen.queryByRole('link', { name: /Review this lesson|Practice this lesson/i })).not.toBeInTheDocument()
  })
})
