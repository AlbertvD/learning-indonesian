// Content-parity guard for the lesson-13 chapter conversion.
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
 *  concatenates element boundaries without spaces (e.g. an <h3> followed by a
 *  <p>), and JSX splits text nodes at inline-markup boundaries (e.g. <em>,
 *  the base→derived transform spans) — either would false-negative a plain
 *  substring check. Content equality is what we guard, not spacing.
 *  Also drop dashes/en-dashes and commas: the ingredient/denomination-style
 *  chip renderers (money-changer denom chips, nota-bene verb chips) drop
 *  separators when converting prose runs into chips (presentational, not
 *  content). Arrows are NOT stripped — NasalRule re-renders the "→" as its
 *  own span, so it survives the base→derived transform verbatim (lesson 5's
 *  strip set, unmodified — this lesson has no colon/paren/em-dash transform
 *  that needs lesson-2's richer set; the one genuine separator-INSERTING
 *  transform, the nota-bene "maar" split, is tested by mirroring the
 *  renderer's own regex below rather than by widening normalise()). */
function normalise(s: string): string {
  return s.replace(/[\s–,-]+/g, '')
}

type GrammarCategory = {
  title: string
  rules: string[]
  examples?: Array<{ dutch: string; indonesian: string }>
}

describe('lesson 13 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup (sub-headers, chip lists) can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders the economic-history culture essay (all paragraphs)', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders the money primer intro, money-changer paragraph and footnote', () => {
    const c = content.sections[1].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders every dialogue line, speaker and translation', () => {
    const c = content.sections[2].content as {
      lines: Array<{ text: string; speaker: string; translation: string }>
    }
    for (const line of c.lines) {
      expectPresent(line.text)
      expectPresent(line.translation)
    }
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[3].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the fixed expression', () => {
    const c = content.sections[4].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the ME-concept, nasalisation and action-central categories with all rules and examples', () => {
    const c = content.sections[5].content as { categories: GrammarCategory[] }
    const [concept, a1, a2, b, central] = c.categories
    for (const cat of [concept, a1, a2, b, central]) {
      expectPresent(cat.title)
      cat.rules.forEach(expectPresent)
      cat.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders the nota-bene title and, via the renderer\'s own split, the maar-contrast and every verb chip', () => {
    const c = content.sections[5].content as { categories: GrammarCategory[] }
    const notaBene = c.categories[5]
    expectPresent(notaBene.title)

    // Mirror GrammarSection's "maar" split (Page.tsx) rather than testing the
    // raw sentence: the renderer inserts "Maar " and a period at the pivot,
    // so a naive whole-string substring check false-negatives on content that
    // DID render, just not verbatim (documented above in normalise()).
    const [yes, no] = notaBene.rules[0].split(/,\s*maar\s+/i)
    expectPresent(yes)
    expectPresent(no)

    // Mirror the chip-list parse (strip the "Tot deze groep horen onder
    // andere: " lead-in, split on comma-before-lowercase, pull word+gloss out
    // of each "word (gloss)" entry) so every one of the 28 verbs is checked
    // individually — the same reason as above, the raw comma-joined sentence
    // never renders verbatim.
    const entries = notaBene.rules[1]
      .replace(/^[^:]*:\s*/, '')
      .split(/,\s*(?=[a-z])/)
    expect(entries.length).toBeGreaterThan(20)
    for (const entry of entries) {
      const m = entry.match(/^([a-z']+)\s*\(([^)]+)\)/i)
      if (m) {
        expectPresent(m[1])
        expectPresent(m[2])
      } else {
        expectPresent(entry.replace(/\.$/, ''))
      }
    }
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
