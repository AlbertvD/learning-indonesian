/**
 * lesson-stage/enrichGrammarTopics.ts — fill empty `grammar_topics` on
 * `grammar` / `reference_table` sections with a cohesive learner-friendly
 * summary of the lesson's grammar.
 *
 * Why this lives in lesson-stage. `lesson_sections.content.grammar_topics`
 * is data on `lesson_sections.content`. Stage A is the writer of
 * `lesson_sections` (`runner.ts:upsertLessonSections`). Filling the field
 * as part of Stage A lets it land in the same upsert that creates the
 * section row, rather than being patched downstream.
 *
 * Output shape: lesson-level. The enricher produces ≤2 short Dutch labels
 * (cohesive across all grammar sections) and writes the same array to
 * every grammar/reference_table section's `grammar_topics`. The runtime's
 * dedup-by-(lessonId, label) at `lessonService.ts:extractLessonGrammarTopics`
 * collapses the duplicates so the lesson card chip shows exactly 1–2
 * labels — no "+N more" overflow.
 *
 * Trigger: at least one `grammar`/`reference_table` section in the lesson
 * has missing or empty `grammar_topics`. If all sections are populated
 * (the state of lessons 1–3, 5–9 today via the legacy SQL backfill at
 * scripts/migration.sql:1834), the enricher is a no-op and existing
 * curated per-section labels are preserved.
 *
 * Fallbacks:
 *   - `ANTHROPIC_API_KEY` not set: deterministic per-section fill from
 *     `categories[].title` → `content.title` → `section.title`, with
 *     `"grammar:"` / `"grammatica:"` prefix stripped. May produce a
 *     "+N more" chip but unblocks GT1 validation.
 *   - LLM returns no usable labels: same deterministic fallback.
 */

import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_LABELS = 2
const MAX_LABEL_LENGTH = 40
const GRAMMAR_PREFIX = /^\s*(grammar|grammatica)\s*:\s*/i

interface SectionLike {
  title?: string
  order_index?: number
  content: Record<string, unknown> & {
    type?: unknown
    grammar_topics?: unknown
    categories?: unknown
    title?: unknown
  }
}

export interface GrammarTopicsEnrichmentResult {
  filledSectionCount: number
  labels: string[]
  source: 'llm' | 'deterministic' | 'none'
}

function isGrammarSection(section: SectionLike): boolean {
  const type = section.content?.type
  return type === 'grammar' || type === 'reference_table'
}

function hasEmptyGrammarTopics(section: SectionLike): boolean {
  const raw = section.content?.grammar_topics
  if (!Array.isArray(raw)) return true
  return raw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).length === 0
}

function stripPrefix(label: string): string {
  return label.replace(GRAMMAR_PREFIX, '').trim()
}

function categoryTitles(section: SectionLike): string[] {
  const cats = section.content?.categories
  if (!Array.isArray(cats)) return []
  return (cats as Array<{ title?: unknown }>)
    .map((c) => (typeof c?.title === 'string' ? c.title : ''))
    .filter((t) => t.length > 0)
}

function deterministicLabelsForSection(section: SectionLike): string[] {
  const cats = categoryTitles(section).map(stripPrefix).filter(Boolean)
  if (cats.length > 0) return cats
  const contentTitle = typeof section.content?.title === 'string' ? stripPrefix(section.content.title as string) : ''
  if (contentTitle.length > 0) return [contentTitle]
  const sectionTitle = typeof section.title === 'string' ? stripPrefix(section.title) : ''
  if (sectionTitle.length > 0) return [sectionTitle]
  return []
}

function deterministicFill(sections: SectionLike[]): GrammarTopicsEnrichmentResult {
  let filled = 0
  for (const section of sections) {
    if (!isGrammarSection(section)) continue
    if (!hasEmptyGrammarTopics(section)) continue
    const labels = deterministicLabelsForSection(section)
    if (labels.length === 0) continue
    section.content.grammar_topics = labels
    filled++
  }
  return { filledSectionCount: filled, labels: [], source: filled > 0 ? 'deterministic' : 'none' }
}

interface LlmInputSection {
  index: number
  title: string
  categories: string[]
}

function buildPrompt(lessonNumber: number, sections: LlmInputSection[]): string {
  const sectionsBlock = sections
    .map((s) =>
      `${s.index}. Section title: "${s.title}"\n   Categories: ${s.categories.length > 0 ? s.categories.map((c) => `"${c}"`).join('; ') : '(none)'}`,
    )
    .join('\n')

  return `You are summarising the grammar topics covered in lesson ${lessonNumber} of a Dutch-language Indonesian course for A1–B1 learners. The summary renders as a chip on the lesson card: "Grammar: <label1>, <label2>". It must fit one line.

Produce 1 OR 2 short Dutch labels that together describe what grammar this lesson teaches. Prefer 1 label when the lesson has a single coherent theme. Use 2 labels only when the lesson genuinely covers two distinct themes.

Rules:
- Dutch language, learner-friendly. Examples of good labels: "Yang-constructies", "Ontkenning", "Tijdaanduiding", "Voornaamwoorden", "Trappen van vergelijking", "Werkwoordvolgorde".
- Each label ≤ ${MAX_LABEL_LENGTH} characters.
- Do NOT include a "grammar:" or "grammatica:" prefix.
- Labels MUST be cohesive at the lesson level — if multiple sections relate to one theme, one label covers them.
- Do NOT echo full section/category names verbatim if they are long; abstract to the underlying concept.

Lesson ${lessonNumber} grammar sections:
${sectionsBlock}

Return ONLY valid JSON in this exact shape: {"labels": ["..."]} with 1 or 2 entries. No markdown fences, no prose, no explanation.`
}

async function callClaude(
  client: Anthropic,
  lessonNumber: number,
  sections: LlmInputSection[],
): Promise<string[] | null> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: buildPrompt(lessonNumber, sections) }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  let parsed: { labels?: unknown }
  try {
    parsed = JSON.parse(match[0]) as { labels?: unknown }
  } catch {
    return null
  }
  if (!Array.isArray(parsed.labels)) return null
  const labels = parsed.labels
    .filter((l: unknown): l is string => typeof l === 'string')
    .map(stripPrefix)
    .filter((l) => l.length > 0 && l.length <= MAX_LABEL_LENGTH)
    .slice(0, MAX_LABELS)
  return labels.length > 0 ? labels : null
}

export async function enrichMissingGrammarTopics(
  sections: SectionLike[],
  lessonNumber: number,
): Promise<GrammarTopicsEnrichmentResult> {
  const grammarSections = sections.filter(isGrammarSection)
  const emptySections = grammarSections.filter(hasEmptyGrammarTopics)
  if (emptySections.length === 0) {
    return { filledSectionCount: 0, labels: [], source: 'none' }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn(
      `   ⚠ ANTHROPIC_API_KEY not set — falling back to deterministic grammar_topics fill (${emptySections.length} sections need topics; chip may show "+N more")`,
    )
    return deterministicFill(sections)
  }

  const llmInput: LlmInputSection[] = grammarSections.map((s, i) => ({
    index: i + 1,
    title: typeof s.title === 'string' ? s.title : `Section ${s.order_index ?? i}`,
    categories: categoryTitles(s),
  }))

  console.log(
    `   ► Generating cohesive grammar_topics for lesson ${lessonNumber} (${grammarSections.length} grammar section${grammarSections.length === 1 ? '' : 's'}) via Claude (${MODEL})...`,
  )
  const client = new Anthropic({ apiKey })
  const labels = await callClaude(client, lessonNumber, llmInput)

  if (!labels || labels.length === 0) {
    console.warn(`   ⚠ Grammar topics enrichment: LLM returned no usable labels — using deterministic fallback`)
    return deterministicFill(sections)
  }

  for (const section of grammarSections) {
    section.content.grammar_topics = labels
  }
  console.log(`   ✓ Grammar topics: ${JSON.stringify(labels)} applied to ${grammarSections.length} section${grammarSections.length === 1 ? '' : 's'}`)
  return { filledSectionCount: grammarSections.length, labels, source: 'llm' }
}
