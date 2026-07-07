import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { ChapterExperience, type LessonChapter } from '../ChapterExperience'
import { LessonChapterOverview } from '../LessonChapterOverview'

const LESSON_ID = 'lesson-uuid-1'

const chapters: LessonChapter[] = [
  { id: 'verhaal', title: 'Verhaal', node: <p>Inhoud verhaal</p> },
  { id: 'woorden', title: 'Woorden', node: <p>Inhoud woorden</p> },
  { id: 'oefenen', title: 'Oefenen', node: <p>Inhoud oefenen</p> },
]

function renderExperience(initialEntry = '/lesson/x') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ChapterExperience lessonId={LESSON_ID} chapters={chapters} />
      </MemoryRouter>
    </MantineProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('ChapterExperience', () => {
  it('mounts only the first chapter by default', () => {
    renderExperience()
    expect(screen.getByText('Inhoud verhaal')).toBeInTheDocument()
    expect(screen.queryByText('Inhoud woorden')).not.toBeInTheDocument()
  })

  it('honours a chapter deep link (?h=)', () => {
    renderExperience('/lesson/x?h=woorden')
    expect(screen.getByText('Inhoud woorden')).toBeInTheDocument()
    expect(screen.queryByText('Inhoud verhaal')).not.toBeInTheDocument()
  })

  it('falls back to the first chapter on an unknown ?h value', () => {
    renderExperience('/lesson/x?h=bestaat-niet')
    expect(screen.getByText('Inhoud verhaal')).toBeInTheDocument()
  })

  it('navigates forward via the next button and marks the step current', async () => {
    renderExperience()
    await userEvent.click(screen.getByRole('button', { name: /Volgende · Woorden/ }))
    expect(screen.getByText('Inhoud woorden')).toBeInTheDocument()
    // Segment buttons' accessible name is the bare title (index is aria-hidden).
    expect(screen.getByRole('button', { name: 'Woorden' })).toHaveAttribute('aria-current', 'step')
  })

  it('jumps via the header segments', async () => {
    renderExperience()
    await userEvent.click(screen.getByRole('button', { name: 'Oefenen' }))
    expect(screen.getByText('Inhoud oefenen')).toBeInTheDocument()
    // Last chapter: no next button, prev goes back to Woorden.
    expect(screen.queryByRole('button', { name: /Volgende/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Vorige · Woorden/ })).toBeInTheDocument()
  })

  it('persists position and offers a resume chip on a fresh landing', async () => {
    const { unmount } = renderExperience()
    await userEvent.click(screen.getByRole('button', { name: /Volgende · Woorden/ }))
    unmount()

    renderExperience() // fresh landing, no ?h
    // Never auto-jumps: chapter 1 is shown, resume is an offer.
    expect(screen.getByText('Inhoud verhaal')).toBeInTheDocument()
    const chip = screen.getByRole('button', { name: /Ga verder bij Woorden/ })
    await userEvent.click(chip)
    expect(screen.getByText('Inhoud woorden')).toBeInTheDocument()
  })

  it('does not offer resume when the stored position is the first chapter', () => {
    window.localStorage.setItem(
      `lesson-chapter:${LESSON_ID}`,
      JSON.stringify({ current: 'verhaal', visited: ['verhaal'] }),
    )
    renderExperience()
    expect(screen.queryByRole('button', { name: /Ga verder bij/ })).not.toBeInTheDocument()
  })

  it('moves focus to the chapter content on navigation (a11y)', async () => {
    renderExperience()
    await userEvent.click(screen.getByRole('button', { name: /Volgende · Woorden/ }))
    const content = screen.getByText('Inhoud woorden').parentElement
    expect(content).toHaveFocus()
  })

  it('renders the hero above the nav on the cover only', async () => {
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/lesson/x']}>
          <ChapterExperience lessonId={LESSON_ID} hero={<header>De heroband</header>} chapters={chapters} />
        </MemoryRouter>
      </MantineProvider>,
    )
    expect(screen.getByText('De heroband')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Woorden' }))
    expect(screen.queryByText('De heroband')).not.toBeInTheDocument()
  })

  it('opening-chapter overview lists remaining chapters and navigates on click', async () => {
    const withOverview: LessonChapter[] = [
      { id: 'verhaal', title: 'Verhaal', node: <LessonChapterOverview /> },
      { id: 'woorden', title: 'Woorden', description: '53 woorden met audio.', node: <p>Inhoud woorden</p> },
      { id: 'oefenen', title: 'Oefenen', description: 'Activeer en oefen.', node: <p>Inhoud oefenen</p> },
    ]
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={['/lesson/x']}>
          <ChapterExperience lessonId={LESSON_ID} chapters={withOverview} />
        </MemoryRouter>
      </MantineProvider>,
    )
    expect(screen.getByText('In deze les')).toBeInTheDocument()
    expect(screen.getByText('53 woorden met audio.')).toBeInTheDocument()
    // The card is a Link whose navigation (?h=woorden) IS the chapter switch.
    await userEvent.click(screen.getByRole('link', { name: /Woorden/ }))
    expect(screen.getByText('Inhoud woorden')).toBeInTheDocument()
  })
})
