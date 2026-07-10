#!/usr/bin/env bun
/**
 * scripts/register-pairs-report.ts
 *
 * READ-ONLY intersection report for the register-pairs artifact
 * (docs/plans/2026-07-09-spreektaal-lesson-woven-core.md §3.1, build order
 * step 2). Queries the LIVE `indonesian` schema (staging drifts — see
 * `project_staging_learning_items_drifts_from_db`) and, for every pair in
 * `scripts/data/register-pairs.ts` `registerPairs` (plus the small
 * `DEFERRED_PAIRS` mirror below — see that const's own comment for why it's
 * not imported), reports whether the formal twin is already taught as a
 * `learning_items` row, in which lesson(s), and derives a classification:
 * CORE (twin taught as an item), PHRASE-ANCHORED (the artifact carries an
 * explicit `anchor_lesson` override), UNANCHORED (twin not taught
 * anywhere yet), or DEFERRED (row comes from `DEFERRED_PAIRS`).
 *
 * Output is committed as `scripts/data/register-pairs-intersection.json`.
 * CONTRACT (PR #413, `scripts/check-supabase-deep.ts` HC47): the top-level
 * `pairs` key is EXACTLY the scheduled core — CORE + PHRASE-ANCHORED
 * classifications, `{ formal, informal, ... }` — never UNANCHORED or
 * DEFERRED. `pairs.length` is the expected count of `learning_items` rows
 * with `register='informal'` once the staging weave (build order step 4)
 * lands. Full per-pair diagnostic detail (all classifications, including
 * UNANCHORED/DEFERRED) lives under the separate `allPairs` key.
 *
 * This script makes ZERO writes. It only ever SELECTs.
 *
 * Run with (same convention as check-supabase-deep.ts):
 *   SUPABASE_SERVICE_KEY=<key> bun scripts/register-pairs-report.ts
 * (needs VITE_SUPABASE_URL from .env.local; if the shared Supabase instance
 * uses an internal CA your Node/bun trust store doesn't already have, add
 * NODE_EXTRA_CA_CERTS=<path to that CA's root> — do NOT reach for
 * NODE_TLS_REJECT_UNAUTHORIZED=0 for a report script; the proper CA root is
 * one `curl https://ca.duin.home/roots.pem` away and doesn't weaken
 * anything.)
 */
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { registerPairs, type RegisterPair } from './data/register-pairs'

/**
 * Mirrors the "DEFERRED CANDIDATES" comment block in
 * `scripts/data/register-pairs.ts` — kept OUT of that module's runtime
 * exports on purpose (see the CONTRACT note at the top of that file: ES
 * module namespace objects sort exported keys alphabetically, so a second
 * export there could silently become `Object.values(mod)[0]` instead of
 * `registerPairs` and break HC45/46). This is diagnostic-only data (used to
 * populate `allPairs` below) — it is never part of the `pairs` contract key.
 * Update BOTH places if a deferred candidate's reason changes.
 */
const DEFERRED_PAIRS: RegisterPair[] = [
  { formal: 'beri', informal: 'kasih', gloss_nl: 'geven', klasse: 'frozen-verb',
    source: 'Sneddon 2006 — frozen colloquial verb (canonical example)',
    deferred: true,
    deferredReason: "SENSE COLLISION: 'kasih' already exists live as its own learning_item (L1, 'gunst / genegenheid' — favor/affection, a noun sense), not the verb sense (give) this pair needs. Cannot insert a second 'kasih' item under normalized_text uniqueness. Needs content curation (disambiguate senses, or fold the verb sense into the existing item) before this can be scheduled." },
  { formal: 'membuat', informal: 'bikin', gloss_nl: 'maken', klasse: 'frozen-verb',
    source: 'Sneddon 2006 — frozen colloquial verb (canonical example)',
    deferred: true,
    deferredReason: "NO DEFENSIBLE ANCHOR: 'membuat' does not appear anywhere in taught lesson content (dialogue lines or learning_items) across L1-L30 as of this pass. The only live 'buat' item (L12) is the PREPOSITION sense ('voor / t.b.v.' — for), not the verb sense this pair needs. Revisit once 'membuat'/'buat'(verb) is taught, or when 'buat' is disambiguated." },
]

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Error: VITE_SUPABASE_URL (from .env.local) and SUPABASE_SERVICE_KEY are required')
  console.error('Run: SUPABASE_SERVICE_KEY=<key> bun scripts/register-pairs-report.ts')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const CHUNK_SIZE = 50

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Mirrors src/lib/capabilities/itemSlug.ts — kept in sync intentionally
 *  rather than imported, since this is a Node script (not the Vite app) and
 *  the transform is a one-liner. Do not diverge from itemSlug()'s definition. */
function itemSlug(baseText: string): string {
  return baseText.toLowerCase().trim()
}

/** learning_items rows carry punctuation as part of the headword for
 *  question words (e.g. normalized_text = 'bagaimana?', 'apa?') — itemSlug()
 *  doesn't strip it. Try the bare slug plus the two punctuation suffixes
 *  actually observed in the live corpus. */
function slugVariants(word: string): string[] {
  const base = itemSlug(word)
  return [base, `${base}?`, `${base}!`]
}

interface LearningItemRow {
  normalized_text: string
  base_text: string
  translation_nl: string | null
}

interface CapabilityRow {
  source_ref: string
  lesson_id: string
}

interface LessonRow {
  id: string
  order_index: number
}

async function fetchLearningItemsByNormalizedText(candidates: string[]): Promise<LearningItemRow[]> {
  const unique = Array.from(new Set(candidates))
  const results: LearningItemRow[] = []
  for (const batch of chunk(unique, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('normalized_text, base_text, translation_nl')
      .in('normalized_text', batch)
    if (error) throw error
    results.push(...(data as LearningItemRow[]))
  }
  return results
}

async function fetchVocabCapabilities(sourceRefs: string[]): Promise<CapabilityRow[]> {
  const unique = Array.from(new Set(sourceRefs))
  const results: CapabilityRow[] = []
  for (const batch of chunk(unique, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_capabilities')
      .select('source_ref, lesson_id')
      .eq('source_kind', 'vocabulary_src')
      .is('retired_at', null)
      .in('source_ref', batch)
    if (error) throw error
    results.push(...(data as CapabilityRow[]))
  }
  return results
}

async function fetchLessons(lessonIds: string[]): Promise<LessonRow[]> {
  const unique = Array.from(new Set(lessonIds))
  const results: LessonRow[] = []
  for (const batch of chunk(unique, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lessons')
      .select('id, order_index')
      .in('id', batch)
    if (error) throw error
    results.push(...(data as LessonRow[]))
  }
  return results
}

interface WordResolution {
  taught: boolean
  matchedNormalizedText: string | null
  translationNl: string | null
  lessons: number[]
}

type PairSource = 'registerPairs' | 'DEFERRED_PAIRS'

interface PairReport {
  formal: string
  informal: string
  klasse: RegisterPair['klasse']
  gloss_nl: string
  source: string
  declaredIn: PairSource
  classification: 'CORE' | 'PHRASE-ANCHORED' | 'UNANCHORED' | 'DEFERRED'
  anchorLesson: number | string | null
  formalTaught: boolean
  formalLessons: number[]
  deferredReason: string | null
  informalAlreadyTaught: { lessons: number[]; translationNl: string | null } | null
}

async function main(): Promise<void> {
  const allDeclaredPairs: { pair: RegisterPair; declaredIn: PairSource }[] = [
    ...registerPairs.map((pair) => ({ pair, declaredIn: 'registerPairs' as const })),
    ...DEFERRED_PAIRS.map((pair) => ({ pair, declaredIn: 'DEFERRED_PAIRS' as const })),
  ]

  const allWords = allDeclaredPairs.flatMap(({ pair }) => [pair.formal, pair.informal])
  const allSlugVariants = allWords.flatMap(slugVariants)

  const itemRows = await fetchLearningItemsByNormalizedText(allSlugVariants)
  const itemByNormalizedText = new Map(itemRows.map((r) => [r.normalized_text, r]))

  const sourceRefs = itemRows.map((r) => `learning_items/${r.normalized_text}`)
  const capRows = await fetchVocabCapabilities(sourceRefs)
  const lessonIdsByRef = new Map<string, Set<string>>()
  for (const cap of capRows) {
    if (!lessonIdsByRef.has(cap.source_ref)) lessonIdsByRef.set(cap.source_ref, new Set())
    lessonIdsByRef.get(cap.source_ref)!.add(cap.lesson_id)
  }

  const allLessonIds = capRows.map((c) => c.lesson_id)
  const lessonRows = await fetchLessons(allLessonIds)
  const orderIndexByLessonId = new Map(lessonRows.map((l) => [l.id, l.order_index]))

  function resolveWord(word: string): WordResolution {
    for (const variant of slugVariants(word)) {
      const item = itemByNormalizedText.get(variant)
      if (!item) continue
      const ref = `learning_items/${item.normalized_text}`
      const lessonIds = lessonIdsByRef.get(ref) ?? new Set()
      const lessons = Array.from(lessonIds)
        .map((id) => orderIndexByLessonId.get(id))
        .filter((n): n is number => n !== undefined)
        .sort((a, b) => a - b)
      if (lessons.length > 0) {
        return { taught: true, matchedNormalizedText: item.normalized_text, translationNl: item.translation_nl, lessons }
      }
    }
    return { taught: false, matchedNormalizedText: null, translationNl: null, lessons: [] }
  }

  const pairReports: PairReport[] = allDeclaredPairs.map(({ pair, declaredIn }) => {
    const formalHit = resolveWord(pair.formal)
    const informalHit = resolveWord(pair.informal)

    let classification: PairReport['classification']
    let anchorLesson: number | string | null

    if (declaredIn === 'DEFERRED_PAIRS') {
      classification = 'DEFERRED'
      anchorLesson = null
    } else if (pair.anchor_lesson !== undefined && pair.anchor_lesson !== null) {
      classification = 'PHRASE-ANCHORED'
      anchorLesson = pair.anchor_lesson
    } else if (formalHit.taught) {
      classification = 'CORE'
      anchorLesson = formalHit.lessons[0]
    } else {
      classification = 'UNANCHORED'
      anchorLesson = null
    }

    return {
      formal: pair.formal,
      informal: pair.informal,
      klasse: pair.klasse,
      gloss_nl: pair.gloss_nl,
      source: pair.source,
      declaredIn,
      classification,
      anchorLesson,
      formalTaught: formalHit.taught,
      formalLessons: formalHit.lessons,
      deferredReason: pair.deferredReason ?? null,
      informalAlreadyTaught: informalHit.taught
        ? { lessons: informalHit.lessons, translationNl: informalHit.translationNl }
        : null,
    }
  })

  const scheduledCore = pairReports.filter(
    (p) => p.classification === 'CORE' || p.classification === 'PHRASE-ANCHORED',
  )

  const countsByKlasse: Record<string, number> = {}
  for (const p of pairReports) countsByKlasse[p.klasse] = (countsByKlasse[p.klasse] ?? 0) + 1

  const countsByClassification = {
    CORE: pairReports.filter((p) => p.classification === 'CORE').length,
    'PHRASE-ANCHORED': pairReports.filter((p) => p.classification === 'PHRASE-ANCHORED').length,
    UNANCHORED: pairReports.filter((p) => p.classification === 'UNANCHORED').length,
    DEFERRED: pairReports.filter((p) => p.classification === 'DEFERRED').length,
  }

  const informalAlreadyTaughtCount = pairReports.filter((p) => p.informalAlreadyTaught !== null).length

  const output = {
    generatedAt: new Date().toISOString(),
    sourceArtifact: 'scripts/data/register-pairs.ts',
    totalPairs: allDeclaredPairs.length,
    countsByKlasse,
    countsByClassification,
    informalAlreadyTaughtCount,
    // CONTRACT (PR #413, check-supabase-deep.ts HC47): EXACTLY the
    // scheduled core (CORE + PHRASE-ANCHORED) — never UNANCHORED/DEFERRED.
    // pairs.length is the expected count of learning_items rows with
    // register='informal' once step 4 (staging weave) lands.
    pairs: scheduledCore.map((p) => ({
      formal: p.formal,
      informal: p.informal,
      klasse: p.klasse,
      anchorLesson: p.anchorLesson,
      informalAlreadyTaught: p.informalAlreadyTaught,
    })),
    // Full per-pair diagnostic detail, every classification included.
    allPairs: pairReports,
  }

  writeFileSync('scripts/data/register-pairs-intersection.json', `${JSON.stringify(output, null, 2)}\n`)

  console.log(`Wrote scripts/data/register-pairs-intersection.json`)
  console.log(`  total pairs declared: ${output.totalPairs}`)
  console.log(`  CORE: ${countsByClassification.CORE}`)
  console.log(`  PHRASE-ANCHORED: ${countsByClassification['PHRASE-ANCHORED']}`)
  console.log(`  UNANCHORED: ${countsByClassification.UNANCHORED}`)
  console.log(`  DEFERRED: ${countsByClassification.DEFERRED}`)
  console.log(`  scheduled core (pairs.length — expected register='informal' row count): ${output.pairs.length}`)
  console.log(`  informal side already taught live (needs retrofit, not fresh insert): ${informalAlreadyTaughtCount}`)
}

main().catch((err) => {
  console.error('register-pairs-report failed:', err)
  process.exit(1)
})
