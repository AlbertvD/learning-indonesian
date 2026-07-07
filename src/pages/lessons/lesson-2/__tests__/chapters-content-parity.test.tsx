// Content-parity guard for the lesson-2 chapter conversion.
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
 *  at inline-markup boundaries (e.g. <em>, the woordgroep-slot spans) —
 *  either would false-negative a plain substring check. Content equality is
 *  what we guard, not spacing. */
function normalise(s: string): string {
  // Also drop dashes/en-dashes, commas, and slashes: the negation/adjective
  // rules use " -> " / " -- " as inline separators (presentational, dropped
  // from textContent by the row renderer), and renderWoordgroep() strips the
  // literal "/" slot markers from `/Saya/ /guru/`-style Indonesian examples
  // before rendering them as pill spans.
  // (em-dash included: the classifier gloss join renders " — "; colon too —
  //  the classifier renderer splits "head: pattern" and drops the colon;
  //  arrows too — the negation renderer swaps ASCII " -> " for a "→" glyph.)
  //  Parens too: the negation renderer unwraps "(gloss)".
  return s.replace(/[\s–—,:/>→()-]+/g, '')
}

// The ini/itu category titles carry a leading "1. "/"2. "/"3. " ordinal that
// IniItuSection strips before rendering (`cat.title.replace(/^\d+\.\s*/, '')`)
// — a deliberate presentational transform, not a content drop.
function stripOrdinal(s: string): string {
  return s.replace(/^\d+\.\s*/, '')
}

describe('lesson 2 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders every dialogue line, speaker and translation', () => {
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

  it('renders every leave-taking expression', () => {
    const c = content.sections[2].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every number 11-20', () => {
    const c = content.sections[3].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.dutch)
      expectPresent(item.indonesian)
    }
  })

  it('renders the SE- classifiers intro, rules and word order', () => {
    const c = content.sections[4].content as {
      intro: string
      word_order: string
      categories: Array<{ rules: string[] }>
    }
    expectPresent(c.intro)
    expectPresent(c.word_order)
    for (const cat of c.categories) {
      cat.rules.forEach(expectPresent)
    }
  })

  it('renders the woordgroepen intro, rules and every example', () => {
    const c = content.sections[5].content as {
      intro: string
      categories: Array<{ rules: string[] }>
      examples: Array<{ dutch: string; indonesian: string; note?: string }>
    }
    expectPresent(c.intro)
    for (const cat of c.categories) {
      cat.rules.forEach(expectPresent)
    }
    for (const ex of c.examples) {
      expectPresent(ex.indonesian)
      expectPresent(ex.dutch)
      expectPresent(ex.note)
    }
  })

  it('renders every ini/itu category with its rules and examples', () => {
    const c = content.sections[6].content as {
      intro: string
      categories: Array<{
        title: string
        rules: string[]
        examples: Array<{ dutch: string; indonesian: string }>
      }>
    }
    expectPresent(c.intro)
    for (const cat of c.categories) {
      expectPresent(stripOrdinal(cat.title))
      cat.rules.forEach(expectPresent)
      cat.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders the negation (tidak) intro and every rule', () => {
    const c = content.sections[7].content as { intro: string; categories: Array<{ rules: string[] }> }
    expectPresent(c.intro)
    for (const cat of c.categories) {
      cat.rules.forEach(expectPresent)
    }
  })

  it('renders the adjectives intro, placement rules, and every opposite pair', () => {
    const c = content.sections[8].content as {
      intro: string
      categories: Array<{
        title: string
        rules?: string[]
        notes?: string
        pairs?: Array<{ neg: string; pos: string; neg_dutch: string; pos_dutch: string }>
      }>
    }
    expectPresent(c.intro)
    const placement = c.categories.find(cat => cat.title === 'Plaatsing')
    placement?.rules?.forEach(expectPresent)
    const opposites = c.categories.find(cat => cat.pairs)
    expectPresent(opposites?.notes)
    for (const pair of opposites?.pairs ?? []) {
      expectPresent(pair.neg)
      expectPresent(pair.pos)
      expectPresent(pair.neg_dutch)
      expectPresent(pair.pos_dutch)
    }
  })

  it('renders the Borobudur culture text and all three spheres', () => {
    const c = content.sections[10].content as {
      intro: string
      paragraphs: string[]
      borobudur_levels: Array<{ code: string; name: string; dutch: string }>
    }
    expectPresent(c.intro)
    c.paragraphs.forEach(expectPresent)
    for (const lvl of c.borobudur_levels) {
      expectPresent(lvl.code)
      expectPresent(lvl.name)
      expectPresent(lvl.dutch)
    }
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
