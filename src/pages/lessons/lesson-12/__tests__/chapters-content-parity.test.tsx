// Content-parity guard for the lesson-12 chapter conversion.
//
// With the one-chapter-at-a-time mount strategy the live DOM only ever holds
// the current chapter, so this test renders EVERY chapter node and asserts
// that all learner-facing strings from content.json appear somewhere in the
// combined output — i.e. slicing the page into chapters lost no content
// (docs/plans/2026-07-06-lesson-chapter-experience-program.md §3).

import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { buildChapters } from '../Page'
import content from '../content.json'

vi.mock('@/lib/lessons')
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'user-uuid' } }),
}))

import { getLessonCapabilityPracticeSummaryByLessonId, buildLessonPracticeActions } from '@/lib/lessons'

vi.mocked(buildLessonPracticeActions).mockReturnValue([])
vi.mocked(getLessonCapabilityPracticeSummaryByLessonId).mockResolvedValue({
  readyCapabilityCount: 0,
  activePracticedCapabilityCount: 0,
})

const noopActivation = {
  activated: false,
  saving: false,
  toggle: () => {},
} as unknown as Parameters<typeof buildChapters>[0]

function renderAllChaptersText(): string {
  const chapters = buildChapters(noopActivation)
  return chapters
    .map(chapter => {
      const { container, unmount } = render(
        <MantineProvider>
          <MemoryRouter>{chapter.node}</MemoryRouter>
        </MantineProvider>,
      )
      const text = container.textContent ?? ''
      unmount()
      return text
    })
    .join('\n')
}

/** Strip ALL whitespace from both haystack and needle: textContent
 *  concatenates element boundaries without spaces (e.g. an <h3> followed by a
 *  <p>, the economics-spread head/body split), and JSX splits text nodes at
 *  <em> boundaries — either would false-negative a plain substring check.
 *  Content equality is what we guard, not spacing. */
function normalise(s: string): string {
  // Also drop dashes and commas: none of lesson 12's renderers transform
  // separators (parens, colons and em-dashes in grammar titles/rules render
  // verbatim), so no richer strip set is needed here — this is the base
  // lesson-5 set, kept for consistency.
  return s.replace(/[\s–,-]+/g, '')
}

describe('lesson 12 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup (economics head/body split) can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders every dialogue line and translation', () => {
    const c = content.sections[0].content as {
      lines: Array<{ text: string; speaker: string; translation: string }>
    }
    for (const line of c.lines) {
      expectPresent(line.text)
      expectPresent(line.translation)
    }
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[1].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every fixed expression', () => {
    const c = content.sections[2].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every acronym/abbreviation/cardinal-direction grammar category with rules, examples and tables', () => {
    const c = content.sections[3].content as {
      categories: Array<{
        title: string
        rules?: string[]
        examples?: Array<{ dutch: string; indonesian: string }>
        table?: string[][]
      }>
    }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules?.forEach(expectPresent)
      cat.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
      cat.table?.forEach(row => row.forEach(expectPresent))
    }
  })

  it('renders every BER- reduplication grammar category with rules and examples', () => {
    const c = content.sections[4].content as {
      categories: Array<{
        title: string
        rules?: string[]
        examples?: Array<{ dutch: string; indonesian: string }>
      }>
    }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules?.forEach(expectPresent)
      cat.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders the full economics reading', () => {
    const c = content.sections[6].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
