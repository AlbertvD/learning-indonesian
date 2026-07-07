// Content-parity guard for the lesson-10 chapter conversion.
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
 *  concatenates element boundaries without spaces (e.g. an id span followed
 *  by a gloss span), and JSX splits text nodes at <em> boundaries — either
 *  would false-negative a plain substring check. Content equality is what we
 *  guard, not spacing.
 *
 *  Unlike lesson-2/lesson-5, none of lesson 10's renderers strip non-
 *  whitespace separator characters (dashes, commas, colons) when
 *  transforming content — the one place a renderer "splits" raw text
 *  (NuancePanel's rasa/kira/pikir rows) only consumes whitespace at the
 *  split point, so plain whitespace-stripping is sufficient here. */
function normalise(s: string): string {
  return s.replace(/\s+/g, '')
}

type GrammarCategory = {
  title: string
  rules?: string[]
  table?: string[][]
  examples?: Array<{ dutch: string; indonesian: string }>
}

describe('lesson 10 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup (e.g. the Nuance panel's unsplit example rows) can't
    // false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  const checkGrammarSection = (sectionIndex: number) => {
    const c = content.sections[sectionIndex].content as { categories: GrammarCategory[] }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules?.forEach(expectPresent)
      cat.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
      cat.table?.forEach(row => row.forEach(expectPresent))
    }
  }

  it('renders the Majapahit / Gajah Mada history text', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders every dialogue line, speaker and translation', () => {
    const c = content.sections[1].content as {
      lines: Array<{ text: string; speaker: string; translation: string }>
    }
    for (const line of c.lines) {
      expectPresent(line.text)
      expectPresent(line.translation)
    }
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[2].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the parting-formula expression', () => {
    const c = content.sections[3].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the -AN suffix grammar: every category, rule, table cell and example', () => {
    checkGrammarSection(4)
  })

  it('renders the rasa/kira/pikir nuance panel intro, glosses and examples', () => {
    const c = content.sections[5].content as { paragraphs: string[] }
    expectPresent(c.paragraphs[0])
    ;(c.paragraphs[1] ?? '').split('\n').filter(Boolean).forEach(expectPresent)
    ;(c.paragraphs[2] ?? '').split('\n').filter(Boolean).forEach(expectPresent)
  })

  it('renders the ordinal-number grammar: every category, rule, table cell and example', () => {
    checkGrammarSection(6)
  })

  it('renders the arithmetic grammar: every category, rule, table cell and example', () => {
    checkGrammarSection(7)
  })

  it('renders the conjunctions grammar: every category, rule, table cell and example', () => {
    checkGrammarSection(8)
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
