// lib/exercise-content/byKind/affixedFormPair — word_form_pair_src-source-kind
// fetcher.
//
// PR 3 (2026-05-23): switched from the legacy `capability_artifacts` reader
// (root_derived_pair + allomorph_rule — two rows per cap) to the typed
// `affixed_form_pairs` table (one row per cap, NOT NULL root_text/derived_text/
// allomorph_rule). The new reader is FAIL-LOUD per §1.5 of
// `docs/plans/2026-05-22-data-model-migration.md`: when `learning_capabilities`
// says the cap is ready but the typed-table query returns nothing, the resolver
// surfaces an `affixed_form_pair_typed_row_missing` failure diagnostic rather
// than silently skipping. Exact mirror of byKind/dialogueLine.ts (PR 2).
//
// The `direction` (root→derived recall vs derived→root recognition) comes from
// the canonical-key tail, decoded at bucketing time — NOT from the typed row,
// which is pair-stable across both caps of a linguistic pair.
//
// No capability_artifacts are read: the legacy morphology artifact writes were
// removed in this PR (renderContracts: type_form_ex/word_form_pair_src → []).
//
// Morphology phase-b: choose_form_ex is ALSO served over word_form_pair_src for the
// recognise_word_form_link_cap MCQ. This reader supplies affix so buildCuedRecall can
// build catalog-derived distractors. (The per-pair allomorph MCQ was retired in the
// 2026-06-17 cap-model fix — nasalization is taught at the rule tier, ADR 0017 — so
// allomorph_class is no longer threaded to the render path; the column stays in the DB.)

import {
  type AffixedFormPairBucketEntry,
  type BlockResolutionData,
  type SupabaseSchemaClient,
  makeFailContext,
} from '../adapter'
import { itemSlug } from '@/lib/capabilities'

/**
 * Shape returned by the affixed_form_pairs query. Every column has a NOT NULL
 * constraint in the DB (scripts/migration.sql:2420-2431); we narrow defensively
 * in case Postgres-side integrity ever drifts.
 */
interface AffixedFormPairRow {
  capability_id: string
  lesson_id: string
  root_text: string
  derived_text: string
  allomorph_rule: string
  affix: string | null
  // ADR 0019: circumfix pieces feed decompose_word_ex; carrier_text feeds the
  // contextualised type_form_ex (option B). All nullable.
  circumfix_left: string | null
  circumfix_right: string | null
  carrier_text: string | null
  // ADR 0021: the meaning card's substrate (transparent affixes).
  derived_gloss_nl: string | null
  derived_gloss_en: string | null
}

export async function fetchForAffixedFormPairBlocks(
  client: SupabaseSchemaClient,
  affixedBlocks: AffixedFormPairBucketEntry[],
  userLanguage: 'nl' | 'en',
  result: Map<string, BlockResolutionData>,
): Promise<void> {
  if (affixedBlocks.length === 0) return

  const capabilityIds = [...new Set(affixedBlocks.map(b => b.block.capabilityId))]
  const { data, error } = await client.schema('indonesian')
    .from('affixed_form_pairs')
    .select('capability_id, lesson_id, root_text, derived_text, allomorph_rule, affix, circumfix_left, circumfix_right, carrier_text, derived_gloss_nl, derived_gloss_en')
    .in('capability_id', capabilityIds)
  if (error) throw error

  const rowByCapability = new Map<string, AffixedFormPairRow>()
  for (const row of (data ?? []) as AffixedFormPairRow[]) {
    rowByCapability.set(row.capability_id, row)
  }

  // ADR 0021 — the MEANING card's distractor substrate, fetched in two batched
  // reads over this block set: (1) each root's own bare meaning (the richest
  // distractor — drills the affix's meaning-shift), and (2) a LESSON-scoped pool of
  // every other derived gloss, which the builder splits into same-root family
  // (preferred) + backfill. Best-effort: the formation path ignores all of this.
  const rows = [...rowByCapability.values()]
  const rootTexts = [...new Set(rows.map(r => r.root_text))]
  const lessonIds = [...new Set(rows.map(r => r.lesson_id))]
  const rootMeaningBySlug = new Map<string, string>()
  // gloss pool entries keyed by lesson: { root_text, derived_text, gloss } in the user language.
  const glossPool: Array<{ root_text: string; derived_text: string; gloss: string }> = []
  if (rootTexts.length > 0) {
    const rootSlugs = [...new Set(rootTexts.map(itemSlug))]
    const { data: itemRows } = await client.schema('indonesian')
      .from('learning_items')
      .select('normalized_text, translation_nl, translation_en')
      .in('normalized_text', rootSlugs)
    for (const r of (itemRows ?? []) as Array<{ normalized_text: string; translation_nl: string | null; translation_en: string | null }>) {
      const m = userLanguage === 'nl' ? r.translation_nl : r.translation_en
      if (r.normalized_text && m) rootMeaningBySlug.set(r.normalized_text, m)
    }
    const { data: poolRows } = await client.schema('indonesian')
      .from('affixed_form_pairs')
      .select('root_text, derived_text, derived_gloss_nl, derived_gloss_en')
      .in('lesson_id', lessonIds)
    for (const r of (poolRows ?? []) as Array<{ root_text: string; derived_text: string; derived_gloss_nl: string | null; derived_gloss_en: string | null }>) {
      const g = userLanguage === 'nl' ? r.derived_gloss_nl : r.derived_gloss_en
      if (g) glossPool.push({ root_text: r.root_text, derived_text: r.derived_text, gloss: g })
    }
  }

  for (const { block, sourceRef, direction } of affixedBlocks) {
    const row = rowByCapability.get(block.capabilityId)
    if (!row) {
      // Fail-loud: a ready word_form_pair_src cap with no typed row means the
      // typed-row writer (projectors/morphology.ts) failed or did not run for
      // this lesson, or the cap was promoted before the row landed. Surface,
      // do not skip silently.
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'affixed_form_pair_typed_row_missing',
          `word_form_pair_src cap ${block.capabilityId} has no affixed_form_pairs row — typed-row writer failed or did not run for this lesson`,
          { capabilityId: block.capabilityId, sourceRef }),
      })
      continue
    }

    const root = row.root_text
    const derived = row.derived_text
    const rule = row.allomorph_rule

    if (!root || !derived || !rule) {
      // DB NOT NULL constraints guard against empties at write time. This
      // branch is defensive belt-and-braces.
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'affixed_form_pair_typed_row_missing',
          `affixed_form_pairs row for cap ${block.capabilityId} has empty fields after fetch`,
          {
            capabilityId: block.capabilityId,
            sourceRef,
            hasRoot: !!root,
            hasDerived: !!derived,
            hasRule: !!rule,
          }),
      })
      continue
    }

    // direction comes from the canonical-key tail (parsed by decodeCanonicalKey).
    // Production caps always carry it. Normalize to the union type; an
    // unexpected value falls back to root_to_derived (production caps cover only
    // these two values per src/lib/capabilities/capabilityCatalog.ts).
    const normalizedDirection: 'root_to_derived' | 'derived_to_root' =
      direction === 'derived_to_root' ? 'derived_to_root' : 'root_to_derived'

    result.set(block.id, {
      kind: 'ok',
      block,
      input: {
        block,
        learningItem: null,
        dialogueLine: null,
        affixedFormPair: {
          root,
          derived,
          direction: normalizedDirection,
          allomorphRule: rule,
          affix: row.affix,
          circumfixLeft: row.circumfix_left,
          circumfixRight: row.circumfix_right,
          carrierText: row.carrier_text,
          sourceRef,
          // ADR 0021 meaning-card substrate (null/empty on the formation path).
          derivedGloss: userLanguage === 'nl' ? row.derived_gloss_nl : row.derived_gloss_en,
          rootMeaning: rootMeaningBySlug.get(itemSlug(root)) ?? null,
          siblingGlosses: glossPool
            .filter(g => g.root_text === root && g.derived_text !== derived)
            .map(g => g.gloss),
          poolGlosses: glossPool
            .filter(g => g.root_text !== root)
            .map(g => g.gloss),
        },
        meanings: [],
        contexts: [],
        answerVariants: [],
        patternExercise: null,
        // No artifacts in the typed-table path — the byType/typedRecall.ts
        // packager reads input.affixedFormPair; the empty map is a no-op for it.
        poolItems: [],
        poolMeaningsByItem: new Map(),
        userLanguage,
        curatedRecognitionDistractors: new Map(),
        curatedCuedRecallDistractors: new Map(),
      },
    })
  }
}
