/**
 * lesson-stage/enrichEnTranslations.ts — fill English (EN) across all
 * learner-facing lesson content: vocabulary/expressions/numbers items,
 * dialogue lines, and grammar categories (title + rules + examples).
 *
 * Relocated + widened from `capability-stage/enrichEnTranslations.ts` per
 * ADR 0012: English is lesson material the learner reads (not in the Dutch
 * book), so the Lesson Stage generates it. The Capability Stage no longer
 * generates translations — it reads ID/NL/EN from the lesson-content tables.
 *
 * The old capability-side enricher only covered `learning-items.ts` items.
 * This one walks `lesson_sections.content` and fills:
 *   - items[].english                       (vocabulary/expressions/numbers)
 *   - lines[].translation_en                (dialogue)
 *   - categories[].title_en                 (grammar, rule-bearing categories)
 *   - categories[].rules_en[]               (grammar)
 *   - categories[].examples[].english       (grammar)
 *
 * Pure collect/apply are exported for unit testing; the orchestrator
 * `enrichMissingEnContent` batches the LLM calls. The runner caches the
 * enriched lesson.ts back to staging so subsequent runs skip the LLM work.
 *
 * Skipping:
 *   - ANTHROPIC_API_KEY not set → the default translator returns an empty Map
 *     (content publishes without EN; the sectionShape validator then fails
 *     CRITICAL on the missing l2_translation, surfacing the gap loudly).
 *   - No content missing EN → no API call.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface EnNeed {
  /** Stable per-run key: `${sectionIdx}|item|${i}` etc. (see collectEnNeeds). */
  key: string
  /** Indonesian source text (items / dialogue lines / grammar examples). */
  indonesian?: string
  /** Dutch — context for ID→EN, or the source text for NL→EN (titles / rules). */
  dutch?: string
}

/** Translate a batch of needs → Map<key, english>. Injectable for tests. */
export type EnTranslator = (needs: EnNeed[]) => Promise<Map<string, string>>

export interface EnFillCounts {
  items: number
  dialogueLines: number
  grammarCategories: number
}

interface SectionLike {
  content?: Record<string, unknown>
}

function isFilled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/** A grammar category feeds a pattern capability iff it carries rules. Pure
 *  reference grids (table only, no rules) stay in the content blob and are
 *  not projected to lesson_section_grammar_categories — so they need no EN. */
export function isCapabilityFeedingCategory(cat: unknown): boolean {
  const rules = (cat as { rules?: unknown })?.rules
  return Array.isArray(rules) && rules.some((r) => isFilled(r))
}

/**
 * Walk sections and collect every string still missing its English. Pure.
 * Indexes are array positions in the passed `sections` (apply uses the same).
 */
export function collectEnNeeds(sections: SectionLike[]): EnNeed[] {
  const needs: EnNeed[] = []

  sections.forEach((section, si) => {
    const content = section.content
    const type = content?.type

    if (type === 'vocabulary' || type === 'expressions' || type === 'numbers') {
      const items = content?.items
      if (!Array.isArray(items)) return
      items.forEach((raw, ii) => {
        const item = raw as Record<string, unknown>
        const indonesian = isFilled(item.indonesian) ? (item.indonesian as string).trim() : ''
        if (!indonesian) return
        if (isFilled(item.english)) return
        needs.push({
          key: `${si}|item|${ii}`,
          indonesian,
          dutch: isFilled(item.dutch) ? (item.dutch as string).trim() : undefined,
        })
      })
    } else if (type === 'dialogue') {
      const lines = content?.lines
      if (!Array.isArray(lines)) return
      lines.forEach((raw, li) => {
        const line = raw as Record<string, unknown>
        const text = isFilled(line.text) ? (line.text as string).trim() : ''
        if (!text) return
        if (isFilled(line.translation_en)) return
        needs.push({
          key: `${si}|line|${li}`,
          indonesian: text,
          dutch: isFilled(line.translation) ? (line.translation as string).trim() : undefined,
        })
      })
    } else if (type === 'grammar') {
      const categories = content?.categories
      if (!Array.isArray(categories)) return
      categories.forEach((rawCat, ci) => {
        const cat = rawCat as Record<string, unknown>
        if (!isCapabilityFeedingCategory(cat)) return

        if (isFilled(cat.title) && !isFilled(cat.title_en)) {
          needs.push({ key: `${si}|cat|${ci}|title`, dutch: (cat.title as string).trim() })
        }

        const rules = Array.isArray(cat.rules) ? cat.rules : []
        const rulesEn = Array.isArray(cat.rules_en) ? cat.rules_en : []
        rules.forEach((rule, ri) => {
          if (!isFilled(rule)) return
          if (isFilled(rulesEn[ri])) return
          needs.push({ key: `${si}|cat|${ci}|rule|${ri}`, dutch: (rule as string).trim() })
        })

        const examples = Array.isArray(cat.examples) ? cat.examples : []
        examples.forEach((rawEx, ei) => {
          const ex = rawEx as Record<string, unknown>
          const indonesian = isFilled(ex.indonesian) ? (ex.indonesian as string).trim() : ''
          if (!indonesian) return
          if (isFilled(ex.english)) return
          needs.push({
            key: `${si}|cat|${ci}|ex|${ei}`,
            indonesian,
            dutch: isFilled(ex.dutch) ? (ex.dutch as string).trim() : undefined,
          })
        })
      })
    }
  })

  return needs
}

/**
 * Apply translations back into sections in place. Pure (mutates the passed
 * objects). Returns the number of distinct items/lines/categories touched.
 */
export function applyEnTranslations(
  sections: SectionLike[],
  byKey: Map<string, string>,
): EnFillCounts {
  let items = 0
  let dialogueLines = 0
  const touchedCategories = new Set<string>()

  sections.forEach((section, si) => {
    const content = section.content
    const type = content?.type

    if (type === 'vocabulary' || type === 'expressions' || type === 'numbers') {
      const list = content?.items
      if (!Array.isArray(list)) return
      list.forEach((raw, ii) => {
        const en = byKey.get(`${si}|item|${ii}`)
        if (!en) return
        ;(raw as Record<string, unknown>).english = en
        items++
      })
    } else if (type === 'dialogue') {
      const lines = content?.lines
      if (!Array.isArray(lines)) return
      lines.forEach((raw, li) => {
        const en = byKey.get(`${si}|line|${li}`)
        if (!en) return
        ;(raw as Record<string, unknown>).translation_en = en
        dialogueLines++
      })
    } else if (type === 'grammar') {
      const categories = content?.categories
      if (!Array.isArray(categories)) return
      categories.forEach((rawCat, ci) => {
        const cat = rawCat as Record<string, unknown>

        const titleEn = byKey.get(`${si}|cat|${ci}|title`)
        if (titleEn) {
          cat.title_en = titleEn
          touchedCategories.add(`${si}|${ci}`)
        }

        const rules = Array.isArray(cat.rules) ? cat.rules : []
        if (rules.length > 0) {
          const rulesEn = Array.isArray(cat.rules_en) ? [...(cat.rules_en as unknown[])] : []
          rules.forEach((_rule, ri) => {
            const en = byKey.get(`${si}|cat|${ci}|rule|${ri}`)
            if (en) {
              rulesEn[ri] = en
              touchedCategories.add(`${si}|${ci}`)
            }
          })
          if (rulesEn.length > 0) cat.rules_en = rulesEn
        }

        const examples = Array.isArray(cat.examples) ? cat.examples : []
        examples.forEach((rawEx, ei) => {
          const en = byKey.get(`${si}|cat|${ci}|ex|${ei}`)
          if (en) {
            ;(rawEx as Record<string, unknown>).english = en
            touchedCategories.add(`${si}|${ci}`)
          }
        })
      })
    }
  })

  return { items, dialogueLines, grammarCategories: touchedCategories.size }
}

export interface EnEnrichmentResult {
  needed: number
  filled: EnFillCounts
}

const MODEL = 'claude-haiku-4-5-20251001'
const BATCH_SIZE = 30

/**
 * Default translator — Claude haiku, batched. Each entry shows the Indonesian
 * (when present) and the Dutch. The model returns the English equivalent of
 * the Indonesian when present (Dutch as context), else the English of the Dutch
 * (grammar explanations/titles have no Indonesian source).
 */
async function defaultTranslate(needs: EnNeed[]): Promise<Map<string, string>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn(`   ⚠ ANTHROPIC_API_KEY not set — skipping EN content enrichment (${needs.length} strings will publish without EN)`)
    return new Map()
  }

  const client = new Anthropic({ apiKey })
  const out = new Map<string, string>()

  for (let i = 0; i < needs.length; i += BATCH_SIZE) {
    const batch = needs.slice(i, i + BATCH_SIZE)
    const lines = batch
      .map((n, j) => {
        if (n.indonesian) {
          return `${j + 1}. Indonesian: "${n.indonesian}"${n.dutch ? ` | Dutch: "${n.dutch}"` : ''}`
        }
        return `${j + 1}. Dutch: "${n.dutch ?? ''}"`
      })
      .join('\n')

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Translate each numbered entry to English.
- If an entry has an Indonesian field, translate the Indonesian to English (use the Dutch as context for the intended sense). Keep it concise — same style as the Dutch (short, no explanations).
- If an entry has only a Dutch field, translate that Dutch text to natural English (these are grammar explanations or category titles).

Return ONLY a JSON object mapping each number to its English string. No prose, no markdown fences.

${lines}

Respond with only valid JSON, e.g.: {"1": "...", "2": "..."}`,
      }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) continue
    let parsed: Record<string, string>
    try {
      parsed = JSON.parse(match[0]) as Record<string, string>
    } catch {
      continue
    }
    batch.forEach((n, j) => {
      const en = parsed[String(j + 1)]
      if (typeof en === 'string' && en.trim().length > 0) out.set(n.key, en.trim())
    })
    console.log(`     EN batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(needs.length / BATCH_SIZE)}: ${batch.filter((n) => out.has(n.key)).length} translated`)
  }

  return out
}

/**
 * Collect → translate → apply. The runner persists the enriched lesson.ts so
 * subsequent runs skip already-translated content. Pass a stub translator in
 * tests; production uses the batched Claude call.
 */
export async function enrichMissingEnContent(
  sections: SectionLike[],
  translate: EnTranslator = defaultTranslate,
): Promise<EnEnrichmentResult> {
  const needs = collectEnNeeds(sections)
  if (needs.length === 0) {
    return { needed: 0, filled: { items: 0, dialogueLines: 0, grammarCategories: 0 } }
  }
  console.log(`   ► Filling EN on ${needs.length} learner-facing strings (items + dialogue + grammar) via Claude (${MODEL})...`)
  const byKey = await translate(needs)
  const filled = applyEnTranslations(sections, byKey)
  console.log(`   ✓ EN content enrichment: items=${filled.items} dialogue=${filled.dialogueLines} grammar=${filled.grammarCategories}`)
  return { needed: needs.length, filled }
}
