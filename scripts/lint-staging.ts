#!/usr/bin/env bun
/**
 * lint-staging.ts — deterministic checks for the linguist pipeline.
 *
 * Replaces the manual structural checks the linguist-reviewer agent used to
 * do by hand. Runs every fully-scriptable rule and the scriptable half of
 * partially-scriptable rules. The reviewer agent should run this first, then
 * focus its LLM cycles on the pedagogical-judgment checks the script can't do
 * (naturalness, CEFR level, distractor pedagogy, etc.).
 *
 * Wired into publish-approved-content.ts as a pre-flight gate so even a
 * missed review can't ship structurally-broken content.
 *
 * Usage:
 *   bun scripts/lint-staging.ts                       # all lessons
 *   bun scripts/lint-staging.ts --lesson 7            # one lesson
 *   bun scripts/lint-staging.ts --severity critical   # only blockers
 *   bun scripts/lint-staging.ts --json                # machine-readable
 *
 * Exit codes:
 *   0 — clean (or only WARNINGs)
 *   1 — at least one CRITICAL finding
 *   2 — script error (DB unreachable, bad CLI args, etc.)
 *
 * NEVER log the supabase client object — service-role JWT lives in client.headers.
 */

import fs from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { stripAffixes, tokenize, FUNCTION_WORDS } from './lib/affix'
import { normalizeForClozeCompare, normalizeForExemptLookup, normalizeDialogueToken } from './lib/normalize'
import { VALID_POS } from './lib/validate-pos'
import {
  validateCapabilityStaging,
  validateContentUnits,
  validateExerciseAssets,
  validateLessonPageBlocks,
} from './lib/content-pipeline-output'

// Internal Step-CA on the homelab. Scoped: only this script's HTTPS calls
// (all to the homelab supabase) bypass cert validation.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY required')
  process.exit(2)
}
const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'indonesian' },
  auth: { persistSession: false },
})

// ---- Types ----

type Severity = 'CRITICAL' | 'WARNING'
interface Finding {
  source: 'linter'   // distinguishes from agent-emitted findings on shared review-report.json
  severity: Severity
  lesson: number
  file: string
  ref?: string
  rule: string
  detail: string
}

interface LessonCtx {
  n: number
  dir: string
  exists: boolean
  lesson?: any
  grammarPatterns?: any[]
  candidates?: any[]
  clozeContexts?: any[]
  clozeSkips?: any[]
  patternBrief?: any
  learningItems?: any[]
  contentUnits?: any[]
  capabilities?: any[]
  lessonPageBlocks?: any[]
  exerciseAssets?: any[]
  vocabEnrichments?: any[] | null
  sectionsCatalog?: any
  priorLearningItems?: any[]   // vocabulary from lessons with lower order_index (flattened)
}

interface DbCtx {
  knownSlugs: Set<string>
  poolIndoTokens: Set<string>
  poolIndoExact: Set<string>
  posByText: Map<string, string>
}

const REQUIRED_TYPES = ['contrast_pair', 'sentence_transformation', 'constrained_translation', 'cloze_mcq'] as const

// Patterns where constrained_translation MAY include a slot blank for cloze
// rendering. The ConstrainedTranslationExercise component treats this as
// opt-in: present → cloze mode, absent → full-sentence translation. So a
// missing blank is a content-quality WARNING, not a runtime breakage.
const SLOT_PATTERNS = new Set([
  'belum-vs-tidak', 'kami-vs-kita', 'dari-di-ke-locative', 'bukan-negation',
  'tidak-negation', 'bukan-tag-question', 'jangan-prohibition',
  'sekali-intensifier', 'kah-question-suffix', 'imperative-lah-suffix',
])

// Items that legitimately skip a cloze context (per linguist-reviewer.md §4):
// standalone discourse particles and metalinguistic single-tokens.
const CLOZE_EXEMPT_BASE_TEXTS = new Set([
  'deh', 'sih', 'lah', 'kah', 'pun', 'kok', 'dong', 'nih', 'tuh', 'ya', 'ah',
])

// Grammar patterns where the lesson IS substring contrast — reduplication,
// morphological derivation (ter-/se-/ke-/-an), comparison particles. The
// `options-substring-duplicate` rule misfires on these because the substring
// relationship is the pedagogical point (e.g. `buah` vs `buah-buah` for
// reduplication-plural; `dari` vs `daripada` for lebih-comparative; `tua` vs
// `setua` for se-sama-equality-comparison). Matched explicitly by slug or
// by structural slug suffix that signals morphological-derivation pedagogy.
const SUBSTRING_OK_PATTERN_SLUGS = new Set([
  'no-singular-plural',
  'ada-existential',
])
const SUBSTRING_OK_PATTERN_REGEX = /^reduplication-|-comparative$|-superlative$|-comparison$/

export function isSubstringContrastPattern(slug: string | undefined | null): boolean {
  if (!slug) return false
  return SUBSTRING_OK_PATTERN_SLUGS.has(slug) || SUBSTRING_OK_PATTERN_REGEX.test(slug)
}


// ---- Pagination wrapper ----

// Supabase JS .select() defaults cap at 1000 rows. Without this wrapper
// learning_items / item_contexts truncate silently and known-vocab pools
// collapse, producing false-positive "unknown" findings.
//
// Pages are stabilised with .order('id') so .range() slices a consistent
// result set even if a write happens during the lint. Caller passes the
// id-equivalent column for tables whose primary key isn't `id`.
async function selectAll<T = any>(builder: any, orderColumn = 'id'): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  const ordered = builder.order(orderColumn, { ascending: true })
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ordered.range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE) break
  }
  return out
}

// ---- I/O ----

async function readTsExport(filePath: string): Promise<any> {
  if (!fs.existsSync(filePath)) return null
  // Cache-bust with timestamp so repeat invocations in the same process see
  // edits. Bun's loader keys cache on URL+query.
  const m = await import(`file://${filePath}?t=${Date.now()}`)
  const exports = Object.values(m)
  return exports.length > 0 ? exports[0] : null
}

// Read a specific named export from a TS module (unlike readTsExport which
// returns the first export). Needed for files that expose multiple exports,
// e.g. cloze-contexts.ts → { clozeContexts, clozeSkips }.
async function readTsNamedExport(filePath: string, name: string): Promise<any> {
  if (!fs.existsSync(filePath)) return null
  const m = await import(`file://${filePath}?t=${Date.now()}`)
  return (m as Record<string, unknown>)[name] ?? null
}

function readJson(filePath: string): any {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

async function loadLesson(n: number): Promise<LessonCtx> {
  const dir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${n}`)
  if (!fs.existsSync(dir)) return { n, dir, exists: false }
  return {
    n,
    dir,
    exists: true,
    lesson: await readTsExport(path.join(dir, 'lesson.ts')),
    grammarPatterns: (await readTsExport(path.join(dir, 'grammar-patterns.ts'))) ?? [],
    candidates: (await readTsExport(path.join(dir, 'candidates.ts'))) ?? [],
    clozeContexts: (await readTsNamedExport(path.join(dir, 'cloze-contexts.ts'), 'clozeContexts'))
      ?? (await readTsExport(path.join(dir, 'cloze-contexts.ts'))) ?? [],
    clozeSkips: (await readTsNamedExport(path.join(dir, 'cloze-contexts.ts'), 'clozeSkips')) ?? [],
    learningItems: (await readTsExport(path.join(dir, 'learning-items.ts'))) ?? [],
    contentUnits: (await readTsExport(path.join(dir, 'content-units.ts'))) ?? [],
    capabilities: (await readTsExport(path.join(dir, 'capabilities.ts'))) ?? [],
    lessonPageBlocks: (await readTsExport(path.join(dir, 'lesson-page-blocks.ts'))) ?? [],
    exerciseAssets: (await readTsExport(path.join(dir, 'exercise-assets.ts'))) ?? [],
    vocabEnrichments: (await readTsExport(path.join(dir, 'vocab-enrichments.ts'))) ?? null,
    patternBrief: readJson(path.join(dir, 'pattern-brief.json')),
    sectionsCatalog: readJson(path.join(dir, 'sections-catalog.json')),
    priorLearningItems: await loadPriorLearningItems(n),
  }
}

// Flatten learning-items.ts from every lesson dir with a lower number than `n`.
// Used to cross-reference that a dialogue cloze's blanked word exists in the
// current or a prior lesson's vocabulary.
async function loadPriorLearningItems(n: number): Promise<any[]> {
  const stagingBase = path.join(process.cwd(), 'scripts', 'data', 'staging')
  if (!fs.existsSync(stagingBase)) return []
  const dirs = fs.readdirSync(stagingBase)
    .filter(d => /^lesson-\d+$/.test(d))
    .map(d => parseInt(d.replace('lesson-', ''), 10))
    .filter(x => !Number.isNaN(x) && x < n)
    .sort((a, b) => a - b)
  const out: any[] = []
  for (const x of dirs) {
    const items = await readTsExport(path.join(stagingBase, `lesson-${x}`, 'learning-items.ts'))
    if (Array.isArray(items)) out.push(...items)
  }
  return out
}

async function loadDb(): Promise<DbCtx> {
  const knownSlugs = new Set<string>()
  const gps = await selectAll<{ slug: string }>(supabase.from('grammar_patterns').select('slug'))
  for (const g of gps) knownSlugs.add(g.slug)

  const poolIndoTokens = new Set<string>()
  const poolIndoExact = new Set<string>()
  const posByText = new Map<string, string>()
  const items = await selectAll<{ base_text: string; normalized_text: string; pos: string | null }>(
    supabase.from('learning_items').select('base_text, normalized_text, pos').eq('is_active', true),
  )
  for (const it of items) {
    if (it.normalized_text) {
      poolIndoExact.add(it.normalized_text.toLowerCase())
      for (const tok of tokenize(it.normalized_text)) {
        poolIndoTokens.add(tok)
        poolIndoTokens.add(stripAffixes(tok))
      }
    }
    if (it.base_text && it.pos) posByText.set(it.base_text.toLowerCase(), it.pos)
  }

  const ctxs = await selectAll<{ source_text: string }>(
    supabase.from('item_contexts').select('source_text'),
  )
  for (const c of ctxs) {
    if (!c.source_text) continue
    for (const tok of tokenize(c.source_text)) {
      poolIndoTokens.add(tok)
      poolIndoTokens.add(stripAffixes(tok))
    }
  }

  return { knownSlugs, poolIndoTokens, poolIndoExact, posByText }
}

// ---- Check helpers ----

function isKebabCase(s: string): boolean { return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s) }
function wordCount(s: string): number { return s.trim().split(/\s+/).filter(Boolean).length }

function indoFieldsFor(payload: any, exerciseType: string): string[] {
  const out: string[] = []
  switch (exerciseType) {
    case 'constrained_translation':
      for (const a of payload?.acceptableAnswers ?? []) if (typeof a === 'string') out.push(a)
      if (typeof payload?.targetSentenceWithBlank === 'string') out.push(payload.targetSentenceWithBlank)
      break
    case 'sentence_transformation':
      if (typeof payload?.sourceSentence === 'string') out.push(payload.sourceSentence)
      for (const a of payload?.acceptableAnswers ?? []) if (typeof a === 'string') out.push(a)
      break
    case 'contrast_pair':
      for (const opt of payload?.options ?? []) if (typeof opt?.text === 'string') out.push(opt.text)
      break
    case 'cloze_mcq':
      if (typeof payload?.sentence === 'string') out.push(payload.sentence)
      for (const opt of payload?.options ?? []) if (typeof opt === 'string') out.push(opt)
      break
  }
  return out
}

function mkFinding(severity: Severity, lesson: number, file: string, rule: string, detail: string, ref?: string): Finding {
  return { source: 'linter', severity, lesson, file, rule, detail, ref }
}

// ---- Checks ----

// §1 lesson.ts: grammar/exercises sections must be structured. Discriminator
// is at content.type, NOT section.type — fixing earlier bug where the rule
// was dead code.
function checkLessonStructure(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  if (!ctx.lesson) return out
  const sections = ctx.lesson?.sections ?? ctx.lesson?.lesson_sections ?? []
  for (const s of sections) {
    const c = s?.content
    if (c?.type === 'grammar') {
      if (typeof c?.body === 'string' && !Array.isArray(c?.categories)) {
        out.push(mkFinding('CRITICAL', ctx.n, 'lesson.ts', 'grammar-section-unstructured',
          'grammar section still has body:string and no categories array', s?.title ?? '?'))
      }
      if (Array.isArray(c?.categories)) {
        for (const cat of c.categories) {
          const hasContent = Array.isArray(cat?.rules) || Array.isArray(cat?.examples) || cat?.table
          if (!hasContent) {
            out.push(mkFinding('WARNING', ctx.n, 'lesson.ts', 'grammar-category-empty',
              'category has no rules, examples, or table', `${s?.title} > ${cat?.title ?? '?'}`))
          }
        }
      }
    }
    if (c?.type === 'exercises') {
      if (typeof c?.body === 'string' && !Array.isArray(c?.sections)) {
        out.push(mkFinding('CRITICAL', ctx.n, 'lesson.ts', 'exercises-section-unstructured',
          'exercises section still has body:string and no sections array', s?.title ?? '?'))
      }
      for (const sub of c?.sections ?? []) {
        if (sub?.type === 'translation' || sub?.type === 'grammar_drill') {
          (sub?.items ?? []).forEach((it: any, i: number) => {
            if (it?.answer == null || it.answer === '') {
              out.push(mkFinding('WARNING', ctx.n, 'lesson.ts', 'translation-drill-no-answer',
                `${sub.type} item missing answer field`, `${s?.title} > ${sub?.title ?? '?'} #${i + 1}`))
            }
          })
        }
      }
    }
  }
  return out
}

// §2 grammar-patterns.ts. slugToLessons maps slug → [lesson numbers it appears
// in across all loaded staging dirs]. A slug present in >1 lesson is a
// CRITICAL collision regardless of which lesson is being linted.
function checkGrammarPatterns(ctx: LessonCtx, slugToLessons: Map<string, number[]>): Finding[] {
  const out: Finding[] = []
  for (const p of ctx.grammarPatterns ?? []) {
    const ref = p?.slug ?? p?.pattern_name ?? '?'
    if (!p?.pattern_name) out.push(mkFinding('CRITICAL', ctx.n, 'grammar-patterns.ts', 'missing-pattern_name', '', ref))
    if (!p?.description) out.push(mkFinding('WARNING', ctx.n, 'grammar-patterns.ts', 'missing-description', '', ref))
    if (!p?.slug) {
      out.push(mkFinding('CRITICAL', ctx.n, 'grammar-patterns.ts', 'missing-slug', '', ref))
      continue
    }
    if (!isKebabCase(p.slug)) {
      out.push(mkFinding('CRITICAL', ctx.n, 'grammar-patterns.ts', 'slug-not-kebab', p.slug, ref))
    }
    if (typeof p?.complexity_score !== 'number' || p.complexity_score < 1 || p.complexity_score > 10) {
      out.push(mkFinding('CRITICAL', ctx.n, 'grammar-patterns.ts', 'complexity_score-out-of-range',
        String(p?.complexity_score), ref))
    }
    // Dedupe lesson numbers — a single grammar-patterns.ts file with the
    // same slug listed twice is also a bug (intra-file collision), but the
    // diagnostic should distinguish "appears in lessons N, M" from "appears
    // in lesson N twice". A Set + size check handles both cleanly.
    const occurrences = slugToLessons.get(p.slug) ?? []
    const distinctLessons = [...new Set(occurrences)]
    if (occurrences.length > 1 && distinctLessons.length === 1) {
      out.push(mkFinding('CRITICAL', ctx.n, 'grammar-patterns.ts', 'slug-duplicate-within-lesson',
        `slug appears ${occurrences.length} times in lesson-${distinctLessons[0]}/grammar-patterns.ts`, ref))
    } else if (distinctLessons.length > 1) {
      out.push(mkFinding('CRITICAL', ctx.n, 'grammar-patterns.ts', 'slug-duplicate-cross-lesson',
        `defined in lessons ${distinctLessons.sort((a, b) => a - b).join(', ')}`, ref))
    }
  }
  return out
}

// §3 candidates.ts — structural shape per type.
function checkCandidatesStructural(ctx: LessonCtx, db: DbCtx): Finding[] {
  const out: Finding[] = []
  const localSlugs = new Set((ctx.grammarPatterns ?? []).map(p => p?.slug).filter(Boolean))
  const cands = ctx.candidates ?? []
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]
    const ref = `${c?.exercise_type ?? '?'} #${i + 1} (${c?.grammar_pattern_slug ?? '?'})`
    if (c?.exercise_type === 'speaking') {
      out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'speaking-type-forbidden', '', ref))
      continue
    }
    if (!c?.payload || typeof c.payload !== 'object') {
      out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'payload-missing',
        'no payload object — publish reads candidate.payload', ref))
      continue
    }
    if (c.grammar_pattern_slug && !localSlugs.has(c.grammar_pattern_slug) && !db.knownSlugs.has(c.grammar_pattern_slug)) {
      out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'unresolved-grammar_pattern_slug', c.grammar_pattern_slug, ref))
    }
    const t = c.exercise_type
    const slug: string | undefined = c.grammar_pattern_slug
    if (t === 'contrast_pair') checkContrastPair(c.payload, slug, ctx, ref, out)
    else if (t === 'cloze_mcq') checkClozeMcq(c.payload, slug, ctx, ref, out)
    else if (t === 'sentence_transformation') checkSentenceTransformation(c.payload, ctx, ref, out)
    else if (t === 'constrained_translation') checkConstrainedTranslation(c.payload, slug, localSlugs, db, ctx, ref, out)
  }
  return out
}

function checkContrastPair(p: any, slug: string | undefined, ctx: LessonCtx, ref: string, out: Finding[]): void {
  for (const f of ['promptText', 'targetMeaning', 'correctOptionId', 'explanationText']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) {
      out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', `missing-${f}`, '', ref))
    }
  }
  const opts = Array.isArray(p.options) ? p.options : []
  if (opts.length !== 2) {
    out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'options-wrong-length',
      `expected 2, got ${opts.length}`, ref))
  }
  for (const o of opts) {
    if (typeof o?.id !== 'string' || typeof o?.text !== 'string') {
      out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'option-missing-id-or-text', '', ref))
    } else if (o.id !== o.text) {
      // WARNING (not CRITICAL): runtime tolerates the abstract-id form.
      // sessionQueue.ts:243-266 normalises options to text strings and the
      // ContrastPairExercise component never sees the raw id. Convention check
      // only — flag for cleanup, don't block publish.
      out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'option-id-not-text',
        `id="${o.id}" text="${o.text}" — convention says id must equal text`, ref))
    }
  }
  if (opts.length === 2 && !opts.some((o: any) => o?.id === p.correctOptionId)) {
    out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'correctOptionId-not-in-options',
      `correctOptionId="${p.correctOptionId}"`, ref))
  }
  if (opts.length === 2 && !isSubstringContrastPattern(slug)) {
    const [a, b] = [String(opts[0]?.text ?? ''), String(opts[1]?.text ?? '')]
    if (a && b && a !== b && (a.includes(b) || b.includes(a))) {
      out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'options-substring-duplicate',
        `"${a}" / "${b}"`, ref))
    }
  }
  if (typeof p.targetMeaning === 'string' && typeof p.promptText === 'string') {
    const tm = p.targetMeaning.toLowerCase().trim()
    const pt = p.promptText.toLowerCase().trim()
    if (tm === pt) {
      out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'targetMeaning-equals-promptText', '', ref))
    } else if (pt.length > 0 && pt.includes(tm) && tm.length > 4) {
      out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'targetMeaning-substring-of-promptText',
        `targetMeaning="${p.targetMeaning}"`, ref))
    }
    if (wordCount(p.targetMeaning) > 12) {
      out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'targetMeaning-too-long',
        `${wordCount(p.targetMeaning)} words — should be 3–10 word gloss`, ref))
    }
  }
  if (typeof p.promptText === 'string') {
    const m = p.promptText.match(/\(([^)]{2,80})\)/)
    if (m) {
      const inside = m[1].toLowerCase()
      if (/\b(nog niet|definitief|gebruik|kies|antwoord|correct|inclusief|exclusief)\b/.test(inside)
          || /\bNOG\s+NIET\b/.test(m[1])) {
        out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'promptText-parenthetical-hint',
          `(${m[1]})`, ref))
      }
    }
    if (/\[[^\]]+\]/.test(p.promptText)) {
      out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'promptText-bracketed-label',
        'bracketed [..] in prompt — usually labels the answer', ref))
    }
  }
  if (typeof p.explanationText === 'string' && wordCount(p.explanationText) < 15) {
    out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'explanationText-too-thin',
      `${wordCount(p.explanationText)} words — likely too short to teach`, ref))
  }
}

function checkClozeMcq(p: any, slug: string | undefined, ctx: LessonCtx, ref: string, out: Finding[]): void {
  for (const f of ['sentence', 'correctOptionId', 'explanationText']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) {
      out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', `missing-${f}`, '', ref))
    }
  }
  if (typeof p.sentence === 'string') {
    const blanks = (p.sentence.match(/___/g) ?? []).length
    if (blanks !== 1) {
      out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'cloze-blank-count',
        `expected exactly one ___, got ${blanks}`, ref))
    }
  }
  const opts = Array.isArray(p.options) ? p.options : []
  if (opts.length !== 4) {
    out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'options-wrong-length',
      `expected 4, got ${opts.length}`, ref))
  }
  if (opts.length > 0 && !opts.includes(p.correctOptionId)) {
    out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'correctOptionId-not-in-options',
      `correctOptionId="${p.correctOptionId}"`, ref))
  }
  if (!isSubstringContrastPattern(slug)) {
    for (let i = 0; i < opts.length; i++) {
      for (let j = i + 1; j < opts.length; j++) {
        const a = String(opts[i] ?? ''), b = String(opts[j] ?? '')
        if (a && b && a !== b && (a.includes(b) || b.includes(a))) {
          out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'options-substring-duplicate',
            `"${a}" / "${b}"`, ref))
          break
        }
      }
    }
  }
  if (p.translation == null) {
    out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'cloze_mcq-translation-null',
      'translation should be a Dutch sentence; null only acceptable in rare metalinguistic cases', ref))
  }
  // Distractors all morphological variants of the correct answer
  if (opts.length === 4 && typeof p.correctOptionId === 'string') {
    const correctRoot = stripAffixes(String(p.correctOptionId).toLowerCase())
    if (correctRoot.length >= 3) {
      const distRoots = opts.filter((o: string) => o !== p.correctOptionId).map((o: string) => stripAffixes(String(o).toLowerCase()))
      if (distRoots.length === 3 && distRoots.every(r => r === correctRoot)) {
        out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'distractors-all-morphological-variants',
          `all distractors share root "${correctRoot}" with the answer`, ref))
      }
    }
  }
  if (typeof p.explanationText === 'string' && wordCount(p.explanationText) < 15) {
    out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'explanationText-too-thin',
      `${wordCount(p.explanationText)} words`, ref))
  }
}

function checkSentenceTransformation(p: any, ctx: LessonCtx, ref: string, out: Finding[]): void {
  for (const f of ['sourceSentence', 'transformationInstruction', 'explanationText']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) {
      out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', `missing-${f}`, '', ref))
    }
  }
  if (!Array.isArray(p.acceptableAnswers) || p.acceptableAnswers.length === 0) {
    out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'acceptableAnswers-empty', '', ref))
  }
  if (typeof p.transformationInstruction === 'string' && Array.isArray(p.acceptableAnswers)) {
    const m = p.transformationInstruction.match(/vervang\s+['"]?([^'"]+?)['"]?\s+door\s+['"]?([^'"]+?)['"]?(?:[.\s]|$)/i)
    if (m) {
      const target = m[2].toLowerCase().trim()
      const ansTokens = new Set(p.acceptableAnswers.flatMap((a: string) => tokenize(a)))
      const targetToks = tokenize(target)
      if (targetToks.length > 0 && targetToks.every(t => ansTokens.has(t))) {
        out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'instruction-reveals-answer',
          `"vervang ... door '${m[2]}'" — answer is in the instruction`, ref))
      }
    }
  }
  if (typeof p.explanationText === 'string' && wordCount(p.explanationText) < 15) {
    out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'explanationText-too-thin',
      `${wordCount(p.explanationText)} words`, ref))
  }
}

function checkConstrainedTranslation(
  p: any,
  slug: string | undefined,
  localSlugs: Set<string>,
  db: DbCtx,
  ctx: LessonCtx,
  ref: string,
  out: Finding[],
): void {
  for (const f of ['sourceLanguageSentence', 'requiredTargetPattern', 'explanationText']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) {
      out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', `missing-${f}`, '', ref))
    }
  }
  if (!Array.isArray(p.acceptableAnswers) || p.acceptableAnswers.length === 0) {
    out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'acceptableAnswers-empty', '', ref))
  }
  // requiredTargetPattern must resolve to a known slug (local or DB)
  if (typeof p.requiredTargetPattern === 'string' && p.requiredTargetPattern
      && !localSlugs.has(p.requiredTargetPattern)
      && !db.knownSlugs.has(p.requiredTargetPattern)) {
    out.push(mkFinding('CRITICAL', ctx.n, 'candidates.ts', 'unresolved-requiredTargetPattern',
      p.requiredTargetPattern, ref))
  }
  // Slot patterns benefit from the optional cloze-mode fields. WARNING
  // (not CRITICAL): the runtime falls back to full-sentence translation when
  // these are absent (ConstrainedTranslationExercise.tsx:135 — opt-in cloze).
  if (slug && SLOT_PATTERNS.has(slug)) {
    const hasBlank = typeof p.targetSentenceWithBlank === 'string' && p.targetSentenceWithBlank.includes('___')
    const hasAnswers = Array.isArray(p.blankAcceptableAnswers) && p.blankAcceptableAnswers.length > 0
    if (!hasBlank) {
      out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'slot-pattern-missing-blank',
        `pattern ${slug} would benefit from targetSentenceWithBlank with ___ (cloze mode)`, ref))
    }
    if (!hasAnswers) {
      out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'slot-pattern-missing-blank-answers',
        `pattern ${slug} would benefit from non-empty blankAcceptableAnswers (cloze mode)`, ref))
    }
  }
  if (typeof p.explanationText === 'string' && wordCount(p.explanationText) < 15) {
    out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'explanationText-too-thin',
      `${wordCount(p.explanationText)} words`, ref))
  }
}

function checkClozeContextsFile(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  for (let i = 0; i < (ctx.clozeContexts ?? []).length; i++) {
    const c = ctx.clozeContexts![i]
    const ref = `${c?.learning_item_slug ?? '?'} #${i + 1}`
    for (const f of ['learning_item_slug', 'source_text', 'translation_text']) {
      if (typeof c?.[f] !== 'string' || !c[f].trim()) {
        out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', `missing-${f}`, '', ref))
      }
    }
    if (typeof c?.source_text === 'string') {
      const blanks = (c.source_text.match(/___/g) ?? []).length
      if (blanks !== 1) {
        out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'cloze-blank-count',
          `expected 1 ___, got ${blanks}`, ref))
      }
      if (typeof c?.learning_item_slug === 'string') {
        const stripped = c.source_text.replace(/___/g, '').trim()
        if (stripped.length === 0 || stripped === c.learning_item_slug.replace(/___/g, '').trim()) {
          out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'context-not-embedded',
            'source_text is just the item, not embedded in a sentence', ref))
        }
      }
    }
  }
  return out
}

// New §4 check (B12): every word/phrase/expression/numbers vocab item in
// learning-items.ts must have at least one cloze context (or be in the
// discourse-particle exemption set, or be a metalinguistic single-token).
// Items with `=` in base_text must always have a cloze (the short form is
// blanked); flagged CRITICAL.
function checkClozeCoverage(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  if (!ctx.learningItems?.length) return out
  // Both sides go through normalizeForClozeCompare so case, trailing
  // punctuation, and pronunciation diacritics don't mask a real match.
  const slugsCovered = new Set(
    (ctx.clozeContexts ?? [])
      .map(c => (typeof c?.learning_item_slug === 'string' ? normalizeForClozeCompare(c.learning_item_slug) : null))
      .filter((s): s is string => Boolean(s)),
  )

  for (const it of ctx.learningItems) {
    if (!['word', 'phrase'].includes(it?.item_type)) continue
    const slug: string = it.base_text
    if (!slug) continue
    const normalized = normalizeForClozeCompare(slug)
    if (slugsCovered.has(normalized)) continue
    // Exempt lookup is more aggressive — strips the trailing (pronunciation)
    // parenthetical so 'deh! (dèh)' still matches the exempt entry 'deh'.
    const isExempt = CLOZE_EXEMPT_BASE_TEXTS.has(normalizeForExemptLookup(slug))
    const hasEqualsExpansion = slug.includes('=')
    if (hasEqualsExpansion) {
      out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'cloze-coverage-missing-equals',
        'item with "=" expansion must have a cloze context (blank the short form)', slug))
    } else if (!isExempt) {
      out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'cloze-coverage-missing',
        'word/phrase item has no cloze context', slug))
    }
  }
  return out
}

// §13 — dialogue cloze: every dialogue_chunk must be reviewable via either
// an authored cloze context or an explicit skip in clozeSkips. Enforces the
// structural half of the C-4 contract from the dialogue-pipeline plan:
// ≥6 tokens, blanked word must be a current/prior-lesson vocab item, blanked
// word must have ≥2 same-POS siblings in the lesson pool. Semantic uniqueness
// (whether any other word could fit) is LLM judgment — linguist-reviewer
// covers that.
const DIALOGUE_CLOZE_MIN_TOKENS = 6
const VALID_SKIP_REASONS = new Set([
  'below_6_token_threshold',
  'no_current_or_prior_vocab_in_line',
  'no_same_pos_distractors_in_pool',
])

function checkDialogueClozes(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  const dialogueItems = (ctx.learningItems ?? []).filter(it => it?.item_type === 'dialogue_chunk')
  if (dialogueItems.length === 0) return out

  const clozeContexts = ctx.clozeContexts ?? []
  const clozeSkips = ctx.clozeSkips ?? []

  // Build index of authored dialogue clozes by normalized slug (= dialogue
  // line's normalized base_text). We match on normalizeForClozeCompare, same
  // as checkClozeCoverage, so diacritic/punctuation variance doesn't mask.
  const clozeBySlug = new Map<string, any>()
  for (const c of clozeContexts) {
    if (typeof c?.learning_item_slug !== 'string') continue
    clozeBySlug.set(normalizeForClozeCompare(c.learning_item_slug), c)
  }
  const skipByBase = new Map<string, any>()
  for (const s of clozeSkips) {
    if (typeof s?.dialogue_chunk_base_text !== 'string') continue
    skipByBase.set(normalizeForClozeCompare(s.dialogue_chunk_base_text), s)
  }

  // Duplicate normalized_text across dialogue lines in the same lesson.
  // Expected empty set — two lines collapsing would break slug-based cloze
  // lookup and let one cloze silently mask another.
  const seen = new Map<string, string>()
  for (const it of dialogueItems) {
    const norm = normalizeForClozeCompare(String(it.base_text ?? ''))
    if (!norm) continue
    if (seen.has(norm)) {
      out.push(mkFinding('CRITICAL', ctx.n, 'learning-items.ts', 'dialogue-duplicate-normalized-text',
        `two dialogue_chunk items collapse to the same normalized_text ("${norm}") — one would mask the other in cloze lookup`,
        it.base_text))
    } else {
      seen.set(norm, it.base_text)
    }
  }

  // Build vocab pool for current + prior lessons. Used for both the
  // vocab-membership check and the same-POS-distractor check.
  // Key: normalizeDialogueToken(base_text). Value: { base_text, pos }.
  const vocabPool = new Map<string, { base_text: string, pos: string | null }>()
  const posToCount = new Map<string, number>()
  for (const src of [ctx.learningItems ?? [], ctx.priorLearningItems ?? []]) {
    for (const it of src) {
      if (!['word', 'phrase'].includes(it?.item_type)) continue
      if (typeof it?.base_text !== 'string') continue
      const key = normalizeDialogueToken(it.base_text)
      if (!key) continue
      if (!vocabPool.has(key)) {
        vocabPool.set(key, { base_text: it.base_text, pos: typeof it.pos === 'string' ? it.pos : null })
      }
      if (typeof it.pos === 'string') {
        posToCount.set(it.pos, (posToCount.get(it.pos) ?? 0) + 1)
      }
    }
  }

  for (const it of dialogueItems) {
    const baseText: string = String(it.base_text ?? '')
    if (!baseText.trim()) continue
    const ref = baseText.length > 60 ? baseText.slice(0, 60) + '…' : baseText
    const normSlug = normalizeForClozeCompare(baseText)
    const tokens = baseText.split(/\s+/).filter(Boolean)
    const tokenCount = tokens.length

    const hasCloze = clozeBySlug.has(normSlug)
    const hasSkip = skipByBase.has(normSlug)

    // 13a — translation_nl presence. Required whenever the item will be
    // published (i.e. not in clozeSkips). Productive-stage recognition_mcq
    // renders the NL translation as its Dutch prompt.
    const translation = typeof it.translation_nl === 'string' ? it.translation_nl.trim() : ''
    if (!translation && !hasSkip) {
      out.push(mkFinding('CRITICAL', ctx.n, 'learning-items.ts', 'dialogue-translation-missing',
        `dialogue_chunk has empty translation_nl — recognition_mcq at productive stage has no Dutch prompt to render`, ref))
      // Don't continue; still run coverage check to surface multiple issues at once.
    }

    // 13b — coverage
    if (!hasCloze && !hasSkip) {
      out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'dialogue-cloze-missing',
        `dialogue_chunk has no cloze context and no clozeSkips entry`, ref))
      continue
    }
    if (hasCloze && hasSkip) {
      out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'dialogue-cloze-and-skip',
        `dialogue_chunk appears in BOTH clozeContexts and clozeSkips — pick one`, ref))
      continue
    }

    if (hasCloze) {
      const c = clozeBySlug.get(normSlug)
      // 13c — eligibility on authored clozes
      if (tokenCount < DIALOGUE_CLOZE_MIN_TOKENS) {
        out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'dialogue-cloze-below-token-threshold',
          `dialogue line has ${tokenCount} tokens (<${DIALOGUE_CLOZE_MIN_TOKENS}) — should be in clozeSkips, not clozeContexts`, ref))
        continue
      }
      // Extract the blanked word from source_text vs answer key.
      // source_text has `___` where the word was; we need the word itself.
      // Convention: cloze-creator blanks a single vocab token; we recover it
      // from the difference between source_text (with ___) and base_text.
      const blank = extractBlankedWord(baseText, typeof c.source_text === 'string' ? c.source_text : '')
      if (!blank) {
        out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'dialogue-cloze-blank-unresolvable',
          `cannot determine blanked word from source_text vs base_text (source_text must be the dialogue line with one token replaced by ___)`, ref))
        continue
      }
      const blankKey = normalizeDialogueToken(blank)
      // Vocab-membership
      if (!vocabPool.has(blankKey)) {
        out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'dialogue-cloze-blank-not-in-pool',
          `blanked word "${blank}" is not in current or prior lesson's learning-items.ts — user would face an unknown word in an unknown sentence`, ref))
        continue
      }
      // Same-POS distractor pool
      const entry = vocabPool.get(blankKey)!
      if (!entry.pos) {
        out.push(mkFinding('WARNING', ctx.n, 'cloze-contexts.ts', 'dialogue-cloze-blank-missing-pos',
          `blanked word "${blank}" has no POS in learning-items.ts — distractor quality will degrade`, ref))
      } else if ((posToCount.get(entry.pos) ?? 0) < 3) {
        // < 3 because the answer itself counts in the tally; we need ≥2 OTHER same-POS siblings.
        out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'dialogue-cloze-blank-no-distractors',
          `blanked word "${blank}" (pos=${entry.pos}) has fewer than 2 same-POS siblings in the lesson pool — runtime distractor cascade will degrade`, ref))
      }
    } else if (hasSkip) {
      const s = skipByBase.get(normSlug)
      const reason = typeof s?.reason === 'string' ? s.reason : ''
      if (!VALID_SKIP_REASONS.has(reason)) {
        out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'dialogue-skip-invalid-reason',
          `clozeSkips entry has missing or unrecognised reason "${reason}" — must be one of: ${[...VALID_SKIP_REASONS].join(', ')}`, ref))
        continue
      }
      // Cross-verify the reason
      if (reason === 'below_6_token_threshold' && tokenCount >= DIALOGUE_CLOZE_MIN_TOKENS) {
        out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'dialogue-skip-bogus-threshold',
          `clozeSkips reason is "below_6_token_threshold" but line has ${tokenCount} tokens (≥${DIALOGUE_CLOZE_MIN_TOKENS}) — should have a cloze, not a skip`, ref))
      }
      if (reason === 'no_current_or_prior_vocab_in_line') {
        const hasVocab = tokens.some(tok => vocabPool.has(normalizeDialogueToken(tok)))
        if (hasVocab) {
          out.push(mkFinding('CRITICAL', ctx.n, 'cloze-contexts.ts', 'dialogue-skip-bogus-no-vocab',
            `clozeSkips reason is "no_current_or_prior_vocab_in_line" but at least one token IS a vocab item — creator should have written a cloze`, ref))
        }
      }
      // 'no_same_pos_distractors_in_pool' is hard to cross-verify without the
      // exact intended blank; accept the skip.
    }
  }

  return out
}

// Given the full dialogue line and the source_text with `___`, return the
// original token that was replaced. Does character-wise alignment around the
// `___` marker. Returns null if the alignment can't be recovered (source_text
// doesn't match base_text modulo the blank).
function extractBlankedWord(baseText: string, sourceText: string): string | null {
  const blankIdx = sourceText.indexOf('___')
  if (blankIdx < 0) return null
  const prefix = sourceText.slice(0, blankIdx)
  const suffix = sourceText.slice(blankIdx + 3)
  if (!baseText.startsWith(prefix)) return null
  const blankPlusSuffix = baseText.slice(prefix.length)
  if (!blankPlusSuffix.endsWith(suffix)) return null
  return blankPlusSuffix.slice(0, blankPlusSuffix.length - suffix.length)
}

function checkExerciseCoverage(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  if (!ctx.grammarPatterns?.length) return out
  const coverage = new Map<string, Map<string, number>>()
  for (const c of ctx.candidates ?? []) {
    if (!c?.grammar_pattern_slug || !c?.exercise_type) continue
    if (!coverage.has(c.grammar_pattern_slug)) coverage.set(c.grammar_pattern_slug, new Map())
    const m = coverage.get(c.grammar_pattern_slug)!
    m.set(c.exercise_type, (m.get(c.exercise_type) ?? 0) + 1)
  }
  for (const p of ctx.grammarPatterns) {
    const m = coverage.get(p.slug) ?? new Map()
    const total = [...m.values()].reduce((a, b) => a + b, 0)
    for (const required of REQUIRED_TYPES) {
      if (!m.has(required)) {
        out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'missing-exercise-type',
          `pattern has no ${required} candidate`, p.slug))
      }
    }
    if (total < 8) {
      out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'too-few-candidates',
        `${total} candidates (target: 10, minimum: 8)`, p.slug))
    }
  }
  return out
}

function checkVocabCoverage(ctx: LessonCtx, db: DbCtx): Finding[] {
  const out: Finding[] = []
  for (let i = 0; i < (ctx.candidates ?? []).length; i++) {
    const c = ctx.candidates![i]
    if (!c?.payload || !c?.exercise_type) continue
    const fields = indoFieldsFor(c.payload, c.exercise_type)
    const unknown = new Set<string>()
    for (const text of fields) {
      for (const raw of tokenize(text)) {
        if (raw.length < 3) continue
        if (FUNCTION_WORDS.has(raw)) continue
        const stripped = stripAffixes(raw)
        if (db.poolIndoTokens.has(raw) || db.poolIndoTokens.has(stripped)) continue
        if (FUNCTION_WORDS.has(stripped)) continue
        unknown.add(raw)
      }
    }
    if (unknown.size > 0) {
      out.push(mkFinding('WARNING', ctx.n, 'candidates.ts', 'unknown-vocabulary',
        [...unknown].sort().join(', '),
        `${c.exercise_type} #${i + 1} (${c.grammar_pattern_slug ?? '?'})`))
    }
  }
  return out
}

function checkPatternBrief(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  if (!ctx.patternBrief) return out
  const brief = ctx.patternBrief
  const localSlugs = new Set((ctx.grammarPatterns ?? []).map(p => p?.slug).filter(Boolean))
  for (const p of brief?.patterns ?? []) {
    if (p?.slug && !localSlugs.has(p.slug)) {
      out.push(mkFinding('WARNING', ctx.n, 'pattern-brief.json', 'brief-slug-not-in-grammar-patterns',
        `slug "${p.slug}" not in grammar-patterns.ts`, p.slug))
    }
  }
  const pool = brief?.vocabulary_pool ?? brief?.vocab_pool ?? []
  if (!Array.isArray(pool) || pool.length === 0) {
    out.push(mkFinding('WARNING', ctx.n, 'pattern-brief.json', 'vocabulary-pool-empty', ''))
  } else {
    pool.forEach((entry: any, i: number) => {
      if (!entry?.item_type) {
        out.push(mkFinding('CRITICAL', ctx.n, 'pattern-brief.json', 'pool-entry-missing-item_type',
          JSON.stringify(entry).slice(0, 80), `pool[${i}]`))
      }
    })
  }
  for (const p of brief?.patterns ?? []) {
    const ex = p?.example_sentences ?? []
    if (!Array.isArray(ex) || ex.length < 3) {
      out.push(mkFinding('WARNING', ctx.n, 'pattern-brief.json', 'example_sentences-too-few',
        `${Array.isArray(ex) ? ex.length : 0} examples (target ≥3)`, p?.slug ?? '?'))
    }
  }
  return out
}

function checkCapabilityPipelineOutput(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  const contentUnits = ctx.contentUnits ?? []
  const capabilities = ctx.capabilities ?? []
  const lessonPageBlocks = ctx.lessonPageBlocks ?? []

  if (contentUnits.length === 0) {
    out.push(mkFinding('CRITICAL', ctx.n, 'content-units.ts', 'slice10-content-units-missing',
      'content-units.ts is missing or empty; Slice 10 output is required'))
  }
  if (lessonPageBlocks.length === 0) {
    out.push(mkFinding('CRITICAL', ctx.n, 'lesson-page-blocks.ts', 'slice10-lesson-blocks-missing',
      'lesson-page-blocks.ts is missing or empty; Slice 10 output is required'))
  }
  if ((ctx.learningItems?.length ?? 0) + (ctx.grammarPatterns?.length ?? 0) > 0 && capabilities.length === 0) {
    out.push(mkFinding('CRITICAL', ctx.n, 'capabilities.ts', 'slice10-capabilities-missing',
      'capabilities.ts is missing or empty despite staged learning content'))
  }
  if (capabilities.length > 0 && (ctx.exerciseAssets?.length ?? 0) === 0) {
    out.push(mkFinding('CRITICAL', ctx.n, 'exercise-assets.ts', 'slice10-exercise-assets-missing',
      'exercise-assets.ts is missing or empty despite staged capabilities'))
  }

  for (const item of validateContentUnits(contentUnits)) {
    out.push(mkFinding(item.severity, ctx.n, 'content-units.ts', item.rule, item.detail, item.ref))
  }
  for (const item of validateCapabilityStaging({ capabilities, contentUnits })) {
    out.push(mkFinding(item.severity, ctx.n, 'capabilities.ts', item.rule, item.detail, item.ref))
  }
  for (const item of validateLessonPageBlocks({ blocks: lessonPageBlocks, contentUnits, capabilities })) {
    out.push(mkFinding(item.severity, ctx.n, 'lesson-page-blocks.ts', item.rule, item.detail, item.ref))
  }
  for (const item of validateExerciseAssets({ exerciseAssets: ctx.exerciseAssets ?? [], capabilities })) {
    out.push(mkFinding(item.severity, ctx.n, 'exercise-assets.ts', item.rule, item.detail, item.ref))
  }
  return out
}

function checkLearningItemsPos(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  for (const it of ctx.learningItems ?? []) {
    if (!['word', 'phrase'].includes(it?.item_type)) continue
    const ref = it?.base_text?.slice(0, 40) ?? '?'
    if (it?.pos == null) {
      out.push(mkFinding('WARNING', ctx.n, 'learning-items.ts', 'pos-missing',
        'word/phrase item without pos — distractor quality degrades for this item', ref))
    } else if (!VALID_POS.has(it.pos)) {
      out.push(mkFinding('CRITICAL', ctx.n, 'learning-items.ts', 'pos-invalid',
        `pos="${it.pos}" not in 12-value taxonomy — DB CHECK constraint will reject publish`, ref))
    }
  }
  return out
}

// §12 — vocab-enrichments. Coverage is word/phrase only; dialogue_chunks are
// reviewed via cloze contexts (see §13), not distractor enrichments. The
// runtime distractor cascade covers recognition_mcq for dialogue at
// productive+ by drawing same-POS siblings from the lesson pool — enrichments
// are authored for words where per-item-curated distractors outperform the
// cascade, which isn't the case for full sentence items.
function checkVocabEnrichments(ctx: LessonCtx, db: DbCtx): Finding[] {
  const out: Finding[] = []
  if (!ctx.vocabEnrichments) return out
  const enrich = ctx.vocabEnrichments
  const enrichBySlug = new Map<string, any>()
  for (const e of enrich) if (e?.learning_item_slug) enrichBySlug.set(e.learning_item_slug, e)

  for (const it of ctx.learningItems ?? []) {
    if (!['word', 'phrase'].includes(it?.item_type)) continue
    if (!enrichBySlug.has(it?.base_text)) {
      out.push(mkFinding('CRITICAL', ctx.n, 'vocab-enrichments.ts', 'enrichment-missing',
        'learning-items.ts entry has no vocab-enrichment row', it.base_text))
    }
  }

  for (const e of enrich) {
    const ref = e?.learning_item_slug ?? '?'
    const correctPos = db.posByText.get(String(ref).toLowerCase())
    for (const arr of ['recognition_distractors_nl', 'cued_recall_distractors_id', 'cloze_distractors_id']) {
      const v = e[arr]
      if (!Array.isArray(v) || v.length !== 3) {
        out.push(mkFinding('CRITICAL', ctx.n, 'vocab-enrichments.ts', 'distractor-array-wrong-length',
          `${arr}: expected 3, got ${Array.isArray(v) ? v.length : 'not-array'}`, ref))
        continue
      }
      const seen = new Set<string>()
      for (const d of v) {
        const key = String(d).toLowerCase().trim()
        if (seen.has(key)) {
          out.push(mkFinding('WARNING', ctx.n, 'vocab-enrichments.ts', 'distractor-duplicate-in-array',
            `${arr} contains duplicate "${d}"`, ref))
        }
        seen.add(key)
        if (key === String(ref).toLowerCase().trim()) {
          out.push(mkFinding('CRITICAL', ctx.n, 'vocab-enrichments.ts', 'distractor-equals-answer',
            `${arr} contains the correct answer as a distractor`, ref))
        }
        if (arr.endsWith('_id') && !db.poolIndoExact.has(key)) {
          if (key.split(/\s+/).length === 1 && key.length > 2) {
            out.push(mkFinding('WARNING', ctx.n, 'vocab-enrichments.ts', 'distractor-not-in-id-pool',
              `${arr} "${d}" not in learning_items pool`, ref))
          }
        }
        // POS-class match (B/D8 — wires posByText into a real check). Only
        // the Indonesian arrays carry a POS check; Dutch translations don't
        // map cleanly to POS in our taxonomy.
        if (correctPos && arr.endsWith('_id')) {
          const distractorPos = db.posByText.get(key)
          if (distractorPos && distractorPos !== correctPos) {
            out.push(mkFinding('WARNING', ctx.n, 'vocab-enrichments.ts', 'distractor-pos-mismatch',
              `${arr} "${d}" is ${distractorPos}; answer is ${correctPos}`, ref))
          }
        }
      }
      if (arr === 'cued_recall_distractors_id' || arr === 'cloze_distractors_id') {
        const root = stripAffixes(String(ref).toLowerCase())
        if (root.length >= 3) {
          for (const d of v) {
            const dr = stripAffixes(String(d).toLowerCase())
            if (dr === root && dr.length >= 3) {
              out.push(mkFinding('WARNING', ctx.n, 'vocab-enrichments.ts', 'distractor-morphological-variant',
                `${arr} "${d}" shares root with answer "${ref}"`, ref))
            }
          }
        }
      }
    }
  }
  return out
}

// ---- CLI parsing ----

interface CliArgs { jsonOut: boolean; sevFilter: Severity | null; onlyLesson: number | null }

function parseArgs(args: string[]): CliArgs {
  const jsonOut = args.includes('--json')
  let sevFilter: Severity | null = null
  let onlyLesson: number | null = null
  const sevIdx = args.indexOf('--severity')
  if (sevIdx >= 0) {
    const v = args[sevIdx + 1]
    if (!v) { console.error('--severity requires a value (critical or warning)'); process.exit(2) }
    const up = v.toUpperCase()
    if (up !== 'CRITICAL' && up !== 'WARNING') {
      console.error(`--severity expects "critical" or "warning", got "${v}"`); process.exit(2)
    }
    sevFilter = up as Severity
  }
  const lessonIdx = args.indexOf('--lesson')
  if (lessonIdx >= 0) {
    const v = args[lessonIdx + 1]
    if (!v) { console.error('--lesson requires a number'); process.exit(2) }
    const n = parseInt(v, 10)
    if (Number.isNaN(n) || n < 1) { console.error(`--lesson expects a positive integer, got "${v}"`); process.exit(2) }
    onlyLesson = n
  }
  return { jsonOut, sevFilter, onlyLesson }
}

// ---- Main ----

async function main() {
  const { jsonOut, sevFilter, onlyLesson } = parseArgs(process.argv.slice(2))

  const stagingRoot = path.join(process.cwd(), 'scripts', 'data', 'staging')
  if (!fs.existsSync(stagingRoot)) {
    console.error(`staging root not found: ${stagingRoot}`); process.exit(2)
  }
  const dirs = fs.readdirSync(stagingRoot).filter(d => /^lesson-\d+$/.test(d))
  const allLessonNumbers = dirs.map(d => parseInt(d.replace('lesson-', ''), 10)).sort((a, b) => a - b)
  if (onlyLesson != null && !allLessonNumbers.includes(onlyLesson)) {
    console.error(`lesson ${onlyLesson} has no staging directory under ${stagingRoot}`); process.exit(2)
  }

  if (!jsonOut) console.log('Loading DB context…')
  const db = await loadDb()

  if (!jsonOut) console.log(`Loading staging files for ${allLessonNumbers.length} lesson(s)…`)
  const allCtxs = await Promise.all(allLessonNumbers.map(loadLesson))

  // Cross-lesson slug map: every slug → list of lesson numbers it appears in.
  // A duplicate (len > 1) is CRITICAL regardless of which lesson is being linted.
  const slugToLessons = new Map<string, number[]>()
  for (const c of allCtxs) {
    for (const p of c.grammarPatterns ?? []) {
      if (!p?.slug) continue
      if (!slugToLessons.has(p.slug)) slugToLessons.set(p.slug, [])
      slugToLessons.get(p.slug)!.push(c.n)
    }
  }

  const findings: Finding[] = []
  for (const ctx of allCtxs) {
    if (onlyLesson != null && ctx.n !== onlyLesson) continue
    if (!ctx.exists) continue
    findings.push(...checkLessonStructure(ctx))
    findings.push(...checkGrammarPatterns(ctx, slugToLessons))
    findings.push(...checkCandidatesStructural(ctx, db))
    findings.push(...checkClozeContextsFile(ctx))
    findings.push(...checkClozeCoverage(ctx))
    findings.push(...checkDialogueClozes(ctx))
    findings.push(...checkExerciseCoverage(ctx))
    findings.push(...checkVocabCoverage(ctx, db))
    findings.push(...checkPatternBrief(ctx))
    findings.push(...checkCapabilityPipelineOutput(ctx))
    findings.push(...checkLearningItemsPos(ctx))
    findings.push(...checkVocabEnrichments(ctx, db))
  }

  // D3 fix: counts always reflect the true critical/warning state, regardless
  // of --severity display filter. Otherwise a `--severity warning` run would
  // exit 0 even with CRITICALs present.
  const counts = {
    total: findings.length,
    critical: findings.filter(f => f.severity === 'CRITICAL').length,
    warning: findings.filter(f => f.severity === 'WARNING').length,
  }
  const display = sevFilter ? findings.filter(f => f.severity === sevFilter) : findings

  if (jsonOut) {
    console.log(JSON.stringify({ counts, findings: display }, null, 2))
  } else if (display.length === 0) {
    console.log('\nClean.')
  } else {
    console.log(`\n${counts.critical} CRITICAL, ${counts.warning} WARNING (showing ${display.length})\n`)
    // Group by lesson then file, sorting numerically by lesson so lesson-10
    // doesn't appear between lesson-1 and lesson-2.
    type Group = { lesson: number; file: string; findings: Finding[] }
    const groups: Group[] = []
    for (const f of display) {
      let g = groups.find(g => g.lesson === f.lesson && g.file === f.file)
      if (!g) { g = { lesson: f.lesson, file: f.file, findings: [] }; groups.push(g) }
      g.findings.push(f)
    }
    groups.sort((a, b) => a.lesson - b.lesson || a.file.localeCompare(b.file))
    for (const g of groups) {
      console.log(`Lesson ${g.lesson} · ${g.file}`)
      for (const f of g.findings) {
        const sev = f.severity === 'CRITICAL' ? 'CRIT ' : 'WARN '
        const ref = f.ref ? `[${f.ref}] ` : ''
        console.log(`  ${sev} ${ref}${f.rule} — ${f.detail}`)
      }
      console.log()
    }
  }

  process.exit(counts.critical > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
