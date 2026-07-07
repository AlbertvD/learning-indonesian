// Content-parity guard for the lesson-9 chapter conversion.
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
 *  concatenates element boundaries without spaces (e.g. an <h2> followed by
 *  an <em>), and JSX splits text nodes at inline-markup boundaries — either
 *  would false-negative a plain substring check. Content equality is what we
 *  guard, not spacing. */
function normalise(s: string): string {
  return s.replace(/\s+/g, '')
}

// content.sections[0] paragraph indices 9 and 11 are NOT rendered verbatim:
// CultureSpread deliberately restructures them into hand-authored widgets
// (a dukun-specialisation chip strip, and an a/b/c/d "eigenschappen" grid —
// see the comment block above CultureSpread in Page.tsx/Page.next.tsx). All
// the underlying facts still appear, just reworded rather than quoted, so
// this is a pre-existing editorial transform, not a content drop — excluded
// from the literal-substring check below (same pattern as lesson-2's
// stripOrdinal for the ini/itu category titles).
const CULTURE_PARAGRAPHS_RENDERED_VERBATIM = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12]

describe('lesson 9 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup (sub-headers, ingredient lists) can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders the culture spread paragraphs, the semangat panel and the dukun specialisations/eigenschappen', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    c.paragraphs.forEach((para, i) => {
      if (CULTURE_PARAGRAPHS_RENDERED_VERBATIM.includes(i)) expectPresent(para)
    })
    // The two restructured paragraphs (9, 11) are covered via the hand-
    // authored chip strip / eigenschappen grid instead of the raw text.
    expectPresent('dukun bayi')
    expectPresent('vroedvrouw')
    expectPresent('sihir hitam')
    expectPresent('zwarte magie')
    expectPresent('Kruidenkennis')
    expectPresent('Bezwerende formules')
    expectPresent('Psychologisch inzicht')
    expectPresent('Culturele taboes')
  })

  it('renders every dialogue line (narration + spoken) and every translation', () => {
    const c = content.sections[1].content as {
      lines: Array<{ text: string; speaker: string; translation: string }>
    }
    for (const line of c.lines) {
      expectPresent(line.text)
      expectPresent(line.translation)
    }
  })

  it('renders every general-vocabulary item (section 2)', () => {
    const c = content.sections[2].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every expression (section 3)', () => {
    const c = content.sections[3].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every A-B-C opener rule, every opener example, the full word-group table and all three group tiles', () => {
    const c = content.sections[4].content as {
      categories: Array<{
        title: string
        rules?: string[]
        table?: string[][]
        examples?: Array<{ indonesian: string; dutch: string }>
      }>
    }
    const [opener, table, ...groups] = c.categories

    // All 5 opener rules — the pre-chapter renderer dropped rules[1..4]
    // (see the fix comment above VerbalOrderGrammar); this asserts the fix.
    opener.rules?.forEach(expectPresent)
    opener.examples?.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })

    // The word-group table: every non-empty cell. NOTE: table.title
    // ("Woorden per groep") is intentionally NOT checked here — the renderer
    // substitutes a custom heading ("De woordenmachine — kies een woord uit
    // elke kolom") instead of the raw field, a deliberate editorial caption
    // choice (pre-existing, not touched by the chapter conversion).
    table.table?.forEach(row => row.forEach(cell => { if (cell.trim()) expectPresent(cell) }))

    // The three groups (A/B/C): title + rules + examples.
    for (const g of groups) {
      expectPresent(g.title)
      g.rules?.forEach(expectPresent)
      g.examples?.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })
    }
  })

  it('renders both intensifier categories with rules and examples', () => {
    const c = content.sections[5].content as {
      categories: Array<{ title: string; rules?: string[]; examples?: Array<{ indonesian: string; dutch: string }> }>
    }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules?.forEach(expectPresent)
      cat.examples?.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })
    }
  })

  it('renders every body-atlas item (section 7)', () => {
    const c = content.sections[7].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every symptom/remedy item (section 8), regardless of which column it lands in', () => {
    // SYMPTOM_KEYS in SymptomsRemedies mismatches two live `indonesian`
    // values ('sakit perut' / 'capèk'), so those two items render in the
    // "remedies" column instead of "symptoms" — a pre-existing misclassifi-
    // cation, not a text drop (both items' text still renders in full). This
    // test only asserts presence, not which column, so it is unaffected.
    const c = content.sections[8].content as { items: Array<{ dutch: string; indonesian: string }> }
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
