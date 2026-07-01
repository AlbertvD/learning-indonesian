import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Lessons } from '@/pages/Lessons'
import * as lessonsAdapter from '@/lib/lessons/adapter'

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

vi.mock('@/lib/lessons/adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/lessons/adapter')>()
  return {
    ...actual,
    getLessonsOverview: vi.fn(),
  }
})

// "Prepared" (openable) = the lesson has a bespoke page, i.e. registry
// membership. Mock the registry id-set so tests control which lessons are
// openable (replaces the retired has_page_blocks RPC signal).
const { preparedLessonIdSet } = vi.hoisted(() => ({ preparedLessonIdSet: new Set<string>() }))
vi.mock('@/pages/lessons/registry', () => ({
  bespokeLessonIdSet: preparedLessonIdSet,
  bespokeLessonHeroByOrderIndex: new Map<number, string>(),
}))

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

// Helper: synthesize a row matching indonesian.get_lessons_overview's
// RETURNS TABLE shape (2026-06-09 two-sources: is_activated +
// mastered_capability_count; no has_started_lesson / practiced count).
function overviewRow(opts: {
  lessonId: string
  orderIndex: number
  title: string
  level?: string | null
  isActivated?: boolean
  readyCapabilityCount?: number
  masteredCapabilityCount?: number
  practicedCapabilityCount?: number
  lessonSections?: any[]
}): any {
  return {
    lesson_id: opts.lessonId,
    order_index: opts.orderIndex,
    title: opts.title,
    level: opts.level ?? 'A1',
    description: null,
    audio_path: null,
    duration_seconds: null,
    primary_voice: null,
    publication_status: 'published',
    is_published: true,
    lesson_sections: opts.lessonSections ?? [],
    is_activated: opts.isActivated ?? false,
    ready_capability_count: opts.readyCapabilityCount ?? 0,
    mastered_capability_count: opts.masteredCapabilityCount ?? 0,
    practiced_capability_count: opts.practicedCapabilityCount ?? 0,
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
    // Default: both fixture lessons have a bespoke page (openable).
    preparedLessonIdSet.clear()
    preparedLessonIdSet.add('lesson-1')
    preparedLessonIdSet.add('lesson-2')
    vi.mocked(lessonsAdapter.getLessonsOverview).mockResolvedValue(defaultOverviewRows())
  })

  it('renders every lesson grouped under its CEFR level, no recommended-lesson hero', async () => {
    const { container } = renderLessons()

    // Lessons are grouped into collapsible CEFR sections (§7.3); both fixtures
    // are A1, and the current level opens by default, so both are visible.
    const list = await screen.findByRole('list', { name: 'A1' })
    expect(within(list).getByText('Lesson 1')).toBeInTheDocument()
    expect(within(list).getByText('Lesson 2')).toBeInTheDocument()
    // The recommended-lesson hero was retired.
    expect(screen.queryByText('Recommended lesson')).not.toBeInTheDocument()
    expect(screen.queryByText('Start with Lesson 1')).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent(/no lessons completed/i)
  })

  it('shows the title, level badge, status, and full grammar row for a not-activated lesson (no CTA, bars hidden)', async () => {
    const { container } = renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(lessonOne).toHaveTextContent('Lesson 1')
    expect(lessonOne).toHaveTextContent('Not started')
    expect(lessonOne).toHaveTextContent('A1') // CEFR level badge
    expect(lessonOne).toHaveTextContent('word order') // grammar row
    // The redundant CTA label is gone (the card itself is the link).
    expect(lessonOne).not.toHaveTextContent(/Open lesson|Continue/i)
    // Not activated → bars hidden → no progress labels.
    expect(lessonOne).not.toHaveTextContent(/geoefend|practiced|beheerst|mastered/i)
    // The number appears once (in the banner), not also as an eyebrow "LES 1".
    expect(lessonOne).not.toHaveTextContent(/LES 1/i)

    expect(container.querySelector('[class*="progressBar"]')).toBeNull()
    expect(container).not.toHaveTextContent(/source progress|fsrs|content health|eligible|in practice|later/i)
  })

  it('shows an activated lesson as Active with both nested progress bars and no CTA', async () => {
    vi.mocked(lessonsAdapter.getLessonsOverview).mockResolvedValue([
      overviewRow({
        lessonId: 'lesson-1',
        orderIndex: 1,
        title: 'Lesson 1 (Di pasar)',
        lessonSections: lesson1Sections,
        isActivated: true,
        readyCapabilityCount: 9,
        masteredCapabilityCount: 7,
        practicedCapabilityCount: 9,
      }),
      overviewRow({ lessonId: 'lesson-2', orderIndex: 2, title: 'Lesson 2', lessonSections: lesson2Sections }),
    ])

    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(lessonOne).toHaveTextContent('Active')
    expect(lessonOne).toHaveTextContent('mastered') // beheerst bar label (en)
    expect(lessonOne).toHaveTextContent('78%')      // 7/9 mastered
    expect(lessonOne).toHaveTextContent('practiced') // geoefend bar label
    expect(lessonOne).toHaveTextContent('100%')     // 9/9 practiced
    expect(lessonOne).not.toHaveTextContent(/Continue|Doorgaan/i)
  })

  it('suppresses % mastered for an activated lesson with no introducible caps', async () => {
    vi.mocked(lessonsAdapter.getLessonsOverview).mockResolvedValue([
      overviewRow({
        lessonId: 'lesson-1',
        orderIndex: 1,
        title: 'Lesson 1 (Di pasar)',
        lessonSections: lesson1Sections,
        isActivated: true,
        readyCapabilityCount: 0,
        masteredCapabilityCount: 0,
      }),
      overviewRow({ lessonId: 'lesson-2', orderIndex: 2, title: 'Lesson 2', lessonSections: lesson2Sections }),
    ])

    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(lessonOne).toHaveTextContent('Active')
    // No introducible caps → both bars hidden → no progress labels.
    expect(lessonOne).not.toHaveTextContent(/beheerst|mastered|geoefend|practiced/i)
  })

  it('shows lessons without a bespoke page as coming later instead of openable', async () => {
    preparedLessonIdSet.delete('lesson-2') // lesson-2 has no bespoke page
    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(within(lessonOne).getByRole('link')).toHaveAttribute('href', '/lesson/lesson-1')

    const lessonTwo = screen.getByTestId('lesson-overview-row-lesson-2')
    expect(lessonTwo).toHaveTextContent('Coming later')
    expect(within(lessonTwo).queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not sequentially lock later lessons (no order-gate)', async () => {
    // lesson-1 barely started; under the old order-gate lesson-2 would have been
    // forced to "Later" with no link. It must stay openable.
    vi.mocked(lessonsAdapter.getLessonsOverview).mockResolvedValue([
      overviewRow({
        lessonId: 'lesson-1', orderIndex: 1, title: 'Lesson 1 (Di pasar)',
        lessonSections: lesson1Sections, isActivated: true,
        readyCapabilityCount: 20, masteredCapabilityCount: 0,
      }),
      overviewRow({ lessonId: 'lesson-2', orderIndex: 2, title: 'Lesson 2', lessonSections: lesson2Sections }),
    ])

    renderLessons()

    const lessonTwo = await screen.findByTestId('lesson-overview-row-lesson-2')
    expect(within(lessonTwo).getByRole('link')).toHaveAttribute('href', '/lesson/lesson-2')
    expect(lessonTwo).not.toHaveTextContent('Later')
  })

  it('keeps lessons openable (whole card links) when the overview load works', async () => {
    renderLessons()

    const lessonOne = await screen.findByTestId('lesson-overview-row-lesson-1')
    expect(within(lessonOne).getByRole('link')).toHaveAttribute('href', '/lesson/lesson-1')
    const lessonTwo = screen.getByTestId('lesson-overview-row-lesson-2')
    expect(within(lessonTwo).getByRole('link')).toHaveAttribute('href', '/lesson/lesson-2')
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
})
