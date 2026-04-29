import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LessonReader } from '@/components/lessons/LessonReader'
import type { LessonExperience, LessonExperienceBlock } from '@/lib/lessons/lessonExperience'

let observedSections: Array<{
  target: Element
  callback: IntersectionObserverCallback
  observer: IntersectionObserver
}> = []

function installIntersectionObserverMock() {
  observedSections = []

  class MockIntersectionObserver {
    readonly root: Element | Document | null = null
    readonly rootMargin = '0px'
    readonly scrollMargin = '0px'
    readonly thresholds = [0.6]
    private readonly callback: IntersectionObserverCallback

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
    }

    disconnect = vi.fn()
    unobserve = vi.fn()
    takeRecords = vi.fn((): IntersectionObserverEntry[] => [])

    observe = vi.fn((target: Element) => {
      observedSections.push({
        target,
        callback: this.callback,
        observer: this as unknown as IntersectionObserver,
      })
    })
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
}

function markSectionVisible(title: string) {
  const section = screen.getByRole('heading', { name: title }).closest('section')
  expect(section).not.toBeNull()
  const observed = observedSections.find(entry => entry.target === section)
  expect(observed).toBeDefined()
  observed!.callback([
    {
      isIntersecting: true,
      intersectionRatio: 0.75,
      target: section!,
    } as unknown as IntersectionObserverEntry,
  ], observed!.observer)
}

function setAudioProgress(audio: HTMLElement, durationSeconds: number, currentTimeSeconds: number) {
  Object.defineProperty(audio, 'duration', { configurable: true, value: durationSeconds })
  Object.defineProperty(audio, 'currentTime', { configurable: true, value: currentTimeSeconds })
  fireEvent.loadedMetadata(audio)
  fireEvent.timeUpdate(audio)
}

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
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('renders a responsive web-native lesson flow with companion and progress rail', () => {
    render(
      <LessonReader
        experience={experience()}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
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
        onSourceProgress={onSourceProgress}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Markeer sectie als gezien' }))

    expect(onSourceProgress).toHaveBeenCalledWith(expect.objectContaining({
      id: 'lesson-1-item-makan',
    }), 'section_exposed')
  })

  it('does not expose a direct practice bridge action before lesson-level action rules allow it', () => {
    const onPractice = vi.fn()

    render(
      <LessonReader
        experience={experience()}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onSourceProgress={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Oefen deze inhoud' })).not.toBeInTheDocument()
    expect(onPractice).not.toHaveBeenCalled()
  })

  it('does not record grammar audio exposure below the readiness threshold', () => {
    const onLessonExposureProgress = vi.fn()

    render(
      <LessonReader
        experience={lessonExperienceWith([
          lessonBlock({
            id: 'lesson-4-grammar',
            kind: 'reading_section',
            title: 'Grammar audio',
            payload: { type: 'grammar', audioUrl: '/grammar.mp3', body: 'Grammar notes.' },
          }),
        ])}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={onLessonExposureProgress}
      />
    )

    setAudioProgress(screen.getByTestId('lesson-block-audio-lesson-4-grammar'), 600, 45)

    expect(onLessonExposureProgress).not.toHaveBeenCalled()
  })

  it('records grammar audio exposure once when the threshold is crossed', () => {
    const onLessonExposureProgress = vi.fn()

    render(
      <LessonReader
        experience={lessonExperienceWith([
          lessonBlock({
            id: 'lesson-4-grammar',
            kind: 'reading_section',
            title: 'Grammar audio',
            payload: { type: 'grammar', audioUrl: '/grammar.mp3', body: 'Grammar notes.' },
          }),
        ])}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={onLessonExposureProgress}
      />
    )

    const audio = screen.getByTestId('lesson-block-audio-lesson-4-grammar')
    setAudioProgress(audio, 600, 360)
    setAudioProgress(audio, 600, 420)

    expect(onLessonExposureProgress).toHaveBeenCalledTimes(1)
    expect(onLessonExposureProgress).toHaveBeenCalledWith(expect.objectContaining({
      id: 'lesson-4-grammar',
    }), 'grammar_audio')
  })

  it('does not crash when saved audio position cannot be restored by the browser', () => {
    localStorage.setItem('lesson-audio-position:lesson-4:/grammar.mp3', '120')

    render(
      <LessonReader
        experience={lessonExperienceWith([
          lessonBlock({
            id: 'lesson-4-grammar',
            kind: 'reading_section',
            title: 'Grammar audio',
            payload: { type: 'grammar', audioUrl: '/grammar.mp3', body: 'Grammar notes.' },
          }),
        ])}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={vi.fn()}
      />
    )

    const audio = screen.getByTestId('lesson-block-audio-lesson-4-grammar')
    Object.defineProperty(audio, 'duration', { configurable: true, value: 600 })
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 0, writable: false })

    expect(() => fireEvent.loadedMetadata(audio)).not.toThrow()
  })

  it('records dialogue audio exposure with 60 percent playback and no 5-minute floor', () => {
    const onLessonExposureProgress = vi.fn()

    render(
      <LessonReader
        experience={lessonExperienceWith([
          lessonBlock({
            id: 'lesson-4-dialogue',
            kind: 'dialogue_card',
            title: 'Dialogue',
            payload: { type: 'dialogue', audioUrl: '/dialogue.mp3', lines: [{ text: 'Apa kabar?', translation: 'Hoe gaat het?' }] },
          }),
        ])}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={onLessonExposureProgress}
      />
    )

    setAudioProgress(screen.getByTestId('lesson-block-audio-lesson-4-dialogue'), 120, 72)

    expect(onLessonExposureProgress).toHaveBeenCalledWith(expect.objectContaining({
      id: 'lesson-4-dialogue',
    }), 'dialogue_audio')
  })

  it('does not record grammar text exposure from a token click before meaningful reading time', async () => {
    const user = userEvent.setup()
    const onLessonExposureProgress = vi.fn()

    render(
      <LessonReader
        experience={lessonExperienceWith([
          lessonBlock({
            id: 'lesson-4-grammar',
            kind: 'reading_section',
            title: 'Grammar',
            payload: { type: 'grammar', body: 'Grammar notes.' },
          }),
          lessonBlock({
            id: 'lesson-4-dialogue',
            kind: 'dialogue_card',
            title: 'Dialogue',
            payload: { type: 'dialogue', lines: [{ text: 'Selamat pagi', translation: 'Goedemorgen' }] },
            displayOrder: 20,
          }),
        ])}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={onLessonExposureProgress}
      />
    )

    const buttons = screen.getAllByRole('button', { name: 'Markeer sectie als gezien' })
    await user.click(buttons[0])

    expect(onLessonExposureProgress).not.toHaveBeenCalled()
  })

  it('records grammar and dialogue text exposure after meaningful reading time', async () => {
    vi.useFakeTimers()
    installIntersectionObserverMock()
    const onLessonExposureProgress = vi.fn()

    render(
      <LessonReader
        experience={lessonExperienceWith([
          lessonBlock({
            id: 'lesson-4-grammar',
            kind: 'reading_section',
            title: 'Grammar',
            payload: { type: 'grammar', body: 'Grammar notes.' },
          }),
          lessonBlock({
            id: 'lesson-4-dialogue',
            kind: 'dialogue_card',
            title: 'Dialogue',
            payload: { type: 'dialogue', lines: [{ text: 'Selamat pagi', translation: 'Goedemorgen' }] },
            displayOrder: 20,
          }),
        ])}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={onLessonExposureProgress}
      />
    )

    markSectionVisible('Grammar')
    markSectionVisible('Dialogue')
    vi.advanceTimersByTime(120_000)
    const buttons = screen.getAllByRole('button', { name: 'Markeer sectie als gezien' })
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])

    expect(onLessonExposureProgress).toHaveBeenCalledWith(expect.objectContaining({ id: 'lesson-4-grammar' }), 'grammar_text')
    expect(onLessonExposureProgress).toHaveBeenCalledWith(expect.objectContaining({ id: 'lesson-4-dialogue' }), 'dialogue_text')
  })

  it('does not let time spent on one visible block unlock an unseen text block', () => {
    vi.useFakeTimers()
    installIntersectionObserverMock()
    const onLessonExposureProgress = vi.fn()

    render(
      <LessonReader
        experience={lessonExperienceWith([
          lessonBlock({
            id: 'lesson-4-grammar',
            kind: 'reading_section',
            title: 'Grammar',
            payload: { type: 'grammar', body: 'Grammar notes.' },
          }),
          lessonBlock({
            id: 'lesson-4-dialogue',
            kind: 'dialogue_card',
            title: 'Dialogue',
            payload: { type: 'dialogue', lines: [{ text: 'Selamat pagi', translation: 'Goedemorgen' }] },
            displayOrder: 20,
          }),
        ])}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={onLessonExposureProgress}
      />
    )

    markSectionVisible('Grammar')
    vi.advanceTimersByTime(120_000)
    const buttons = screen.getAllByRole('button', { name: 'Markeer sectie als gezien' })
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])

    expect(onLessonExposureProgress).toHaveBeenCalledTimes(1)
    expect(onLessonExposureProgress).toHaveBeenCalledWith(expect.objectContaining({ id: 'lesson-4-grammar' }), 'grammar_text')
  })

  it('does not use mount time as text exposure time when visibility cannot be observed', () => {
    vi.useFakeTimers()
    const onLessonExposureProgress = vi.fn()

    render(
      <LessonReader
        experience={lessonExperienceWith([
          lessonBlock({
            id: 'lesson-4-grammar',
            kind: 'reading_section',
            title: 'Grammar',
            payload: { type: 'grammar', body: 'Grammar notes.' },
          }),
        ])}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={onLessonExposureProgress}
      />
    )

    vi.advanceTimersByTime(120_000)
    fireEvent.click(screen.getByRole('button', { name: 'Markeer sectie als gezien' }))

    expect(onLessonExposureProgress).not.toHaveBeenCalled()
  })

  it('gates pattern-noticing grammar exposure behind visible reading time', () => {
    vi.useFakeTimers()
    installIntersectionObserverMock()
    const onSourceProgress = vi.fn()
    const onLessonExposureProgress = vi.fn()

    render(
      <LessonReader
        experience={lessonExperienceWith([
          lessonBlock({
            id: 'lesson-4-pattern',
            kind: 'pattern_callout',
            title: 'Pattern',
            payload: { name: 'Possessive -nya', description: 'Use -nya after nouns.' },
            sourceProgressEvent: 'pattern_noticing_seen',
          }),
        ])}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onSourceProgress={onSourceProgress}
        onLessonExposureProgress={onLessonExposureProgress}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ik heb dit patroon opgemerkt' }))
    expect(onSourceProgress).not.toHaveBeenCalled()
    expect(onLessonExposureProgress).not.toHaveBeenCalled()

    markSectionVisible('Pattern')
    vi.advanceTimersByTime(120_000)
    fireEvent.click(screen.getByRole('button', { name: 'Ik heb dit patroon opgemerkt' }))

    expect(onSourceProgress).not.toHaveBeenCalled()
    expect(onLessonExposureProgress).toHaveBeenCalledWith(expect.objectContaining({ id: 'lesson-4-pattern' }), 'grammar_text')
  })

  it('renders authored grammar, dialogue, vocabulary, sentences, culture, and pronunciation content', () => {
    render(
      <LessonReader
        experience={lessonExperienceWith([
          lessonBlock({ id: 'grammar', title: 'Grammar', payload: { type: 'grammar', body: 'Possessive pronouns' } }),
          lessonBlock({
            id: 'dialogue',
            kind: 'dialogue_card',
            title: 'Dialogue',
            payload: { type: 'dialogue', lines: [{ text: 'Apa kabar?', translation: 'Hoe gaat het?' }] },
            displayOrder: 20,
          }),
          lessonBlock({
            id: 'vocab',
            kind: 'vocab_strip',
            title: 'Vocabulary',
            payload: { type: 'vocabulary', items: [{ baseText: 'makan', translationNl: 'eten' }] },
            displayOrder: 30,
          }),
          lessonBlock({
            id: 'flat-vocab',
            kind: 'vocab_strip',
            title: 'Flat vocabulary',
            payload: { type: 'vocabulary', baseText: 'minum', translationNl: 'drinken' },
            displayOrder: 32,
          }),
          lessonBlock({
            id: 'grammar-categories',
            title: 'Grammar detail',
            payload: { type: 'grammar', intro: 'Use -nya for possession.', categories: [{ title: 'Possession', rules: ['noun + nya'] }] },
            displayOrder: 35,
          }),
          lessonBlock({
            id: 'sentences',
            title: 'Sentences',
            payload: { body: 'Saya makan nasi. Ik eet rijst.' },
            displayOrder: 40,
          }),
          lessonBlock({
            id: 'culture',
            title: 'Culture',
            payload: { type: 'culture', body: 'Market etiquette' },
            displayOrder: 50,
          }),
          lessonBlock({
            id: 'pronunciation',
            title: 'Pronunciation',
            payload: { type: 'pronunciation', body: 'Roll r softly' },
            displayOrder: 60,
          }),
        ])}
        progressBySourceRef={new Map()}
        onBack={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={vi.fn()}
      />
    )

    expect(screen.getByText('Possessive pronouns')).toBeInTheDocument()
    expect(screen.getByText('Apa kabar?')).toBeInTheDocument()
    expect(screen.getByText('makan')).toBeInTheDocument()
    expect(screen.getByText('minum')).toBeInTheDocument()
    expect(screen.getByText('drinken')).toBeInTheDocument()
    expect(screen.getByText(/Use -nya for possession/)).toBeInTheDocument()
    expect(screen.getByText(/Possession/)).toBeInTheDocument()
    expect(screen.getByText(/Saya makan nasi/)).toBeInTheDocument()
    expect(screen.getByText('Market etiquette')).toBeInTheDocument()
    expect(screen.getByText('Roll r softly')).toBeInTheDocument()
  })
})

function lessonBlock(overrides: Partial<LessonExperienceBlock>): LessonExperienceBlock {
  return {
    id: 'block-1',
    kind: 'reading_section',
    title: 'Block',
    sourceRef: 'lesson-4',
    sourceRefs: ['lesson-4'],
    contentUnitSlugs: [],
    displayOrder: 10,
    payload: { body: 'Body' },
    sourceProgressEvent: 'section_exposed',
    capabilityKeyRefs: [],
    ...overrides,
  }
}

function lessonExperienceWith(blocks: LessonExperienceBlock[]): LessonExperience {
  return {
    lessonId: 'lesson-id-4',
    sourceRef: 'lesson-4',
    title: 'Les 4',
    level: 'A1',
    sourceRefs: ['lesson-4'],
    blocks,
  }
}
