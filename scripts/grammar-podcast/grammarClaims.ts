// Phase 0 — grammar verification: extract the verifiable grammar *claims* from a
// lesson's grammar sections, so each can be cross-checked against an authoritative
// source (TBBBI rules / KBBI words). Pure + deterministic.
//
// A "claim" is one grammatical assertion: a rule, a note (often an exception), a
// table row, or a top-level word-order/intro statement. Every assertion in the
// grammar becomes exactly one claim — nothing is silently dropped. Any grammar
// field shape the extractor does not recognise is reported as a warning (mirrors
// generate-grammar-audio-script.ts's no-silent-drop guarantee), never ignored.

export interface ClaimExample {
  indonesian: string
  gloss: string // Dutch gloss (the example's `dutch` field)
  note?: string
}

export type ClaimKind = 'rule' | 'note' | 'table' | 'word_order' | 'intro'

export interface GrammarClaim {
  claimId: string // stable: L{lesson}-s{sectionIdx}-c{catIdx}-{kind}{n}
  lesson: number
  topic: string // the category (or section) title for context
  kind: ClaimKind
  text: string // the assertion to verify
  examples: ClaimExample[] // category-level examples, for context
}

export interface ClaimExtraction {
  lesson: number
  claims: GrammarClaim[]
  warnings: string[] // unhandled field shapes — surfaced, never silently dropped
}

// Field vocabularies — anything outside these triggers a warning so a corrected
// lesson that introduces a new grammar field shape can't silently bypass review.
const KNOWN_SECTION_KEYS = new Set(['type', 'categories', 'grammar_topics', 'intro', 'word_order', 'examples', 'note', 'notes'])
const KNOWN_CATEGORY_KEYS = new Set([
  'title', 'rules', 'examples', 'table', 'note', 'notes',
  'title_en', 'rules_en', // English enrichment — not a separate claim (same rule, other language)
])

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function extractExamples(raw: unknown): ClaimExample[] {
  if (!Array.isArray(raw)) return []
  const out: ClaimExample[] = []
  for (const ex of raw) {
    if (!ex || typeof ex !== 'object') continue
    const e = ex as Record<string, unknown>
    const indonesian = asString(e.indonesian)
    const gloss = asString(e.dutch)
    const note = asString(e.note)
    if (!indonesian && !gloss) continue
    out.push(note ? { indonesian, gloss, note } : { indonesian, gloss })
  }
  return out
}

function renderTableRow(row: unknown): string {
  if (!Array.isArray(row)) return ''
  return row.map((c) => String(c ?? '').trim()).join(' — ')
}

interface GrammarSection {
  title?: string | null
  content: Record<string, unknown>
}

// Pull every verifiable claim out of a lesson's grammar sections (in order).
export function extractGrammarClaims(lesson: number, sections: GrammarSection[]): ClaimExtraction {
  const claims: GrammarClaim[] = []
  const warnings: string[] = []
  const warn = (msg: string) => warnings.push(`L${lesson}: ${msg}`)

  sections.forEach((section, sIdx) => {
    const content = section.content ?? {}
    const sectionTitle = asString(section.title) || `Grammatica ${sIdx + 1}`

    const intro = asString(content.intro)
    if (intro) claims.push({ claimId: `L${lesson}-s${sIdx}-intro`, lesson, topic: sectionTitle, kind: 'intro', text: intro, examples: [] })

    const wordOrder = asString(content.word_order)
    if (wordOrder) claims.push({ claimId: `L${lesson}-s${sIdx}-wo`, lesson, topic: sectionTitle, kind: 'word_order', text: wordOrder, examples: [] })

    const categories = Array.isArray(content.categories) ? (content.categories as Record<string, unknown>[]) : []
    categories.forEach((cat, cIdx) => {
      const topic = asString(cat.title) || sectionTitle
      const examples = extractExamples(cat.examples)

      const rules = Array.isArray(cat.rules) ? cat.rules : []
      rules.forEach((r, rIdx) => {
        const text = asString(r)
        if (text) claims.push({ claimId: `L${lesson}-s${sIdx}-c${cIdx}-r${rIdx}`, lesson, topic, kind: 'rule', text, examples })
      })

      const table = Array.isArray(cat.table) ? cat.table : []
      table.forEach((row, tIdx) => {
        const text = renderTableRow(row)
        if (text) claims.push({ claimId: `L${lesson}-s${sIdx}-c${cIdx}-t${tIdx}`, lesson, topic, kind: 'table', text, examples: [] })
      })

      const note = asString(cat.note) || asString(cat.notes)
      if (note) claims.push({ claimId: `L${lesson}-s${sIdx}-c${cIdx}-note`, lesson, topic, kind: 'note', text: note, examples })

      for (const k of Object.keys(cat)) {
        if (!KNOWN_CATEGORY_KEYS.has(k)) warn(`unhandled category field "${k}" in "${topic}" — not verified`)
      }
    })

    // Top-level examples / section note attach to the section topic as context-bearing claims.
    const topLevelExamples = extractExamples(content.examples)
    if (topLevelExamples.length > 0) {
      const sectionNote = asString(content.note) || asString(content.notes)
      claims.push({
        claimId: `L${lesson}-s${sIdx}-ex`,
        lesson,
        topic: sectionTitle,
        kind: 'rule',
        text: sectionNote || `Voorbeelden voor "${sectionTitle}"`,
        examples: topLevelExamples,
      })
    }

    for (const k of Object.keys(content)) {
      if (!KNOWN_SECTION_KEYS.has(k)) warn(`unhandled section field "${k}" in "${sectionTitle}" — not verified`)
    }
  })

  return { lesson, claims, warnings }
}
