#!/usr/bin/env bun
/**
 * enrich-answer-variants.ts
 *
 * Standalone maintenance script that seeds `item_answer_variants` — the
 * accepted-answer coverage fix (docs/plans/2026-07-06-answer-variant-coverage.md).
 * `item_answer_variants` is DB-authoritative-after-seeding (ADR 0011): this is a
 * generator/seeder, not a pipeline stage, following the established dry-run/apply
 * maintenance-script shape (`scripts/backfill-pos.ts`, `scripts/collections/seed-collection.ts`).
 *
 * TWO PHASES, deliberately split (plan §Part 1, "R-1"):
 *
 *   generate — LLM authors candidate variants, batched, and writes them to a
 *              COMMITTED artifact (default scripts/data/answer-variants-seed.json).
 *              Presence-cached: re-running generate never re-LLMs an item
 *              already in the artifact (append-only, like propose-morphology-
 *              roots.ts / generate-morphology-patterns.ts's gloss pass).
 *
 *   apply    — deterministic, DB-writing, and NEVER calls the LLM. Reads the
 *              committed artifact, validates + dedupes + drops any candidate
 *              that collides with the item's curated MCQ distractors (reusing
 *              the runtime's own `resolveDistractorMaps`), then upserts into
 *              item_answer_variants with `ON CONFLICT (learning_item_id,
 *              variant_text, language) DO NOTHING` — additive, re-runnable,
 *              never resurrects a DB-authored is_accepted=false rejection.
 *
 *              apply ALSO folds in a SECOND, deterministic candidate source —
 *              the register-pairs intersection report (docs/plans/2026-07-09
 *              -spreektaal-lesson-woven-core.md §7, build order step 5): no
 *              LLM call, a closed list, read from the committed
 *              `scripts/data/register-pairs-intersection.json`. It feeds the
 *              SAME validate/dedupe/report/upsert pipeline below as one more
 *              source, not a parallel code path — see
 *              `scripts/lib/registerPairVariants.ts` for the pure mapper.
 *
 * The artifact IS the seed input, not a second source of truth — the DB stays
 * authoritative after seeding (ADR 0011); it is committed so the candidate set
 * is reviewable (like a PR diff) before `apply` ever touches the DB.
 *
 * Usage:
 *   bun scripts/enrich-answer-variants.ts generate [--max-items N] [--out <path>]
 *   bun scripts/enrich-answer-variants.ts apply [--in <path>] [--dry-run] [--csv <path>]
 *
 * generate requires SUPABASE_SERVICE_KEY + ANTHROPIC_API_KEY (.env.local).
 * apply requires SUPABASE_SERVICE_KEY (.env.local) — --dry-run still reads the
 * DB (items + distractors) to produce an accurate report, but never writes.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import {
  toCandidateVariant,
  dedupeCandidates,
  dropDistractorCollisions,
  dropCorpusCollisions,
  buildDistractorTextsByItem,
  buildAnswerOwnersByText,
  toInsertRow,
  type CandidateVariant,
  type ItemForDistractorResolution,
} from './lib/answerVariants'
import {
  mapRegisterPairsToCandidates,
  registerPairSlugVariants,
  type RegisterPairIntersectionReport,
} from './lib/registerPairVariants'

// Do NOT set NODE_TLS_REJECT_UNAUTHORIZED='0' here — that disables TLS
// verification against the live Supabase DB. If your Node/bun trust store
// doesn't already have the homelab's internal CA, pass
// NODE_EXTRA_CA_CERTS=<path to that CA's root> on the command line instead
// (same convention as scripts/register-pairs-report.ts / check-supabase-deep.ts).

function loadEnv(): void {
  if (!fs.existsSync('.env.local')) return
  for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const DEFAULT_ARTIFACT_PATH = 'scripts/data/answer-variants-seed.json'
const REGISTER_PAIRS_INTERSECTION_PATH = 'scripts/data/register-pairs-intersection.json'
const MODEL = 'claude-sonnet-4-6'
const GENERATE_BATCH_SIZE = 20
const INSERT_CHUNK_SIZE = 500

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

function requireEnv(): { url: string; key: string } {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY required (.env.local)')
  return { url, key }
}

// ── The committed artifact row shape (generate output / apply input) ───────
// Structurally the raw-candidate shape `toCandidateVariant` validates, plus
// `baseText` for human-readable review — the artifact is meant to be read by
// a human before `apply` runs, like a PR diff.
export interface ArtifactCandidate {
  learningItemId: string
  baseText: string
  language: string
  variantText: string
  variantType: string
}

// ============================================================================
// GENERATE — LLM authoring, writes the committed artifact. Never called by apply.
// ============================================================================

interface EligibleItem {
  id: string
  base_text: string
  item_type: string
  translation_nl: string | null
  translation_en: string | null
}

function buildGeneratePrompt(items: EligibleItem[]): string {
  return `You are authoring ADDITIONAL accepted-answer variants for an Indonesian -> Dutch/English
vocabulary grader. learning_items.translation_nl / translation_en is the PRIMARY gloss already
shown to the learner (as the displayed answer and MCQ option) — do not repeat it. You are
proposing MORE correct answers the grader should ALSO accept when the learner types a synonym,
inflection, or paraphrase instead of the primary gloss.

For each item, propose 0-3 variants PER LANGUAGE (nl, en) beyond the primary gloss: synonyms,
register variants (informal speech), singular/plural or with/without-article forms, and short
idiomatic paraphrases that mean the SAME thing as the primary gloss.

Be CONSERVATIVE. A false-accept (marking a near-miss/confusable word as correct) is WORSE than
missing a synonym — that is the exact failure mode this fix must not introduce. Never propose a
variant that could plausibly be the correct translation of a DIFFERENT, similar Indonesian word.
When in doubt, propose fewer variants (including zero).

variant_type: "informal" for a colloquial/register variant, "alternative_translation" otherwise.
Never propose the primary gloss text itself as a variant.

Return ONLY a JSON array, one object per PROPOSED VARIANT (zero or more per item; omit an item
entirely if you have no confident additions). No prose, no markdown fences.

[{"id": "...", "language": "nl"|"en", "variantText": "...", "variantType": "informal"|"alternative_translation"}]

Items:

${JSON.stringify(items.map((i) => ({
  id: i.id,
  indonesian: i.base_text,
  item_type: i.item_type,
  translation_nl: i.translation_nl,
  translation_en: i.translation_en,
})), null, 2)}
`
}

/**
 * Parse the LLM's raw JSON-array response into artifact candidates, resolved
 * against the batch's own items (an id outside the batch is dropped — the
 * model must not invent ids). Pure — no I/O, unit-tested without a network call.
 */
export function parseGenerateResponse(
  raw: string,
  itemsById: ReadonlyMap<string, EligibleItem>,
): ArtifactCandidate[] {
  const cleaned = raw.replace(/^```json\s*/, '').replace(/\s*```\s*$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out: ArtifactCandidate[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const r = entry as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : null
    const language = typeof r.language === 'string' ? r.language : null
    const variantText = typeof r.variantText === 'string' ? r.variantText.trim() : null
    const variantType = typeof r.variantType === 'string' ? r.variantType : null
    if (!id || !language || !variantText || !variantType) continue
    const item = itemsById.get(id)
    if (!item) continue
    out.push({ learningItemId: id, baseText: item.base_text, language, variantText, variantType })
  }
  return out
}

/** Injectable so `generate`'s orchestration (batching, presence-cache, artifact
 *  write) is exercised in tests without a real Anthropic call. */
export type VariantBatchGenerator = (batch: EligibleItem[]) => Promise<ArtifactCandidate[]>

async function defaultGenerateBatch(claude: Anthropic, batch: EligibleItem[]): Promise<ArtifactCandidate[]> {
  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: buildGeneratePrompt(batch) }],
  })
  const content = response.content[0]
  if (content.type !== 'text') return []
  const itemsById = new Map(batch.map((i) => [i.id, i]))
  return parseGenerateResponse(content.text, itemsById)
}

async function runGenerate(): Promise<void> {
  const maxItems = Number(arg('max-items') ?? 200)
  const outPath = arg('out') ?? DEFAULT_ARTIFACT_PATH
  const { url, key } = requireEnv()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required for generate (.env.local)')
  const claude = new Anthropic({ apiKey })
  const db = createClient(url, key).schema('indonesian')

  console.log(`Generate — max-items=${maxItems}, out=${outPath}`)

  const { data, error } = await db
    .from('learning_items')
    .select('id, base_text, item_type, translation_nl, translation_en')
    .eq('is_active', true)
    .in('item_type', ['word', 'phrase'])
    .limit(maxItems)
  if (error) throw error
  const items = (data ?? []) as EligibleItem[]
  console.log(`Eligible items fetched: ${items.length}`)

  // Presence-cache: an item id already present in the artifact is never
  // re-sent to the LLM on a re-run (mirrors generate-morphology-patterns.ts's
  // gloss pass / propose-morphology-roots.ts).
  const existing: ArtifactCandidate[] = fs.existsSync(outPath)
    ? (JSON.parse(fs.readFileSync(outPath, 'utf-8')) as ArtifactCandidate[])
    : []
  const alreadyCovered = new Set(existing.map((c) => c.learningItemId))
  const toGenerate = items.filter((i) => !alreadyCovered.has(i.id))
  console.log(`Already in artifact: ${alreadyCovered.size} item(s). New to generate: ${toGenerate.length} item(s).`)

  const results: ArtifactCandidate[] = [...existing]
  for (let i = 0; i < toGenerate.length; i += GENERATE_BATCH_SIZE) {
    const batch = toGenerate.slice(i, i + GENERATE_BATCH_SIZE)
    const candidates = await defaultGenerateBatch(claude, batch)
    results.push(...candidates)
    console.log(`  Batch ${Math.floor(i / GENERATE_BATCH_SIZE) + 1}/${Math.ceil(toGenerate.length / GENERATE_BATCH_SIZE)}: ${candidates.length} candidate(s) authored`)
  }

  fs.writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n')
  console.log(`Wrote ${results.length} candidate row(s) to ${outPath} (${results.length - existing.length} new). Review before running apply.`)
}

// ============================================================================
// APPLY — deterministic. Reads the artifact + the register-pairs intersection
// report; NEVER calls the LLM.
// ============================================================================

/** Tolerant of the file not existing (mirrors check-supabase-deep.ts's
 *  HC45 loader) — register-pairs is an independent, parallel-landed artifact
 *  (spec §9: "steps 5 and 6 are independent of 4"), so `apply` must keep
 *  working before/without it. */
function loadRegisterPairIntersection(filePath: string): RegisterPairIntersectionReport | null {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RegisterPairIntersectionReport
}

async function runApply(): Promise<void> {
  const inPath = arg('in') ?? DEFAULT_ARTIFACT_PATH
  const csvPath = arg('csv')
  const dryRun = process.argv.includes('--dry-run')

  if (!fs.existsSync(inPath)) {
    throw new Error(`Artifact not found: ${inPath} — run "generate" first, or point --in at a reviewed artifact.`)
  }
  const rawRows = JSON.parse(fs.readFileSync(inPath, 'utf-8')) as unknown[]
  console.log(`Apply — dry-run=${dryRun}, in=${inPath} (${rawRows.length} raw candidate row(s))`)

  const validated = rawRows
    .map((r) => toCandidateVariant(r as Record<string, unknown>))
    .filter((c): c is CandidateVariant => c !== null)
  const invalidCount = rawRows.length - validated.length
  if (invalidCount > 0) {
    console.warn(`  ${invalidCount} row(s) failed validation (bad variant_type/empty text/missing field) — skipped`)
  }

  const deduped = dedupeCandidates(validated)
  console.log(`  ${validated.length} valid candidate(s), ${deduped.length} after intra-batch de-dup`)

  const { url, key } = requireEnv()
  const db = createClient(url, key).schema('indonesian')

  // Chunk every .in() lookup — at full-corpus scale (~1500 item ids) a single
  // .in() overflows Kong's URL length limit ("URI too long"). CHUNK=100 stays
  // well under it (mirrors src/lib/chunkedQuery.ts, which does the same in-app).
  const chunkedIn = async <T>(
    table: string, cols: string, col: string, ids: string[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extra?: (b: any) => any,
  ): Promise<T[]> => {
    const out: T[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      // Kong/PostgREST gives intermittent upstream errors (memory:
      // project_homelab_postgrest_flaky_reads) — retry the chunk with backoff.
      let lastErr: string | null = null
      for (let attempt = 0; attempt < 4; attempt++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let b: any = db.from(table).select(cols).in(col, chunk)
        if (extra) b = extra(b)
        const { data, error } = await b
        if (!error) { out.push(...((data ?? []) as T[])); lastErr = null; break }
        lastErr = error.message
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
      if (lastErr) throw new Error(`[apply] ${table}.in(${col}) chunk ${i} of ${ids.length}: ${lastErr}`)
    }
    return out
  }

  // Register-pairs source (spec §7, build order step 5): a second,
  // deterministic candidate source, no LLM, closed list. Resolves each core
  // pair's formal twin against the live DB and produces one
  // item_answer_variants candidate per resolved pair — see
  // scripts/lib/registerPairVariants.ts for the pure mapper. Kept as its own
  // bucket rather than folded into `deduped` above so it never drags the
  // register-pair items through the nl/en distractor-collision machinery
  // below (those checks are meaningless for language='id' rows, which
  // already bypass them via `otherCandidates`).
  const registerPairIntersection = loadRegisterPairIntersection(REGISTER_PAIRS_INTERSECTION_PATH)
  let registerPairCandidates: CandidateVariant[] = []
  if (registerPairIntersection === null) {
    console.log(`  register-pairs: SKIPPED — ${REGISTER_PAIRS_INTERSECTION_PATH} not found`)
  } else {
    const formalSlugs = [...new Set(registerPairIntersection.pairs.flatMap((p) => registerPairSlugVariants(p.formal)))]
    const formalItemRows = await chunkedIn<{ id: string; normalized_text: string }>(
      'learning_items', 'id, normalized_text', 'normalized_text', formalSlugs,
    )
    const formalItemIdBySlug = new Map(formalItemRows.map((r) => [r.normalized_text, r.id]))
    const { candidates, unresolved } = mapRegisterPairsToCandidates(registerPairIntersection.pairs, formalItemIdBySlug)
    registerPairCandidates = dedupeCandidates(candidates)
    console.log(
      `  register-pairs: ${registerPairCandidates.length} candidate(s) resolved from ${registerPairIntersection.pairs.length} core pair(s)` +
      (unresolved.length > 0
        ? `, ${unresolved.length} unresolved (formal twin not live: ${unresolved.slice(0, 5).map((p) => p.formal).join(', ')}${unresolved.length > 5 ? ' …' : ''})`
        : ''),
    )
  }

  const itemIds = [...new Set(deduped.map((c) => c.learningItemId))]
  const items = await chunkedIn<{ id: string; normalized_text: string; base_text: string; translation_nl: string | null; translation_en: string | null }>(
    'learning_items', 'id, normalized_text, base_text, translation_nl, translation_en', 'id', itemIds,
  )
  const itemIdByRef = new Map(items.map((i) => [`learning_items/${i.normalized_text}`, i.id]))

  // The items' OWN capabilities (source_kind='vocabulary_src' — item-harvest
  // is word/phrase only per ADR 0014, so every eligible item has exactly this
  // source_kind), resolved back to their target item id.
  const sourceRefs = items.map((i) => `learning_items/${i.normalized_text}`)
  const capRows = await chunkedIn<{ id: string; capability_type: string; source_ref: string }>(
    'learning_capabilities', 'id, capability_type, source_ref', 'source_ref', sourceRefs,
    (b) => b.eq('source_kind', 'vocabulary_src'),
  )
  const capabilityRows = capRows
    .map((r) => ({ id: r.id, capability_type: r.capability_type, targetItemId: itemIdByRef.get(r.source_ref) ?? '' }))
    .filter((r) => r.targetItemId !== '')

  const capIds = capabilityRows.map((r) => r.id)
  const distractorPointerRows = await chunkedIn<{ capability_id: string; item_id: string }>(
    'distractors', 'capability_id, item_id', 'capability_id', capIds,
  )

  const distractorItemIds = [...new Set(distractorPointerRows.map((r) => r.item_id))]
  const distractorItemRows = await chunkedIn<{ id: string } & ItemForDistractorResolution>(
    'learning_items', 'id, base_text, translation_nl, translation_en', 'id', distractorItemIds,
  )
  const distractorItemById = new Map(distractorItemRows.map((r) => [r.id, r]))

  // Collision check is language-specific — an NL candidate must dodge the
  // Dutch-rendered distractor strings, an EN candidate the English-rendered
  // ones (resolveDistractorMaps renders per a single userLanguage).
  const distractorTextsNl = buildDistractorTextsByItem(capabilityRows, distractorPointerRows, distractorItemById, 'nl')
  const distractorTextsEn = buildDistractorTextsByItem(capabilityRows, distractorPointerRows, distractorItemById, 'en')

  // Corpus-wide false-accept guard: a candidate whose text is the accepted
  // answer of a DIFFERENT item would credit the learner for another item's
  // meaning (e.g. `lapangan -> "square"` vs `alun-alun` = "square"). The
  // per-item distractor check above structurally can't see this. Fetch the
  // WHOLE item corpus (paginated — a plain select caps at 1000 rows in
  // PostgREST, which would silently miss collisions with items past the first
  // page and defeat the guard).
  const corpus: Array<{ id: string; translation_nl: string | null; translation_en: string | null }> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('learning_items')
      .select('id, translation_nl, translation_en')
      .range(from, from + 999)
    if (error) throw error
    const page = (data ?? []) as typeof corpus
    corpus.push(...page)
    if (page.length < 1000) break
  }
  const nlOwners = buildAnswerOwnersByText(corpus.map((i) => ({ id: i.id, text: i.translation_nl })))
  const enOwners = buildAnswerOwnersByText(corpus.map((i) => ({ id: i.id, text: i.translation_en })))

  const nlCandidates = deduped.filter((c) => c.language === 'nl')
  const enCandidates = deduped.filter((c) => c.language === 'en')
  const otherCandidates = [
    ...deduped.filter((c) => c.language !== 'nl' && c.language !== 'en'),
    ...registerPairCandidates,
  ]

  // Two-stage drop per language: own-distractor collision, then corpus collision.
  const nlDist = dropDistractorCollisions(nlCandidates, distractorTextsNl)
  const enDist = dropDistractorCollisions(enCandidates, distractorTextsEn)
  const nlResult = dropCorpusCollisions(nlDist.kept, nlOwners)
  const enResult = dropCorpusCollisions(enDist.kept, enOwners)

  const kept = [...nlResult.kept, ...enResult.kept, ...otherCandidates]
  const distractorDropped = [...nlDist.dropped, ...enDist.dropped]
  const corpusDropped = [...nlResult.dropped, ...enResult.dropped]
  const dropped = [...distractorDropped, ...corpusDropped]
  console.log(`  ${dropped.length} candidate(s) dropped — ${distractorDropped.length} collide with a curated MCQ distractor, ${corpusDropped.length} collide with another item's meaning`)
  for (const d of corpusDropped.slice(0, 10)) console.log(`    dropped (corpus): item=${d.learningItemId} "${d.variantText}" (${d.language})`)
  for (const d of distractorDropped.slice(0, 10)) console.log(`    dropped (distractor): item=${d.learningItemId} "${d.variantText}" (${d.language})`)
  if (dropped.length > 20) console.log(`    … and ${dropped.length - Math.min(20, corpusDropped.length + distractorDropped.length)} more`)

  const insertRows = kept.map(toInsertRow)

  if (csvPath) {
    const rows = ['learning_item_id,variant_text,variant_type,language,dropped_collision', ...insertRows.map((r) =>
      `${r.learning_item_id},"${r.variant_text.replace(/"/g, '""')}",${r.variant_type},${r.language},false`,
    ), ...dropped.map((d) =>
      `${d.learningItemId},"${d.variantText.replace(/"/g, '""')}",${d.variantType},${d.language},true`,
    )]
    fs.writeFileSync(csvPath, rows.join('\n'))
    console.log(`  Wrote report to ${csvPath}`)
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would upsert ${insertRows.length} row(s) into item_answer_variants (ON CONFLICT DO NOTHING).`)
    return
  }

  let written = 0
  for (let i = 0; i < insertRows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = insertRows.slice(i, i + INSERT_CHUNK_SIZE)
    const { error } = await db
      .from('item_answer_variants')
      .upsert(chunk, { onConflict: 'learning_item_id,variant_text,language', ignoreDuplicates: true })
    if (error) throw error
    written += chunk.length
  }
  console.log(`Upserted ${written} row(s) into item_answer_variants (pre-existing rows/DB-authored rejections left untouched).`)
}

// ── CLI entry ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const mode = process.argv[2]
  if (mode === 'generate') {
    await runGenerate()
  } else if (mode === 'apply') {
    await runApply()
  } else {
    console.error('Usage:')
    console.error('  bun scripts/enrich-answer-variants.ts generate [--max-items N] [--out <path>]')
    console.error('  bun scripts/enrich-answer-variants.ts apply [--in <path>] [--dry-run] [--csv <path>]')
    process.exit(1)
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
