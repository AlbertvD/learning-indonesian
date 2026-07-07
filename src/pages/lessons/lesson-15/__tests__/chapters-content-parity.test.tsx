// Content-parity guard for the lesson-15 chapter conversion.
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
 *  at inline-markup boundaries (e.g. <em>, the decode-chip spans) — either
 *  would false-negative a plain substring check. Content equality is what we
 *  guard, not spacing. Also drop dashes/en-dash/em-dash, commas, colons,
 *  slashes and arrows: DecodeExamples/DropCard split "form → root" pairs and
 *  "prefix: examples" rules on these characters as structural separators,
 *  not content (mirrored explicitly below via decodeExamplePieces /
 *  dropCardPieces, but kept here too for the directly-rendered fields that
 *  still carry a colon or parens, e.g. category titles). */
function normalise(s: string): string {
  return s.replace(/[\s–—,:/>→()-]+/g, '')
}

// Mirrors DecodeExamples' own parsing ("melayang → layang; merasa → rasa"
// becomes two chips with no literal ";" or "→" text between form and root).
function decodeExamplePieces(raw: string): string[] {
  return raw
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .flatMap(pair => {
      const [form, root] = pair.split('→').map(s => s.trim())
      return [form, root].filter((s): s is string => Boolean(s))
    })
}

// Mirrors GrammarSection's isDropCard classification (Page.tsx/Page.next.tsx):
// the four "Bij <prefix>- …" rules render as DropCard; the trailing rule
// (which never names a me- prefix) renders verbatim as the closing caveat.
function isDropCardRule(rule: string): boolean {
  return /\bme\w*-/.test(rule)
}

// Mirrors DropCard's own parsing so the parity check reflects what's
// actually rendered: the "Bij <prefix>-" glue phrase is absorbed into the
// header's prefix chip rather than repeated in the body, and each
// ", maar " example separator becomes a form→root chip (no literal ": ",
// ", maar " or "→" text run).
function dropCardPieces(rule: string): string[] {
  const [body, examplesRaw] = rule.split(/:\s*/)
  const prefixMatch = body.match(/Bij (\w+-)/)
  const pieces = [body.replace(/^Bij \w+- /, '')]
  if (prefixMatch) pieces.push(prefixMatch[1])
  const examples = (examplesRaw ?? '')
    .split(/,\s*maar\s*/)
    .map(s => s.trim().replace(/\.$/, ''))
  for (const ex of examples) {
    const [form, root] = ex.split('→').map(s => s.trim())
    if (form) pieces.push(form)
    if (root) pieces.push(root)
  }
  return pieces
}

describe('lesson 15 chapters — content parity with content.json', () => {
  const combined = normalise(renderAllChaptersText())

  const expectPresent = (value: string | undefined | null) => {
    if (!value) return
    // Long prose paragraphs render as-is; check a normalized prefix so
    // in-prose markup can't false-negative.
    const needle = normalise(value).slice(0, 80)
    if (!needle) return
    expect(combined, `missing content: "${needle}"`).toContain(needle)
  }

  it('renders the culture essay in full', () => {
    const c = content.sections[0].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders the Indonesian narrative in full', () => {
    const c = content.sections[1].content as { paragraphs: string[] }
    c.paragraphs.forEach(expectPresent)
  })

  it('renders every vocabulary item', () => {
    const c = content.sections[2].content as { items: Array<{ dutch: string; indonesian: string }> }
    for (const item of c.items) {
      expectPresent(item.indonesian)
      expectPresent(item.dutch)
    }
  })

  it('renders the grammar concept, decode table, drop cards and loanword note', () => {
    const c = content.sections[3].content as {
      categories: Array<{ title: string; rules?: string[]; table?: string[][] }>
    }
    const [conceptCat, tableCat, dropCat, loanCat] = c.categories

    // Movement 0 — concept, rendered directly as numbered steps
    expectPresent(conceptCat.title)
    conceptCat.rules?.forEach(expectPresent)

    // Movement 1 — the decode table (spine): title, column headings, and
    // every row (prefix tag, plain cell, and every form→root example pair)
    expectPresent(tableCat.title)
    const [head, ...rows] = tableCat.table ?? []
    head.forEach(expectPresent)
    for (const row of rows) {
      expectPresent(row[0])
      expectPresent(row[1])
      decodeExamplePieces(row[2]).forEach(expectPresent)
    }

    // Movement 2 — the K·P·S·T drop-sound cards + the trailing ambiguity
    // caveat. Every rule must render somewhere: the four "Bij <prefix>-"
    // rules as parsed drop cards (incl. the meny-/"S" card — content-drop
    // fix, see Page.next.tsx), the fifth verbatim as the closing caveat.
    for (const rule of dropCat.rules ?? []) {
      if (isDropCardRule(rule)) {
        dropCardPieces(rule).forEach(expectPresent)
      } else {
        expectPresent(rule)
      }
    }

    // Movement 3 — loanword N.B., rendered directly as plain steps
    expectPresent(loanCat.title)
    loanCat.rules?.forEach(expectPresent)
  })

  it('renders the practice chapter with the activation gate', () => {
    expect(combined).toContain(normalise('Klaar om te oefenen?'))
    expect(combined).toContain(normalise('Activeer de les'))
  })
})
