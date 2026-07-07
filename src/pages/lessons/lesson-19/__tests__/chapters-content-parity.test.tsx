// Content-parity guard for the lesson-19 chapter conversion.
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
 *  at <em> boundaries — either would false-negative a plain substring check.
 *  Content equality is what we guard, not spacing. Also drop dashes and
 *  commas per the lesson-5 template (harmless here — no renderer in this
 *  lesson transforms them away — kept for cross-lesson consistency). */
function normalise(s: string): string {
  return s.replace(/[\s–,-]+/g, '')
}

// LatihanTeaser strips the "Latihan I — " ordinal prefix before rendering
// (`sub.title.replace(/^Latihan\s+[IVX]+\s+—\s+/, '')`) — a deliberate
// presentational transform, not a content drop.
function stripLatihanPrefix(s: string): string {
  return s.replace(/^Latihan\s+[IVX]+\s+—\s+/, '')
}

describe('lesson 19 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders every dialogue line and its translation', () => {
    const c = content.sections[0].content as {
      lines: Array<{ text: string; speaker: string; translation: string }>
    }
    for (const line of c.lines) {
      expectPresent(line.text)
      expectPresent(line.translation)
    }
  })

  it('renders every journey vocabulary item', () => {
    const c = content.sections[1].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every sepeda motor part', () => {
    const c = content.sections[2].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the participants rules and examples (title replaced by a bespoke heading)', () => {
    const c = content.sections[3].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    const participants = c.categories[0]
    // cats[0].title ("Zinsbouw: agens, patiens en de partijen") is replaced by
    // the bespoke heading "Wie doet wat, voor wie, waarmee" — not asserted.
    participants.rules.forEach(expectPresent)
    participants.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
  })

  it('renders the word-order rules (minus the one re-expressed as the visual order track) and examples', () => {
    const c = content.sections[3].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    const wordOrder = c.categories[1]
    expectPresent(wordOrder.title) // rendered verbatim as the orderCaption
    // rules[1] (the literal "tijdsbepaling — partij 1 — ..." enumeration) is
    // deliberately re-expressed as the ORDER track's labelled steps, not
    // quoted verbatim — every other rule (including rules[0], previously
    // dropped by an off-by-one `.slice(2)`) renders as prose.
    wordOrder.rules.forEach((r, i) => { if (i !== 1) expectPresent(r) })
    wordOrder.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
  })

  it('renders both connective categories with their titles, rules and examples', () => {
    const c = content.sections[3].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    for (const cat of [c.categories[2], c.categories[3]]) {
      expectPresent(cat.title)
      cat.rules.forEach(expectPresent)
      cat.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders every latihan title (ordinal prefix stripped) and instruction', () => {
    const c = content.sections[4].content as { sections: Array<{ title: string; instruction: string }> }
    for (const sub of c.sections) {
      expectPresent(stripLatihanPrefix(sub.title))
      expectPresent(sub.instruction)
    }
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
