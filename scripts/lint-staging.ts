#!/usr/bin/env bun
/**
 * lint-staging.ts — deterministic checks for the linguist pipeline
 *
 * Replaces the manual structural checks the linguist-reviewer agent used to
 * do by hand. Runs every fully-scriptable rule and the scriptable half of
 * partially-scriptable rules. The reviewer agent should run this first, then
 * focus its LLM cycles on the pedagogical-judgment checks the script can't do
 * (naturalness, CEFR level, distractor pedagogy, etc.).
 *
 * Wire into publish-approved-content.ts as a pre-flight gate so even a missed
 * review can't ship structurally-broken content.
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
 *   2 — script error
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY required')
  process.exit(2)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'indonesian' },
  auth: { persistSession: false },
})

type Severity = 'CRITICAL' | 'WARNING'
interface Finding {
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
  lesson?: any
  grammarPatterns?: any[]
  candidates?: any[]
  clozeContexts?: any[]
  patternBrief?: any
  learningItems?: any[]
  vocabEnrichments?: any[]
  sectionsCatalog?: any
}

interface DbCtx {
  knownSlugs: Set<string>          // grammar_patterns.slug across DB
  poolIndoTokens: Set<string>      // tokens from learning_items.normalized_text + item_contexts.source_text (with affix-stripped variants)
  poolIndoExact: Set<string>       // exact normalized_text values (for distractor lookup)
  poolNlExact: Set<string>         // item_meanings.translation_text where language='nl'
  posByText: Map<string, string>   // base_text -> pos (for word-class checks)
}

const VALID_POS = new Set([
  'verb','noun','adjective','adverb','pronoun','numeral','classifier',
  'preposition','conjunction','particle','question_word','greeting',
])

const REQUIRED_TYPES = ['contrast_pair','sentence_transformation','constrained_translation','cloze_mcq']

// Patterns where constrained_translation should also include a slot blank.
// Mirrors the list documented in linguist-reviewer.md §3.
const SLOT_PATTERNS = new Set([
  'belum-vs-tidak','kami-vs-kita','dari-di-ke-locative','bukan-negation',
  'tidak-negation','bukan-tag-question','jangan-prohibition',
  'sekali-intensifier','kah-question-suffix','imperative-lah-suffix',
])

const SUFFIXES = ['nya','lah','kah','ku','mu','kan','i']
const PREFIXES = ['meng','meny','memp','memb','memf','menj','mens','menc','mem','men','peng','peny','pemp','pemb','penj','pens','penc','pem','pen','ber','ter','per','ke','se','di','me','pe','ku','mu']

function stripAffixes(word: string): string {
  let w = word
  let changed = true
  while (changed) {
    changed = false
    for (const suf of SUFFIXES) {
      if (w.length > suf.length + 2 && w.endsWith(suf)) { w = w.slice(0, -suf.length); changed = true; break }
    }
    for (const pre of PREFIXES) {
      if (w.length > pre.length + 2 && w.startsWith(pre)) { w = w.slice(pre.length); changed = true; break }
    }
  }
  return w
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean)
}

const FUNCTION_WORDS = new Set([
  'itu','ini','di','ke','dari','yang','dan','atau','tapi','tetapi','dengan','untuk','pada','dalam','akan','sudah','belum','tidak','bukan','adalah','ada','saya','kamu','dia','kami','kita','mereka','anda','aku','ya','juga','saja','lagi','sangat','sekali','agar','supaya','karena','sebab','jika','kalau','maka','kemudian','lalu','setelah','sebelum','ketika','waktu','sambil','tanpa','tentang','seperti','sang','bahwa','bagi','oleh','sampai','hingga','baru','lebih','paling','suka','bisa','dapat','harus','mau','ingin','perlu','boleh','sedang','sini','sana','situ','kenapa','apa','siapa','mana','bagaimana','kapan','berapa','lah','kah','pun','nya','sebuah','seorang','para','semua','setiap','beberapa','banyak','sedikit',
])

// ---- I/O ----

async function readTsExport(filePath: string): Promise<any> {
  if (!fs.existsSync(filePath)) return null
  const m = await import(`file://${filePath}?t=${Date.now()}`)
  const exports = Object.values(m)
  return exports.length > 0 ? exports[0] : null
}

function readJson(filePath: string): any {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

async function loadLesson(n: number): Promise<LessonCtx> {
  const dir = path.join(process.cwd(), 'scripts', 'data', 'staging', `lesson-${n}`)
  if (!fs.existsSync(dir)) return { n, dir }
  const ctx: LessonCtx = { n, dir }
  ctx.lesson = await readTsExport(path.join(dir, 'lesson.ts'))
  ctx.grammarPatterns = await readTsExport(path.join(dir, 'grammar-patterns.ts')) ?? []
  ctx.candidates = await readTsExport(path.join(dir, 'candidates.ts')) ?? []
  ctx.clozeContexts = await readTsExport(path.join(dir, 'cloze-contexts.ts')) ?? []
  ctx.learningItems = await readTsExport(path.join(dir, 'learning-items.ts')) ?? []
  ctx.vocabEnrichments = await readTsExport(path.join(dir, 'vocab-enrichments.ts')) ?? null
  ctx.patternBrief = readJson(path.join(dir, 'pattern-brief.json'))
  ctx.sectionsCatalog = readJson(path.join(dir, 'sections-catalog.json'))
  return ctx
}

async function loadDb(): Promise<DbCtx> {
  const knownSlugs = new Set<string>()
  const { data: gps } = await supabase.from('grammar_patterns').select('slug')
  for (const g of gps ?? []) knownSlugs.add(g.slug)

  const poolIndoTokens = new Set<string>()
  const poolIndoExact = new Set<string>()
  const posByText = new Map<string, string>()
  const { data: items } = await supabase.from('learning_items').select('base_text, normalized_text, pos').eq('is_active', true)
  for (const it of items ?? []) {
    if (it.normalized_text) {
      poolIndoExact.add(String(it.normalized_text).toLowerCase())
      for (const tok of tokenize(it.normalized_text)) {
        poolIndoTokens.add(tok); poolIndoTokens.add(stripAffixes(tok))
      }
    }
    if (it.base_text && it.pos) posByText.set(String(it.base_text).toLowerCase(), it.pos)
  }
  const { data: ctxs } = await supabase.from('item_contexts').select('source_text')
  for (const c of ctxs ?? []) {
    for (const tok of tokenize(c.source_text)) {
      poolIndoTokens.add(tok); poolIndoTokens.add(stripAffixes(tok))
    }
  }

  const poolNlExact = new Set<string>()
  const { data: meanings } = await supabase.from('item_meanings').select('translation_text, translation_language').eq('translation_language', 'nl')
  for (const m of meanings ?? []) {
    if (m.translation_text) poolNlExact.add(String(m.translation_text).toLowerCase())
  }

  return { knownSlugs, poolIndoTokens, poolIndoExact, poolNlExact, posByText }
}

// ---- Check helpers ----

function isKebabCase(s: string): boolean { return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s) }
function wordCount(s: string): number { return s.trim().split(/\s+/).filter(Boolean).length }
function nestedSentenceFor(payload: any, exerciseType: string): string {
  if (exerciseType === 'cloze_mcq') return payload?.sentence ?? ''
  if (exerciseType === 'sentence_transformation') return payload?.sourceSentence ?? ''
  return ''
}

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

// ---- Checks ----

function checkLessonStructure(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  if (!ctx.lesson) return out
  const sections = ctx.lesson?.lesson_sections ?? ctx.lesson?.sections ?? []
  for (const s of sections) {
    if (s?.section_type === 'grammar' || s?.type === 'grammar') {
      const c = s.content ?? s
      if (typeof c?.body === 'string' && !Array.isArray(c?.categories)) {
        out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'lesson.ts', ref: s?.title ?? '?',
          rule: 'grammar-section-unstructured', detail: 'grammar section still has body:string and no categories array' })
      }
    }
    if (s?.section_type === 'exercises' || s?.type === 'exercises') {
      const c = s.content ?? s
      if (typeof c?.body === 'string' && !Array.isArray(c?.sections)) {
        out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'lesson.ts', ref: s?.title ?? '?',
          rule: 'exercises-section-unstructured', detail: 'exercises section still has body:string and no sections array' })
      }
      // Translation/grammar_drill items must have answer
      const subs = c?.sections ?? []
      for (const sub of subs) {
        if (sub?.type === 'translation' || sub?.type === 'grammar_drill') {
          const items = sub?.items ?? []
          items.forEach((it: any, i: number) => {
            if (it?.answer == null || it.answer === '') {
              out.push({ severity: 'WARNING', lesson: ctx.n, file: 'lesson.ts', ref: `${s.title} #${i + 1}`,
                rule: 'translation-drill-no-answer', detail: `${sub.type} item missing answer field` })
            }
          })
        }
      }
    }
  }
  return out
}

function checkGrammarPatterns(ctx: LessonCtx, db: DbCtx, allOtherSlugs: Map<string, number>): Finding[] {
  const out: Finding[] = []
  for (const p of ctx.grammarPatterns ?? []) {
    const ref = p?.slug ?? p?.pattern_name ?? '?'
    if (!p?.pattern_name) out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'grammar-patterns.ts', ref, rule: 'missing-pattern_name', detail: '' })
    if (!p?.description) out.push({ severity: 'WARNING', lesson: ctx.n, file: 'grammar-patterns.ts', ref, rule: 'missing-description', detail: '' })
    if (!p?.slug) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'grammar-patterns.ts', ref, rule: 'missing-slug', detail: '' })
      continue
    }
    if (!isKebabCase(p.slug)) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'grammar-patterns.ts', ref, rule: 'slug-not-kebab', detail: p.slug })
    }
    if (typeof p?.complexity_score !== 'number' || p.complexity_score < 1 || p.complexity_score > 10) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'grammar-patterns.ts', ref, rule: 'complexity_score-out-of-range', detail: String(p?.complexity_score) })
    }
    // Cross-lesson + DB slug uniqueness
    const otherLessonHit = allOtherSlugs.get(p.slug)
    if (otherLessonHit !== undefined && otherLessonHit !== ctx.n) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'grammar-patterns.ts', ref,
        rule: 'slug-duplicate-other-lesson', detail: `also defined in lesson-${otherLessonHit}` })
    }
    if (db.knownSlugs.has(p.slug)) {
      // Slug already in DB — that's fine (it was published), but flag if intent looks new
      // We can't easily tell new vs existing without comparing IDs; leave as informational only
    }
  }
  return out
}

function checkCandidatesStructural(ctx: LessonCtx, db: DbCtx): Finding[] {
  const out: Finding[] = []
  const localSlugs = new Set((ctx.grammarPatterns ?? []).map(p => p?.slug).filter(Boolean))
  const cands = ctx.candidates ?? []

  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]
    const ref = `${c?.exercise_type ?? '?'} #${i + 1} (${c?.grammar_pattern_slug ?? '?'})`

    if (c?.exercise_type === 'speaking') {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'speaking-type-forbidden', detail: '' })
      continue
    }
    if (!c?.payload || typeof c.payload !== 'object') {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'payload-missing', detail: 'candidate has no payload object — publish reads candidate.payload' })
      continue
    }
    const p = c.payload
    const t = c.exercise_type

    // grammar_pattern_slug must resolve (local or DB)
    if (c.grammar_pattern_slug && !localSlugs.has(c.grammar_pattern_slug) && !db.knownSlugs.has(c.grammar_pattern_slug)) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'unresolved-grammar_pattern_slug', detail: c.grammar_pattern_slug })
    }
    // grammar exercise types require slug
    if (['cloze_mcq','contrast_pair','sentence_transformation','constrained_translation'].includes(t) && !c.grammar_pattern_slug) {
      // cloze_mcq for VOCAB might not have slug; check based on context — assume any candidate without slug is intentional vocab-only
      // Spec says grammar versions require slug — for the staging cycle, all are grammar so flag absence.
      // Soft to WARNING to avoid false positives during vocab-only cloze publication.
      out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'no-grammar_pattern_slug', detail: 'grammar candidate without slug' })
    }

    if (t === 'contrast_pair') {
      checkContrastPair(p, ctx, ref, out)
    } else if (t === 'cloze_mcq') {
      checkClozeMcq(p, ctx, ref, out)
    } else if (t === 'sentence_transformation') {
      checkSentenceTransformation(p, ctx, ref, out)
    } else if (t === 'constrained_translation') {
      checkConstrainedTranslation(p, c.grammar_pattern_slug, ctx, ref, out)
    }
  }
  return out
}

function checkContrastPair(p: any, ctx: LessonCtx, ref: string, out: Finding[]): void {
  for (const f of ['promptText','targetMeaning','correctOptionId','explanationText']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: `missing-${f}`, detail: '' })
    }
  }
  const opts = Array.isArray(p.options) ? p.options : []
  if (opts.length !== 2) {
    out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'options-wrong-length', detail: `expected 2, got ${opts.length}` })
  }
  for (const o of opts) {
    if (typeof o?.id !== 'string' || typeof o?.text !== 'string') {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'option-missing-id-or-text', detail: '' })
    } else if (o.id !== o.text) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'option-id-not-text', detail: `id="${o.id}" text="${o.text}" — id must equal text` })
    }
  }
  if (opts.length === 2 && !opts.some((o: any) => o?.id === p.correctOptionId)) {
    out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'correctOptionId-not-in-options', detail: `correctOptionId="${p.correctOptionId}"` })
  }
  // Substring duplicate options
  if (opts.length === 2) {
    const [a, b] = [String(opts[0]?.text ?? ''), String(opts[1]?.text ?? '')]
    if (a && b && (a !== b) && (a.includes(b) || b.includes(a))) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'options-substring-duplicate', detail: `"${a}" / "${b}"` })
    }
  }
  // targetMeaning paraphrase / length checks (partially scriptable)
  if (typeof p.targetMeaning === 'string' && typeof p.promptText === 'string') {
    const tmLow = p.targetMeaning.toLowerCase().trim()
    const ptLow = p.promptText.toLowerCase().trim()
    if (tmLow === ptLow) {
      out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'targetMeaning-equals-promptText', detail: '' })
    } else if (ptLow.length > 0 && ptLow.includes(tmLow) && tmLow.length > 4) {
      out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'targetMeaning-substring-of-promptText', detail: `targetMeaning="${p.targetMeaning}"` })
    }
    if (wordCount(p.targetMeaning) > 12) {
      out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'targetMeaning-too-long', detail: `${wordCount(p.targetMeaning)} words — should be 3–10 word gloss` })
    }
  }
  // Parenthetical answer-reveal regex on promptText
  if (typeof p.promptText === 'string') {
    const m = p.promptText.match(/\(([^)]{2,80})\)/)
    if (m) {
      const inside = m[1].toLowerCase()
      // Heuristic: parenthetical that names the criterion
      if (/\b(nog niet|definitief|gebruik|kies|antwoord|correct|inclusief|exclusief)\b/.test(inside)
          || /\bNOG\s+NIET\b/.test(m[1])) {
        out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'promptText-parenthetical-hint', detail: `(${m[1]})` })
      }
    }
    if (/\[[^\]]+\]/.test(p.promptText)) {
      out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'promptText-bracketed-label', detail: 'bracketed [..] in prompt — usually labels the answer' })
    }
  }
  // explanationText length
  if (typeof p.explanationText === 'string' && wordCount(p.explanationText) < 15) {
    out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'explanationText-too-thin', detail: `${wordCount(p.explanationText)} words — likely too short to teach` })
  }
}

function checkClozeMcq(p: any, ctx: LessonCtx, ref: string, out: Finding[]): void {
  for (const f of ['sentence','correctOptionId','explanationText']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: `missing-${f}`, detail: '' })
    }
  }
  if (typeof p.sentence === 'string') {
    const blanks = (p.sentence.match(/___/g) ?? []).length
    if (blanks !== 1) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'cloze-blank-count', detail: `expected exactly one ___, got ${blanks}` })
    }
  }
  const opts = Array.isArray(p.options) ? p.options : []
  if (opts.length !== 4) {
    out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'options-wrong-length', detail: `expected 4, got ${opts.length}` })
  }
  if (opts.length > 0 && !opts.includes(p.correctOptionId)) {
    out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'correctOptionId-not-in-options', detail: `correctOptionId="${p.correctOptionId}"` })
  }
  // Substring-duplicate options (e.g. "sekali" + "sekali besar")
  for (let i = 0; i < opts.length; i++) {
    for (let j = i + 1; j < opts.length; j++) {
      const a = String(opts[i] ?? ''), b = String(opts[j] ?? '')
      if (a && b && a !== b && (a.includes(b) || b.includes(a))) {
        out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'options-substring-duplicate', detail: `"${a}" / "${b}"` })
        break
      }
    }
  }
  if (p.translation == null) {
    out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'cloze_mcq-translation-null', detail: 'translation should be a Dutch sentence; null only acceptable in rare metalinguistic cases' })
  }
  // Distractors are morphological variants of correct answer
  if (opts.length === 4 && typeof p.correctOptionId === 'string') {
    const correctRoot = stripAffixes(String(p.correctOptionId).toLowerCase())
    if (correctRoot.length >= 3) {
      const distractorRoots = opts.filter((o: string) => o !== p.correctOptionId).map((o: string) => stripAffixes(String(o).toLowerCase()))
      if (distractorRoots.length === 3 && distractorRoots.every(r => r === correctRoot)) {
        out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'distractors-all-morphological-variants', detail: `all distractors share root "${correctRoot}" with the answer — for content-word blanks distractors must be different vocabulary` })
      }
    }
  }
  if (typeof p.explanationText === 'string' && wordCount(p.explanationText) < 15) {
    out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'explanationText-too-thin', detail: `${wordCount(p.explanationText)} words` })
  }
}

function checkSentenceTransformation(p: any, ctx: LessonCtx, ref: string, out: Finding[]): void {
  for (const f of ['sourceSentence','transformationInstruction','explanationText']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: `missing-${f}`, detail: '' })
    }
  }
  if (!Array.isArray(p.acceptableAnswers) || p.acceptableAnswers.length === 0) {
    out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'acceptableAnswers-empty', detail: '' })
  }
  // Instruction reveals answer: "vervang X door Y" where Y appears in acceptableAnswers tokens
  if (typeof p.transformationInstruction === 'string' && Array.isArray(p.acceptableAnswers)) {
    const m = p.transformationInstruction.match(/vervang\s+['"]?([^'"]+?)['"]?\s+door\s+['"]?([^'"]+?)['"]?(?:[\.\s]|$)/i)
    if (m) {
      const target = m[2].toLowerCase().trim()
      const ansTokens = new Set(p.acceptableAnswers.flatMap((a: string) => tokenize(a)))
      const targetToks = tokenize(target)
      if (targetToks.length > 0 && targetToks.every(t => ansTokens.has(t))) {
        out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'instruction-reveals-answer', detail: `"vervang ... door '${m[2]}'" — answer is in the instruction` })
      }
    }
  }
  if (typeof p.explanationText === 'string' && wordCount(p.explanationText) < 15) {
    out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'explanationText-too-thin', detail: `${wordCount(p.explanationText)} words` })
  }
}

function checkConstrainedTranslation(p: any, slug: string | undefined, ctx: LessonCtx, ref: string, out: Finding[]): void {
  for (const f of ['sourceLanguageSentence','requiredTargetPattern','explanationText']) {
    if (typeof p[f] !== 'string' || !p[f].trim()) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: `missing-${f}`, detail: '' })
    }
  }
  if (!Array.isArray(p.acceptableAnswers) || p.acceptableAnswers.length === 0) {
    out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'acceptableAnswers-empty', detail: '' })
  }
  if (slug && SLOT_PATTERNS.has(slug)) {
    if (typeof p.targetSentenceWithBlank !== 'string' || !p.targetSentenceWithBlank.includes('___')) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'slot-pattern-missing-blank', detail: `pattern ${slug} requires targetSentenceWithBlank with ___` })
    }
    if (!Array.isArray(p.blankAcceptableAnswers) || p.blankAcceptableAnswers.length === 0) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'slot-pattern-missing-blank-answers', detail: `pattern ${slug} requires non-empty blankAcceptableAnswers` })
    }
  }
  if (typeof p.explanationText === 'string' && wordCount(p.explanationText) < 15) {
    out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref, rule: 'explanationText-too-thin', detail: `${wordCount(p.explanationText)} words` })
  }
}

function checkClozeContextsFile(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  const items = ctx.clozeContexts ?? []
  for (let i = 0; i < items.length; i++) {
    const c = items[i]
    const ref = `${c?.learning_item_slug ?? '?'} #${i + 1}`
    for (const f of ['learning_item_slug','source_text','translation_text']) {
      if (typeof c?.[f] !== 'string' || !c[f].trim()) {
        out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'cloze-contexts.ts', ref, rule: `missing-${f}`, detail: '' })
      }
    }
    if (typeof c?.source_text === 'string') {
      const blanks = (c.source_text.match(/___/g) ?? []).length
      if (blanks !== 1) {
        out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'cloze-contexts.ts', ref, rule: 'cloze-blank-count', detail: `expected 1 ___, got ${blanks}` })
      }
      // source_text shouldn't be just the item itself with underscores
      if (typeof c?.learning_item_slug === 'string') {
        const stripped = c.source_text.replace(/___/g, '').trim()
        if (stripped.length === 0 || stripped === c.learning_item_slug.replace(/___/g, '').trim()) {
          out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'cloze-contexts.ts', ref, rule: 'context-not-embedded', detail: 'source_text is just the item, not embedded in a sentence' })
        }
      }
    }
  }
  return out
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
        out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref: p.slug,
          rule: 'missing-exercise-type', detail: `pattern has no ${required} candidate` })
      }
    }
    if (total < 8) {
      out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts', ref: p.slug,
        rule: 'too-few-candidates', detail: `${total} candidates (target: 10, minimum: 8)` })
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
      out.push({ severity: 'WARNING', lesson: ctx.n, file: 'candidates.ts',
        ref: `${c.exercise_type} #${i + 1} (${c.grammar_pattern_slug ?? '?'})`,
        rule: 'unknown-vocabulary', detail: [...unknown].sort().join(', ') })
    }
  }
  return out
}

function checkPatternBrief(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  if (!ctx.patternBrief) return out  // optional file
  const brief = ctx.patternBrief
  const localSlugs = new Set((ctx.grammarPatterns ?? []).map(p => p?.slug).filter(Boolean))
  const briefSlugs: string[] = (brief?.patterns ?? []).map((p: any) => p?.slug).filter(Boolean)
  for (const s of briefSlugs) {
    if (!localSlugs.has(s)) {
      out.push({ severity: 'WARNING', lesson: ctx.n, file: 'pattern-brief.json', ref: s,
        rule: 'brief-slug-not-in-grammar-patterns', detail: `slug "${s}" not in grammar-patterns.ts` })
    }
  }
  const pool = brief?.vocabulary_pool ?? brief?.vocab_pool ?? []
  if (!Array.isArray(pool) || pool.length === 0) {
    out.push({ severity: 'WARNING', lesson: ctx.n, file: 'pattern-brief.json', rule: 'vocabulary-pool-empty', detail: '' })
  } else {
    pool.forEach((entry: any, i: number) => {
      if (!entry?.item_type) {
        out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'pattern-brief.json', ref: `pool[${i}]`,
          rule: 'pool-entry-missing-item_type', detail: JSON.stringify(entry).slice(0, 80) })
      }
    })
  }
  for (const p of brief?.patterns ?? []) {
    const ex = p?.example_sentences ?? []
    if (!Array.isArray(ex) || ex.length < 3) {
      out.push({ severity: 'WARNING', lesson: ctx.n, file: 'pattern-brief.json', ref: p?.slug ?? '?',
        rule: 'example_sentences-too-few', detail: `${Array.isArray(ex) ? ex.length : 0} examples (target ≥3)` })
    }
  }
  return out
}

function checkLearningItemsPos(ctx: LessonCtx): Finding[] {
  const out: Finding[] = []
  for (const it of ctx.learningItems ?? []) {
    if (!['word', 'phrase'].includes(it?.item_type)) continue
    if (it?.pos == null) {
      out.push({ severity: 'WARNING', lesson: ctx.n, file: 'learning-items.ts', ref: it?.base_text?.slice(0, 40) ?? '?',
        rule: 'pos-missing', detail: 'word/phrase item without pos — distractor quality degrades for this item' })
    } else if (!VALID_POS.has(it.pos)) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'learning-items.ts', ref: it?.base_text?.slice(0, 40) ?? '?',
        rule: 'pos-invalid', detail: `pos="${it.pos}" not in 12-value taxonomy — DB CHECK constraint will reject publish` })
    }
  }
  return out
}

function checkVocabEnrichments(ctx: LessonCtx, db: DbCtx): Finding[] {
  const out: Finding[] = []
  if (!ctx.vocabEnrichments) return out  // file is optional
  const enrich = ctx.vocabEnrichments
  const enrichBySlug = new Map<string, any>()
  for (const e of enrich) if (e?.learning_item_slug) enrichBySlug.set(e.learning_item_slug, e)

  // Every word/phrase item should have an entry
  for (const it of ctx.learningItems ?? []) {
    if (!['word', 'phrase'].includes(it?.item_type)) continue
    if (!enrichBySlug.has(it?.base_text)) {
      out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'vocab-enrichments.ts', ref: it.base_text,
        rule: 'enrichment-missing', detail: 'learning-items.ts entry has no vocab-enrichment row' })
    }
  }

  for (const e of enrich) {
    const ref = e?.learning_item_slug ?? '?'
    for (const arr of ['recognition_distractors_nl','cued_recall_distractors_id','cloze_distractors_id']) {
      const v = e[arr]
      if (!Array.isArray(v) || v.length !== 3) {
        out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'vocab-enrichments.ts', ref,
          rule: 'distractor-array-wrong-length', detail: `${arr}: expected 3, got ${Array.isArray(v) ? v.length : 'not-array'}` })
        continue
      }
      const seen = new Set<string>()
      for (const d of v) {
        const key = String(d).toLowerCase().trim()
        if (seen.has(key)) {
          out.push({ severity: 'WARNING', lesson: ctx.n, file: 'vocab-enrichments.ts', ref,
            rule: 'distractor-duplicate-in-array', detail: `${arr} contains duplicate "${d}"` })
        }
        seen.add(key)
        if (key === String(ref).toLowerCase().trim()) {
          out.push({ severity: 'CRITICAL', lesson: ctx.n, file: 'vocab-enrichments.ts', ref,
            rule: 'distractor-equals-answer', detail: `${arr} contains the correct answer as a distractor` })
        }
        // Pool membership (only meaningful for *_id arrays — Indonesian distractors should be real Indonesian items)
        if (arr.endsWith('_id') && !db.poolIndoExact.has(key)) {
          // Don't flag short tokens or compound phrases — only single tokens worth checking
          if (key.split(/\s+/).length === 1 && key.length > 2) {
            out.push({ severity: 'WARNING', lesson: ctx.n, file: 'vocab-enrichments.ts', ref,
              rule: 'distractor-not-in-id-pool', detail: `${arr} "${d}" not in learning_items pool` })
          }
        }
      }
      // Morphological variants of the answer (cued_recall and cloze)
      if (arr === 'cued_recall_distractors_id' || arr === 'cloze_distractors_id') {
        const root = stripAffixes(String(ref).toLowerCase())
        if (root.length >= 3) {
          for (const d of v) {
            const dr = stripAffixes(String(d).toLowerCase())
            if (dr === root && dr.length >= 3) {
              out.push({ severity: 'WARNING', lesson: ctx.n, file: 'vocab-enrichments.ts', ref,
                rule: 'distractor-morphological-variant', detail: `${arr} "${d}" shares root with answer "${ref}"` })
            }
          }
        }
      }
    }
  }
  return out
}

// ---- Main ----

async function main() {
  const args = process.argv.slice(2)
  const jsonOut = args.includes('--json')
  const sevIdx = args.indexOf('--severity')
  const sevFilter: Severity | null = sevIdx >= 0 ? (args[sevIdx + 1].toUpperCase() as Severity) : null
  const lessonIdx = args.indexOf('--lesson')
  const onlyLesson = lessonIdx >= 0 ? parseInt(args[lessonIdx + 1], 10) : null

  // Discover lessons
  const stagingRoot = path.join(process.cwd(), 'scripts', 'data', 'staging')
  const dirs = fs.readdirSync(stagingRoot).filter(d => /^lesson-\d+$/.test(d))
  const allLessonNumbers = dirs.map(d => parseInt(d.replace('lesson-', ''), 10)).sort((a, b) => a - b)
  const targetLessons = onlyLesson != null ? [onlyLesson] : allLessonNumbers

  if (!jsonOut) console.log(`Loading DB context…`)
  const db = await loadDb()

  // Need ALL lesson contexts (not just target) to compute cross-lesson slug uniqueness
  if (!jsonOut) console.log(`Loading staging files for ${allLessonNumbers.length} lesson(s)…`)
  const allCtxs = await Promise.all(allLessonNumbers.map(loadLesson))
  const slugToLesson = new Map<string, number>()
  for (const c of allCtxs) {
    for (const p of c.grammarPatterns ?? []) {
      if (p?.slug && !slugToLesson.has(p.slug)) slugToLesson.set(p.slug, c.n)
    }
  }

  const findings: Finding[] = []
  for (const ctx of allCtxs) {
    if (!targetLessons.includes(ctx.n)) continue
    if (!fs.existsSync(ctx.dir)) continue
    findings.push(...checkLessonStructure(ctx))
    findings.push(...checkGrammarPatterns(ctx, db, slugToLesson))
    findings.push(...checkCandidatesStructural(ctx, db))
    findings.push(...checkClozeContextsFile(ctx))
    findings.push(...checkExerciseCoverage(ctx))
    findings.push(...checkVocabCoverage(ctx, db))
    findings.push(...checkPatternBrief(ctx))
    findings.push(...checkLearningItemsPos(ctx))
    findings.push(...checkVocabEnrichments(ctx, db))
  }

  const filtered = sevFilter ? findings.filter(f => f.severity === sevFilter) : findings
  const counts = {
    total: filtered.length,
    critical: filtered.filter(f => f.severity === 'CRITICAL').length,
    warning: filtered.filter(f => f.severity === 'WARNING').length,
  }

  if (jsonOut) {
    console.log(JSON.stringify({ counts, findings: filtered }, null, 2))
  } else {
    if (filtered.length === 0) {
      console.log('\nClean.')
    } else {
      console.log(`\n${counts.critical} CRITICAL, ${counts.warning} WARNING\n`)
      // Group by lesson then file
      const grouped = new Map<string, Finding[]>()
      for (const f of filtered) {
        const k = `Lesson ${f.lesson} · ${f.file}`
        if (!grouped.has(k)) grouped.set(k, [])
        grouped.get(k)!.push(f)
      }
      for (const [k, list] of [...grouped.entries()].sort()) {
        console.log(k)
        for (const f of list) {
          const sev = f.severity === 'CRITICAL' ? 'CRIT ' : 'WARN '
          const ref = f.ref ? `[${f.ref}] ` : ''
          console.log(`  ${sev} ${ref}${f.rule} — ${f.detail}`)
        }
        console.log()
      }
    }
  }

  process.exit(counts.critical > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
