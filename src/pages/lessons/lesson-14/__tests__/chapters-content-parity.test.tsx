// Content-parity guard for the lesson-14 chapter conversion.
//
// With the one-chapter-at-a-time mount strategy the live DOM only ever holds
// the current chapter, so this test renders EVERY chapter node and asserts
// that all learner-facing strings from content.json appear somewhere in the
// combined output — i.e. slicing the page into chapters lost no content
// (docs/plans/2026-07-06-lesson-chapter-experience-program.md §3).
//
// This also guards the index-shift fix in Page.next.tsx's GrammarSection: the
// pre-fix code silently dropped the BER-/ME- relation-intro rules, the
// locative-word-class examples, and the entire "bijvoeglijk naamwoord en
// telwoord" contrast category (title + rule + 6 examples). Every one of those
// strings is asserted below.

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
 *  <ul>), and JSX splits text nodes at <em>/arrow-span boundaries — either
 *  would false-negative a plain substring check. Content equality is what we
 *  guard, not spacing. (No dash/arrow/paren stripping needed here, unlike
 *  lessons 2/5: the "→" glyph is already literal in content.json and is
 *  re-rendered as its own text node unchanged, so it survives whitespace-only
 *  normalisation on both sides.) */
function normalise(s: string): string {
  return s.replace(/\s+/g, '')
}

type GrammarCategory = {
  title: string
  rules?: string[]
  examples?: Array<{ dutch: string; indonesian: string }>
  table?: string[][]
}

describe('lesson 14 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  const grammarCats = (content.sections[2].content as { categories: GrammarCategory[] }).categories

  it('renders the ME- concept intro and all its rules', () => {
    const concept = grammarCats[0]
    expectPresent(concept.title)
    concept.rules?.forEach(expectPresent)
  })

  it('renders every cell of the word-class index table', () => {
    const index = grammarCats[1]
    for (const row of index.table ?? []) {
      row.forEach(expectPresent)
    }
  })

  it('renders every word-class transform group with its title, rules and examples', () => {
    // cats[2..8] inclusive — the seven word-class groups (2a, 2b, 3, 4a, 4b, 5, 6).
    const groups = grammarCats.slice(2, 9)
    expect(groups).toHaveLength(7)
    for (const cat of groups) {
      expectPresent(cat.title)
      cat.rules?.forEach(expectPresent)
      cat.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders the BER-/ME- relationship intro rules', () => {
    // cats[9] — previously mis-indexed as cats[8], so its rules never rendered.
    // Its TITLE is deliberately replaced by the page's bespoke heading
    // ("Toestand tegenover handeling") — same editorial substitution as
    // cats[1].title; only the rules are asserted.
    const relationIntro = grammarCats[9]
    relationIntro.rules?.forEach(expectPresent)
  })

  it('renders the BER-/ME- contrast for verb and noun', () => {
    // cats[10] — previously mis-indexed as cats[9].
    const contrastVerb = grammarCats[10]
    expectPresent(contrastVerb.title)
    contrastVerb.rules?.forEach(expectPresent)
    contrastVerb.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
  })

  it('renders the BER-/ME- contrast for adjective and numeral (previously dropped entirely)', () => {
    // cats[11] — previously mis-indexed as cats[10] AND therefore never
    // reached, since only 11 of the 12 categories were addressed at all.
    const contrastAdj = grammarCats[11]
    expectPresent(contrastAdj.title)
    contrastAdj.rules?.forEach(expectPresent)
    contrastAdj.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[1].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every paragraph of the Islam-in-Indonesië culture essay', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
