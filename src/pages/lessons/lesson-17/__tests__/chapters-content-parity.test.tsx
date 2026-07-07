// Content-parity guard for the lesson-17 chapter conversion.
//
// With the one-chapter-at-a-time mount strategy the live DOM only ever holds
// the current chapter, so this test renders EVERY chapter node and asserts
// that all learner-facing strings from content.json appear somewhere in the
// combined output — i.e. slicing the page into chapters lost no content
// (docs/plans/2026-07-06-lesson-chapter-experience-program.md §3).
//
// This also guards the content-drop fix made during the conversion: section 2
// (the "how to read the word list" note — basiswoord, the ~ notation) was
// never rendered by the pre-chapter page at all. It's now folded into the
// Woorden chapter (see Vocabulary in ../Page.next.tsx) — asserted below.

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

/** Strip whitespace from both haystack and needle: textContent concatenates
 *  element boundaries without spaces (e.g. an <h2> followed by a <p>), and JSX
 *  splits text nodes at <em>/<span> boundaries (dialogue ids next to their
 *  PlayButton, grammar pair ids, etc.) — either would false-negative a plain
 *  substring check. Content equality is what we guard, not spacing.
 *  (Unlike lesson-2/5/9/14, none of this lesson's renderers transform
 *  separators — no ordinal strip, no arrow-swap, no comma→bullet split — so
 *  no extra characters need dropping here.) */
function normalise(s: string): string {
  return s.replace(/\s+/g, '')
}

describe('lesson 17 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup (PlayButton, emphasis) can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders every paragraph of the reading narrative', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders every dialogue line, speaker and translation', () => {
    const c = content.sections[1].content as {
      lines: Array<{ text: string; speaker: string; translation: string }>
    }
    for (const line of c.lines) {
      expectPresent(line.text)
      expectPresent(line.speaker)
      expectPresent(line.translation)
    }
  })

  it('renders the word-list reading note (section 2 — previously dropped)', () => {
    const c = content.sections[2].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[3].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every mealtime expression', () => {
    const c = content.sections[4].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the featured pepatah', () => {
    const c = content.sections[5].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the ME-order/clitics grammar categories with all rules and examples', () => {
    const c = content.sections[6].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules.forEach(expectPresent)
      cat.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders the berapa? grammar category with all rules and examples', () => {
    const c = content.sections[7].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules.forEach(expectPresent)
      cat.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders the siapa/apa/mana grammar categories with all rules and examples', () => {
    const c = content.sections[8].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules.forEach(expectPresent)
      cat.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
