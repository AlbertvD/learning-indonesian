// Phase 2 — build the NotebookLM source briefings from a lesson's VERIFIED grammar
// (post Phase-0). Pure + deterministic; no LLM grammar authoring.
//
//  - NL briefing: Dutch rules + Indonesian examples with their Dutch glosses
//    (what SD L<N>.txt already contains) + a framing header.
//  - EN briefing: English rules (`rules_en`) + Indonesian examples WITHOUT the
//    Dutch gloss (the English-speaking hosts translate them live — no Dutch leaks
//    into the EN episode) + a framing header. If `rules_en`/`title_en` is missing
//    for a category, that is surfaced as a warning (the EN briefing would
//    otherwise silently omit that rule rather than leak Dutch).
//
// The framing header carries the lesson's CEFR level so it travels into the
// instruction prompt and the hosts pitch to it.

import type { EpisodeMeta, Lang } from './prompts'

interface GrammarSection {
  title?: string | null
  content: Record<string, unknown>
}

export interface BriefingResult {
  nl: string
  en: string
  topics: string[] // category titles (NL) — also the deterministic coverage checklist for the output gate
  warnings: string[]
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(asString).filter(Boolean) : []
}

function renderTable(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((row) => Array.isArray(row))
    .map((row) => (row as unknown[]).map((c) => String(c ?? '').trim()).join(' — '))
}

function header(meta: EpisodeMeta, lang: Lang, topics: string[]): string {
  if (lang === 'nl') {
    return [
      `Kamoe Bisa — grammatica-aflevering`,
      `Les ${meta.lesson}: ${meta.title}`,
      `Niveau: ${meta.level} (ERK)`,
      `Doelgroep: Nederlandstaligen die Indonesisch leren.`,
      `Onderwerpen in deze aflevering: ${topics.join('; ')}.`,
      ``,
    ].join('\n')
  }
  return [
    `Kamoe Bisa — grammar episode`,
    `Lesson ${meta.lesson}: ${meta.title}`,
    `Level: CEFR ${meta.level}`,
    `Audience: learners of Indonesian.`,
    `Topics in this episode: ${topics.join('; ')}.`,
    ``,
  ].join('\n')
}

export function buildBriefings(meta: EpisodeMeta, sections: GrammarSection[]): BriefingResult {
  const warnings: string[] = []
  const warn = (m: string) => warnings.push(`L${meta.lesson}: ${m}`)
  const topics: string[] = []
  const nlBody: string[] = []
  const enBody: string[] = []

  for (const section of sections) {
    const content = section.content ?? {}
    const categories = Array.isArray(content.categories) ? (content.categories as Record<string, unknown>[]) : []

    for (const cat of categories) {
      const titleNl = asString(cat.title)
      const titleEn = asString(cat.title_en)
      if (titleNl) topics.push(titleNl)

      const rulesNl = asStringArray(cat.rules)
      const rulesEn = asStringArray(cat.rules_en)
      const table = renderTable(cat.table)
      const noteNl = asString(cat.note) || asString(cat.notes)
      const examples = Array.isArray(cat.examples) ? (cat.examples as Record<string, unknown>[]) : []

      // ── NL ──
      if (titleNl) nlBody.push(`## ${titleNl}`)
      for (const r of rulesNl) nlBody.push(`- ${r}`)
      if (table.length) nlBody.push('', ...table)
      if (examples.length) {
        nlBody.push('', 'Voorbeelden:')
        for (const ex of examples) {
          const id = asString(ex.indonesian)
          const nl = asString(ex.dutch)
          nlBody.push(`  ${[id, nl].filter(Boolean).join(' — ')}`)
        }
      }
      if (noteNl) nlBody.push('', `Opmerking: ${noteNl}`)
      nlBody.push('')

      // ── EN (English rules + bare Indonesian examples; no Dutch) ──
      if (!titleEn) warn(`category "${titleNl}" has no title_en — EN briefing uses the lesson context`)
      if (rulesNl.length && !rulesEn.length) warn(`category "${titleNl}" has no rules_en — its rules are omitted from the EN briefing (not leaked as Dutch)`)
      if (titleEn || titleNl) enBody.push(`## ${titleEn || titleNl}`)
      for (const r of rulesEn) enBody.push(`- ${r}`)
      if (table.length) enBody.push('', ...table)
      if (examples.length) {
        enBody.push('', 'Examples (Indonesian — translate into English for listeners):')
        for (const ex of examples) {
          const id = asString(ex.indonesian)
          if (id) enBody.push(`  ${id}`)
        }
      }
      enBody.push('')
    }

    // Top-level word_order / intro (rare) — NL only (no _en counterpart in the data).
    const wo = asString(content.word_order)
    if (wo) {
      nlBody.push(`Woordvolgorde: ${wo}`, '')
      warn(`section has top-level word_order with no English counterpart — EN briefing omits it`)
    }
  }

  if (topics.length === 0) warn('no grammar categories found — briefings are empty')

  const nl = header(meta, 'nl', topics) + '\n' + nlBody.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
  const en = header(meta, 'en', topics) + '\n' + enBody.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
  return { nl, en, topics, warnings }
}
