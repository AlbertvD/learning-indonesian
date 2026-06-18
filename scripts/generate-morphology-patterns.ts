/**
 * generate-morphology-patterns.ts — the deterministic morphology authoring step
 * (Spec 2, docs/plans/2026-06-18-morphology-authoring-capability.md §3.3).
 *
 * Reads the LEAN judgment-only `morphology-roots.ts` an agent/human authored,
 * runs the deterministic `deriveAffixedForm` engine, mints the grammar-pattern
 * slug from the illustrated category, cross-checks the engine's allomorph class
 * against the category, and emits the COMMITTED `morphology-patterns.ts`
 * (`AffixedPairInput[]`) the lesson stage consumes — the same way other derived
 * staging files are regenerated at authoring time and committed.
 *
 * Pure core (`generateMorphologyPatterns`) is unit-tested without I/O; the CLI
 * wrapper reads the staging files, queries learning_items for the root-vocab
 * prereq, and writes the snapshot. Run AFTER the structurer authors the grammar
 * categories + morphology-roots.ts, BEFORE publish-approved-content.
 *
 * Usage:  SUPABASE_SERVICE_KEY=… NODE_TLS_REJECT_UNAUTHORIZED=0 \
 *           bun scripts/generate-morphology-patterns.ts <lessonNumber> [<lessonNumber> …]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { deriveAffixedForm, UnsupportedAffixError, itemSlug, type MorphologyRoot } from '@/lib/capabilities'
import { isCatalogAffix, allomorphClassesFor } from '@/lib/capabilities/affixCatalog'
import { stableSlug } from './lib/content-pipeline-output'

// ── Pure core ────────────────────────────────────────────────────────────────

/** One example as authored in lesson.ts content.categories[].examples. */
export interface CategoryExample {
  indonesian: string
}

/** A grammar category pooled from the lesson's grammar sections. */
export interface LessonCategory {
  title: string
  examples?: CategoryExample[]
}

export interface GenerateInput {
  lessonNumber: number
  roots: MorphologyRoot[]
  /** All categories across the lesson's grammar sections (content.categories). */
  categories: LessonCategory[]
  /** itemSlug-normalized base_texts that exist as learning_items (root-vocab prereq). */
  knownItemSlugs: ReadonlySet<string>
}

/** The emitted shape — structurally `AffixedPairInput` (projectSections.ts:73-89). */
export interface GeneratedPair {
  sourceRef: string
  patternSourceRef: string
  affix: string
  root: string
  derived: string
  allomorphRule: string
  affixType: string
  affixGloss: string
  allomorphClass: string | null
  productive: boolean
}

export interface GenerateResult {
  pairs: GeneratedPair[]
  errors: string[]
}

/** The example root before the `→`/`->` arrow, lowercased+trimmed (or null). */
function exampleRoot(indonesian: string): string | null {
  const left = indonesian.split(/→|->/)[0]?.trim().toLowerCase()
  return left && left.length > 0 ? left : null
}

/**
 * Base pattern slugs the grammar projector would mint for this lesson, with the
 * SAME `stableSlug` (projectors/grammar.ts:97-101). A category whose base slug is
 * UNIQUE keeps the clean `l{N}-{slug}`; a COLLIDING base slug gets a
 * `-{display_order}` suffix there, so the clean slug is NOT resolvable — we return
 * only the unique (resolvable-by-clean-slug) base slugs. A minted ref outside this
 * set fails loud (subsumes the "category exists" check).
 */
export function resolvableBaseSlugs(lessonNumber: number, categoryTitles: string[]): Set<string> {
  const base = categoryTitles.map((t) => `l${lessonNumber}-${stableSlug(t)}`)
  const counts = new Map<string, number>()
  for (const s of base) counts.set(s, (counts.get(s) ?? 0) + 1)
  return new Set(base.filter((s) => counts.get(s) === 1))
}

/**
 * The allomorph classes a category covers, derived INDEPENDENTLY from its authored
 * examples (run each example root through the engine). A semantic category (e.g.
 * L14 word-class) naturally spans many classes → wide set → never flags; an
 * allomorph-keyed category (L13 A2 = mem/men/meng) yields a tight set that catches
 * a misfiled root. Empty when no parseable examples → caller skips the check.
 */
export function coveredClasses(category: LessonCategory, affix: string): Set<string> {
  const covered = new Set<string>()
  for (const ex of category.examples ?? []) {
    const root = exampleRoot(ex.indonesian)
    if (!root) continue
    try {
      const cls = deriveAffixedForm(root, affix).allomorphClass
      if (cls) covered.add(cls)
    } catch {
      // Unparseable/irregular example — skip; it just doesn't constrain the set.
    }
  }
  return covered
}

export function generateMorphologyPatterns(input: GenerateInput): GenerateResult {
  const { lessonNumber, roots, categories, knownItemSlugs } = input
  const errors: string[] = []
  const pairs: GeneratedPair[] = []
  const resolvable = resolvableBaseSlugs(lessonNumber, categories.map((c) => c.title))
  const categoryByTitle = new Map(categories.map((c) => [c.title, c]))

  for (const { root, affix, illustratesCategory } of roots) {
    const where = `root "${root}" (affix ${affix}, category "${illustratesCategory}")`

    if (!isCatalogAffix(affix)) {
      errors.push(`${where}: affix not in the affix catalog (lib/capabilities/affixCatalog.ts)`)
      continue
    }
    if (!knownItemSlugs.has(itemSlug(root))) {
      errors.push(`${where}: root is not an existing learning_item — the ADR-0018 root-vocab prereq is unsatisfiable (HC31 backstops at publish)`)
      continue
    }

    const patternSourceRef = `l${lessonNumber}-${stableSlug(illustratesCategory)}`
    if (!resolvable.has(patternSourceRef)) {
      errors.push(
        `${where}: patternSourceRef "${patternSourceRef}" does not resolve to a unique grammar_patterns slug ` +
        '— the category title is missing from this lesson, or collides with another under stableSlug ' +
        '(grammar projector would disambiguate with -{display_order}; CS12 would abort the publish)',
      )
      continue
    }

    let derived
    try {
      derived = deriveAffixedForm(root, affix)
    } catch (err) {
      const msg = err instanceof UnsupportedAffixError ? err.message : String(err)
      errors.push(`${where}: ${msg}`)
      continue
    }

    // Class cross-check (set-membership): only for allomorphic affixes with a
    // covered set from the category's examples.
    if (allomorphClassesFor(affix).length > 0 && derived.allomorphClass) {
      const category = categoryByTitle.get(illustratesCategory)
      const covered = category ? coveredClasses(category, affix) : new Set<string>()
      if (covered.size > 0 && !covered.has(derived.allomorphClass)) {
        errors.push(
          `${where}: engine class "${derived.allomorphClass}" is outside the classes its category covers ` +
          `(${[...covered].join('/')}) — the root is likely misfiled under the wrong grammar category`,
        )
        continue
      }
    }

    pairs.push({
      // affix already carries its trailing hyphen (e.g. 'meN-'), so it is the
      // separator before the root — matches the L13 pilot's sourceRef exactly.
      // (A suffix like '-an' carries a leading hyphen; the ref is still unique.)
      sourceRef: `lesson-${lessonNumber}/morphology/${affix}${root}-${derived.derived}`,
      patternSourceRef,
      affix,
      root,
      derived: derived.derived,
      allomorphRule: derived.allomorphRule,
      affixType: derived.affixType,
      affixGloss: derived.affixGloss,
      allomorphClass: derived.allomorphClass,
      productive: derived.productive,
    })
  }

  return { pairs, errors }
}

/** Serialize the generated pairs to the committed `morphology-patterns.ts` source. */
export function serializePairs(lessonNumber: number, pairs: GeneratedPair[]): string {
  const q = (s: string) => JSON.stringify(s)
  const body = pairs
    .map((p) =>
      [
        '  {',
        `    sourceRef: ${q(p.sourceRef)},`,
        `    patternSourceRef: ${q(p.patternSourceRef)},`,
        `    affix: ${q(p.affix)},`,
        `    root: ${q(p.root)},`,
        `    derived: ${q(p.derived)},`,
        `    allomorphRule: ${q(p.allomorphRule)},`,
        `    affixType: ${q(p.affixType)},`,
        `    affixGloss: ${q(p.affixGloss)},`,
        `    allomorphClass: ${p.allomorphClass === null ? 'null' : q(p.allomorphClass)},`,
        `    productive: ${p.productive},`,
        '  },',
      ].join('\n'),
    )
    .join('\n')
  return (
    `// GENERATED by scripts/generate-morphology-patterns.ts — DO NOT hand-edit.\n` +
    `// Authoring source: scripts/data/staging/lesson-${lessonNumber}/morphology-roots.ts\n` +
    `// Regenerate after editing morphology-roots.ts. Spec 2:\n` +
    `// docs/plans/2026-06-18-morphology-authoring-capability.md\n` +
    `export const affixedFormPairs = [\n${body}\n]\n`
  )
}

// ── CLI wrapper ──────────────────────────────────────────────────────────────

const STAGING_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'staging')

async function readExport(filePath: string): Promise<unknown> {
  if (!fs.existsSync(filePath)) return null
  const mod = await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`)
  return Object.values(mod)[0] ?? null
}

/** Pool all categories from the lesson's grammar-type sections. */
function categoriesFromLesson(lesson: any): LessonCategory[] {
  const sections: any[] = Array.isArray(lesson?.sections) ? lesson.sections : []
  const out: LessonCategory[] = []
  for (const s of sections) {
    const content = s?.content
    if (content?.type === 'grammar' && Array.isArray(content.categories)) {
      for (const c of content.categories) {
        if (typeof c?.title === 'string') {
          out.push({ title: c.title, examples: Array.isArray(c.examples) ? c.examples : [] })
        }
      }
    }
  }
  return out
}

async function fetchKnownItemSlugs(): Promise<Set<string>> {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required (root-vocab prereq check)')
  const client = createClient(url, serviceKey)
  const slugs = new Set<string>()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .schema('indonesian')
      .from('learning_items')
      .select('normalized_text')
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) if (r.normalized_text) slugs.add(r.normalized_text as string)
    if (rows.length < pageSize) break
  }
  return slugs
}

async function main() {
  const lessons = process.argv.slice(2).map((a) => Number.parseInt(a, 10)).filter((n) => Number.isInteger(n))
  if (lessons.length === 0) {
    console.error('Usage: bun scripts/generate-morphology-patterns.ts <lessonNumber> [<lessonNumber> …]')
    process.exit(1)
  }

  const knownItemSlugs = await fetchKnownItemSlugs()
  let anyError = false

  for (const lessonNumber of lessons) {
    const dir = path.join(STAGING_ROOT, `lesson-${lessonNumber}`)
    const roots = (await readExport(path.join(dir, 'morphology-roots.ts'))) as MorphologyRoot[] | null
    if (!roots || roots.length === 0) {
      console.log(`lesson-${lessonNumber}: no morphology-roots.ts — skipping.`)
      continue
    }
    const lesson = await readExport(path.join(dir, 'lesson.ts'))
    const categories = categoriesFromLesson(lesson)

    const { pairs, errors } = generateMorphologyPatterns({ lessonNumber, roots, categories, knownItemSlugs })
    if (errors.length > 0) {
      anyError = true
      console.error(`\nlesson-${lessonNumber}: ${errors.length} author-time error(s) — NOT writing morphology-patterns.ts:`)
      for (const e of errors) console.error(`  ✗ ${e}`)
      continue
    }

    const outPath = path.join(dir, 'morphology-patterns.ts')
    fs.writeFileSync(outPath, serializePairs(lessonNumber, pairs))
    console.log(`lesson-${lessonNumber}: wrote ${pairs.length} pair(s) → ${path.relative(process.cwd(), outPath)}`)
  }

  if (anyError) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
