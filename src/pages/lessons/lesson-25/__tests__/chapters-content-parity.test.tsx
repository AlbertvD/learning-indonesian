// Content-parity guard for the lesson-25 chapter conversion.
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
 *  at inline element boundaries (e.g. the play button between the Indonesian
 *  term and its arrow chain) — either would false-negative a plain substring
 *  check. Content equality is what we guard, not spacing. */
function normalise(s: string): string {
  return s.replace(/[\s→,]+/g, '')
}

describe('lesson 25 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders the marine-garden essay paragraphs', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders every dialogue line and its Dutch translation', () => {
    const c = content.sections[1].content as {
      lines: Array<{ text: string; speaker: string; translation: string }>
    }
    for (const line of c.lines) {
      expectPresent(line.text)
      expectPresent(line.translation)
    }
  })

  it('renders every tourism/Ambon vocabulary item', () => {
    const c = content.sections[2].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every grammar category with all rules and examples', () => {
    const c = content.sections[3].content as {
      categories: Array<{ title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string }> }>
    }
    // Categories 0 (overview) and 1-3 (the application sub-patterns) render
    // their own title + rules + examples verbatim (GrammarSection).
    for (const cat of c.categories.slice(0, 4)) {
      expectPresent(cat.title.replace(/^\d+\.\s*/, ''))
      cat.rules.forEach(expectPresent)
      cat.examples.forEach(ex => { expectPresent(ex.indonesian); expectPresent(ex.dutch) })
    }
  })

  it('renders the three-way contrast category via the triptych spread', () => {
    const c = content.sections[3].content as {
      categories: Array<{ examples: Array<{ dutch: string; indonesian: string }> }>
    }
    // Category 4 (the uitvoerder/proces/resultaat contrast) is NOT rendered
    // via GrammarSection's title/rules path — the triptych spread re-presents
    // its terms as a dedicated 3-column grid instead (hardcoded TRIPTYCH
    // labels + the same pemilih/penjual example terms, split on "/"). This
    // is pre-existing GrammarSection behaviour, unchanged by the chapter
    // conversion — only the terms are asserted here, not the raw title/rules.
    const contrastCat = c.categories[4]
    for (const ex of contrastCat.examples) {
      ex.indonesian.split('/').map(s => s.trim()).forEach(expectPresent)
      ex.dutch.split('/').map(s => s.trim()).forEach(expectPresent)
    }
  })

  it('renders the TELEPON PENTING phone reference card', () => {
    const c = content.sections[4].content as { paragraphs: string[] }
    const raw = c.paragraphs[0]
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (line.includes('|') && line.includes(':')) {
        const [id, nl] = line.split('|').map(s => s.trim())
        expectPresent(id.split(':')[0].trim())
        expectPresent((id.split(':')[1] ?? '').trim())
        expectPresent((nl.split(':')[0] ?? '').trim())
      } else if (line.startsWith('(*')) {
        expectPresent(line)
      }
    }
  })

  it('renders every fauna vocabulary item', () => {
    const c = content.sections[5].content as { items: Array<{ dutch: string; indonesian: string }> }
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
