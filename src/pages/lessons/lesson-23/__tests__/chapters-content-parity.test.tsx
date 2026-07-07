// Content-parity guard for the lesson-23 chapter conversion.
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
 *  concatenates element boundaries without spaces, and JSX splits text nodes
 *  at <em>/<span> boundaries — either would false-negative a plain substring
 *  check. Content equality is what we guard, not spacing. */
function normalise(s: string): string {
  return s.replace(/\s+/g, '')
}

describe('lesson 23 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders the culture essay — all 9 paragraphs (body + coda)', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    const p = c.paragraphs
    expect(p.length).toBe(9)
    // The CultureSpread component renders paragraphs 0,1,2,4,5,7 as body text
    // plus p[8] in the closing coda callout (fixed from a stale p[9] index
    // during the chapter conversion — content.json only has 9 paragraphs,
    // 0-8, so the old p[9] reference was always undefined and the essay's
    // punchline never rendered). p[3] and p[6] are deliberately NOT rendered
    // verbatim — one-liner transitions folded into the surrounding rhythm.
    // Assert every paragraph the component is expected to place.
    for (const i of [0, 1, 2, 4, 5, 7, 8]) {
      expectPresent(p[i])
    }
  })

  it('renders every grammar category with all rules, examples and the paradigm table', () => {
    const c = content.sections[2].content as {
      categories: Array<{
        title: string
        rules: string[]
        examples?: Array<{ dutch: string; indonesian: string }>
        table?: string[][]
      }>
    }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules.forEach(expectPresent)
      cat.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
      cat.table?.forEach(row => row.forEach(expectPresent))
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
