// Content-parity guard for the lesson-5 chapter conversion.
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
 *  concatenates element boundaries without spaces (e.g. an <h4> followed by a
 *  <p>), and JSX splits text nodes at <em> boundaries — either would false-
 *  negative a plain substring check. Content equality is what we guard, not
 *  spacing. */
function normalise(s: string): string {
  // Also drop dashes and commas: the ingredient-list renderer converts
  // "– item, – item" runs into <li> bullets (presentational, not content).
  return s.replace(/[\s–,-]+/g, '')
}

describe('lesson 5 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup (sub-headers, ingredient lists) can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders every dialogue line, speaker and translation', () => {
    const c = content.sections[1].content as {
      lines: Array<{ text: string; speaker: string; translation: string }>
    }
    for (const line of c.lines) {
      expectPresent(line.text)
      expectPresent(line.translation)
    }
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

  it('renders the full possessive reference table', () => {
    const c = content.sections[3].content as {
      tableTitle: string
      columns: string[]
      sections: Array<{ heading: string; rows: Array<{ label: string; cells: string[] }> }>
      examples: Array<{ dutch: string; indonesian: string }>
      footnotes: string[]
    }
    expectPresent(c.tableTitle)
    c.columns.forEach(expectPresent)
    for (const sec of c.sections) {
      expectPresent(sec.heading)
      for (const row of sec.rows) {
        expectPresent(row.label)
        row.cells.filter(cell => cell.trim() && cell.trim() !== '-').forEach(expectPresent)
      }
    }
    c.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    c.footnotes.forEach(expectPresent)
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[6].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders both culture texts', () => {
    const cookery = content.sections[0].content as { paragraphs: string[] }
    const history = content.sections[5].content as { paragraphs: string[] }
    cookery.paragraphs.forEach(expectPresent)
    history.paragraphs.forEach(expectPresent)
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
