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
import Anthropic from '@anthropic-ai/sdk'
import { deriveAffixedForm, UnsupportedAffixError, itemSlug, blankDerivedInCarrier, type MorphologyRoot } from '@/lib/capabilities'
import { isCatalogAffix, allomorphClassesFor, affixCatalogEntry } from '@/lib/capabilities/affixCatalog'
import { stableSlug } from './lib/content-pipeline-output'

// ── Pure core ────────────────────────────────────────────────────────────────

/** One example as authored in lesson.ts content.categories[].examples. The Dutch
 *  + English fields carry the coursebook's own tuned gloss (e.g. indonesian
 *  "pembuka" → dutch "opener (alat untuk membuka)") — grounding for the gloss pass. */
export interface CategoryExample {
  indonesian: string
  dutch?: string
  english?: string
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
  /** Raw candidate source strings for the in-context carrier (ADR 0019 option B),
   *  in SOURCE-PRIORITY order: [grammar examples, story paragraphs, exercise answers].
   *  Each tier is extracted into sentences + matched verbatim against derived_text;
   *  shortest match in the first tier that has one wins. Optional (default []). */
  carrierTiers?: string[][]
  /** Hand-authored carrier sentences (§5b, docs/plans/2026-07-08-affix-trainer-quick-wins.md
   *  — the presence-cache-shaped fix for lessons whose own staged text never uses a
   *  frequency-selected derived form). Key = derived form, value = one carrier sentence
   *  containing it as a whole word. WINS over `harvestCarrier` when a key matches a
   *  generated pair's derived form. Curated sentences do NOT pass through
   *  `extractSentences` — they are authored as exactly one sentence already; validated
   *  loud in `generateMorphologyPatterns` instead (whole-word gate + a 3-word floor),
   *  never silently discarded or silently falling back to harvest. Optional (default none).
   *  See scripts/data/staging/lesson-N/curated-carriers.ts. */
  curatedCarriers?: ReadonlyMap<string, string>
}

/** The emitted shape — structurally `AffixedPairInput` (projectSections.ts:73-93). */
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
  /** Confix surface pieces (ADR 0019); null for non-confix affixes. */
  circumfixLeft: string | null
  circumfixRight: string | null
  /** Harvested carrier sentence containing `derived` verbatim, or null (isolated). */
  carrierText: string | null
  /** Bilingual meaning of the derived form, LLM-authored by the gloss pass below
   *  (the pure core leaves these null — gloss authoring is non-deterministic, so it
   *  is a SEPARATE injectable step, presence-cached, mirroring enrichEnTranslations).
   *  Nullable: an un-glossed pair is valid during rollout (NULL-tolerant gate). */
  derivedGlossNl: string | null
  derivedGlossEn: string | null
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

/**
 * Split a raw source string (a grammar example, story paragraph, or exercise
 * answer) into candidate carrier sentences: break on sentence punctuation, em-dash,
 * newline, and `;`; strip list markers (`a.`/`b.`/`1.`); drop arrow fragments
 * (`tempat → menempatkan`) and anything under 3 words (too short to be a carrier).
 */
export function extractSentences(raw: string): string[] {
  // ADR 0021 Task 3: split on the derivation arrow (→/->) too, so the affixed RHS
  // of "root → derived in a sentence" survives (we used to discard the whole arrow
  // line). A bare "tempat → menempatkan" still yields nothing — both sides < 3 words.
  return raw
    .split(/[.!?]+\s+|—|→|->|\n|;/u)
    .map((s) => s.replace(/^\s*[a-z0-9]\.\s*/iu, '').replace(/[.!?]+\s*$/u, '').trim())
    .filter((s) => s.split(/\s+/u).filter(Boolean).length >= 3)
}

/**
 * Harvest the carrier for `derived` from priority-ordered raw source tiers
 * (ADR 0019 option B): the first tier with a sentence containing `derived` as a
 * WHOLE WORD wins; within it, the shortest match. The gate is `blankDerivedInCarrier`
 * (the SAME whole-word matcher the runtime render uses), so a hit guarantees the
 * runtime blank lands — and a clitic-attached surface (`dinaikkannya`) is correctly
 * NOT matched. Returns the FULL carrier sentence (the runtime blanks it at render);
 * null when no tier contains it → isolated prompt fallback.
 */
export function harvestCarrier(derived: string, tiers: string[][]): string | null {
  for (const tier of tiers) {
    const matches = tier.flatMap(extractSentences).filter((s) => blankDerivedInCarrier(s, derived) !== null)
    if (matches.length > 0) return matches.reduce((a, b) => (b.length < a.length ? b : a))
  }
  return null
}

export function generateMorphologyPatterns(input: GenerateInput): GenerateResult {
  const { lessonNumber, roots, categories, knownItemSlugs, carrierTiers = [], curatedCarriers } = input
  const errors: string[] = []
  const pairs: GeneratedPair[] = []
  const resolvable = resolvableBaseSlugs(lessonNumber, categories.map((c) => c.title))
  const categoryByTitle = new Map(categories.map((c) => [c.title, c]))
  // Curated keys matched to a generated pair's derived form (regardless of whether
  // that curated carrier passed its own validation below) — feeds the stale-key
  // check after the loop (typo/stale protection).
  const matchedCuratedKeys = new Set<string>()

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

    // Carrier: a curated sentence WINS over the harvest when authored for this
    // derived form (§5b). Curated sentences are validated loud here — no silent
    // fallback to harvest on a bad curated entry, and no silent write of a carrier
    // that fails its own gate.
    let carrierText: string | null
    const curated = curatedCarriers?.get(derived.derived)
    if (curated !== undefined) {
      matchedCuratedKeys.add(derived.derived)
      const wordCount = curated.split(/\s+/u).filter(Boolean).length
      if (blankDerivedInCarrier(curated, derived.derived) === null || wordCount < 3) {
        errors.push(
          `${where}: curated carrier for derived form "${derived.derived}" fails the carrier gate ` +
          `("${curated}" must contain "${derived.derived}" as a whole word and have at least 3 words)`,
        )
        continue
      }
      carrierText = curated
    } else {
      carrierText = harvestCarrier(derived.derived, carrierTiers)
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
      circumfixLeft: derived.circumfixLeft,
      circumfixRight: derived.circumfixRight,
      carrierText,
      // The deterministic core leaves the bilingual derived-form meaning empty; the
      // injectable gloss pass (enrichDerivedGlosses, below) fills it presence-cached.
      derivedGlossNl: null,
      derivedGlossEn: null,
    })
  }

  // Stale/typo protection: a curated key that never matched any generated pair's
  // derived form is either a typo or leftover from a since-changed root pool.
  if (curatedCarriers) {
    for (const key of curatedCarriers.keys()) {
      if (!matchedCuratedKeys.has(key)) {
        errors.push(`curated-carriers.ts: key "${key}" did not match any generated pair's derived form (stale entry or typo)`)
      }
    }
  }

  return { pairs, errors }
}

/** Serialize the generated pairs to the committed `morphology-patterns.ts` source. */
export function serializePairs(lessonNumber: number, pairs: GeneratedPair[]): string {
  const q = (s: string) => JSON.stringify(s)
  const body = pairs
    .map((p) => {
      const lines = [
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
      ]
      // Confix pieces + carrier are emitted only when present — prefix/suffix pairs
      // (e.g. the L13/L20 meN-/peN- snapshots) serialise byte-identically as before.
      if (p.circumfixLeft !== null) lines.push(`    circumfixLeft: ${q(p.circumfixLeft)},`)
      if (p.circumfixRight !== null) lines.push(`    circumfixRight: ${q(p.circumfixRight)},`)
      if (p.carrierText !== null) lines.push(`    carrierText: ${q(p.carrierText)},`)
      // Glosses emitted only when authored — un-glossed pairs serialise as before,
      // so the gloss pass is purely additive over existing snapshots (presence-cache).
      if (p.derivedGlossNl !== null) lines.push(`    derivedGlossNl: ${q(p.derivedGlossNl)},`)
      if (p.derivedGlossEn !== null) lines.push(`    derivedGlossEn: ${q(p.derivedGlossEn)},`)
      lines.push('  },')
      return lines.join('\n')
    })
    .join('\n')
  return (
    `// GENERATED by scripts/generate-morphology-patterns.ts — DO NOT hand-edit.\n` +
    `// Authoring source: scripts/data/staging/lesson-${lessonNumber}/morphology-roots.ts\n` +
    `// Regenerate after editing morphology-roots.ts. Spec 2:\n` +
    `// docs/plans/2026-06-18-morphology-authoring-capability.md\n` +
    `export const affixedFormPairs = [\n${body}\n]\n`
  )
}

// ── Derived-form gloss authoring (Fix 3) ─────────────────────────────────────
//
// affixed_form_pairs is a REGENERABLE projection (delete + reinsert on every
// publish, ADR 0011) — NOT DB-authoritative. So a derived gloss is corrected by
// editing the authoring source + regenerating morphology-patterns.ts +
// republishing, NEVER by a live DB edit (the next publish would wipe it). This is
// the same source-of-truth regime carrier_text already follows.
//
// Gloss authoring is non-deterministic (an LLM call) and costs tokens, so it is a
// SEPARATE injectable step from the deterministic core: the pure core leaves the
// glosses null; this pass fills them, presence-cached (a re-run never re-LLMs an
// already-glossed pair — additive, like propose-morphology-roots.ts). Mirrors
// lesson-stage/enrichEnTranslations.ts in shape (collect → translate → apply),
// which is used only as a prompt/caching pattern reference, not as the seam.

/** One pair needing a gloss, with all its grounding. */
export interface GlossNeed {
  sourceRef: string
  derived: string
  affix: string
  root: string
  rootMeaningNl: string | null
  rootMeaningEn: string | null
  affixRuleNl: string | null
  affixRuleEn: string | null
  carrierText: string | null
  /** Coursebook grammar example mentioning the form (its own tuned NL/EN phrasing). */
  descriptionSnippet: string | null
}

export interface GlossGrounding {
  /** itemSlug(root) → the root's bilingual meaning (from learning_items). */
  rootMeanings: ReadonlyMap<string, { nl: string | null; en: string | null }>
  /** sourceRef → coursebook snippet mentioning the derived form. */
  descriptionByRef: ReadonlyMap<string, string>
}

/** Translate a batch of needs → Map<sourceRef, {nl, en}>. Injectable for tests. */
export type GlossTranslator = (needs: GlossNeed[]) => Promise<Map<string, { nl: string; en: string }>>

/**
 * Presence-cache: copy already-authored glosses from a prior snapshot onto the
 * freshly generated pairs (matched by sourceRef), so a re-run never re-LLMs an
 * existing gloss. Pure (mutates the passed pairs). Both-or-neither is preserved —
 * each field is copied independently only when the fresh pair lacks it.
 */
export function mergeCachedGlosses(
  pairs: GeneratedPair[],
  cached: ReadonlyArray<{ sourceRef?: unknown; derivedGlossNl?: unknown; derivedGlossEn?: unknown }>,
): void {
  const byRef = new Map<string, { nl?: unknown; en?: unknown }>()
  for (const c of cached) {
    if (typeof c.sourceRef === 'string') byRef.set(c.sourceRef, { nl: c.derivedGlossNl, en: c.derivedGlossEn })
  }
  for (const p of pairs) {
    const prev = byRef.get(p.sourceRef)
    if (!prev) continue
    if (p.derivedGlossNl === null && typeof prev.nl === 'string') p.derivedGlossNl = prev.nl
    if (p.derivedGlossEn === null && typeof prev.en === 'string') p.derivedGlossEn = prev.en
  }
}

/**
 * Harvest, per pair, a coursebook grammar example that mentions the derived form
 * (case-insensitive substring of `indonesian`), combining the book's own Dutch +
 * English phrasing into one snippet. Pure. Unlike the carrier (whole-word, ≥3-word
 * sentence), this keeps arrow examples + parenthetical glosses — that is exactly
 * where the book's tuned phrasing lives. Shortest indonesian match wins.
 */
export function harvestDescriptionSnippets(
  pairs: ReadonlyArray<GeneratedPair>,
  categories: ReadonlyArray<LessonCategory>,
): Map<string, string> {
  const examples = categories.flatMap((c) => c.examples ?? []).filter((e) => typeof e.indonesian === 'string')
  const out = new Map<string, string>()
  for (const p of pairs) {
    const needle = p.derived.toLowerCase()
    const hits = examples.filter((e) => e.indonesian.toLowerCase().includes(needle))
    if (hits.length === 0) continue
    const best = hits.reduce((a, b) => (b.indonesian.length < a.indonesian.length ? b : a))
    const parts = [best.indonesian.trim()]
    if (best.dutch?.trim()) parts.push(`NL: ${best.dutch.trim()}`)
    if (best.english?.trim()) parts.push(`EN: ${best.english.trim()}`)
    out.set(p.sourceRef, parts.join(' — '))
  }
  return out
}

/** Build the gloss needs for every pair still missing a gloss (either field null).
 *  Pure: pulls grounding from the supplied maps + the affix catalog. */
export function collectGlossNeeds(pairs: ReadonlyArray<GeneratedPair>, grounding: GlossGrounding): GlossNeed[] {
  const needs: GlossNeed[] = []
  for (const p of pairs) {
    if (p.derivedGlossNl !== null && p.derivedGlossEn !== null) continue // presence-cache hit
    const rule = affixCatalogEntry(p.affix)
    const rootMeaning = grounding.rootMeanings.get(itemSlug(p.root))
    needs.push({
      sourceRef: p.sourceRef,
      derived: p.derived,
      affix: p.affix,
      root: p.root,
      rootMeaningNl: rootMeaning?.nl ?? null,
      rootMeaningEn: rootMeaning?.en ?? null,
      affixRuleNl: rule?.glossNl ?? null,
      affixRuleEn: rule?.glossEn ?? null,
      carrierText: p.carrierText,
      descriptionSnippet: grounding.descriptionByRef.get(p.sourceRef) ?? null,
    })
  }
  return needs
}

/** Apply authored glosses back onto the pairs (matched by sourceRef). Pure; sets
 *  both fields together (the translator returns {nl, en} as a unit). */
export function applyGlosses(pairs: GeneratedPair[], byRef: ReadonlyMap<string, { nl: string; en: string }>): number {
  let n = 0
  for (const p of pairs) {
    const g = byRef.get(p.sourceRef)
    if (!g) continue
    if (g.nl.trim() && g.en.trim()) {
      p.derivedGlossNl = g.nl.trim()
      p.derivedGlossEn = g.en.trim()
      n++
    }
  }
  return n
}

const GLOSS_MODEL = 'claude-sonnet-4-6'
const GLOSS_BATCH_SIZE = 20

/**
 * Default gloss translator — Claude (Sonnet, this is creative linguistic work, the
 * permitted LLM carve-out), batched. The form is already kaikki-attested, so the
 * model glosses a KNOWN real word, it does not invent one. Returns {nl, en} per
 * sourceRef; missing/blank entries are simply not set (left null → un-glossed).
 */
async function defaultGlossTranslate(needs: GlossNeed[]): Promise<Map<string, { nl: string; en: string }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const out = new Map<string, { nl: string; en: string }>()
  if (!apiKey) {
    console.warn(`   ⚠ ANTHROPIC_API_KEY not set — skipping derived-gloss authoring (${needs.length} pairs stay un-glossed)`)
    return out
  }
  const client = new Anthropic({ apiKey })

  for (let i = 0; i < needs.length; i += GLOSS_BATCH_SIZE) {
    const batch = needs.slice(i, i + GLOSS_BATCH_SIZE)
    const entries = batch
      .map((n, j) => {
        const ctx = [
          `root "${n.root}"${n.rootMeaningNl ? ` (NL: ${n.rootMeaningNl})` : ''}${n.rootMeaningEn ? ` (EN: ${n.rootMeaningEn})` : ''}`,
          `affix ${n.affix}${n.affixRuleNl ? ` — ${n.affixRuleNl}` : ''}`,
          n.carrierText ? `used in: "${n.carrierText}"` : null,
          n.descriptionSnippet ? `coursebook: ${n.descriptionSnippet}` : null,
        ].filter(Boolean).join('; ')
        return `${j + 1}. derived form "${n.derived}" [${ctx}]`
      })
      .join('\n')

    const response = await client.messages.create({
      model: GLOSS_MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are glossing Indonesian affixed (derived) word forms for a Dutch-speaking learner. Each numbered entry is a real, attested derived form with its root meaning, the affix rule, and (when available) a usage sentence and the coursebook's own phrasing.

For each entry, give the meaning of the DERIVED form (not the root) in:
- "nl": Dutch — a concise dictionary-style gloss (a word or short phrase, no sentence, no explanation).
- "en": English — the same, concise.

Prefer the coursebook's tuned phrasing when it gives one; otherwise compose a fresh gloss from the root meaning + the affix rule. Do not restate the root; give the derived form's actual meaning.

Return ONLY a JSON object mapping each number to {"nl": "...", "en": "..."}. No prose, no markdown fences.

${entries}

Respond with only valid JSON, e.g.: {"1": {"nl": "...", "en": "..."}}`,
      }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) continue
    let parsed: Record<string, { nl?: unknown; en?: unknown }>
    try {
      parsed = JSON.parse(match[0]) as Record<string, { nl?: unknown; en?: unknown }>
    } catch {
      continue
    }
    batch.forEach((n, j) => {
      const g = parsed[String(j + 1)]
      if (g && typeof g.nl === 'string' && typeof g.en === 'string' && g.nl.trim() && g.en.trim()) {
        out.set(n.sourceRef, { nl: g.nl.trim(), en: g.en.trim() })
      }
    })
    console.log(`     gloss batch ${Math.floor(i / GLOSS_BATCH_SIZE) + 1}/${Math.ceil(needs.length / GLOSS_BATCH_SIZE)}: ${batch.filter((n) => out.has(n.sourceRef)).length} authored`)
  }
  return out
}

/** Collect → translate → apply. Presence-cached upstream (mergeCachedGlosses), so
 *  `needs` already excludes glossed pairs. Returns the count of pairs glossed. */
export async function enrichDerivedGlosses(
  pairs: GeneratedPair[],
  grounding: GlossGrounding,
  translate: GlossTranslator = defaultGlossTranslate,
): Promise<number> {
  const needs = collectGlossNeeds(pairs, grounding)
  if (needs.length === 0) return 0
  console.log(`   ► Authoring bilingual derived-form meanings for ${needs.length} pair(s) via Claude (${GLOSS_MODEL})...`)
  const byRef = await translate(needs)
  return applyGlosses(pairs, byRef)
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

/**
 * Priority-ordered raw carrier candidates from the lesson (ADR 0019 option B):
 * [grammar examples, story paragraphs, exercise answers]. `harvestCarrier` extracts
 * sentences + matches verbatim against derived_text.
 */
export function carrierTiersFromLesson(lesson: any, categories: LessonCategory[]): string[][] {
  const grammar = categories.flatMap((c) => (c.examples ?? []).map((e) => e.indonesian)).filter((s): s is string => typeof s === 'string')

  const story: string[] = []
  const dialogue: string[] = []
  const exercise: string[] = []
  const sections: any[] = Array.isArray(lesson?.sections) ? lesson.sections : []
  for (const s of sections) {
    const content = s?.content
    if (content?.type === 'text' && Array.isArray(content.paragraphs)) {
      for (const p of content.paragraphs) if (typeof p === 'string') story.push(p)
    }
    // ADR 0021 Task 3: dialogue/conversation lines are natural Indonesian carriers;
    // `text` is the Indonesian line (`translation`/`translation_en` are glosses — skip).
    if ((content?.type === 'dialogue' || content?.type === 'conversation') && Array.isArray(content.lines)) {
      for (const ln of content.lines) if (typeof ln?.text === 'string') dialogue.push(ln.text)
    }
  }
  // Exercise carriers can be nested arbitrarily deep (Latihan → sub-exercises → items).
  // ADR 0021 Task 3: collect both `answer` and `prompt` (some drills carry the
  // Indonesian sentence in the prompt; Dutch instruction prompts never whole-word-match).
  const collectExerciseStrings = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(collectExerciseStrings)
    else if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      if (typeof obj.answer === 'string') exercise.push(obj.answer)
      if (typeof obj.prompt === 'string') exercise.push(obj.prompt)
      Object.values(obj).forEach(collectExerciseStrings)
    }
  }
  collectExerciseStrings(sections)

  return [grammar, story, exercise, dialogue]
}

/** All learning_items keyed by normalized_text (== itemSlug form), with bilingual
 *  meanings. Serves BOTH the root-vocab prereq (keys → knownItemSlugs) AND the gloss
 *  pass's root-meaning grounding (values) in one fetch. */
async function fetchKnownItems(): Promise<Map<string, { nl: string | null; en: string | null }>> {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required (root-vocab prereq check)')
  const client = createClient(url, serviceKey)
  const items = new Map<string, { nl: string | null; en: string | null }>()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .schema('indonesian')
      .from('learning_items')
      .select('normalized_text, translation_nl, translation_en')
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) {
      if (r.normalized_text) {
        items.set(r.normalized_text as string, {
          nl: (r.translation_nl as string | null) ?? null,
          en: (r.translation_en as string | null) ?? null,
        })
      }
    }
    if (rows.length < pageSize) break
  }
  return items
}

async function main() {
  const lessons = process.argv.slice(2).map((a) => Number.parseInt(a, 10)).filter((n) => Number.isInteger(n))
  if (lessons.length === 0) {
    console.error('Usage: bun scripts/generate-morphology-patterns.ts <lessonNumber> [<lessonNumber> …]')
    process.exit(1)
  }

  const knownItems = await fetchKnownItems()
  const knownItemSlugs = new Set(knownItems.keys())
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
    const carrierTiers = carrierTiersFromLesson(lesson, categories)
    const curatedCarriersRecord = (await readExport(path.join(dir, 'curated-carriers.ts'))) as Record<string, string> | null
    const curatedCarriers = curatedCarriersRecord ? new Map(Object.entries(curatedCarriersRecord)) : undefined

    const { pairs, errors } = generateMorphologyPatterns({ lessonNumber, roots, categories, knownItemSlugs, carrierTiers, curatedCarriers })
    if (errors.length > 0) {
      anyError = true
      console.error(`\nlesson-${lessonNumber}: ${errors.length} author-time error(s) — NOT writing morphology-patterns.ts:`)
      for (const e of errors) console.error(`  ✗ ${e}`)
      continue
    }

    // Presence-cache: carry forward already-authored glosses from the prior
    // committed snapshot so this re-run only LLMs newly-added (un-glossed) pairs.
    const outPath = path.join(dir, 'morphology-patterns.ts')
    const cached = ((await readExport(outPath)) as Array<Record<string, unknown>> | null) ?? []
    mergeCachedGlosses(pairs, cached)

    // Bilingual derived-form meanings (Fix 3) — grounded on root meaning, affix
    // rule, harvested carrier, and the coursebook's own phrasing for the form.
    const glossed = await enrichDerivedGlosses(pairs, {
      rootMeanings: knownItems,
      descriptionByRef: harvestDescriptionSnippets(pairs, categories),
    })

    fs.writeFileSync(outPath, serializePairs(lessonNumber, pairs))
    const totalGlossed = pairs.filter((p) => p.derivedGlossNl !== null).length
    console.log(`lesson-${lessonNumber}: wrote ${pairs.length} pair(s) (${totalGlossed} glossed, ${glossed} new) → ${path.relative(process.cwd(), outPath)}`)
  }

  if (anyError) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
