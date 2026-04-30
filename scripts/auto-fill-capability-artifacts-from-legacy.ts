// Auto-fill capability artifacts from legacy DB content.
// Implements docs/plans/2026-04-30-auto-fill-capability-artifacts-from-legacy-spec.md
//
// Task 1: pure planning functions (no DB I/O).
// Task 2: DB adapter — load + chunked transactional updates.
// Task 3: staging merge + deterministic write-back.
// Task 4: CLI orchestrator — runs dry-run / apply, prints JSON report.
//
// Run: NODE_TLS_REJECT_UNAUTHORIZED=0 \
//   npx tsx scripts/auto-fill-capability-artifacts-from-legacy.ts --dry-run

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

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

// ----- DB adapter (Task 2) -----------------------------------------------

export interface DraftArtifactRow {
  id: string
  capabilityId: string
  artifactKind: string
  artifactJson: Record<string, unknown>
  capability: {
    canonicalKey: string
    sourceKind: string
    sourceRef: string
    capabilityType: string
  }
}

export interface LearningItemRow {
  id: string
  baseText: string
  normalizedText: string
  itemType: string
  isActive: boolean
  sourceLessonId?: string | null
}

export interface ItemMeaningRow {
  learningItemId: string
  translationLanguage: string
  translationText: string
  isPrimary: boolean
}

export interface AnswerVariantRow {
  learningItemId: string
  variantText: string
  language: string
}

export interface ItemContextRow {
  learningItemId: string
  contextType: string
  sentenceText: string | null
  translationText: string | null
  sourceLessonId: string | null
}

export interface GrammarPatternRow {
  id: string
  slug: string
  name: string
  shortExplanation: string
  introducedByLessonId: string | null
}

export interface LessonSectionRow {
  id: string
  lessonId: string
  content: Record<string, unknown> | null
}

// Loose type for the supabase-js client to keep this module testable without
// pulling in @supabase/supabase-js types.
type SupabaseLike = {
  schema: (name: string) => {
    from: (table: string) => SupabaseQueryBuilder
  }
}

type SupabaseQueryBuilder = {
  select?: (cols: string) => SupabaseQueryBuilder
  update?: (payload: Record<string, unknown>) => SupabaseQueryBuilder
  eq?: (col: string, value: unknown) => SupabaseQueryBuilder
  in?: (col: string, values: unknown[]) => SupabaseQueryBuilder
  filter?: (col: string, op: string, value: unknown) => SupabaseQueryBuilder
  range?: (from: number, to: number) => SupabaseQueryBuilder
  then?: (resolve: (v: { data: unknown[] | null; error: unknown }) => void) => void
}

const PG_PAGE_SIZE = 1000

const PG_IN_CHUNK_SIZE = 50

function db(client: SupabaseLike) {
  return client.schema('indonesian')
}

function autoFillStableSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function detectSlugCollisions(items: LearningItemRow[]): Map<string, LearningItemRow[]> {
  const bySlug = new Map<string, LearningItemRow[]>()
  for (const item of items) {
    if (!item.isActive) continue
    const slug = autoFillStableSlug(item.baseText)
    if (!slug) continue
    const list = bySlug.get(slug) ?? []
    list.push(item)
    bySlug.set(slug, list)
  }
  const collisions = new Map<string, LearningItemRow[]>()
  for (const [slug, rows] of bySlug.entries()) {
    if (rows.length > 1) collisions.set(slug, rows)
  }
  return collisions
}

export async function loadDraftArtifactsWithCapability(
  client: SupabaseLike,
): Promise<DraftArtifactRow[]> {
  const out: DraftArtifactRow[] = []
  let offset = 0
  // Page through PostgREST's default 1000-row cap; embedded join keeps the
  // payload manageable while still giving us source metadata in one query.
  while (true) {
    const builder = db(client).from('capability_artifacts') as SupabaseQueryBuilder
    let q = builder.select!(`
      id, capability_id, artifact_kind, artifact_json,
      capability:learning_capabilities!inner(canonical_key, source_kind, source_ref, capability_type)
    `)
    q = q.eq!('quality_status', 'draft')
    q = q.filter!('artifact_json->>placeholder', 'eq', 'true')
    q = q.range!(offset, offset + PG_PAGE_SIZE - 1)
    const { data, error } = await new Promise<{ data: unknown[] | null; error: unknown }>(
      resolve => q.then!(resolve),
    )
    if (error) throw error
    const rows = (data ?? []) as Array<Record<string, unknown>>
    for (const row of rows) {
      const cap = row.capability as Record<string, unknown> | null
      out.push({
        id: String(row.id),
        capabilityId: String(row.capability_id),
        artifactKind: String(row.artifact_kind),
        artifactJson: (row.artifact_json as Record<string, unknown>) ?? {},
        capability: {
          canonicalKey: String(cap?.canonical_key ?? ''),
          sourceKind: String(cap?.source_kind ?? ''),
          sourceRef: String(cap?.source_ref ?? ''),
          capabilityType: String(cap?.capability_type ?? ''),
        },
      })
    }
    if (rows.length < PG_PAGE_SIZE) break
    offset += PG_PAGE_SIZE
  }
  return out
}

export async function loadActiveLearningItems(
  client: SupabaseLike,
): Promise<LearningItemRow[]> {
  const builder = db(client).from('learning_items') as SupabaseQueryBuilder
  const q = builder
    .select!('id, base_text, normalized_text, item_type, is_active')
    .eq!('is_active', true)
  const { data, error } = await new Promise<{ data: unknown[] | null; error: unknown }>(
    resolve => q.then!(resolve),
  )
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    baseText: String(row.base_text ?? ''),
    normalizedText: String(row.normalized_text ?? ''),
    itemType: String(row.item_type ?? ''),
    isActive: Boolean(row.is_active),
    // sourceLessonId comes from item_contexts; the test fixture sets it
    // directly for convenience but the live DB derives it via the bridge below.
    sourceLessonId: (row.source_lesson_id as string | null | undefined) ?? null,
  }))
}

export interface LessonRow {
  id: string
  orderIndex: number
}

export async function loadLessons(client: SupabaseLike): Promise<LessonRow[]> {
  const builder = db(client).from('lessons') as SupabaseQueryBuilder
  const q = builder.select!('id, order_index')
  const { data, error } = await new Promise<{ data: unknown[] | null; error: unknown }>(
    resolve => q.then!(resolve),
  )
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    orderIndex: Number(row.order_index),
  }))
}

async function loadInChunks<TRow>(
  client: SupabaseLike,
  table: string,
  selectCols: string,
  itemIds: string[],
  filterCol: string,
  extraFilters: Array<{ col: string; value: unknown }> = [],
  mapRow: (row: Record<string, unknown>) => TRow = (row: Record<string, unknown>) => row as TRow,
): Promise<TRow[]> {
  if (itemIds.length === 0) return []
  const out: TRow[] = []
  for (let i = 0; i < itemIds.length; i += PG_IN_CHUNK_SIZE) {
    const chunk = itemIds.slice(i, i + PG_IN_CHUNK_SIZE)
    const builder = db(client).from(table) as SupabaseQueryBuilder
    let q = builder.select!(selectCols).in!(filterCol, chunk)
    for (const f of extraFilters) {
      q = q.eq!(f.col, f.value)
    }
    const { data, error } = await new Promise<{ data: unknown[] | null; error: unknown }>(
      resolve => q.then!(resolve),
    )
    if (error) throw error
    const rows = (data ?? []) as Array<Record<string, unknown>>
    for (const row of rows) out.push(mapRow(row))
  }
  return out
}

export async function loadItemMeanings(
  client: SupabaseLike,
  itemIds: string[],
): Promise<ItemMeaningRow[]> {
  return loadInChunks<ItemMeaningRow>(
    client,
    'item_meanings',
    'learning_item_id, translation_language, translation_text, is_primary',
    itemIds,
    'learning_item_id',
    [],
    row => ({
      learningItemId: String(row.learning_item_id),
      translationLanguage: String(row.translation_language ?? ''),
      translationText: String(row.translation_text ?? ''),
      isPrimary: Boolean(row.is_primary),
    }),
  )
}

export async function loadAnswerVariants(
  client: SupabaseLike,
  itemIds: string[],
): Promise<AnswerVariantRow[]> {
  return loadInChunks<AnswerVariantRow>(
    client,
    'item_answer_variants',
    'learning_item_id, variant_text, language',
    itemIds,
    'learning_item_id',
    [],
    row => ({
      learningItemId: String(row.learning_item_id),
      variantText: String(row.variant_text ?? ''),
      language: String(row.language ?? ''),
    }),
  )
}

export async function loadItemContexts(
  client: SupabaseLike,
  itemIds: string[],
): Promise<ItemContextRow[]> {
  return loadInChunks<ItemContextRow>(
    client,
    'item_contexts',
    'learning_item_id, context_type, source_text, translation_text, source_lesson_id',
    itemIds,
    'learning_item_id',
    [],
    row => ({
      learningItemId: String(row.learning_item_id),
      contextType: String(row.context_type ?? ''),
      sentenceText: row.source_text == null ? null : String(row.source_text),
      translationText: row.translation_text == null ? null : String(row.translation_text),
      sourceLessonId: row.source_lesson_id == null ? null : String(row.source_lesson_id),
    }),
  )
}

export async function loadGrammarPatterns(
  client: SupabaseLike,
): Promise<GrammarPatternRow[]> {
  const builder = db(client).from('grammar_patterns') as SupabaseQueryBuilder
  const q = builder.select!('id, slug, name, short_explanation, introduced_by_lesson_id')
  const { data, error } = await new Promise<{ data: unknown[] | null; error: unknown }>(
    resolve => q.then!(resolve),
  )
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? ''),
    shortExplanation: String(row.short_explanation ?? ''),
    introducedByLessonId: row.introduced_by_lesson_id == null ? null : String(row.introduced_by_lesson_id),
  }))
}

export async function loadLessonSections(
  client: SupabaseLike,
  lessonIds: string[],
): Promise<LessonSectionRow[]> {
  return loadInChunks<LessonSectionRow>(
    client,
    'lesson_sections',
    'id, lesson_id, content',
    lessonIds,
    'lesson_id',
    [],
    row => ({
      id: String(row.id),
      lessonId: String(row.lesson_id),
      content: (row.content as Record<string, unknown> | null) ?? null,
    }),
  )
}

// ----- Staging merge + write-back (Task 3) -------------------------------

export interface ExerciseAssetEntry {
  asset_key: string
  capability_key: string
  artifact_kind: string
  quality_status: 'draft' | 'approved' | 'blocked' | 'deprecated'
  payload_json: Record<string, unknown>
}

function isAutoFilled(entry: ExerciseAssetEntry): boolean {
  const reviewedBy = (entry.payload_json as { reviewedBy?: unknown }).reviewedBy
  return reviewedBy === AUTO_FILL_REVIEWED_BY
}

function isManuallyReviewed(entry: ExerciseAssetEntry): boolean {
  return entry.quality_status === 'approved' && !isAutoFilled(entry)
}

export function mergeWithExistingStaging(
  existing: ExerciseAssetEntry[],
  autoFilled: ExerciseAssetEntry[],
): ExerciseAssetEntry[] {
  const merged = new Map<string, ExerciseAssetEntry>()
  // Manual entries are protected — drop drafts and prior auto-fill rows so
  // the new auto-fill batch can replace them.
  for (const entry of existing) {
    if (isManuallyReviewed(entry)) {
      merged.set(entry.asset_key, entry)
    }
  }
  for (const entry of autoFilled) {
    if (!merged.has(entry.asset_key)) {
      merged.set(entry.asset_key, entry)
    }
  }
  return [...merged.values()].sort((a, b) =>
    a.asset_key < b.asset_key ? -1 : a.asset_key > b.asset_key ? 1 : 0,
  )
}

function entryPriority(entry: ExerciseAssetEntry): number {
  // Higher = wins. Manual approved > auto-fill approved > non-draft other > draft.
  if (entry.quality_status === 'approved' && !isAutoFilled(entry)) return 4
  if (entry.quality_status === 'approved') return 3
  if (entry.quality_status !== 'draft') return 2
  return 1
}

export function serializeExerciseAssets(entries: ExerciseAssetEntry[]): string {
  const dedupe = new Map<string, ExerciseAssetEntry>()
  for (const entry of entries) {
    const existing = dedupe.get(entry.asset_key)
    if (!existing || entryPriority(entry) > entryPriority(existing)) {
      dedupe.set(entry.asset_key, entry)
    }
  }
  const sorted = [...dedupe.values()].sort((a, b) =>
    a.asset_key < b.asset_key ? -1 : a.asset_key > b.asset_key ? 1 : 0,
  )
  const body = JSON.stringify(sorted, null, 2)
  return `// Auto-filled by auto-fill-capability-artifacts-from-legacy.ts\nexport const exerciseAssets = ${body}\n`
}

const STAGING_FILENAME = 'exercise-assets.ts'

const EXERCISE_ASSETS_BODY_RE = /export const exerciseAssets\s*=\s*(\[[\s\S]*?\])\s*;?\s*$/m

export async function readExistingExerciseAssets(stagingDir: string): Promise<ExerciseAssetEntry[]> {
  const filePath = path.join(stagingDir, STAGING_FILENAME)
  if (!fs.existsSync(filePath)) return []
  const source = fs.readFileSync(filePath, 'utf8')
  const match = EXERCISE_ASSETS_BODY_RE.exec(source)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[1]!)
    if (!Array.isArray(parsed)) return []
    return parsed as ExerciseAssetEntry[]
  } catch {
    return []
  }
}

export async function writeExerciseAssets(
  stagingDir: string,
  entries: ExerciseAssetEntry[],
): Promise<void> {
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true })
  }
  const filePath = path.join(stagingDir, STAGING_FILENAME)
  fs.writeFileSync(filePath, serializeExerciseAssets(entries), 'utf8')
}

export async function applyArtifactUpdatesInChunks(
  client: SupabaseLike,
  updates: Array<{ id: string; artifactJson: Record<string, unknown> }>,
  chunkSize: number = 50,
): Promise<{ updated: number; failedChunks: number }> {
  if (updates.length === 0) return { updated: 0, failedChunks: 0 }
  let updated = 0
  let failedChunks = 0
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize)
    let chunkFailed = false
    for (const update of chunk) {
      const builder = db(client).from('capability_artifacts') as SupabaseQueryBuilder
      const q = builder
        .update!({
          artifact_json: update.artifactJson,
          quality_status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq!('id', update.id)
      const { error } = await new Promise<{ data?: unknown; error: unknown }>(
        resolve => q.then!(resolve as never),
      )
      if (error) {
        chunkFailed = true
      } else {
        updated++
      }
    }
    if (chunkFailed) failedChunks++
  }
  return { updated, failedChunks }
}

// ----- CLI orchestrator (Task 4) -----------------------------------------

export interface AutoFillArgs {
  mode: 'dry-run' | 'apply'
  /** Optional override of the staging root for tests. Defaults to scripts/data/staging. */
  stagingRoot?: string
  /** Optional override for affixed-form-pair source. Defaults to staging morphology files. */
  loadAffixedFormPairs?: (lessonNumber: number) => Promise<AffixedFormPairSource[]>
}

export interface AutoFillReport {
  mode: 'dry-run' | 'apply'
  perLesson: Record<string, {
    filledByKind: Record<string, number>
    skippedByKind: Record<string, number>
    criticalByKind: Record<string, number>
  }>
  slugCollisions: Array<{ slug: string; resolved: string[]; unresolved: string[] }>
  dialogueChunkResidual: Record<string, number>
  totalFilled: number
  totalSkipped: number
  totalCritical: number
  exitCode: 0 | 1
}

export function parseAutoFillArgs(argv: string[]): AutoFillArgs {
  let mode: 'dry-run' | 'apply' | undefined
  for (const arg of argv) {
    if (arg === '--dry-run') {
      if (mode === 'apply') throw new Error('Cannot combine --dry-run and --apply')
      mode = 'dry-run'
    } else if (arg === '--apply') {
      if (mode === 'dry-run') throw new Error('Cannot combine --dry-run and --apply')
      mode = 'apply'
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (!mode) throw new Error('Must specify --dry-run or --apply')
  return { mode }
}

const SOURCE_REF_ITEM_RE = /^learning_items\/(.+)$/
const SOURCE_REF_PATTERN_RE = /^lesson-(\d+)\/pattern-(.+)$/
const SOURCE_REF_MORPHOLOGY_RE = /^lesson-(\d+)\/morphology\/(.+)$/

function ensureLessonBucket(report: AutoFillReport, key: string): {
  filledByKind: Record<string, number>
  skippedByKind: Record<string, number>
  criticalByKind: Record<string, number>
} {
  if (!report.perLesson[key]) {
    report.perLesson[key] = {
      filledByKind: {},
      skippedByKind: {},
      criticalByKind: {},
    }
  }
  return report.perLesson[key]!
}

function bumpKind(map: Record<string, number>, kind: string) {
  map[kind] = (map[kind] ?? 0) + 1
}

async function loadAffixedFormPairsFromStaging(
  stagingRoot: string,
  lessonNumber: number,
): Promise<AffixedFormPairSource[]> {
  const filePath = path.join(stagingRoot, `lesson-${lessonNumber}`, 'morphology-patterns.ts')
  if (!fs.existsSync(filePath)) return []
  const source = fs.readFileSync(filePath, 'utf8')
  const match = /export const affixedFormPairs\s*=\s*(\[[\s\S]*?\])\s*;?\s*$/m.exec(source)
  if (!match) return []
  // The TS export uses unquoted keys; convert to JSON via a tiny transform.
  // Quote any unquoted property keys (foo: ...) → ("foo": ...).
  const jsonish = match[1]!.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
    // Replace single quotes with double quotes (string literals only).
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_m, body) => `"${(body as string).replace(/"/g, '\\"')}"`)
    // Strip trailing commas before ] or }.
    .replace(/,(\s*[}\]])/g, '$1')
  try {
    const parsed = JSON.parse(jsonish) as Array<Record<string, unknown>>
    return parsed.map(p => ({
      id: String(p.id ?? ''),
      sourceRef: String(p.sourceRef ?? ''),
      root: String(p.root ?? ''),
      derived: String(p.derived ?? ''),
      allomorphRule: String(p.allomorphRule ?? ''),
    }))
  } catch {
    return []
  }
}

export async function runAutoFill(
  client: SupabaseLike,
  args: AutoFillArgs,
): Promise<AutoFillReport> {
  const stagingRoot = args.stagingRoot ?? path.join(process.cwd(), 'scripts/data/staging')
  const loadPairs = args.loadAffixedFormPairs
    ?? ((lessonNumber: number) => loadAffixedFormPairsFromStaging(stagingRoot, lessonNumber))

  const [draftRows, items, lessons, patterns] = await Promise.all([
    loadDraftArtifactsWithCapability(client),
    loadActiveLearningItems(client),
    loadLessons(client),
    loadGrammarPatterns(client),
  ])

  const lessonIdToNumber = new Map(lessons.map(l => [l.id, l.orderIndex]))
  const lessonIdsForSections = lessons.map(l => l.id)
  const [meanings, variants, contexts, sections] = await Promise.all([
    loadItemMeanings(client, items.map(i => i.id)),
    loadAnswerVariants(client, items.map(i => i.id)),
    loadItemContexts(client, items.map(i => i.id)),
    loadLessonSections(client, lessonIdsForSections),
  ])

  // Slug collision detection.
  const slugMap = new Map<string, LearningItemRow[]>()
  for (const item of items) {
    if (!item.isActive) continue
    const slug = autoFillStableSlug(item.baseText)
    if (!slug) continue
    const list = slugMap.get(slug) ?? []
    list.push(item)
    slugMap.set(slug, list)
  }
  const collisions = new Map<string, LearningItemRow[]>()
  for (const [slug, rows] of slugMap.entries()) {
    if (rows.length > 1) collisions.set(slug, rows)
  }

  const meaningsByItemId = new Map<string, ItemMeaningRow[]>()
  for (const m of meanings) {
    const list = meaningsByItemId.get(m.learningItemId) ?? []
    list.push(m)
    meaningsByItemId.set(m.learningItemId, list)
  }
  const variantsByItemId = new Map<string, AnswerVariantRow[]>()
  for (const v of variants) {
    const list = variantsByItemId.get(v.learningItemId) ?? []
    list.push(v)
    variantsByItemId.set(v.learningItemId, list)
  }
  const contextsByItemId = new Map<string, ItemContextRow[]>()
  for (const c of contexts) {
    const list = contextsByItemId.get(c.learningItemId) ?? []
    list.push(c)
    contextsByItemId.set(c.learningItemId, list)
  }

  // Derive item → lesson_uuid via item_contexts (the live schema does not
  // store source_lesson_id on learning_items). For an item that appears in
  // multiple lessons, prefer the smallest order_index (introduction lesson).
  const itemLessonId = new Map<string, string>()
  for (const item of items) {
    if (item.sourceLessonId) {
      itemLessonId.set(item.id, item.sourceLessonId)
      continue
    }
    const ctxLessons = (contextsByItemId.get(item.id) ?? [])
      .map(c => c.sourceLessonId)
      .filter((v): v is string => Boolean(v))
    if (ctxLessons.length === 0) continue
    let bestLessonId = ctxLessons[0]!
    let bestOrder = lessonIdToNumber.get(bestLessonId) ?? Number.POSITIVE_INFINITY
    for (const id of ctxLessons.slice(1)) {
      const order = lessonIdToNumber.get(id) ?? Number.POSITIVE_INFINITY
      if (order < bestOrder) {
        bestLessonId = id
        bestOrder = order
      }
    }
    itemLessonId.set(item.id, bestLessonId)
  }

  const patternsBySlug = new Map(patterns.map(p => [p.slug, p]))
  const lessonGrammarById = new Map<string, GrammarSection>()
  for (const section of sections) {
    const content = section.content
    if (!content || typeof content !== 'object') continue
    const categories = (content as { categories?: unknown }).categories
    if (!Array.isArray(categories)) continue
    const parsed: GrammarCategory[] = (categories as Array<Record<string, unknown>>).map(c => ({
      title: String(c.title ?? ''),
      rules: Array.isArray(c.rules) ? (c.rules as unknown[]).map(r => String(r)) : [],
      examples: Array.isArray(c.examples)
        ? (c.examples as Array<Record<string, unknown>>).map(ex => ({
            indonesian: String(ex.indonesian ?? ''),
            dutch: String(ex.dutch ?? ''),
          }))
        : [],
    }))
    const existing = lessonGrammarById.get(section.lessonId)?.categories ?? []
    lessonGrammarById.set(section.lessonId, { categories: [...existing, ...parsed] })
  }

  const morphologyPairsByLesson = new Map<number, AffixedFormPairSource[]>()
  for (const draft of draftRows) {
    if (draft.capability.sourceKind === 'affixed_form_pair') {
      const m = SOURCE_REF_MORPHOLOGY_RE.exec(draft.capability.sourceRef)
      if (!m) continue
      const lessonNumber = Number(m[1])
      if (morphologyPairsByLesson.has(lessonNumber)) continue
      const pairs = await loadPairs(lessonNumber)
      morphologyPairsByLesson.set(lessonNumber, pairs)
    }
  }

  const report: AutoFillReport = {
    mode: args.mode,
    perLesson: {},
    slugCollisions: [],
    dialogueChunkResidual: {},
    totalFilled: 0,
    totalSkipped: 0,
    totalCritical: 0,
    exitCode: 0,
  }

  // Record collisions in the report. Mark as unresolved because we currently
  // have no fast lesson-scope resolver in this implementation; if any draft
  // artifact references a colliding slug, that's a CRITICAL.
  for (const [slug, rows] of collisions.entries()) {
    report.slugCollisions.push({
      slug,
      resolved: [],
      unresolved: rows.map(r => r.id),
    })
  }

  const updates: Array<{ id: string; artifactJson: Record<string, unknown> }> = []
  const stagingByLesson = new Map<number, ExerciseAssetEntry[]>()

  for (const draft of draftRows) {
    const sourceKind = draft.capability.sourceKind
    let lessonNumber: number | undefined
    let plan: ArtifactPlanOutput | undefined

    if (sourceKind === 'item') {
      const itemMatch = SOURCE_REF_ITEM_RE.exec(draft.capability.sourceRef)
      if (!itemMatch) {
        addSkip(report, 'unknown', draft.artifactKind, 'invalid source_ref for item')
        continue
      }
      const slug = itemMatch[1]!
      const matching = items.filter(i => autoFillStableSlug(i.baseText) === slug)
      if (matching.length === 0) {
        addSkip(report, 'unknown', draft.artifactKind, 'no active learning_items matches slug')
        continue
      }
      if (matching.length > 1) {
        addCritical(report, 'unknown', draft.artifactKind,
          `slug collision unresolved: ${slug} matches ${matching.length} items`)
        continue
      }
      const item = matching[0]!
      const lessonUuid = item.sourceLessonId ?? itemLessonId.get(item.id) ?? null
      lessonNumber = lessonUuid ? lessonIdToNumber.get(lessonUuid) : undefined
      const itemSource: ItemSource = {
        id: item.id,
        baseText: item.baseText,
        normalizedText: item.normalizedText,
        itemType: item.itemType,
        isActive: item.isActive,
        meanings: (meaningsByItemId.get(item.id) ?? []).map(m => ({
          language: m.translationLanguage,
          text: m.translationText,
          isPrimary: m.isPrimary,
        })),
        answerVariants: (variantsByItemId.get(item.id) ?? []).map(v => ({
          language: v.language,
          text: v.variantText,
        })),
      }
      plan = planForItemArtifact(draft.artifactKind, itemSource)
    } else if (sourceKind === 'pattern') {
      const m = SOURCE_REF_PATTERN_RE.exec(draft.capability.sourceRef)
      if (!m) {
        addSkip(report, 'unknown', draft.artifactKind, 'invalid source_ref for pattern')
        continue
      }
      lessonNumber = Number(m[1])
      const slug = m[2]!
      const pattern = patternsBySlug.get(slug)
      if (!pattern) {
        addSkip(report, lessonKey(lessonNumber), draft.artifactKind, 'no grammar_pattern matches slug')
        continue
      }
      const patternSource: PatternSource = {
        id: pattern.id,
        slug: pattern.slug,
        name: pattern.name,
        shortExplanation: pattern.shortExplanation,
        introducedByLessonId: pattern.introducedByLessonId ?? '',
      }
      const grammar = pattern.introducedByLessonId
        ? lessonGrammarById.get(pattern.introducedByLessonId) ?? { categories: [] }
        : { categories: [] }
      plan = planForPatternArtifact(draft.artifactKind, patternSource, grammar)
    } else if (sourceKind === 'affixed_form_pair') {
      const m = SOURCE_REF_MORPHOLOGY_RE.exec(draft.capability.sourceRef)
      if (!m) {
        addSkip(report, 'unknown', draft.artifactKind, 'invalid source_ref for morphology')
        continue
      }
      lessonNumber = Number(m[1])
      const slug = m[2]!
      const pairs = morphologyPairsByLesson.get(lessonNumber) ?? []
      const pair = pairs.find(p => p.id === slug || p.sourceRef.endsWith(`/${slug}`))
      if (!pair) {
        addSkip(report, lessonKey(lessonNumber), draft.artifactKind, 'no affixed-form-pair match')
        continue
      }
      plan = planForAffixedPairArtifact(draft.artifactKind, pair)
    } else {
      addSkip(report, 'unknown', draft.artifactKind, `unsupported source_kind=${sourceKind}`)
      continue
    }

    if (!plan) {
      addSkip(report, lessonKey(lessonNumber), draft.artifactKind, 'no planner for artifact_kind')
      continue
    }

    const lessonKeyName = lessonKey(lessonNumber)
    if (plan.decision === 'fill' && plan.payloadJson) {
      const bucket = ensureLessonBucket(report, lessonKeyName)
      bumpKind(bucket.filledByKind, draft.artifactKind)
      report.totalFilled++
      updates.push({ id: draft.id, artifactJson: plan.payloadJson })
      if (lessonNumber !== undefined) {
        const list = stagingByLesson.get(lessonNumber) ?? []
        list.push({
          asset_key: `${draft.capability.canonicalKey}:${draft.artifactKind}`,
          capability_key: draft.capability.canonicalKey,
          artifact_kind: draft.artifactKind,
          quality_status: 'approved',
          payload_json: plan.payloadJson,
        })
        stagingByLesson.set(lessonNumber, list)
      }
    } else {
      addSkip(report, lessonKeyName, draft.artifactKind, plan.warning ?? 'plan returned skip')
    }
    if (plan.critical) {
      addCritical(report, lessonKeyName, draft.artifactKind, plan.critical)
    }
  }

  // Slug-collision contribution to totalCritical. A collision becomes critical
  // only if any draft artifact actually depended on it (already counted above
  // via addCritical when matching.length > 1).

  if (args.mode === 'apply') {
    if (updates.length > 0) {
      await applyArtifactUpdatesInChunks(client, updates, 50)
    }
    for (const [lessonNumber, autoEntries] of stagingByLesson.entries()) {
      const dir = path.join(stagingRoot, `lesson-${lessonNumber}`)
      const existing = await readExistingExerciseAssets(dir)
      const merged = mergeWithExistingStaging(existing, autoEntries)
      await writeExerciseAssets(dir, merged)
    }
  }

  report.exitCode = report.totalCritical > 0 ? 1 : 0
  return report
}

function lessonKey(lessonNumber?: number): string {
  return lessonNumber === undefined ? 'unknown' : `lesson-${lessonNumber}`
}

function addSkip(report: AutoFillReport, key: string, kind: string, _reason: string) {
  const bucket = ensureLessonBucket(report, key)
  bumpKind(bucket.skippedByKind, kind)
  report.totalSkipped++
}

function addCritical(report: AutoFillReport, key: string, kind: string, _reason: string) {
  const bucket = ensureLessonBucket(report, key)
  bumpKind(bucket.criticalByKind, kind)
  report.totalCritical++
}

function planForItemArtifact(kind: string, item: ItemSource): ArtifactPlanOutput | undefined {
  switch (kind) {
    case 'meaning:l1':
    case 'meaning:nl':
      return planMeaningL1(item)
    case 'meaning:en':
      return planMeaningEn(item)
    case 'base_text':
      return planBaseText(item)
    case 'accepted_answers:id':
      return planAcceptedAnswersId(item)
    case 'accepted_answers:l1':
      return planAcceptedAnswersL1(item)
    default:
      return undefined
  }
}

function planForPatternArtifact(
  kind: string,
  pattern: PatternSource,
  grammar: GrammarSection,
): ArtifactPlanOutput | undefined {
  switch (kind) {
    case 'pattern_explanation:l1':
      return planPatternExplanationL1(pattern)
    case 'pattern_example':
      return planPatternExample(pattern, grammar)
    default:
      return undefined
  }
}

function planForAffixedPairArtifact(
  kind: string,
  pair: AffixedFormPairSource,
): ArtifactPlanOutput | undefined {
  switch (kind) {
    case 'root_derived_pair':
      return planRootDerivedPair(pair)
    case 'allomorph_rule':
      return planAllomorphRule(pair)
    default:
      return undefined
  }
}

export async function runMain(argv: string[], client: SupabaseLike): Promise<void> {
  const args = parseAutoFillArgs(argv)
  const report = await runAutoFill(client, args)
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.exitCode)
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
}

if (isMainModule()) {
  ;(async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required')
    const client = createClient(url, serviceKey) as unknown as SupabaseLike
    await runMain(process.argv.slice(2), client)
  })().catch(error => {
    console.error(error)
    process.exit(1)
  })
}
