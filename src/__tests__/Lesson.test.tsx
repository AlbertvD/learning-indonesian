import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Lesson } from '@/pages/Lesson'
import { lessonService } from '@/services/lessonService'
import { sourceProgressService } from '@/services/sourceProgressService'

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

vi.mock('@/lib/session', () => ({
  startSession: vi.fn().mockResolvedValue('session-1'),
  endSession: vi.fn().mockResolvedValue(undefined),
  endSessionBeacon: vi.fn(),
}))

vi.mock('@/lib/useSessionBeacon', () => ({
  useSessionBeacon: vi.fn(),
}))

vi.mock('@/services/lessonService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/lessonService')>()
  return {
    ...actual,
    lessonService: {
      ...actual.lessonService,
      getLesson: vi.fn(),
      getLessonPageBlocks: vi.fn(),
      getLessonSourceProgress: vi.fn(),
      getUserLessonProgress: vi.fn(),
      getAudioUrl: vi.fn(),
    },
  }
})

vi.mock('@/services/sourceProgressService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/sourceProgressService')>()
  return {
    ...actual,
    sourceProgressService: {
      ...actual.sourceProgressService,
      recordEvent: vi.fn(),
    },
  }
})

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

vi.mock('@/services/audioService', () => ({
  fetchAudioMap: vi.fn().mockResolvedValue(new Map()),
  resolveAudioUrl: vi.fn(),
}))

function setAudioProgress(audio: HTMLElement, durationSeconds: number, currentTimeSeconds: number) {
  Object.defineProperty(audio, 'duration', { configurable: true, value: durationSeconds })
  Object.defineProperty(audio, 'currentTime', { configurable: true, value: currentTimeSeconds })
  fireEvent.loadedMetadata(audio)
  fireEvent.timeUpdate(audio)
}

function renderLesson() {
  return render(
    <MemoryRouter initialEntries={['/lesson/lesson-4']}>
      <MantineProvider>
        <Notifications />
        <Routes>
          <Route path="/lesson/:lessonId" element={<Lesson />} />
          <Route path="/session" element={<div>Session page</div>} />
        </Routes>
      </MantineProvider>
    </MemoryRouter>,
  )
}

describe('Lesson page', () => {
  beforeEach(() => {
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
        source_progress_event: 'section_exposed',
        capability_key_refs: ['capability-1', 'capability-2'],
      },
    ] as any)
    vi.mocked(lessonService.getLessonSourceProgress).mockResolvedValue([])
    vi.mocked(lessonService.getUserLessonProgress).mockResolvedValue([])
    vi.mocked(sourceProgressService.recordEvent).mockImplementation(async (event) => ({
      userId: event.userId,
      sourceRef: event.sourceRef,
      sourceSectionRef: event.sourceSectionRef ?? '__lesson__',
      currentState: event.eventType,
      completedEventTypes: [event.eventType],
      lastEventAt: event.occurredAt,
      metadataJson: event.metadataJson,
    }))
  })

  it('records readiness source progress through the lesson exposure adapter', async () => {
    renderLesson()

    const audio = await screen.findByTestId('lesson-block-audio-lesson-4-grammar')
    setAudioProgress(audio, 600, 360)

    expect(sourceProgressService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      sourceRef: 'lesson-4',
      sourceSectionRef: 'lesson-4-grammar',
      eventType: 'heard_once',
      metadataJson: expect.objectContaining({
        lessonId: 'lesson-4',
        exposureKind: 'grammar_audio',
      }),
      idempotencyKey: 'lesson-exposure:user-1:lesson-4:lesson-4-grammar:grammar_audio',
    }))
  })

  it('shows a subtle practice-ready toast after meaningful lesson exposure', async () => {
    renderLesson()

    await screen.findByText('Grammar notes.')
    fireEvent.click(screen.getByRole('button', { name: 'Markeer sectie als gezien' }))

    expect(await screen.findByText('Lesson 4 is ready to practice.')).toBeInTheDocument()
  })
})
