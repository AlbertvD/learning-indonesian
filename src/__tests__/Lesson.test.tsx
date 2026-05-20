import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Lesson } from '@/pages/Lesson'
import { lessonService } from '@/services/lessonService'
import { progressService } from '@/services/progressService'
import * as activationModule from '@/lib/lessons/activation'

vi.mock('@/lib/featureFlags', () => ({
  capabilityMigrationFlags: {
    lessonReaderV2: true,
    standardSession: false,
    sessionDiagnostics: false,
    reviewShadow: false,
    reviewCompat: false,
    experiencePlayerV1: false,
    localContentPreview: false,
  },
}))

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
      getUserLessonProgress: vi.fn(),
      getAudioUrl: vi.fn(),
      getLesson: vi.fn(),
      getLessonPageBlocks: vi.fn(),
      getLessonCapabilityPracticeSummary: vi.fn(),
    },
  }
})

vi.mock('@/lib/lessons/activation', () => ({
  isLessonActivated: vi.fn(),
  setLessonActivated: vi.fn(),
  listActivatedLessons: vi.fn(),
}))

vi.mock('@/services/learningItemService', () => ({
  learningItemService: {
    getByLesson: vi.fn().mockResolvedValue([]),
    getMeaningsBatch: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/services/learnerStateService', () => ({
  learnerStateService: {
    getItemStates: vi.fn().mockResolvedValue([]),
    getSkillStatesBatch: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/services/progressService', () => ({
  progressService: {
    markLessonComplete: vi.fn().mockResolvedValue(undefined),
  },
}))

function SessionLocation() {
  const location = useLocation()
  return <div>Session page {location.pathname}{location.search}</div>
}

function renderLesson() {
  return render(
    <MemoryRouter initialEntries={['/lesson/lesson-4']}>
      <MantineProvider>
        <Notifications />
        <Routes>
          <Route path="/lesson/:lessonId" element={<Lesson />} />
          <Route path="/session" element={<SessionLocation />} />
        </Routes>
      </MantineProvider>
    </MemoryRouter>,
  )
}

describe('Lesson page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(lessonService.getLesson).mockResolvedValue({
      id: 'lesson-4',
      module_id: 'module-1',
      level: 'A1',
      title: 'Lesson 4',
      description: null,
      order_index: 4,
      created_at: '2026-04-01T00:00:00Z',
      audio_path: null,
      duration_seconds: null,
      transcript_dutch: null,
      transcript_indonesian: null,
      transcript_english: null,
      primary_voice: null,
      dialogue_voices: null,
      lesson_sections: [],
    })
    vi.mocked(lessonService.getLessonPageBlocks).mockResolvedValue([
      {
        block_key: 'lesson-4-grammar',
        source_ref: 'lesson-4',
        source_refs: ['lesson-4'],
        content_unit_slugs: [],
        block_kind: 'section',
        display_order: 10,
        payload_json: {
          type: 'grammar',
          title: 'Grammar',
          body: 'Grammar notes.',
          audioUrl: '/grammar.mp3',
        },
      },
    ] as any)
    vi.mocked(lessonService.getLessonCapabilityPracticeSummary).mockResolvedValue({
      readyCapabilityCount: 2,
      activePracticedCapabilityCount: 0,
    })
    vi.mocked(lessonService.getUserLessonProgress).mockResolvedValue([])
    vi.mocked(lessonService.getAudioUrl).mockReturnValue('/lesson-audio.mp3')
    vi.mocked(activationModule.isLessonActivated).mockResolvedValue(false)
    vi.mocked(activationModule.setLessonActivated).mockResolvedValue(undefined)
  })

  it('renders an inactive activation checkbox by default', async () => {
    renderLesson()
    const checkbox = await screen.findByTestId('lesson-activation-checkbox')
    expect(checkbox).toBeInTheDocument()
    expect((checkbox as HTMLInputElement).checked).toBe(false)
  })

  it('reflects an existing activation when the lesson is already activated', async () => {
    vi.mocked(activationModule.isLessonActivated).mockResolvedValueOnce(true)
    renderLesson()
    const checkbox = await screen.findByTestId('lesson-activation-checkbox')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect((checkbox as HTMLInputElement).checked).toBe(true)
  })

  it('toggles activation through the RPC and shows a confirmation toast', async () => {
    renderLesson()
    const checkbox = await screen.findByTestId('lesson-activation-checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)

    await userEvent.click(checkbox)

    expect(activationModule.setLessonActivated).toHaveBeenCalledWith('user-1', 'lesson-4', true)
    expect(await screen.findByText('Lesson activated')).toBeInTheDocument()
    expect(checkbox.checked).toBe(true)
  })

  it('only surfaces the practice CTA after the lesson has been activated', async () => {
    renderLesson()
    await screen.findByTestId('lesson-activation-checkbox')

    expect(screen.queryByRole('link', { name: /Oefen deze les/i })).not.toBeInTheDocument()

    const checkbox = await screen.findByTestId('lesson-activation-checkbox') as HTMLInputElement
    await userEvent.click(checkbox)

    const practiceLink = await screen.findByRole('link', { name: /Oefen deze les/i })
    expect(practiceLink).toHaveAttribute('href', '/session?lesson=lesson-4&mode=lesson_practice')
  })

  it('renders the lesson-level audio from the lesson audio path', async () => {
    vi.mocked(lessonService.getLesson).mockResolvedValueOnce({
      id: 'lesson-4',
      module_id: 'module-1',
      level: 'A1',
      title: 'Lesson 4',
      description: null,
      order_index: 4,
      created_at: '2026-04-01T00:00:00Z',
      audio_path: 'lessons/lesson-4.mp3',
      duration_seconds: 1500,
      transcript_dutch: null,
      transcript_indonesian: null,
      transcript_english: null,
      primary_voice: null,
      dialogue_voices: null,
      lesson_sections: [],
    })

    renderLesson()

    const audio = await screen.findByTestId('lesson-audio-player')
    expect(lessonService.getAudioUrl).toHaveBeenCalledWith('lessons/lesson-4.mp3')
    expect(audio).toHaveAttribute('src', '/lesson-audio.mp3')
    expect(screen.getByText('25 min')).toBeInTheDocument()
  })

  it('shows a learner-friendly unavailable state when lesson page blocks are missing', async () => {
    vi.mocked(lessonService.getLessonPageBlocks).mockResolvedValue([])

    renderLesson()

    expect(await screen.findByRole('heading', { name: 'This lesson is being prepared' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to list' })).toHaveAttribute('href', '/lessons')
    expect(screen.queryByText('Grammar notes.')).not.toBeInTheDocument()
  })

  it('does not write legacy lesson completion from the reader keyboard path', async () => {
    renderLesson()

    expect(await screen.findByText('Grammar notes.')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await Promise.resolve()

    expect(progressService.markLessonComplete).not.toHaveBeenCalled()
  })

  it('opens lesson review with the lesson-scoped review mode when practiced content exists', async () => {
    vi.mocked(lessonService.getLessonCapabilityPracticeSummary).mockResolvedValueOnce({
      readyCapabilityCount: 2,
      activePracticedCapabilityCount: 2,
    })
    vi.mocked(activationModule.isLessonActivated).mockResolvedValueOnce(true)

    renderLesson()

    const reviewLink = await screen.findByRole('link', { name: 'Herhaal deze les' })
    expect(reviewLink).toHaveAttribute('href', '/session?lesson=lesson-4&mode=lesson_review')
  })

  it('restores and saves lesson audio position without autoplay', async () => {
    localStorage.setItem('lesson-audio-position:lesson-4:/grammar.mp3', '120')
    renderLesson()

    const audio = await screen.findByTestId('lesson-block-audio-lesson-4-grammar') as HTMLAudioElement
    Object.defineProperty(audio, 'duration', { configurable: true, value: 600 })
    fireEvent.loadedMetadata(audio)

    expect(audio.autoplay).toBe(false)
    expect(audio.currentTime).toBe(120)

    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 180 })
    fireEvent.timeUpdate(audio)
    expect(localStorage.getItem('lesson-audio-position:lesson-4:/grammar.mp3')).toBe('180')
  })
})
