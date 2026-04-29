import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LessonReader } from '@/components/lessons/LessonReader'
import type { LessonExperience, LessonExperienceBlock } from '@/lib/lessons/lessonExperience'

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
        onPractice={vi.fn()}
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
        onPractice={vi.fn()}
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
        onPractice={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={onLessonExposureProgress}
      />
    )

    setAudioProgress(screen.getByTestId('lesson-block-audio-lesson-4-dialogue'), 120, 72)

    expect(onLessonExposureProgress).toHaveBeenCalledWith(expect.objectContaining({
      id: 'lesson-4-dialogue',
    }), 'dialogue_audio')
  })

  it('records grammar and dialogue text exposure from section exposure actions', async () => {
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
        onPractice={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={onLessonExposureProgress}
      />
    )

    const buttons = screen.getAllByRole('button', { name: 'Markeer sectie als gezien' })
    await user.click(buttons[0])
    await user.click(buttons[1])

    expect(onLessonExposureProgress).toHaveBeenCalledWith(expect.objectContaining({ id: 'lesson-4-grammar' }), 'grammar_text')
    expect(onLessonExposureProgress).toHaveBeenCalledWith(expect.objectContaining({ id: 'lesson-4-dialogue' }), 'dialogue_text')
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
            payload: { type: 'vocabulary', items: [{ indonesian: 'makan', dutch: 'eten' }] },
            displayOrder: 30,
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
        onPractice={vi.fn()}
        onSourceProgress={vi.fn()}
        onLessonExposureProgress={vi.fn()}
      />
    )

    expect(screen.getByText('Possessive pronouns')).toBeInTheDocument()
    expect(screen.getByText('Apa kabar?')).toBeInTheDocument()
    expect(screen.getByText('makan')).toBeInTheDocument()
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
