// Auto-fill capability artifacts from legacy DB content.
// Implements docs/plans/2026-04-30-auto-fill-capability-artifacts-from-legacy-spec.md
//
// Task 1 (this file's first slice): pure planning functions, no DB I/O.
// Subsequent tasks add the DB adapter, staging merge, and CLI entry point.

export const AUTO_FILL_VERSION = '1'
export const AUTO_FILL_REVIEWED_BY = 'auto-from-legacy-db'

export interface ItemMeaning {
  language: string
  text: string
  isPrimary: boolean
}

export interface ItemAnswerVariant {
  language: string
  text: string
}

export interface ItemSource {
  id: string
  baseText: string
  normalizedText: string
  itemType: string
  isActive: boolean
  meanings: ItemMeaning[]
  answerVariants: ItemAnswerVariant[]
}

export interface PatternSource {
  id: string
  slug: string
  name: string
  shortExplanation: string
  introducedByLessonId: string
}

export interface AffixedFormPairSource {
  id: string
  sourceRef: string
  root: string
  derived: string
  allomorphRule: string
}

export interface GrammarExample {
  indonesian: string
  dutch: string
}

export interface GrammarCategory {
  title: string
  rules: string[]
  examples: GrammarExample[]
}

export interface GrammarSection {
  categories: GrammarCategory[]
}

export interface ArtifactPlanOutput {
  decision: 'fill' | 'skip'
  payloadJson?: Record<string, unknown>
  warning?: string
  critical?: string
}

// Dutch stopwords commonly seen in pattern names. Kept narrow to avoid dropping
// content words that may also appear as substrings in example text.
const DUTCH_STOPWORDS = new Set([
  'de', 'het', 'een', 'en', 'of', 'maar', 'met', 'zonder', 'voor', 'aan',
  'op', 'in', 'uit', 'tot', 'van', 'bij', 'om', 'door', 'over', 'na', 'naar',
  'als', 'dan', 'dat', 'die', 'is', 'zijn', 'wordt', 'worden',
])

function nowDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function provenanceFields(): { reviewedBy: string; reviewedAt: string; autoFillVersion: string } {
  return {
    reviewedBy: AUTO_FILL_REVIEWED_BY,
    reviewedAt: nowDate(),
    autoFillVersion: AUTO_FILL_VERSION,
  }
}

function trimOrEmpty(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function splitAcceptedL1(text: string): string[] {
  const trimmed = trimOrEmpty(text)
  if (!trimmed) return []
  const parts = trimmed
    .split(/\s+\/\s+|\s*;\s*/)
    .map(part => part.trim())
    .filter(part => part.length > 0)
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    if (!seen.has(part)) {
      seen.add(part)
      out.push(part)
    }
  }
  return out
}

export function tokenizePatternName(name: string): string[] {
  const stripped = trimOrEmpty(name).replace(/\(.*?\)/g, ' ')
  const tokens = stripped
    .toLowerCase()
    .split(/[^a-zà-öø-ÿ0-9]+/i)
    .map(token => token.trim())
    .filter(token => token.length > 0 && !DUTCH_STOPWORDS.has(token))
  return tokens
}

function pickPrimaryNlMeaning(item: ItemSource): { picked?: ItemMeaning; multiplePrimary: boolean } {
  const nl = item.meanings.filter(m => m.language === 'nl')
  if (nl.length === 0) return { multiplePrimary: false }

  const primaries = nl.filter(m => m.isPrimary && trimOrEmpty(m.text).length > 0)
  if (primaries.length === 1) {
    return { picked: primaries[0], multiplePrimary: false }
  }
  if (primaries.length > 1) {
    const longest = [...primaries].sort((a, b) => b.text.trim().length - a.text.trim().length)[0]
    return { picked: longest, multiplePrimary: true }
  }
  // No primary: longest non-empty NL row (matches "is_primary first; otherwise first NL row"
  // intent, with the longest-non-empty disambiguator from the spec risk register).
  const nonEmpty = nl.filter(m => trimOrEmpty(m.text).length > 0)
  if (nonEmpty.length === 0) return { multiplePrimary: false }
  const longest = [...nonEmpty].sort((a, b) => b.text.trim().length - a.text.trim().length)[0]
  return { picked: longest, multiplePrimary: false }
}

export function planMeaningL1(item: ItemSource): ArtifactPlanOutput {
  if (!item.isActive) return { decision: 'skip' }

  const { picked, multiplePrimary } = pickPrimaryNlMeaning(item)
  if (!picked) {
    if (item.meanings.some(m => m.language === 'nl')) {
      // NL row exists but trims to empty.
      return { decision: 'skip', critical: 'shape_failure: empty NL meaning' }
    }
    return { decision: 'skip' }
  }

  const value = trimOrEmpty(picked.text)
  if (!value) {
    return { decision: 'skip', critical: 'shape_failure: empty NL meaning after trim' }
  }

  const out: ArtifactPlanOutput = {
    decision: 'fill',
    payloadJson: { value, ...provenanceFields() },
  }
  if (multiplePrimary) {
    out.warning = 'multiple is_primary=true NL meanings; picked longest'
  }
  return out
}

export function planMeaningEn(item: ItemSource): ArtifactPlanOutput {
  if (!item.isActive) return { decision: 'skip' }
  const en = item.meanings.filter(m => m.language === 'en')
  if (en.length === 0) return { decision: 'skip' }
  const primary = en.find(m => m.isPrimary && trimOrEmpty(m.text).length > 0)
  const picked = primary ?? en.find(m => trimOrEmpty(m.text).length > 0)
  if (!picked) return { decision: 'skip', critical: 'shape_failure: empty EN meaning' }
  return {
    decision: 'fill',
    payloadJson: { value: trimOrEmpty(picked.text), ...provenanceFields() },
  }
}

export function planBaseText(item: ItemSource): ArtifactPlanOutput {
  if (!item.isActive) return { decision: 'skip' }
  const value = trimOrEmpty(item.baseText)
  if (!value) return { decision: 'skip', critical: 'shape_failure: empty base_text' }
  return {
    decision: 'fill',
    payloadJson: { value, ...provenanceFields() },
  }
}

export function planAcceptedAnswersId(item: ItemSource): ArtifactPlanOutput {
  if (!item.isActive) return { decision: 'skip' }
  const base = trimOrEmpty(item.baseText)
  if (!base) return { decision: 'skip' }
  const variants = item.answerVariants
    .filter(v => v.language === 'id')
    .map(v => trimOrEmpty(v.text))
    .filter(v => v.length > 0)
  const seen = new Set<string>()
  const values: string[] = []
  for (const candidate of [base, ...variants]) {
    if (!seen.has(candidate)) {
      seen.add(candidate)
      values.push(candidate)
    }
  }
  return {
    decision: 'fill',
    payloadJson: { values, ...provenanceFields() },
  }
}

export function planAcceptedAnswersL1(item: ItemSource): ArtifactPlanOutput {
  if (!item.isActive) return { decision: 'skip' }
  const meaningTexts = item.meanings.filter(m => m.language === 'nl').map(m => m.text)
  const variantTexts = item.answerVariants.filter(v => v.language === 'nl').map(v => v.text)
  if (meaningTexts.length === 0 && variantTexts.length === 0) return { decision: 'skip' }

  const seen = new Set<string>()
  const values: string[] = []
  for (const text of [...meaningTexts, ...variantTexts]) {
    for (const part of splitAcceptedL1(text)) {
      if (!seen.has(part)) {
        seen.add(part)
        values.push(part)
      }
    }
  }
  if (values.length === 0) {
    return { decision: 'skip', critical: 'shape_failure: empty NL accepted answers' }
  }
  return {
    decision: 'fill',
    payloadJson: { values, ...provenanceFields() },
  }
}

export function planPatternExplanationL1(pattern: PatternSource): ArtifactPlanOutput {
  const value = trimOrEmpty(pattern.shortExplanation)
  if (!value) return { decision: 'skip' }
  const out: ArtifactPlanOutput = {
    decision: 'fill',
    payloadJson: { value, ...provenanceFields() },
  }
  if (value.length < 20) {
    out.warning = `short_explanation < 20 chars (likely a one-liner): "${value}"`
  }
  return out
}

function categoryTitleMatches(category: GrammarCategory, pattern: PatternSource): boolean {
  const title = category.title.toLowerCase()
  const candidates = [pattern.name, pattern.slug]
    .map(c => trimOrEmpty(c).toLowerCase())
    .filter(c => c.length > 0)
  for (const candidate of candidates) {
    // Word-boundary substring: either side must touch a non-word boundary
    // when the candidate is multi-word, otherwise simple includes is enough.
    if (title.includes(candidate)) return true
    // Also test in reverse — pattern name/slug may carry the longer phrase.
    if (candidate.includes(title)) return true
  }
  return false
}

function exampleMatchesAnyToken(example: GrammarExample, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  const dutch = trimOrEmpty(example.dutch).toLowerCase()
  if (!dutch) return false
  return tokens.some(token => dutch.includes(token))
}

function formatPatternExample(example: GrammarExample): string {
  const id = trimOrEmpty(example.indonesian)
  const nl = trimOrEmpty(example.dutch)
  if (!id && !nl) return ''
  if (!nl) return id
  if (!id) return nl
  return `${id} — ${nl}`
}

export function planPatternExample(
  pattern: PatternSource,
  grammarSection: GrammarSection,
): ArtifactPlanOutput {
  const categories = grammarSection.categories.filter(c => c.examples.length > 0)
  if (categories.length === 0) return { decision: 'skip' }

  const tokens = tokenizePatternName(pattern.name)
  const matchingCategories = categories.filter(c => categoryTitleMatches(c, pattern))

  // Step 1 + 2: title-matched categories — prefer token-matched example, else
  // pick the first non-empty example in the matched category. Title alone is
  // a sufficient disambiguator when only one example exists in the category.
  if (matchingCategories.length > 0) {
    if (tokens.length > 0) {
      for (const category of matchingCategories) {
        const matched = category.examples.find(ex => exampleMatchesAnyToken(ex, tokens))
        if (matched) {
          const value = formatPatternExample(matched)
          if (value) {
            return {
              decision: 'fill',
              payloadJson: { value, ...provenanceFields() },
            }
          }
        }
      }
    }
    for (const category of matchingCategories) {
      for (const example of category.examples) {
        const value = formatPatternExample(example)
        if (value) {
          return {
            decision: 'fill',
            payloadJson: { value, ...provenanceFields() },
          }
        }
      }
    }
  }

  // Step 3: no title match. Fall back to the first non-empty example anywhere
  // in the lesson's grammar section + WARNING.
  for (const category of categories) {
    for (const example of category.examples) {
      const value = formatPatternExample(example)
      if (value) {
        return {
          decision: 'fill',
          payloadJson: { value, ...provenanceFields() },
          warning: 'lesson-wide fallback: no category title match for pattern',
        }
      }
    }
  }

  // Step 4: nothing usable.
  return { decision: 'skip' }
}

export function planRootDerivedPair(pair: AffixedFormPairSource): ArtifactPlanOutput {
  const root = trimOrEmpty(pair.root)
  const derived = trimOrEmpty(pair.derived)
  if (!root || !derived) return { decision: 'skip' }
  return {
    decision: 'fill',
    payloadJson: { root, derived, ...provenanceFields() },
  }
}

export function planAllomorphRule(pair: AffixedFormPairSource): ArtifactPlanOutput {
  const rule = trimOrEmpty(pair.allomorphRule)
  if (!rule) return { decision: 'skip' }
  return {
    decision: 'fill',
    payloadJson: { rule, ...provenanceFields() },
  }
}
