// Content-parity guard for the lesson-24 chapter conversion.
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

describe('lesson 24 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup (parsed sub-blocks, multi-line splits) can't
    // false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders the letter — dateline, salutation, body and signature', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    const p = c.paragraphs
    // p0 dateline, p1 salutation, p2..p(n-2) body, p(n-1) sign-off
    expectPresent(p[0].split('\n')[0])
    expectPresent(p[0].split('\n')[1])
    expectPresent(p[1])
    p.slice(2, p.length - 1).forEach(expectPresent)
    const [signOff, , signatory] = p[p.length - 1].split('\n')
    expectPresent(signOff)
    expectPresent(signatory)
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[1].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders every grammar category with rules, examples and the both-affix table', () => {
    const c = content.sections[2].content as {
      categories: Array<{
        title: string
        rules: string[]
        examples?: Array<{ dutch: string; indonesian: string }>
        table?: string[][]
      }>
    }
    for (const cat of c.categories) {
      expectPresent(cat.title)
      cat.rules.forEach(expectPresent)
      cat.examples?.forEach(ex => { expectPresent(ex.dutch); expectPresent(ex.indonesian) })
      cat.table?.forEach(row => row.forEach(expectPresent))
    }
  })

  it('renders the letter-writing guide — parts, sample, greetings, sentence banks, sign-offs, abbreviations', () => {
    const c = content.sections[3].content as { paragraphs: string[] }
    const p = c.paragraphs

    // p0 — four parts: "a. ID - NL" lines
    const partsLines = p[0].split('\n').filter((l) => /^[a-d]\./.test(l.trim()))
    for (const l of partsLines) {
      const body = l.replace(/^[a-d]\.\s*/, '')
      const [nl, id] = body.split(' - ').map((s) => s.trim())
      expectPresent(nl)
      expectPresent(id)
    }

    // p1 — worked sample letter (skip lead line)
    const sampleLines = p[1].split('\n').slice(1).join('\n').trim()
    expectPresent(sampleLines.split('\n')[0])

    // p2 — opening greetings, two-column rows
    const splitColumns = (line: string): [string, string] => {
      const m = line.split(/\s{2,}/)
      return [m[0]?.trim() ?? '', m.slice(1).join(' ').trim()]
    }
    const greetingRows = p[2].split('\n').slice(2).filter((l) => l.trim()).map(splitColumns)
    greetingRows.forEach(([id, nl]) => { expectPresent(id); expectPresent(nl) })

    // p3 — opening sentence bank (ID/NL pairs)
    const parseSentenceBank = (block: string) => {
      const lines = block.split('\n').slice(2).map((l) => l.trim())
      const pairs: Array<{ id: string; nl: string }> = []
      let pending = ''
      for (const line of lines) {
        if (!line) { pending = ''; continue }
        if (!pending) pending = line
        else { pairs.push({ id: pending, nl: line }); pending = '' }
      }
      return pairs
    }
    parseSentenceBank(p[3]).forEach((s) => { expectPresent(s.id); expectPresent(s.nl) })

    // p4 — closing sentences + sign-off table
    const closingRaw = p[4].split('\n').slice(2)
    const signOffStart = closingRaw.findIndex((l) => /Hormat kami|Hormat saya/.test(l))
    parseSentenceBank('x\n' + closingRaw.slice(0, signOffStart).join('\n')).forEach((s) => {
      expectPresent(s.id); expectPresent(s.nl)
    })
    closingRaw.slice(signOffStart).filter((l) => l.trim()).map(splitColumns).forEach(([id, nl]) => {
      expectPresent(id); expectPresent(nl)
    })

    // p5 — abbreviations reference table
    const abbrevRows = p[5].split('\n').slice(2).filter((l) => l.trim()).map((l) => {
      const cols = l.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean)
      return { afk: cols[0] ?? '', word: cols[1] ?? '', nl: cols.slice(2).join(' ') }
    })
    abbrevRows.forEach((row) => { expectPresent(row.afk); expectPresent(row.word); expectPresent(row.nl) })
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
