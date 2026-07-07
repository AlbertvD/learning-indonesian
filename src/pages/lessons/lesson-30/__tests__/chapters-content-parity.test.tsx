// Content-parity guard for the lesson-30 chapter conversion.
//
// With the one-chapter-at-a-time mount strategy the live DOM only ever holds
// the current chapter, so this test renders EVERY chapter node and asserts
// that all learner-facing strings from content.json appear somewhere in the
// combined output — i.e. slicing the page into chapters lost no content
// (docs/plans/2026-07-06-lesson-chapter-experience-program.md §3).
//
// The grammar assertion below walks ALL 7 categories generically (including
// the framing overview at index 0 and the register band at index 6) —
// exactly the shape that caught a sibling lesson's renderer silently
// dropping an overview category's title + examples (2026-07-07).

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
 *  concatenates element boundaries without spaces (e.g. an <h4> followed by a
 *  <p>), and JSX splits text nodes at <em> boundaries — either would false-
 *  negative a plain substring check. Content equality is what we guard, not
 *  spacing. */
function normalise(s: string): string {
  // Also drop dashes and commas: the "→" arrow pairs and ingredient/example
  // runs get re-punctuated by the renderer (presentational, not content).
  return s.replace(/[\s–,-]+/g, '')
}

describe('lesson 30 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup (song stanza splits, arrow-pair decoding) can't
    // false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders the reading essay and both keroncong songs', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    const essay = c.paragraphs.slice(0, 4)
    essay.forEach(expectPresent)
    const songs = c.paragraphs.slice(4)
    for (const raw of songs) {
      const [title, ...rest] = raw.split('\n\n')
      expectPresent(title)
      for (const stanza of rest) {
        stanza.split('\n').filter(Boolean).forEach(expectPresent)
      }
    }
  })

  it('renders every music & recording vocabulary item', () => {
    const c = content.sections[1].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every grammar category with its title, all rules and all examples', () => {
    // Walk ALL categories generically — including the framing overview [0]
    // and the register band [6] — not just the 5 device tiles, so a
    // dropped overview title/example fails this test.
    const c = content.sections[2].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules.forEach(expectPresent)
      cat.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders every love vocabulary item', () => {
    const c = content.sections[3].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every love-line expression', () => {
    const c = content.sections[4].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every Latihan block with its instruction and items', () => {
    const c = content.sections[5].content as {
      sections: Array<{ title: string; instruction: string; items: Array<{ prompt: string; answer?: string }> }>
    }
    for (const blk of c.sections) {
      expectPresent(blk.title)
      expectPresent(blk.instruction)
      for (const item of blk.items) {
        expectPresent(item.prompt)
        expectPresent(item.answer)
      }
    }
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
