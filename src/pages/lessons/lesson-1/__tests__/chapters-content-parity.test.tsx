// Content-parity guard for the lesson-1 chapter conversion.
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
  return s.replace(/[\s–,-]+/g, '')
}

describe('lesson 1 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders the pronunciation showcase — intro, every greeting example and every spelling rule', () => {
    const c = content.sections[0].content as {
      intro: string
      examples: Array<{ dutch: string; indonesian: string; phonetic?: string }>
      spelling: Array<{ rule: string; dutch: string; example: string }>
    }
    expectPresent(c.intro)
    for (const ex of c.examples) {
      expectPresent(ex.indonesian)
      expectPresent(ex.dutch)
      expectPresent(ex.phonetic)
    }
    for (const s of c.spelling) {
      expectPresent(s.rule)
      expectPresent(s.example)
      expectPresent(s.dutch)
    }
  })

  it('renders the full alphabet — every letter, rule and example', () => {
    const c = content.sections[7].content as {
      letters: Array<{ letter: string; rule: string; examples: string[] }>
    }
    for (const l of c.letters) {
      expectPresent(l.letter)
      expectPresent(l.rule)
      l.examples.forEach(expectPresent)
    }
  })

  it('renders every simple sentence, including the intro', () => {
    const c = content.sections[1].content as { intro?: string; sentences: Array<{ dutch: string; indonesian: string }> }
    expectPresent(c.intro)
    for (const s of c.sentences) {
      expectPresent(s.dutch)
      expectPresent(s.indonesian)
    }
  })

  it('renders every grammar category title, rule and example', () => {
    // Note: content.json's grammar section also carries an `intro` string,
    // but GrammarSection never renders it — a pre-existing gap in the
    // component predating this chapter conversion (kept byte-identical, not
    // fixed here). Only asserting what the component actually renders.
    const c = content.sections[2].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules.forEach(expectPresent)
      cat.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders the dialogue — setup, every speaker line and translation', () => {
    const c = content.sections[3].content as {
      setup?: string
      lines: Array<{ text: string; speaker: string; translation: string }>
    }
    expectPresent(c.setup)
    for (const line of c.lines) {
      expectPresent(line.speaker)
      expectPresent(line.text)
      expectPresent(line.translation)
    }
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[4].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every expression item', () => {
    const c = content.sections[5].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every number 0-10', () => {
    const c = content.sections[6].content as { items: Array<{ dutch: string; indonesian: string }> }
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
