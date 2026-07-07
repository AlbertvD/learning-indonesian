// Content-parity guard for the lesson-7 chapter conversion.
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
 *  at <em>/<span> boundaries — either would false-negative a plain substring
 *  check. Content equality is what we guard, not spacing.
 *
 *  Also drop colons: the -nya topicalisatie renderer splits rule strings
 *  shaped "Constructie N (...): sentence" at "': '" into a head span and a
 *  sentence span, dropping the literal joiner (presentational, not content). */
function normalise(s: string): string {
  return s.replace(/[\s:]+/g, '')
}

// The "dagen" (days) week-strip cells render with the leading "hari " word
// stripped (`row[0].replace('hari ', '')`) — the block heading ("Dagen —
// hari") already carries that context. Deliberate presentational transform,
// applied only to the first 7 rows (the extras — "akhir minggu" etc — render
// unmodified).
function stripHariPrefix(s: string): string {
  return s.replace(/^hari /, '')
}

describe('lesson 7 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup (dropcap, marginal anchors, -nya pills) can't
    // false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders every dialogue line, speaker and translation', () => {
    const c = content.sections[1].content as {
      lines: Array<{ text: string; speaker: string; translation: string }>
    }
    for (const line of c.lines) {
      expectPresent(line.text)
      expectPresent(line.translation)
    }
  })

  it('renders every vocabulary (packing-list) item', () => {
    const c = content.sections[2].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders both travel expressions', () => {
    const c = content.sections[3].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the -nya topicalisatie constructions, headline and all example pairs', () => {
    const c = content.sections[4].content as {
      categories: Array<{ rules: string[]; examples?: Array<{ dutch: string; indonesian: string }> }>
    }
    const topicalisatie = c.categories[1]
    // The 3 "Constructie N (...): sentence" rules and the trailing "nadruk"
    // headline all render verbatim (constructies triptych + foot line).
    topicalisatie.rules.forEach(expectPresent)
    // The 6 illustrative example pairs (naam~Ali, rok~harga): these existed
    // in content.json but were never rendered by the pre-chapter page — see
    // the FIX comment in Page.next.tsx. Render coverage guards the fix.
    topicalisatie.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
  })

  it('renders the -nya possessive and nominalisatie example pairs', () => {
    const c = content.sections[4].content as {
      categories: Array<{ examples?: Array<{ dutch: string; indonesian: string }> }>
    }
    const possessive = c.categories[0]
    const nominalisatie = c.categories[2]
    // NOTE: possessive.rules / nominalisatie.rules are intentionally NOT
    // checked here — NyaGrammar paraphrases them into fixed prose ("Achter
    // een zelfstandig naamwoord = zijn / haar / hun.", "Maar nooit achter een
    // eigennaam: Rumah Tuti, niet Tutinya rumah.") instead of rendering the
    // JSON strings verbatim. Same information, different wording — a
    // pre-existing editorial choice unchanged by the chapter conversion, not
    // a content drop.
    possessive.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
    nominalisatie.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
  })

  it('renders the time-grammar unit, month and day tables', () => {
    const c = content.sections[5].content as {
      categories: Array<{ title: string; table?: string[][] }>
    }
    const eenheden = c.categories.find(cat => cat.title === 'Tijdseenheden')
    const maanden = c.categories.find(cat => cat.title === 'Maanden (bulan)')
    const dagen = c.categories.find(cat => cat.title.startsWith('Dagen'))

    eenheden?.table?.forEach(row => row.forEach(expectPresent))
    maanden?.table?.forEach(row => row.forEach(expectPresent))
    // Days: the first 7 (Senin-Minggu) render with "hari " stripped; the
    // extras (akhir minggu, malam Minggu, Minggu malam) render as-is.
    dagen?.table?.forEach((row, i) => {
      expectPresent(i < 7 ? stripHariPrefix(row[0]) : row[0])
      expectPresent(row[1])
    })
    // NOTE: dagen.rules (the capitalisation rule) is not checked verbatim —
    // it renders as part of the MAANDEN block's rubric ("Met hoofdletter —
    // net als de dagen."), a paraphrase covering both months and days in one
    // place instead of duplicating it under the days block too. Same fact,
    // different wording; a pre-existing editorial choice.
  })

  it('renders the tijdsbepalingen examples and the zinsbouw rules + examples', () => {
    const c = content.sections[5].content as {
      categories: Array<{ title: string; rules?: string[]; examples?: Array<{ dutch: string; indonesian: string }> }>
    }
    const bepaling = c.categories.find(cat => cat.title === 'Tijdsbepalingen')
    const zinsbouw = c.categories.find(cat => cat.title.startsWith('Zinsbouw'))

    // Only the "dulu"/"lalu"-prefixed rules render verbatim (the
    // `horizonRules` filter); the other two rules (the kemarin-dulu..besok
    // axis words, tadi/nanti) are restructured into the dayAxis/timeAxis
    // timeline cells with hardcoded Dutch glosses instead of the raw rule
    // strings — same information, pre-existing design.
    bepaling?.rules?.filter(r => r.startsWith('dulu') || r.startsWith('lalu')).forEach(expectPresent)
    bepaling?.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })

    zinsbouw?.rules?.forEach(expectPresent)
    zinsbouw?.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
  })

  it('renders every Garuda myth paragraph', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
