// Content-parity guard for the lesson-3 chapter conversion.
//
// With the one-chapter-at-a-time mount strategy the live DOM only ever holds
// the current chapter, so this test renders EVERY chapter node and asserts
// that all learner-facing strings from content.json appear somewhere in the
// combined output — i.e. slicing the page into chapters lost no content
// (docs/plans/2026-07-06-lesson-chapter-experience-program.md §3).
//
// Lesson 3's grammar sections (dari/di/ke, vraagwoorden, sekali, ada) parse
// the freeform `rules` arrays before rendering — some lines (the bare
// meaning definitions in the dari/di/ke category, e.g. "dari -- van,
// vanuit...") are never rendered by the ORIGINAL single-scroll page either
// (PlaceWordsSection only surfaces the "Vergelijk" headline + the two "->"
// usage warnings). This test mirrors that existing derivation exactly so it
// catches conversion regressions (a section dropped from a chapter) without
// false-failing on a pre-existing rendering choice this PR did not touch.

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
 *  at inline element boundaries (e.g. a PlayButton between two spans) —
 *  either would false-negative a plain substring check. Content equality is
 *  what we guard, not spacing. */
function normalise(s: string): string {
  return s.replace(/[\s–,-]+/g, '')
}

describe('lesson 3 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose renders as-is; check a normalized prefix so in-prose
    // markup can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders every dialogue line, translation and the closing line', () => {
    const c = content.sections[0].content as {
      lines: Array<{ text: string; speaker: string; translation: string }>
      closing?: string
    }
    for (const line of c.lines) {
      expectPresent(line.text)
      expectPresent(line.translation)
    }
    expectPresent(c.closing)
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[1].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every expression', () => {
    const c = content.sections[2].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every number rung', () => {
    const c = content.sections[3].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the full dari/di/ke body-word table (word, dutch gloss and every combination)', () => {
    const c = content.sections[4].content as {
      categories: Array<{ title: string; rules?: string[]; table?: Array<{ word: string; dutch: string; combinations: string[] }> }>
    }
    const tableCat = c.categories.find(cat => cat.table)
    expect(tableCat?.table?.length).toBeGreaterThan(0)
    for (const row of tableCat!.table!) {
      expectPresent(row.word)
      expectPresent(row.dutch)
      for (const combo of row.combinations) {
        const [lhs, rhs] = combo.split(' -- ')
        expectPresent(lhs)
        expectPresent(rhs)
      }
    }
  })

  it('renders the dari/di/ke headline comparison and the two usage warnings', () => {
    // Mirrors PlaceWordsSection's own derivation: only the "Vergelijk" line
    // and the two "->" rules render — the three bare meaning-definition
    // lines and the "worden altijd" warning are dropped by the ORIGINAL
    // component too (pre-existing, not a conversion regression).
    const c = content.sections[4].content as { categories: Array<{ rules?: string[] }> }
    const rules = c.categories.find(cat => cat.rules)?.rules ?? []

    const headline = rules.find(r => r.toLowerCase().includes('vergelijk'))
    expectPresent(headline?.replace('Vergelijk: ', ''))

    const arrowRules = rules.filter(r => r.includes('->'))
    expect(arrowRules.length).toBeGreaterThan(0)
    for (const rule of arrowRules) {
      const arrow = rule.indexOf(' -> ')
      const nl = rule.slice(0, arrow).replace(/^'|'$/g, '').trim()
      const rest = rule.slice(arrow + 4)
      const id = rest.replace(/\(correct\)|\(fout\)/gi, '').replace(/^NIET\s+/i, '').trim()
      expectPresent(nl)
      expectPresent(id)
    }
  })

  it('renders the vraagwoorden intro, note, all rows and every Q&A example', () => {
    const c = content.sections[5].content as {
      intro?: string
      note?: string
      categories: Array<{ table?: Array<{ word: string; asks: string; example: string }> }>
      examples?: Array<{ indonesian: string; dutch: string }>
    }
    expectPresent(c.intro)
    expectPresent(c.note)
    const rows = c.categories[0]?.table ?? []
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expectPresent(row.word)
      expectPresent(row.asks)
      expectPresent(row.example)
    }
    for (const ex of c.examples ?? []) {
      expectPresent(ex.indonesian)
      expectPresent(ex.dutch)
    }
  })

  it('renders the sekali intro and both worked examples', () => {
    const c = content.sections[6].content as { intro?: string; categories: Array<{ rules?: string[] }> }
    expectPresent(c.intro)
    const rules = c.categories[0]?.rules ?? []
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      const [lhs, rhs] = rule.split(' -- ')
      expectPresent(lhs)
      expectPresent(rhs)
    }
  })

  it('renders the ada intro, examples, the copular-verb warning, both wrong/right pairs and the closing note', () => {
    const c = content.sections[7].content as { intro?: string; categories: Array<{ rules?: string[] }> }
    expectPresent(c.intro)
    const rules = c.categories[0]?.rules ?? []
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      if (rule.startsWith('Opmerking:')) {
        expectPresent(rule.replace(/^Opmerking:\s*/, ''))
        continue
      }
      if (rule.includes(' -> ')) {
        const arrow = rule.indexOf(' -> ')
        const gloss = rule.slice(0, arrow).trim()
        const tail = rule.slice(arrow + 4).trim()
        const paren = tail.lastIndexOf('(')
        const right = paren > -1 ? tail.slice(0, paren).trim() : tail
        const wrong = paren > -1 ? tail.slice(paren + 1, tail.length - 1).replace(/^NIET:\s*/i, '').trim() : ''
        expectPresent(gloss)
        expectPresent(right)
        expectPresent(wrong)
        continue
      }
      if (rule.includes(' -- ')) {
        const [lhs, rhs] = rule.split(' -- ')
        expectPresent(lhs)
        expectPresent(rhs)
        continue
      }
      // Bare warning sentence (no arrow, no double-dash) — rendered in full.
      expectPresent(rule)
    }
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
