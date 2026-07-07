// Content-parity guard for the lesson-6 chapter conversion.
//
// With the one-chapter-at-a-time mount strategy the live DOM only ever holds
// the current chapter, so this test renders EVERY chapter node and asserts
// that all learner-facing strings from content.json appear somewhere in the
// combined output — i.e. slicing the page into chapters lost no content
// (docs/plans/2026-07-06-lesson-chapter-experience-program.md §3).
//
// NOTE on what is intentionally NOT asserted: the negation categories'
// `title` fields (e.g. "Belum = nog niet") and the -lah/-kah categories'
// `title` fields (e.g. "Gebiedende wijs met -lah (beleefde imperatief)",
// "-kah -- vraagachtervoegsel voor nadruk") are replaced editorially by
// hardcoded captions ("nog niet", "Beleefde imperatief", "Voorbeelden") in
// the pre-existing (pre-chapter) renderers — this is NOT a chapter-conversion
// content drop, it predates this conversion (Page.tsx renders the same way).
// The `bukan` tag-question category's title IS rendered directly and IS
// asserted below.

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
 *  concatenates element boundaries without spaces (e.g. an <h2> followed by a
 *  <p>), and JSX splits text nodes at inline-markup boundaries (e.g. <em>) —
 *  either would false-negative a plain substring check. Content equality is
 *  what we guard, not spacing. Also drop dashes/en-dashes and commas: none of
 *  the lesson-6 renderers split rule/example strings on separators (unlike
 *  lesson 2's classifier/negation renderers), but table cells and rule text
 *  legitimately contain "--"/"-" runs that must match on both sides equally. */
function normalise(s: string): string {
  return s.replace(/[\s–,-]+/g, '')
}

describe('lesson 6 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders every history paragraph', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[1].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders belum (section 2): every rule and example', () => {
    const c = content.sections[2].content as { categories: Array<{ rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }> }
    const cat = c.categories[0]
    cat.rules.forEach(expectPresent)
    cat.examples.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })
  })

  it('renders bukan (section 3): negation rules/examples, plus the tag-question title, rules and examples', () => {
    const c = content.sections[3].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    const negation = c.categories[0]
    negation.rules.forEach(expectPresent)
    negation.examples.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })

    const tag = c.categories[1]
    expectPresent(tag.title)
    tag.rules.forEach(expectPresent)
    tag.examples.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })
  })

  it('renders tidak (section 4): every rule and example', () => {
    const c = content.sections[4].content as { categories: Array<{ rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }> }
    const cat = c.categories[0]
    cat.rules.forEach(expectPresent)
    cat.examples.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })
  })

  it('renders jangan (section 5): every rule and example', () => {
    const c = content.sections[5].content as { categories: Array<{ rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }> }
    const cat = c.categories[0]
    cat.rules.forEach(expectPresent)
    cat.examples.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })
  })

  it('renders -lah (section 6): every rule, the full table, the examples heading and every example', () => {
    const c = content.sections[6].content as {
      categories: Array<{ title: string; rules: string[]; table?: string[][]; examples?: Array<{ dutch: string; indonesian: string }> }>
    }
    const main = c.categories[0]
    main.rules.forEach(expectPresent)
    main.table?.forEach(row => row.forEach(expectPresent))

    const examplesCat = c.categories[1]
    expectPresent(examplesCat.title)
    examplesCat.examples?.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })
  })

  it('renders -kah (section 7): every rule and example', () => {
    const c = content.sections[7].content as { categories: Array<{ rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }> }
    const cat = c.categories[0]
    cat.rules.forEach(expectPresent)
    cat.examples.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })
  })

  it('renders day parts (section 8): the full table and the note', () => {
    const c = content.sections[8].content as { categories: Array<{ rules: string[]; table?: string[][] }> }
    const cat = c.categories[0]
    cat.table?.forEach(row => row.forEach(expectPresent))
    expectPresent(cat.rules[0])
  })

  it('renders clock time (section 9): duration, glossary rules + ids/glosses, and every specific time', () => {
    const c = content.sections[9].content as {
      categories: Array<{ rules: string[]; table?: string[][]; examples?: Array<{ dutch: string; indonesian: string }> }>
    }
    const tijdsduur = c.categories[0]
    expectPresent(tijdsduur.rules[0])
    tijdsduur.examples?.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })

    const klokWoorden = c.categories[1]
    klokWoorden.rules.forEach(expectPresent)
    // Glossary rows render column 0 (id) and column 2 (gloss); column 1 is
    // always the "--" placeholder in this dataset, never real content.
    klokWoorden.table?.slice(1).forEach(row => { expectPresent(row[0]); expectPresent(row[2]) })

    const klokVoorbeelden = c.categories[2]
    klokVoorbeelden.examples?.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
