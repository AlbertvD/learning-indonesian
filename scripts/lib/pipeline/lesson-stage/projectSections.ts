/**
 * lesson-stage/projectSections.ts — PURE projection from enriched lesson
 * sections (+ morphology pairs) to the typed lesson-section capability-contract
 * rows the Lesson Stage writes (PR 6, ADR 0011 + 0012).
 *
 * Produces, keyed by the section's order_index (the runner resolves
 * order_index → DB section_id after upsertLessonSections):
 *   - sectionMeta:       section_kind + source_section_ref per section
 *   - itemRows:          lesson_section_item_rows (vocab/expressions/numbers)
 *   - grammarCategories: lesson_section_grammar_categories (rule-bearing only)
 *   - grammarTopics:     lesson_section_grammar_topics (deduped labels)
 *   - affixedPairs:      lesson_section_affixed_pairs (lesson-level; section null)
 *
 * Harvest rule (spec §3.1, task HARD RULES): memorised primitives only —
 * words, short phrases, named numbers (0–20 + place-value landmarks). Composed
 * numbers ('dua puluh satu') and whole dialogue lines are NOT harvested here.
 *
 * No EN generation happens here — the EN enricher (enrichEnTranslations.ts)
 * runs BEFORE this and fills content.*.english in place; this projector just
 * reads those fields. Validation (required fields) is sectionShape.ts.
 */

import { cleanItemText } from '../../clean-item-text'

export interface ProjectedItemRow {
  sourceSectionOrderIndex: number
  display_order: number
  source_item_ref: string
  item_type: 'word' | 'phrase'
  indonesian_text: string
  l1_translation: string
  l2_translation: string | null
}

export interface ProjectedGrammarCategory {
  sourceSectionOrderIndex: number
  display_order: number
  title: string
  title_en: string | null
  rules: string[]
  rules_en: string[]
  examples: Array<{ indonesian: string; dutch: string | null; english: string | null }> | null
}

export interface ProjectedGrammarTopic {
  sourceSectionOrderIndex: number
  topic_label: string
}

export interface ProjectedAffixedPair {
  source_ref: string
  pattern_source_ref: string | null
  affix: string
  root_text: string
  derived_text: string
  allomorph_rule: string
  // Morphology phase-b application-tier payload (authored; nullable on the source
  // table — the cap-stage Layer-2 validator + projection NOT NULL enforce presence).
  affix_type: string | null
  affix_gloss: string | null
  allomorph_class: string | null
  circumfix_left: string | null
  circumfix_right: string | null
  productive: boolean | null
}

export interface SectionMeta {
  orderIndex: number
  sectionKind: string
  sourceSectionRef: string
}

export interface AffixedPairInput {
  sourceRef: string
  /** The authored grammar-pattern slug the cap stage resolves to grammar_pattern_id
   *  (must match the lesson's `l{N}-{title}` grammar_patterns.slug). */
  patternSourceRef?: string | null
  root: string
  derived: string
  allomorphRule?: string | null
  // Morphology phase-b authored payload (optional at the type level; the cap-stage
  // validator enforces the ones that are mandatory per affix_type).
  affixType?: string | null
  affixGloss?: string | null
  allomorphClass?: string | null
  circumfixLeft?: string | null
  circumfixRight?: string | null
  productive?: boolean | null
}

export interface ProjectSectionsInput {
  lessonNumber: number
  sections: Array<{ order_index: number; content?: Record<string, unknown> }>
  affixedPairs?: AffixedPairInput[]
}

export interface ProjectSectionsOutput {
  sectionMeta: SectionMeta[]
  itemRows: ProjectedItemRow[]
  grammarCategories: ProjectedGrammarCategory[]
  grammarTopics: ProjectedGrammarTopic[]
  affixedPairs: ProjectedAffixedPair[]
}

const ITEM_SECTION_TYPES = new Set(['vocabulary', 'expressions', 'numbers'])

/** Place-value landmark words that are items even when their value > 20. */
const NUMBER_LANDMARKS = new Set([
  'seratus', 'seribu', 'sejuta', 'semiliar', 'setriliun',
  'ratus', 'ribu', 'juta', 'miliar', 'triliun', 'puluh', 'belas',
])

export function sourceSectionRef(lessonNumber: number, orderIndex: number): string {
  return `lesson-${lessonNumber}/section-${orderIndex}`
}

/** Multi-token (whitespace-separated) Indonesian → phrase; single token → word. */
export function classifyItemType(indonesian: string): 'word' | 'phrase' {
  return /\s/.test(indonesian.trim()) ? 'phrase' : 'word'
}

/**
 * A numbers-section item is harvested as a vocab item iff it is a NAMED number:
 *   - numeric value 0–20 (from the `dutch` field, which holds the digits), OR
 *   - a place-value landmark word (seratus/seribu/sejuta/semiliar/setriliun,
 *     and the bare place words).
 * Composed numbers ('dua puluh satu', 'dua ratus', 'sepuluh ribu') are NOT
 * items — they are formed by the drilled belas-numbers pattern.
 */
export function isNamedNumber(indonesian: string, dutchValue: string | undefined): boolean {
  const digits = (dutchValue ?? '').replace(/[^\d]/g, '')
  if (digits.length > 0) {
    const value = parseInt(digits, 10)
    if (!Number.isNaN(value) && value >= 0 && value <= 20) return true
  }
  const firstToken = indonesian.trim().toLowerCase().split(/\s+/)[0] ?? ''
  return NUMBER_LANDMARKS.has(firstToken)
}

/** Affix from the allomorph-rule prefix ('meN- becomes…' → 'meN-'); falls back
 *  to the sourceRef's `morphology/<affix>-…` first segment. */
export function deriveAffix(sourceRef: string, allomorphRule: string | null | undefined): string {
  const ruleMatch = (allomorphRule ?? '').match(/^([A-Za-z]+-)/)
  if (ruleMatch) return ruleMatch[1]
  const lastSeg = sourceRef.split('/').pop() ?? ''
  const seg = lastSeg.split('-')[0] ?? ''
  return seg ? `${seg}-` : ''
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFeedingCategory(cat: Record<string, unknown>): boolean {
  const rules = cat.rules
  return Array.isArray(rules) && rules.some((r) => nonEmpty(r))
}

export function projectSections(input: ProjectSectionsInput): ProjectSectionsOutput {
  const { lessonNumber, sections } = input
  const sectionMeta: SectionMeta[] = []
  const itemRows: ProjectedItemRow[] = []
  const grammarCategories: ProjectedGrammarCategory[] = []
  const grammarTopics: ProjectedGrammarTopic[] = []

  for (const section of sections) {
    const content = section.content ?? {}
    const type = typeof content.type === 'string' ? content.type : ''
    const orderIndex = section.order_index
    sectionMeta.push({
      orderIndex,
      sectionKind: type,
      sourceSectionRef: sourceSectionRef(lessonNumber, orderIndex),
    })

    if (ITEM_SECTION_TYPES.has(type)) {
      const items = Array.isArray(content.items) ? content.items : []
      items.forEach((raw, ii) => {
        const item = raw as Record<string, unknown>
        const indonesianRaw = nonEmpty(item.indonesian) ? (item.indonesian as string).trim() : ''
        if (!indonesianRaw) return
        // Strip orthographic parentheticals (pronunciation gloss / optional letter)
        // so they don't leak into the reader, the TTS audio, or the MCQ answers.
        const indonesian = cleanItemText(indonesianRaw)
        if (type === 'numbers' && !isNamedNumber(indonesian, item.dutch as string | undefined)) return
        itemRows.push({
          sourceSectionOrderIndex: orderIndex,
          display_order: ii,
          source_item_ref: `lesson-${lessonNumber}/section-${orderIndex}/item-${ii}`,
          item_type: classifyItemType(indonesian),
          indonesian_text: indonesian,
          l1_translation: nonEmpty(item.dutch) ? (item.dutch as string).trim() : '',
          l2_translation: nonEmpty(item.english) ? (item.english as string).trim() : null,
        })
      })
    } else if (type === 'grammar') {
      const categories = Array.isArray(content.categories) ? content.categories : []
      categories.forEach((rawCat, ci) => {
        const cat = rawCat as Record<string, unknown>
        if (!isFeedingCategory(cat)) return
        const rules = (cat.rules as unknown[]).filter((r) => nonEmpty(r)).map((r) => (r as string).trim())
        const rulesEnRaw = Array.isArray(cat.rules_en) ? cat.rules_en : []
        const rules_en = rules.map((_r, ri) => (nonEmpty(rulesEnRaw[ri]) ? (rulesEnRaw[ri] as string).trim() : ''))
        const examplesRaw = Array.isArray(cat.examples) ? cat.examples : []
        const examples = examplesRaw.length > 0
          ? examplesRaw.map((rawEx) => {
              const ex = rawEx as Record<string, unknown>
              return {
                indonesian: nonEmpty(ex.indonesian) ? (ex.indonesian as string).trim() : '',
                dutch: nonEmpty(ex.dutch) ? (ex.dutch as string).trim() : null,
                english: nonEmpty(ex.english) ? (ex.english as string).trim() : null,
              }
            })
          : null
        grammarCategories.push({
          sourceSectionOrderIndex: orderIndex,
          display_order: ci,
          title: nonEmpty(cat.title) ? (cat.title as string).trim() : '',
          title_en: nonEmpty(cat.title_en) ? (cat.title_en as string).trim() : null,
          rules,
          rules_en,
          examples,
        })
      })

      const topics = Array.isArray(content.grammar_topics) ? content.grammar_topics : []
      const seen = new Set<string>()
      for (const raw of topics) {
        if (!nonEmpty(raw)) continue
        const label = (raw as string).trim()
        if (seen.has(label)) continue
        seen.add(label)
        grammarTopics.push({ sourceSectionOrderIndex: orderIndex, topic_label: label })
      }
    }
  }

  const affixedPairs: ProjectedAffixedPair[] = (input.affixedPairs ?? []).map((p) => ({
    source_ref: p.sourceRef,
    pattern_source_ref: p.patternSourceRef ?? null,
    affix: deriveAffix(p.sourceRef, p.allomorphRule),
    root_text: (p.root ?? '').trim(),
    derived_text: (p.derived ?? '').trim(),
    allomorph_rule: (p.allomorphRule ?? '').trim(),
    affix_type: p.affixType ?? null,
    affix_gloss: p.affixGloss ?? null,
    allomorph_class: p.allomorphClass ?? null,
    circumfix_left: p.circumfixLeft ?? null,
    circumfix_right: p.circumfixRight ?? null,
    productive: p.productive ?? null,
  }))

  return { sectionMeta, itemRows, grammarCategories, grammarTopics, affixedPairs }
}
