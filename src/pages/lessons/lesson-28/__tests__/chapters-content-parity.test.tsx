// Content-parity guard for the lesson-28 chapter conversion.
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
  return s.replace(/[\s–,-]+/g, '')
}

// Mirrors Page.tsx's cleanTranslation — the meeting transcript strips a
// presentational "Speaker: \"...\"" prefix from the NL translation because
// the speaker already renders as its own label (classes.turnSpeaker). This is
// NOT a content loss (the speaker name is still on-screen); asserting the
// cleaned string is what confirms the SUBSTANTIVE translation survived.
function cleanTranslation(translation: string): string {
  let t = translation.replace(/^[^:]{1,24}:\s*/, '').trim()
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim()
  return t
}

describe('lesson 28 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose lines render as-is; check a normalized prefix so in-prose
    // markup can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders every meeting-transcript line and its translation', () => {
    const c = content.sections[0].content as {
      lines: Array<{ text: string; speaker: string; translation: string }>
    }
    for (const line of c.lines) {
      expectPresent(line.text)
      expectPresent(line.speaker === 'narrator' ? line.translation : cleanTranslation(line.translation))
    }
    // Speaker labels themselves are learner-facing (colour-coded in the UI).
    const speakers = new Set(c.lines.map(l => l.speaker).filter(s => s !== 'narrator'))
    speakers.forEach(expectPresent)
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[1].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the fixed expression', () => {
    const c = content.sections[2].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the overview category (title + rules) and every law with its rules and examples', () => {
    const c = content.sections[3].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    // categories[0] is the overview/principle category — assert its title AND
    // examples explicitly (a sibling conversion found a renderer that
    // silently dropped the overview category's title/examples, keeping only
    // rules). This lesson's principle.examples happens to be empty in the
    // fixture, so the examples loop below is a no-op guard for this data,
    // not a false green — the title assertion is the one that bites.
    const principle = c.categories[0]
    expectPresent(principle.title)
    principle.rules.forEach(expectPresent)
    principle.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })

    for (const law of c.categories.slice(1)) {
      expectPresent(law.title)
      law.rules.forEach(expectPresent)
      law.examples.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    }
  })

  it('renders every Latihan block with its instruction and items', () => {
    const c = content.sections[4].content as {
      sections: Array<{ title: string; instruction: string; items: Array<{ prompt: string; answer?: string }> }>
    }
    for (const block of c.sections) {
      expectPresent(block.title)
      expectPresent(block.instruction)
      for (const item of block.items) {
        expectPresent(item.prompt)
        expectPresent(item.answer)
      }
    }
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
