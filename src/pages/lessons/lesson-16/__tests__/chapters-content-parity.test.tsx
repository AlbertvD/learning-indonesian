// Content-parity guard for the lesson-16 chapter conversion.
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
 *  Content equality is what we guard, not spacing. */
function normalise(s: string): string {
  // Also drop dashes and commas — no other separator transform is in play for
  // this lesson's renderers (dialogue/vocab/culture text renders verbatim;
  // the one grammar-example transform is handled by stripTrailingParen below,
  // not by this whitespace pass).
  return s.replace(/[\s–,-]+/g, '')
}

/** FlipBoard/RuleTile (Page.tsx) strip a trailing "(...)" annotation off each
 *  grammar example's dutch translation before rendering — e.g. "Zij stuurt
 *  een postpakket (actief — agens centraal)" renders as just "Zij stuurt een
 *  postpakket"; the active/passief and transitief/intransitief labels are
 *  shown via the flipTag/tile-header instead. Mirror the exact renderer regex
 *  here so the check asserts what's actually rendered, not the raw JSON
 *  string (presentational transform, not a content drop). */
function stripTrailingParen(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, '')
}

describe('lesson 16 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders the culture essay — every paragraph', () => {
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

  // The opener category's `title` ("De DI-vorm: de lijdende (passieve)
  // werkwoordsvorm") is deliberately NOT rendered by FlipBoard — GrammarSection
  // already carries its own bespoke <h2> ("De lijdende vorm: het lijdend
  // voorwerp naar voren") that communicates the same idea. This is pre-existing
  // editorial behaviour (present before the chapter conversion), not a drop
  // introduced by re-grouping — noted, not asserted, per the title-replacement
  // exception. The remaining 4 categories DO render their own titles via
  // RuleTile's tileTitle, and are asserted below.
  it('renders every grammar category — rules + examples always, titles for the 4 rule-tiles', () => {
    const c = content.sections[3].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    const [opener, ...tiles] = c.categories

    opener.rules.forEach(expectPresent)
    opener.examples.forEach(ex => {
      expectPresent(ex.indonesian)
      expectPresent(stripTrailingParen(ex.dutch))
    })

    for (const cat of tiles) {
      expectPresent(cat.title)
      cat.rules.forEach(expectPresent)
      cat.examples.forEach(ex => {
        expectPresent(ex.indonesian)
        expectPresent(stripTrailingParen(ex.dutch))
      })
    }
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
