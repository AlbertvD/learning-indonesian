/**
 * capability-stage/runner.ts — Stage B entry point.
 *
 * Input boundary (DB-only as of Slice 5b #147 — the no-disk cutover):
 *   { lessonNumber, lessonId, dryRun }
 *   → DB load for Stage A's outputs (lessons + sections + audio_clips) via the
 *      loader, then typed DB reads for everything downstream (loadFromDb /
 *      loadPatternFromDb / loadDialogueFromDb / fetchAffixedPairsFromDb).
 *   No staging file is read or written — the global no-disk gate (5b.9) enforces
 *   this. Dry-run loads from the same DB Stage A wrote (Stage A must have run
 *   live first; ADR 0011/0012).
 *
 * Sequence (mirrors lesson-stage/runner.ts shape):
 *   1. Load Stage A outputs from the DB + typed item rows (for the pre-write gate).
 *   2. Run pre-write validators (CS3–CS6). Errors short-circuit before writes.
 *   3. dryRun returns early before any DB writes.
 *   4. Project (pure): produce per-item / grammar / cloze write plans.
 *   5. Adapter writes in dependency order:
 *        content_units → learning_capabilities → capability_content_units →
 *        capability_artifacts → grammar_patterns → learning_items + meanings +
 *        anchor_contexts → exercise_variants → cloze_contexts.
 *      Decision 3 stamps `lesson_id` on morphology capability rows when this
 *      lesson introduces a morphology pattern.
 *      Decision 5b appends `contextual_cloze` capabilities for dialogue lines
 *      whose slug matches a staged cloze context.
 *   6. Run seed hooks (CS7 countParity → CS8 contentNonEmpty → CS9 seedIntegrity).
 *      Per §11 #23 hooks fire AFTER all projector writes complete; per-hook
 *      failure → status: 'partial' with aggregated findings.
 *   7. Return typed CapabilityStageOutput.
 *
 * `process.exit(1)` calls in the legacy file become thrown `Error`s here per
 * fold §11 #7. The publish-approved-content CLI shim does the single
 * top-level exit.
 */

import path from 'node:path'

import {
  EMPTY_COUNTS,
  type CapabilityStageInput,
  type CapabilityStageOutput,
  type ValidationFinding,
} from './model'
import {
  createSupabaseClient as defaultCreateSupabaseClient,
  reconcileArtifactPresence,
  retireOrphanedCapabilities,
  upsertCapabilities,
  upsertCapabilityContentUnits,
  upsertContentUnits,
  replaceDialogueClozes,
  replaceAffixedFormPairs,
  type CapabilityContentUnitInput,
  type CapabilityInput,
  type CapabilitySupabaseClient,
} from './adapter'
import { loadLesson as defaultLoadLesson, type LoadedLesson } from './loader'
import { fetchDistractorPool as defaultFetchDistractorPool, loadPatternFromDb as defaultLoadPatternFromDb, loadDialogueFromDb as defaultLoadDialogueFromDb, fetchClozePool as defaultFetchClozePool, fetchAffixedPairsFromDb as defaultFetchAffixedPairsFromDb, type PatternDbResult, type DialogueDbResult, type TypedAffixedPair, type DistractorInputItem } from './loadFromDb'
import { generateDialogueClozes, type ClozePoolItem, type GenerateFn } from './generateClozeContexts'
import { writePatternPath } from './patternPath'
import { projectAffixedCapabilities } from './projectors/affixedCapabilities'
import { buildContentUnitsFromDb } from './projectors/contentUnits'

// CS1 (grammar_topics) moved back to lesson-stage (GT1) — lesson_sections
// is Stage A's territory, and lesson-stage now owns the enricher that
// fills `content.grammar_topics`. CS2 (perItemEnrichment) was deleted —
// its checks are now replaced by active enrichments (enrichPos / enrichLevel
// / enrichDialogueTranslations) that fill the fields rather than gating.
// EN-translation enrichment was relocated to lesson-stage (PR 6, ADR 0012);
// this stage no longer generates translations.
// Pre-write validators (CS3/CS4/CS4b/CS5/CS6) and post-write verifiers
// (CS7/CS8/CS9) are now composed behind the gate entry points.
import { runCapabilityGatePreWrite, runCapabilityGatePostWrite } from './gate'

import { projectPatternsFromCategories } from './projectors/grammar'
import { projectDialogueClozeCapabilities, projectDialogueClozeRows } from './projectors/dialogueCloze'
import { validateDialogueClozeCoverage } from './validators/dialogueClozeCoverage'
import { projectAffixedFormPairs, type AffixedPairSource } from './projectors/morphology'

import { validateLessonIdPresence } from './validators/lessonId'
import { validateDialogueClozes } from './validators/dialogueClozes'
import { validateAffixedFormPairs } from './validators/affixedFormPairs'

import { loadPromotionPlan, applyPromotionPlan } from '../../../promote-capabilities'

export interface CapabilityStageHooks {
  loadLesson?: typeof defaultLoadLesson
  createSupabaseClient?: () => CapabilitySupabaseClient
  /**
   * Injectable generate function for item distractors. When provided, bypasses
   * the ANTHROPIC_API_KEY check in `generateItemDistractors` — used in tests to
   * inject a fake response without network calls. In production this is omitted
   * and the real Claude API is used (if ANTHROPIC_API_KEY is set).
   */
  generateFn?: GenerateFn
  /**
   * Injectable fetchDistractorPool for tests. When provided, replaces the default
   * DB read of all active word/phrase learning_items.
   */
  fetchDistractorPool?: (supabase: CapabilitySupabaseClient) => Promise<DistractorInputItem[]>
  /**
   * Injectable loadPatternFromDb for tests (Slice 2). When provided, replaces the
   * default DB read of typed grammar categories + pattern capability state.
   */
  loadPatternFromDb?: (supabase: CapabilitySupabaseClient, input: { lessonId: string }) => Promise<PatternDbResult>
  /**
   * Injectable generate function for grammar exercises (Slice 2). Separate from
   * `generateFn` (item distractors) so tests can inject distinct fake responses.
   */
  generateGrammarFn?: GenerateFn
  /**
   * Injectable loadDialogueFromDb for tests (Slice 3). Replaces the default DB
   * read of lesson_dialogue_lines + dialogue-cloze seeded state.
   */
  loadDialogueFromDb?: (supabase: CapabilitySupabaseClient, input: { lessonId: string }) => Promise<DialogueDbResult>
  /**
   * Injectable fetchClozePool for tests (Slice 3). Replaces the default DB read
   * of the active word/phrase vocab pool (with POS) for cloze eligibility.
   */
  fetchClozePool?: (supabase: CapabilitySupabaseClient) => Promise<ClozePoolItem[]>
  /**
   * Injectable fetchAffixedPairsFromDb for tests (Slice 3). Replaces the default
   * DB read of lesson_section_affixed_pairs (the affixed repoint source).
   */
  fetchAffixedPairsFromDb?: (supabase: CapabilitySupabaseClient, lessonId: string) => Promise<TypedAffixedPair[]>
  /**
   * Injectable generate function for dialogue clozes (Slice 3). Separate from
   * `generateFn` / `generateGrammarFn` so tests inject distinct fake responses.
   */
  generateClozeFn?: GenerateFn
}

export async function runCapabilityStage(
  input: CapabilityStageInput,
  hooks: CapabilityStageHooks = {},
): Promise<CapabilityStageOutput> {
  const start = Date.now()
  const findings: ValidationFinding[] = []
  const counts = { ...EMPTY_COUNTS }

  if (!input.lessonId) {
    throw new Error(
      'runCapabilityStage requires lessonId from runLessonStage output. ' +
      'CLI shim must short-circuit if Stage A status !== "ok". ' +
      'Slice 5b (#147): dry-run is DB-only and ALSO requires a real lessonId — ' +
      'Stage A must have run live first.',
    )
  }

  const createClient = hooks.createSupabaseClient ?? defaultCreateSupabaseClient
  const loadLesson = hooks.loadLesson ?? defaultLoadLesson
  const fetchDistractorPool = hooks.fetchDistractorPool ?? defaultFetchDistractorPool
  const loadPatternFromDb = hooks.loadPatternFromDb ?? defaultLoadPatternFromDb
  const loadDialogueFromDb = hooks.loadDialogueFromDb ?? defaultLoadDialogueFromDb
  const fetchClozePool = hooks.fetchClozePool ?? defaultFetchClozePool
  const fetchAffixedPairsFromDb = hooks.fetchAffixedPairsFromDb ?? defaultFetchAffixedPairsFromDb

  // ---- 1. Load (Stage A from DB — DB-only, Slice 5b #147). -------------
  // The loader no longer reads staging files; dry-run loads from the same DB
  // Stage A wrote (Stage A must have run live first — the CLI shim handles this).
  // The Supabase client is created unconditionally (dry-run is DB-backed now).
  const supabase: CapabilitySupabaseClient = createClient()
  const loaded: LoadedLesson = await loadLesson(supabase, {
    lessonNumber: input.lessonNumber,
    lessonId: input.lessonId,
  })

  // ---- 1b. (retired Slice 5b #147) staging enrichment, regeneration + snapshots. --
  // Gone: the staging pos/level enrichment + its disk write-back, AND the
  // buildContentUnitsFromStaging / buildCapabilityStagingFromContent regeneration
  // + the 3 derived-snapshot disk writes (content-units / capabilities / exercise-
  // assets). content_units are built DB-natively (buildContentUnitsFromDb, step 4b);
  // capabilities come from the typed emitters (item / audio / affixed / pattern /
  // dialogue cloze); POS is enriched DB-natively (updateLearningItemPos, step 5b+);
  // level is set in projectItemsFromTypedRows; EN translations are the Lesson Stage's
  // job (ADR 0012). The runner now performs zero disk reads/writes (no-disk gate, 5b.9).

  // ---- 1c. Pre-load the distractor pool (DB). --------------------------
  // cap-v2 #161 cutover: the runner's ITEM branch is amputated — the new
  // `vocabulary/` module (publishVocabulary) owns item projection, item caps,
  // learning_items, POS, item content_units, item junction, and item distractors.
  // The runner keeps only the non-item kinds (pattern, dialogue_line, affixed).
  // distractorPool stays — the pattern path (writePatternPath, step 5d) uses it.
  const distractorPool = await fetchDistractorPool(supabase)

  // ---- 2. Validate (pre-write). ----------------------------------------
  // grammar_topics validation (GT1) is enforced by lesson-stage; by the time
  // Stage A's outputs land here, content.grammar_topics is already populated.
  // Item checks (CS4/CS4b/CS19/CS20/CS5) moved to the vocab gate (the runner no
  // longer projects items); grammarPatterns + candidates pass [] (grammar is
  // DB-native via the pattern path + CS18 post-write coverage).
  findings.push(...runCapabilityGatePreWrite({
    grammarPatterns: [],
    candidates: [],
    learningItems: [],
    mode: 'publish',
  }))

  if (findings.some((f) => f.severity === 'error')) {
    return {
      status: 'validation_failed',
      counts,
      findings,
      durationMs: Date.now() - start,
    }
  }

  // ---- 2b. Dry-run short-circuit after validation, before writes. -------
  if (input.dryRun) {
    console.log(`\n[DRY RUN] Lesson ${input.lessonNumber} (non-item kinds) pre-write validation passed.`)
    console.log(`   Loaded from DB: ${loaded.sections.length} sections.`)
    return {
      status: 'ok',
      counts,
      findings,
      durationMs: Date.now() - start,
    }
  }

  // ---- 3. Project (pure). ----------------------------------------------
  // projectVocab (staging item path) retired in Slice 5b (#147): word/phrase
  // learning_items + anchor contexts are written DB-natively by the typed path
  // (step 5b, projectItemsFromTypedRows); sentence/dialogue items are no longer
  // emitted (deleted by the 5b.10 cleanup migration).
  // projectGrammar (staging grammar path) retired in Slice 5b (#147): grammar
  // patterns + typed grammar exercises are projected from typed DB rows by the
  // pattern path (projectPatternsFromCategories, step 5d).
  // projectCloze (staging cloze path) retired in Slice 5b (#147): the authored
  // cloze item_contexts are DB-authoritative (seed-once); #148 owns their
  // item-cloze caps. No cloze is projected or re-seeded here.

  // ---- 4. Write — content_units. ---------------------------------------
  // The content_units write happens in step 4b (after pattern projection), where
  // buildContentUnitsFromDb needs patternProjection.patternPlans. contentUnitIdsBySlug
  // and contentUnitIds are declared there. Built DB-natively (Slice 5a/5b), never
  // from a staging snapshot.

  // ---- 5. Write — learning_capabilities. -------------------------------
  // Every cap kind is produced by a typed DB-native emitter (item / audio /
  // affixed / pattern / dialogue cloze). Decision 3b (ADR 0006) stamps lesson_id
  // on every lesson-derived capability — the runner is invoked per lesson, so the
  // projecting lesson IS the introducing lesson by construction. Decision 3's
  // morphology tie-break is preserved: only morphology-introducing lessons emit
  // affixed_form_pair capabilities, so those rows get the rule-introducing
  // lesson's id. Podcasts are not projected here; they're carved out from the
  // lesson_id invariant.
  //
  // itemDbResult / distractorPool / itemProjection / allItemCaps were loaded in
  // step 1c (hoisted ahead of the pre-write gate, which reads itemProjection).

  // ---- 5a (pattern). Load typed grammar categories + project patterns. -----
  // Slice 2: the pattern path activates ONLY for a lesson that HAS typed grammar
  // categories in the DB (PR 6). L5/7/8 (and any not-yet-published lesson) have
  // none → `usePatternPath` is false and the LEGACY grammar path (steps 8/10)
  // runs unchanged, gated on their re-publish (the data_prerequisite).
  const patternDb = await loadPatternFromDb(supabase, { lessonId: input.lessonId })
  const usePatternPath = patternDb.categories.length > 0
  const patternProjection = usePatternPath
    ? projectPatternsFromCategories({
        categories: patternDb.categories,
        lessonNumber: input.lessonNumber,
        lessonId: input.lessonId,
      })
    : { patternPlans: [] }

  // ---- 5a (affixed). Early-load affixed pairs + emit DB-native affixed caps. --
  // SECOND-CONSUMER TRAP (landmine #1): these affixedPairsFromDb are appended to
  // allCapabilities below AND reused in step 7c (projectAffixedFormPairs) so step
  // 7c can find affixed caps to join on. Emitting without appending = zero
  // affixed_form_pairs rows. Loading once here avoids a second DB round-trip at 7c.
  const affixedPairsFromDb = await fetchAffixedPairsFromDb(supabase, input.lessonId)
  const newAffixedCaps = projectAffixedCapabilities({
    pairs: affixedPairsFromDb,
    lessonId: input.lessonId,
  })

  // ---- 5a (dialogue). DB→DB dialogue cloze path (Slice 3). ----------------
  // Read lesson_dialogue_lines + the seeded-line set + the vocab pool (with POS),
  // then GENERATE clozes in-stage (Mode 2) for un-seeded eligible lines. The
  // per-line seeded gate is the SOLE idempotency mechanism (R2): seeded lines run
  // neither the generator nor the writer, so L6/L9's reviewed clozes are untouched.
  // The caps are appended to allCapabilities below (replacing the legacy
  // staging-derived vocab.contextualClozeCapabilities); the dialogue_clozes rows
  // are projected post-upsert (step 7b). No LLM in dry-run (short-circuited at 2b)
  // nor without ANTHROPIC_API_KEY/generateClozeFn (generateDialogueClozes no-ops).
  // NOTE: dialogue --regenerate CLI wiring is deferred (input.regenerate is the
  // item-only union today); the seeded gate covers routine idempotency.
  const dialogueDb = await loadDialogueFromDb(supabase, { lessonId: input.lessonId })
  const clozePool = await fetchClozePool(supabase)
  const dialogueLineInputs = dialogueDb.dialogueLines.map((l) => ({
    id: l.id,
    sourceLineRef: l.source_line_ref,
    text: l.text,
    translation: l.translation,
    translationNl: l.translation_nl,
    translationEn: l.translation_en,
    speaker: l.speaker,
  }))
  const generatedDialogueClozes = await generateDialogueClozes(dialogueLineInputs, clozePool, {
    generateFn: hooks.generateClozeFn,
    seededLineIds: dialogueDb.dialogueState.seededDialogueLineIds,
    // F5: --regenerate-dialogue bypasses the per-line seeded gate so existing
    // lessons re-evaluate every line against the F2 narrower (old over-long
    // clozes whose line now drops fall out of the emit set → retire sweep).
    regenerate: input.regenerate?.kind === 'dialogue',
  })
  const dialogueClozeCaps = projectDialogueClozeCapabilities(
    generatedDialogueClozes.clozes,
    input.lessonId,
  )
  // CS22 (Task 8) — dialogue-cloze coverage gate, the DB-state successor of the
  // relocated lint-staging checkDialogueClozes. Surfaces eligible lines whose
  // in-stage generation failed (no row landed) as ERROR → run 'partial' (graceful;
  // the gap is visible for re-publish/--regenerate, never silently dropped, m-2).
  // Pushed after the pre-write gate, so it contributes to the final status, not a
  // hard validation_failed (which would re-create a #126-style block).
  findings.push(...validateDialogueClozeCoverage(generatedDialogueClozes.failedLineRefs))

  // ---- 4b. Write — content_units (DB-native, moved from step 4). --------------
  // Build from DB inputs so grammar units consume plan.slug/plan.sourceRef verbatim
  // (collision-disambiguated) — see Decision E amendment (2026-06-04).
  // affixedPairsFromDb loaded in step 5a (affixed) above (early-load for key-set).
  // itemDbResult.items already ordered deterministically (loadFromDb.ts .order() added in 5a.5).
  const dbContentUnits = buildContentUnitsFromDb({
    lessonNumber: input.lessonNumber,
    sections: loaded.sections,
    patternPlans: patternProjection.patternPlans,
    affixedPairs: affixedPairsFromDb,
  })
  const contentUnitIdsBySlug = await upsertContentUnits(supabase, dbContentUnits)
  counts.contentUnits = contentUnitIdsBySlug.size
  const contentUnitIds = [...contentUnitIdsBySlug.values()]

  // NO-DOUBLE-WRITE for pattern caps. DEVIATION FROM THE PLAN, JUSTIFIED:
  // the plan says "filter by exact canonical_key, NOT sourceKind". But OQ2-5
  // gives new patterns NEW slugs (`l{N}-…`), so the new path's canonical keys are
  // DISJOINT from the legacy bundle's pattern-cap keys (capabilityCatalog.ts:119
  // builds them from staging grammar-patterns.ts with legacy slugs) — an exact-key
  // filter would remove NOTHING and double-write every pattern cap. The new path
  // owns 100% of pattern caps (there is no audio/other pattern sub-kind, unlike
  // the item case the plan's warning is about), so excluding ALL `sourceKind ===
  // 'pattern'` caps is correct and complete. The legacy pattern caps (old keys)
  // then fall out of the emit set and are SOFT-RETIRED by retireOrphanedCapabilities
  // — exactly what OQ2-5 prescribes ("safe: 0 progress; use retireOrphanedCapabilities").
  // Gated on usePatternPath so L5/7/8 keep their legacy pattern caps.

  // Slice 5b (#147): the staging-derived capability bundle is retired. Every cap
  // kind is produced by a typed DB-native emitter, each on its correct write path:
  //   - item base + audio caps → allItemCaps → upsertCapabilitiesSkipIfExists
  //     (step 5b; INSERT … ON CONFLICT DO NOTHING — never disturbs FSRS, ADR 0011)
  //   - pattern caps           → writePatternPath (step 5d), merged into
  //     capabilityIdsByKey there (so the orphan sweep sees them)
  //   - dialogue_line cloze    → dialogueClozeCaps (above)
  //   - affixed_form_pair      → newAffixedCaps (above)
  // allCapabilities (written via upsertCapabilities) is therefore EXACTLY the
  // non-item, non-pattern typed caps. Item caps are deliberately NOT included here
  // — routing them through upsertCapabilities would re-write existing rows and
  // disturb FSRS state; they ride the skip-if-exists path instead.
  const allCapabilities: CapabilityInput[] = [
    // dialogue_line:contextual_cloze caps (DB→DB generator output, Slice 3).
    ...dialogueClozeCaps,
    // DB-native affixed caps — LOAD-BEARING: step 7c (projectAffixedFormPairs)
    // filters allCapabilities for sourceKind==='affixed_form_pair'; without this
    // append it emits zero affixed_form_pairs rows (landmine #1).
    ...newAffixedCaps,
  ]

  // CS21 (ADR 0014 §M4) reader-visibility net — RETIRED in Slice 5b (#147).
  // It read the staging sentence/dialogue_chunk items (now gone) to warn if a
  // de-harvested item vanished from the typed content. With staging removed its
  // only input source disappears; and the de-harvested sentence/dialogue
  // learning_items are themselves being DELETED by the 5b.10 cleanup migration
  // (cap-less dead-weight; reader-visibility comes from lesson_sections per
  // ADR 0014 §M4 / D2), so the transition safety net is moot. No replacement.

  // Decision 3b (ADR 0006): refuse to write any lesson-derived capability with
  // null lesson_id. Podcast source kinds are exempt — see the validator.
  validateLessonIdPresence(allCapabilities)
  // cap-v2 #161 cutover: validateItemSourceRefResolvability moved to the vocab
  // module (publishVocabulary) — the runner no longer emits item-source caps, so
  // it would be vacuous here (allCapabilities is dialogue_line + affixed only).
  const capabilityIdsByKey = await upsertCapabilities(supabase, allCapabilities)
  counts.capabilities = capabilityIdsByKey.size

  // ---- 5b. (removed, cap-v2 #161 cutover) item learning_items + caps + POS. --
  // The entire item branch — learning_items + anchor contexts, the DB-native POS
  // backfill, and item-cap writes (upsertCapabilitiesSkipIfExists) — moved to the
  // vocab module (publishVocabulary), which runs after this runner. The runner no
  // longer touches item rows/caps/POS, so there is no double-write.

  // ---- 5d. Pattern path (Slice 2 Task 6) — DB→DB grammar cutover. ----------
  // Runs BEFORE retire so the new pattern caps are in the emit set (not swept)
  // and the legacy pattern caps (excluded from the bundle in step 5a) ARE swept.
  // Only active when the lesson has typed grammar categories (usePatternPath).
  const regeneratePatternSlug = input.regenerate?.kind === 'pattern' ? input.regenerate.slug : null
  let patternResult: Awaited<ReturnType<typeof writePatternPath>> | null = null
  if (usePatternPath) {
    patternResult = await writePatternPath(
      supabase,
      {
        patternPlans: patternProjection.patternPlans,
        lessonId: input.lessonId,
        patternState: patternDb.patternState,
        pool: distractorPool.map((p) => ({
          indonesian_text: p.indonesian_text,
          l1_translation: p.l1_translation,
          item_type: p.item_type,
        })),
        regenerateSlug: regeneratePatternSlug,
      },
      { generateFn: hooks.generateGrammarFn },
    )
    // Merge new pattern cap ids into the emit set so retire preserves them.
    for (const [key, id] of patternResult.capIdsByKey) capabilityIdsByKey.set(key, id)
    counts.capabilities = capabilityIdsByKey.size
    counts.grammarExerciseRows += patternResult.exercisesWritten
    if (patternResult.retiredLegacySlugs.length > 0) {
      console.log(`   ✓ Cutover-deleted ${patternResult.retiredLegacySlugs.length} legacy grammar pattern(s): ${patternResult.retiredLegacySlugs.join(', ')}`)
    }
    console.log(`   ✓ Pattern path: ${patternResult.patternsUpserted} patterns, ${patternResult.exercisesWritten} typed exercises (${patternResult.patternsSkippedSeeded} seeded-skip, ${patternResult.patternsRegenerated} regenerated, ${patternResult.skippedPatternSlugs.length} declined, ${patternResult.droppedCount} dropped)`)
  }

  const capabilityIds = [...capabilityIdsByKey.values()]

  // PR 1.5: soft-retire any caps still attached to this lesson whose canonical_key
  // dropped out of the new emit set. upsertCapabilities above has already
  // un-retired anything the new emit set re-includes (retired_at=null), so this
  // sweep only catches genuine orphans. FSRS state + review history are
  // preserved (no DELETE); a future re-emission of the same canonical_key
  // reanimates the cap with state intact.
  // cap-v2 #161 cutover (landmine 8a): scope the sweep to the runner's OWN source
  // kinds. The vocab module (publishVocabulary) sweeps source_kind='item' for this
  // same lesson with its own emit set; an unscoped sweep here would retire all the
  // vocab module's live item caps (their keys are not in this emit set).
  const retired = await retireOrphanedCapabilities(supabase, {
    lessonId: input.lessonId,
    emittedKeys: [...capabilityIdsByKey.keys()],
    sourceKinds: ['dialogue_line', 'pattern', 'affixed_form_pair'],
  })
  if (retired.retiredCount > 0) {
    const previewKeys = retired.retiredKeys.slice(0, 5).join(', ')
    const suffix = retired.retiredKeys.length > 5 ? ', …' : ''
    console.log(`   ✓ Soft-retired ${retired.retiredCount} orphan capabilit${retired.retiredCount === 1 ? 'y' : 'ies'}: ${previewKeys}${suffix}`)
  }

  // ---- 6. Write — capability_content_units (junction). -----------------
  // Slice 5b (#147): re-derived DB-natively off content_unit `source_ref` — the
  // staging `capabilities[].contentUnitSlugs` metadata is retired. Each cap links
  // to the content_unit that shares its `source_ref`:
  //   item  cap (incl. audio) → learning_item    unit (learning_items/<nt>)
  //   affixed cap             → affixed_form_pair unit
  //   pattern cap             → grammar_pattern   unit (Decision E source_ref align)
  // dialogue_line cloze caps have NO content_unit (none shares their line source_ref)
  // and produce no junction — matching the live DB (0 dialogue_line junctions).
  // relationship_kind rule (content-pipeline-output.ts:578-581):
  //   capabilityType === 'l1_to_id_choice'   → 'introduced_by'
  //   capabilityType.includes('recognition') → 'introduced_by'  (incl. audio_recognition)
  //   else                                   → 'practiced_by'
  const unitIdBySourceRef = new Map<string, string>()
  for (const unit of dbContentUnits) {
    const unitId = contentUnitIdsBySlug.get(unit.unit_slug)
    if (unitId) unitIdBySourceRef.set(unit.source_ref, unitId)
  }
  // cap-v2 #161 cutover: item caps + their junctions moved to the vocab module.
  const junctionCaps: CapabilityInput[] = [
    ...newAffixedCaps,
    ...(usePatternPath ? patternProjection.patternPlans.flatMap((p) => p.capabilities) : []),
  ]
  const junctionInputs: CapabilityContentUnitInput[] = []
  let junctionsMissing = 0
  for (const cap of junctionCaps) {
    const capId = capabilityIdsByKey.get(cap.canonicalKey)
    const unitId = unitIdBySourceRef.get(cap.sourceRef)
    if (!capId || !unitId) {
      // Orphan — aggregated into one CS9 finding (no per-cap noise on a
      // systematic source_ref break).
      junctionsMissing++
      continue
    }
    const relationship_kind: CapabilityContentUnitInput['relationship_kind'] =
      cap.capabilityType === 'l1_to_id_choice' ? 'introduced_by'
      : cap.capabilityType.includes('recognition') ? 'introduced_by'
      : 'practiced_by'
    junctionInputs.push({ capability_id: capId, content_unit_id: unitId, relationship_kind })
  }
  if (junctionsMissing > 0) {
    findings.push({
      gate: 'CS9',
      severity: 'warning',
      message: `capability_content_units: ${junctionsMissing} cap(s) could not resolve a content_unit by source_ref (orphan caps)`,
    })
  }

  await upsertCapabilityContentUnits(supabase, junctionInputs)

  // ---- 7. (removed in Slice 4b) capability_artifacts write. ------------
  // The capability_artifacts table is dropped; non-item structure now lives in
  // the typed satellite tables (dialogue_clozes / affixed_form_pairs / the 4
  // grammar-exercise tables), written in steps 7b/7c/8 below. The legacy
  // staging-derived exercise-asset projection is fully retired (Slice 5b #147).

  // ---- 7b. Dialogue-line typed rows (Slice 3 — DB→DB). -----------------
  // The dialogue_clozes rows are projected from the in-stage generator output
  // (step 5a) onto the upserted cap ids; translations carried from the DB line
  // (R3). The SOLE persisted representation (renderContracts: dialogue_line → []);
  // structure is guaranteed by the typed table + validateDialogueClozes + HC15.
  // Replaces the legacy staging-driven projectDialogueArtifacts.
  const dialogueClozeRows = projectDialogueClozeRows(
    generatedDialogueClozes.clozes,
    capabilityIdsByKey,
  )
  findings.push(...dialogueClozeRows.findings)

  // Pre-write validator (PR 2) — fails CRITICAL on missing/malformed cloze
  // shape so the typed-table reader never has to defend against it at
  // runtime.
  const dialogueClozeFindings = validateDialogueClozes(dialogueClozeRows.dialogueClozes)
  findings.push(...dialogueClozeFindings)
  if (dialogueClozeFindings.some((f) => f.severity === 'error')) {
    return {
      status: 'validation_failed',
      counts,
      findings,
      durationMs: Date.now() - start,
    }
  }

  // ---- 7c. Affixed-form-pair typed rows (Decision A / PR 3 slice). ------
  // affixed_form_pair caps render from the typed `affixed_form_pairs` row — the
  // SOLE persisted representation. No capability_artifacts are emitted for them
  // (capabilityCatalog sets requiredArtifacts: [] → buildArtifactsForCapability
  // produces none); structure is guaranteed by the typed table's NOT NULL
  // columns + validateAffixedFormPairs + HC17. See projectors/morphology.ts.
  // Slice 3 (affixed repoint): the pairs come from the DB
  // (lesson_section_affixed_pairs) instead of staging morphology-patterns.ts. The
  // DB row's source_ref is byte-identical to the staging-derived
  // affixedFormPairSourceRef the caps were emitted with (verified against the live
  // DB — M-3), so cap.sourceRef ↔ pair join stays exact and canonical_keys are stable.
  // affixedPairsFromDb loaded in step 5a (affixed) — no second DB fetch needed.
  const affixedPairsBySourceRef = new Map<string, AffixedPairSource>(
    affixedPairsFromDb.map((p) => [
      p.source_ref,
      { root: p.root_text, derived: p.derived_text, allomorphRule: p.allomorph_rule },
    ]),
  )
  const affixedFormPairsResult = projectAffixedFormPairs({
    capabilities: allCapabilities,
    capabilityIdsByKey,
    pairsBySourceRef: affixedPairsBySourceRef,
    lessonId: input.lessonId,
  })
  findings.push(...affixedFormPairsResult.findings)

  // Pre-write validator (PR 3) — fails CRITICAL on missing/empty
  // root/derived/allomorph so the typed-table reader never has to defend
  // against it at runtime.
  const affixedFormPairFindings = validateAffixedFormPairs(affixedFormPairsResult.rows)
  findings.push(...affixedFormPairFindings)
  if (
    affixedFormPairsResult.findings.some((f) => f.severity === 'error')
    || affixedFormPairFindings.some((f) => f.severity === 'error')
  ) {
    return {
      status: 'validation_failed',
      counts,
      findings,
      durationMs: Date.now() - start,
    }
  }

  // PR 2 — typed dialogue_clozes table write. Replaces the trio of
  // capability_artifacts rows the reader used to read.
  const dialogueClozesLanded = await replaceDialogueClozes(
    supabase,
    dialogueClozeRows.dialogueClozes,
  )
  counts.dialogueClozes = dialogueClozesLanded

  // PR 3 — typed affixed_form_pairs table write. Replaces the two
  // capability_artifacts rows (root_derived_pair + allomorph_rule) the reader
  // used to read.
  const affixedFormPairsLanded = await replaceAffixedFormPairs(
    supabase,
    affixedFormPairsResult.rows,
  )
  counts.affixedFormPairs = affixedFormPairsLanded

  // ---- 7d. Readiness↔artifact reconciliation (2026-06-14 spec). ----------
  // Soft-retire any active+ready+published non-item cap whose required typed
  // satellite row is absent — so an unrenderable cap can never stay schedulable
  // (the live N−2 session-shrink bug). MUST run AFTER the satellite writes above
  // (a row written this run counts as present, so a just-fixed cap is not wrongly
  // retired) and BEFORE promotion (a cap retired this run is not re-promoted —
  // loadPromotionPlan filters retired_at IS NULL). Runs regardless of `status`
  // (a partial run from a CS22 cloze gap is exactly when caps go artifact-less)
  // and does NOT itself flip status to partial. Scoped to the runner's OWN source
  // kinds — the vocab module reconciles ['item'] for the same lesson (architect C1).
  const reconciled = await reconcileArtifactPresence(supabase, {
    lessonId: input.lessonId,
    sourceKinds: ['dialogue_line', 'pattern', 'affixed_form_pair'],
  })
  if (reconciled.retiredCount > 0) {
    const previewKeys = reconciled.retiredKeys.slice(0, 5).join(', ')
    const suffix = reconciled.retiredKeys.length > 5 ? ', …' : ''
    console.log(`   ✓ Soft-retired ${reconciled.retiredCount} cap(s) for missing artifact: ${previewKeys}${suffix}`)
  }

  // ---- 8. Write — grammar_patterns (PGRST205 fallback preserved). ------
  // Slice 2 (Task 6): when usePatternPath, the pattern path (step 5d) already
  // upserted the NEW patterns + cutover-deleted the legacy ones. Re-running the
  // legacy upsert here would RE-CREATE the legacy-slug patterns the cutover just
  // removed, so it is skipped; grammarPatternUpsert carries the new ids instead.
  // Slice 5b (#147): projectGrammar (staging grammar path) is retired. The
  // pattern path (step 5d) is the sole grammar writer for usePatternPath lessons
  // (all lessons, per D1); a !usePatternPath lesson simply has no grammar patterns.
  const grammarPatternUpsert =
    usePatternPath && patternResult
      ? { idsBySlug: patternResult.patternIdsBySlug, tableMissing: patternResult.tableMissing }
      : { idsBySlug: new Map<string, string>(), tableMissing: false }

  // ---- 9. (cap-v2 #161 cutover) learning_items moved to the vocab module. ---
  // The runner no longer writes item rows; the vocab module (publishVocabulary)
  // owns them. publishedItemIds is empty here, so CS8/CS9's item arms are no-ops
  // (the vocab gate covers the item layer — CS14/CS15/CS17).
  const publishedItemIds: string[] = []
  const dialogueItemIds = new Set<string>()
  counts.learningItems = 0

  // ---- 10. (retired Slice 5b #147) exercise_variants writer. -------------
  // The legacy staging-candidate-driven exercise_variants writer (both the
  // grammar and vocab branches) is gone. The pattern path (step 5d) writes the
  // typed grammar-exercise rows directly; NO source kind writes exercise_variants
  // anymore — this unblocks the #102/4c exercise_variants table drop. Staging
  // write-back #1 (candidates.ts published markers) is retired with it.
  const exerciseVariantIds: string[] = []
  counts.exerciseVariants = 0

  // ---- 11. (retired Slice 5b #147) cloze contexts writer. ----------------
  // projectCloze + the cloze item_contexts writer (upsertClozeContext) are gone.
  // The existing authored cloze item_contexts rows are LEFT IN THE DB (ADR 0011
  // seed-once) as #148's item-cloze substrate; this stage only stops re-seeding
  // them. No item-cloze caps are emitted here — #148 emits them DB-natively.
  // (The noClozeWriter enforcement test guards against accidental re-seed.)
  counts.clozeContexts = 0

  // ---- 12. Verify (CS7 → CS8 → CS9 → CS18). ---------------------------
  // Composed behind the Capability Gate post-write entry point (gate.ts).
  // cap-v2 #161 cutover: the item-kind verifiers (CS14 POS / CS15 coverage /
  // CS17 duplicates) moved to the vocab gate (publishVocabulary) — the runner no
  // longer writes item rows, so it passes no item gate inputs here.
  const postWriteFindings = await runCapabilityGatePostWrite(supabase, {
    lessonId: input.lessonId,
    declared: {
      contentUnits: contentUnitIds.length,
      grammarPatterns: patternResult?.patternsUpserted ?? 0,
      capabilities: allCapabilities.length,
      learningItems: publishedItemIds.length,
      exerciseVariants: exerciseVariantIds.length,
      clozeContexts: 0,
    },
    contentUnitIds,
    capabilityIds,
    learningItemIds: publishedItemIds,
    exerciseVariantIds,
    grammarPatternIds: [...grammarPatternUpsert.idsBySlug.values()],
    publishedItemIds,
    dialogueItemIds,
    // CS18: pattern coverage certification (Slice 2 Task 7) — only when the
    // pattern path ran. Certifies every written pattern has full per-type coverage.
    patternCoverageInput: usePatternPath && patternResult
      ? {
          patternIdsBySlug: patternResult.patternIdsBySlug,
          skippedSlugs: patternResult.skippedPatternSlugs,
        }
      : undefined,
  })
  findings.push(...postWriteFindings)

  // Staging write-back #2 (learning-items.ts published/deferred markers) retired
  // in Slice 5b (#147): learning_items are DB-authoritative (ADR 0011); the typed
  // path's idempotent upsert is the source of truth, so there is no staging file
  // to mark. The deferred-dialogue concept is gone with projectVocab.

  const status: CapabilityStageOutput['status'] =
    findings.some((f) => f.severity === 'error') ? 'partial' : 'ok'

  // ---- 13. Promote capabilities (replaces manual `npx tsx scripts/promote-capabilities.ts`). ----
  // Only when status is fully ok — never promote if seed-hooks flagged errors,
  // because promotion sets readiness_status='ready' and publication_status='published',
  // making the capability live at runtime. A partial publish should NOT auto-promote.
  if (status === 'ok') {
    try {
      const promotionPlan = await loadPromotionPlan({
        lesson: input.lessonNumber,
        sourceRef: `lesson-${input.lessonNumber}`,
        apply: true,
      })
      if (promotionPlan.promotions.length > 0) {
        await applyPromotionPlan(promotionPlan)
        console.log(`\n   ✓ Promoted ${promotionPlan.promotions.length} capabilities → readiness_status=ready, publication_status=published`)
        if (promotionPlan.blocked.length > 0) {
          console.log(`     ⚠ ${promotionPlan.blocked.length} capabilities blocked (not ready)`)
        }
      } else {
        console.log(`\n   No capabilities eligible for promotion (${promotionPlan.blocked.length} blocked)`)
      }
    } catch (err) {
      // Promotion failure is non-fatal — the capabilities are still written,
      // just stuck in draft. Surface as warning, return status: partial.
      console.warn(`\n   ⚠ Capability promotion failed: ${(err as Error).message}`)
      findings.push({
        gate: 'CS9',
        severity: 'warning',
        message: `Capability promotion failed: ${(err as Error).message}`,
      })
    }
  } else {
    console.log(`\n   Skipping capability promotion (status=${status})`)
  }

  // cap-v2 #161 cutover: the item POS-coverage log moved to the vocab module
  // (the runner no longer projects items).

  return {
    status,
    counts,
    findings,
    durationMs: Date.now() - start,
  }
}

export function buildLintStagingCommand(lessonNumber: number): {
  command: string
  args: string[]
} {
  // Bun executes .ts directly. Under node, route through the local tsx CLI
  // because node has no native TS support.
  const isBun = typeof (process.versions as { bun?: string }).bun === 'string'
  const args = isBun
    ? []
    : [path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')]
  args.push('scripts/lint-staging.ts', '--lesson', String(lessonNumber), '--severity', 'critical')
  return { command: process.execPath, args }
}
