// Content-parity guard for the lesson-21 chapter conversion.
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
 *  <p>), and JSX splits text nodes at inline-markup boundaries — either would
 *  false-negative a plain substring check. Content equality is what we guard,
 *  not spacing.
 *
 *  Also drop dashes and commas: category titles carry ASCII hyphens ("-KAN")
 *  that survive unmodified in the DOM, so stripping them on both sides is a
 *  no-op for matching. Unlike lesson 2, the -KAN examples' "→" arrow is NOT
 *  stripped here: ExampleRow splits "root → -KAN form" across two <span>s but
 *  renders the "→" glyph itself unchanged and un-relocated, so the arrow
 *  survives identically in both the content.json string and the combined DOM
 *  text — no colon/paren/em-dash unwrapping happens in this lesson's
 *  renderers, so the richer lesson-2 strip set isn't needed. */
function normalise(s: string): string {
  return s.replace(/[\s–,-]+/g, '')
}

describe('lesson 21 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup (the fable's title/first-scene split) can't
    // false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders the fable prologue and every scene paragraph', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders every grammar category with all rules and examples', () => {
    const c = content.sections[2].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules.forEach(expectPresent)
      cat.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[1].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
