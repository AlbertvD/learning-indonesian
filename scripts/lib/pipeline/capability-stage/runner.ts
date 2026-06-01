/**
 * capability-stage/runner.ts — Stage B entry point.
 *
 * Input boundary (the fold's only behavioural change vs legacy):
 *   { lessonNumber, lessonId, dryRun }
 *   → DB load for Stage A's outputs (lessons + sections + page-blocks + audio_clips)
 *   → staging-file load for everything downstream (learning-items / grammar-
 *      patterns / candidates / cloze-contexts / content-units / capabilities /
 *      exercise-assets / lesson-page-blocks — mirrors legacy 67–101 minus the
 *      `lesson.ts` read).
 *
 * Sequence (mirrors lesson-stage/runner.ts shape):
 *   1. Load Stage A outputs from DB + staging files from disk.
 *   2. Run pre-write validators (CS1–CS6). Errors short-circuit before writes.
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

import fs from 'node:fs'
import path from 'node:path'

import {
  EMPTY_COUNTS,
  type CapabilityStageInput,
  type CapabilityStageOutput,
  type ValidationFinding,
} from './model'
import {
  buildContentUnitsFromStaging,
  buildCapabilityStagingFromContent,
  affixedFormPairSourceRef,
  type StagingLessonInput,
} from '../../content-pipeline-output'
import {
  createSupabaseClient as defaultCreateSupabaseClient,
  findContextIdBySourceText,
  findLearningItemBySlug,
  insertExerciseVariantGrammar,
  insertExerciseVariantVocab,
  insertGrammarExerciseTyped,
  retireOrphanedCapabilities,
  upsertCapabilities,
  upsertCapabilitiesSkipIfExists,
  upsertCapabilityArtifacts,
  upsertCapabilityContentUnits,
  upsertClozeContext,
  upsertContentUnits,
  upsertGrammarPatterns,
  fetchGrammarPatternIdsBySlug,
  upsertItemAnchorContext,
  upsertLearningItem,
  upsertLearningItemIdempotent,
  replaceDialogueClozes,
  replaceAffixedFormPairs,
  fetchSeededDistractorCapIds,
  upsertRecognitionDistractors,
  upsertCuedRecallDistractors,
  deleteItemDistractors,
  type CapabilityArtifactInput,
  type CapabilityContentUnitInput,
  type CapabilityInput,
  type CapabilitySupabaseClient,
  type ContentUnitInput,
  type ItemDistractorRow,
} from './adapter'
import { loadLesson as defaultLoadLesson, type LoadedLesson } from './loader'
import { loadFromDb as defaultLoadFromDb, fetchDistractorPool as defaultFetchDistractorPool, loadPatternFromDb as defaultLoadPatternFromDb, type ItemDbResult, type PatternDbResult } from './loadFromDb'
import { writePatternPath } from './patternPath'
import { projectItemsFromTypedRows } from './projectors/vocab'
import { generateItemDistractors, type GenerateFn, type DistractorInputItem, type ItemDistractorSet } from './generateItemDistractors'
import { itemSlug } from '@/lib/capabilities'
import type { ItemCapForCoverageCheck } from './validators/itemCoverage'
import type { DistractorSetRow } from './validators/itemDistractors'

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

import { projectVocab } from './projectors/vocab'
import { projectGrammar, projectPatternsFromCategories } from './projectors/grammar'
import { buildGrammarExerciseRow } from './projectors/grammarExerciseRows'
import { projectCloze } from './projectors/cloze'
import { projectDialogueArtifacts } from './projectors/dialogueArtifacts'
import { projectAffixedFormPairs, type AffixedPairSource } from './projectors/morphology'

import { validateLessonIdPresence } from './validators/lessonId'
import { validateItemSourceRefResolvability } from './validators/itemSourceRefResolvability'
import { validateDialogueClozes } from './validators/dialogueClozes'
import { validateAffixedFormPairs } from './validators/affixedFormPairs'

import {
  markCandidatesPublished,
  markLearningItemsPublishedOrDeferred,
  markLearningItemsDeferralsOnly,
  writeLearningItemsWithEnrichedPos,
  type CandidateStagingRow,
  type LearningItemStagingRow,
} from './stagingWriteback'
import { enrichMissingPos } from './enrichPos'
import { enrichMissingLevel } from './enrichLevel'
import { propagateDialogueTranslationsToLearningItems } from './propagateDialogueTranslations'
import { loadPromotionPlan, applyPromotionPlan } from '../../../promote-capabilities'

import { validatePOS } from '../../validate-pos'

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
   * Injectable loadFromDb for tests. When provided, replaces the default DB load
   * of typed lesson_section_item_rows + existing item state. Allows tests to supply
   * known typed rows without mocking complex PostgREST join queries.
   */
  loadFromDb?: (supabase: CapabilitySupabaseClient, input: { lessonId: string }) => Promise<ItemDbResult>
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
}

export async function runCapabilityStage(
  input: CapabilityStageInput,
  hooks: CapabilityStageHooks = {},
): Promise<CapabilityStageOutput> {
  const start = Date.now()
  const findings: ValidationFinding[] = []
  const counts = { ...EMPTY_COUNTS }

  if (!input.lessonId && !input.dryRun) {
    throw new Error(
      'runCapabilityStage requires lessonId from runLessonStage output. ' +
      'CLI shim must short-circuit if Stage A status !== "ok".',
    )
  }

  const createClient = hooks.createSupabaseClient ?? defaultCreateSupabaseClient
  const loadLesson = hooks.loadLesson ?? defaultLoadLesson
  const loadFromDb = hooks.loadFromDb ?? defaultLoadFromDb
  const fetchDistractorPool = hooks.fetchDistractorPool ?? defaultFetchDistractorPool
  const loadPatternFromDb = hooks.loadPatternFromDb ?? defaultLoadPatternFromDb

  // ---- 1. Load (Stage A from DB + staging files from disk). ------------
  // Dry-run path: loader falls back to staging-only mode regardless of
  // service key — Stage A's dryRun returns an empty lessonId so we cannot
  // do the DB load anyway, and validation runs fine against the
  // equivalent `staging/lesson.ts` sections.
  const supabase: CapabilitySupabaseClient | null = input.dryRun ? null : createClient()
  const loaded: LoadedLesson = await loadLesson(supabase, {
    lessonNumber: input.lessonNumber,
    lessonId: input.lessonId,
  })
  const staging = loaded.staging

  // ---- 1b. Enrichment (pre-validation). --------------------------------
  // Backfill empty pos / level / translation_en / dialogue translations in-
  // process. The updated staging files are written back immediately so
  // (a) validation sees populated values, (b) the DB upsert writes them,
  // (c) subsequent runs skip the LLM calls. Skipped during dry-run.
  if (!input.dryRun) {
    const items = staging.learningItems as LearningItemStagingRow[]
    let learningItemsDirty = false

    // POS (LLM via Claude)
    const posResult = await enrichMissingPos(items.map((i) => ({
      base_text: i.base_text,
      item_type: i.item_type as 'word' | 'phrase' | 'sentence' | 'dialogue_chunk',
      translation_nl: i.translation_nl,
      translation_en: i.translation_en,
      pos: i.pos,
    })))
    if (posResult.posByBaseText.size > 0) {
      for (const item of items) {
        const pos = posResult.posByBaseText.get(item.base_text)
        if (pos) item.pos = pos
      }
      learningItemsDirty = true
    }

    // Level (deterministic — every item inherits lesson level)
    const levelResult = enrichMissingLevel(items, loaded.lesson.level)
    if (levelResult.filledCount > 0) {
      for (const item of items) {
        const level = levelResult.levelByBaseText.get(item.base_text)
        if (level) item.level = level
      }
      learningItemsDirty = true
      console.log(`   ✓ Level enrichment: ${levelResult.filledCount} items set to ${loaded.lesson.level}`)
    }

    // EN translations: NO LONGER generated here. Per ADR 0012 the Lesson Stage
    // owns all learner-facing translations — the EN enricher was relocated to
    // `lesson-stage/enrichEnTranslations.ts` (PR 6), widened to cover items +
    // dialogue + grammar. The Capability Stage still PROJECTS
    // learning_items.translation_en from staging `learning-items.ts` (which
    // already carries EN); it just stops filling missing EN. The eventual
    // capability-stage redesign (#98/#99) will read EN from the typed
    // lesson-content tables instead.

    // Dialogue translation propagation (deterministic — no LLM call here).
    // The LLM-driven enrichment of `lesson_sections.content.lines[].translation`
    // lives in lesson-stage. By the time we reach this code, Stage A has
    // already filled those translations, so `loaded.sections` carries them.
    // Our job: copy each populated dialogue line's translation across to the
    // matching `dialogue_chunk` learning_item's `translation_nl` (keyed by
    // base_text === line.text), so the deferred-dialogue gate in projectVocab
    // stops deferring otherwise-publishable dialogue chunks.
    const propagated = propagateDialogueTranslationsToLearningItems({
      sections: loaded.sections,
      learningItems: items,
    })
    if (propagated > 0) {
      learningItemsDirty = true
      console.log(`   ✓ Dialogue translation propagation: filled translation_nl on ${propagated} dialogue_chunk item(s) from lesson_sections`)
    }

    if (learningItemsDirty) {
      writeLearningItemsWithEnrichedPos(staging.stagingDir, items)
    }
  }

  // ---- 1b. Regenerate slice-10 snapshots from final enriched data. -----
  // Snapshots (content-units / capabilities / exercise-assets / lesson-page-
  // blocks) are derived state. `generate-staging-files.ts` builds them
  // BEFORE the LLM enrichment runs above, so they capture the pre-enrichment
  // view of `learning-items.ts` (e.g. empty translation_en).
  // Regenerate them here so the upsert at step 4 sees fresh translations,
  // morphology, and grammar pattern data. The deterministic builders run
  // pure on in-memory state — no DB or LLM call.
  const pipelineInput: StagingLessonInput = {
    lessonNumber: input.lessonNumber,
    lessonId: input.lessonId,
    lesson: {
      title: loaded.lesson.title,
      level: loaded.lesson.level,
      module_id: loaded.lesson.module_id,
      order_index: loaded.lesson.order_index,
      sections: loaded.sections.map((s) => ({
        title: s.title,
        order_index: s.order_index,
        content: s.content as { type: string; [key: string]: unknown },
      })),
    },
    learningItems: staging.learningItems as StagingLessonInput['learningItems'],
    grammarPatterns: staging.grammarPatterns as StagingLessonInput['grammarPatterns'],
    affixedFormPairs: staging.affixedFormPairs as StagingLessonInput['affixedFormPairs'],
  }
  const regeneratedContentUnits = buildContentUnitsFromStaging(pipelineInput)
  const regeneratedCapabilityPlan = buildCapabilityStagingFromContent({
    ...pipelineInput,
    contentUnits: regeneratedContentUnits,
    audioClipsByNormalizedText: loaded.audioClipsByNormalizedText,
  })

  // Replace the stale staging snapshots with fresh ones for the rest of the runner.
  // `as unknown as ...` widens the strict builder output to the loader's loose
  // `Record<string, unknown>[]` shape — narrower-than-the-field; safe.
  staging.contentUnits = regeneratedContentUnits as unknown as Array<Record<string, unknown>>
  staging.capabilities = regeneratedCapabilityPlan.capabilities as unknown as Array<Record<string, unknown>>
  staging.exerciseAssets = regeneratedCapabilityPlan.exerciseAssets as unknown as Array<Record<string, unknown>>

  // Write back to disk so subsequent runs see the same state and the linguist
  // reviewer can inspect what was published. Skipped during --dry-run because
  // we don't want dry-run to mutate the working tree.
  if (!input.dryRun) {
    fs.writeFileSync(
      path.join(staging.stagingDir, 'content-units.ts'),
      `// Regenerated by capability-stage runner\nexport const contentUnits = ${JSON.stringify(regeneratedContentUnits, null, 2)}\n`,
    )
    fs.writeFileSync(
      path.join(staging.stagingDir, 'capabilities.ts'),
      `// Regenerated by capability-stage runner\nexport const capabilities = ${JSON.stringify(regeneratedCapabilityPlan.capabilities, null, 2)}\n`,
    )
    fs.writeFileSync(
      path.join(staging.stagingDir, 'exercise-assets.ts'),
      `// Regenerated by capability-stage runner\nexport const exerciseAssets = ${JSON.stringify(regeneratedCapabilityPlan.exerciseAssets, null, 2)}\n`,
    )
  }

  // ---- 2. Validate (pre-write). ----------------------------------------
  // grammar_topics validation (GT1) is enforced by lesson-stage; by the time
  // Stage A's outputs land here, content.grammar_topics is already populated.
  // CS3/CS4/CS4b/CS5/CS6 — composed behind the Capability Gate pre-write entry
  // point (gate.ts). Same validators, same order, same findings — consolidated
  // to eliminate scattered inline calls.
  findings.push(...runCapabilityGatePreWrite({
    grammarPatterns: staging.grammarPatterns as Array<{ slug: string; pattern_name: string; complexity_score: number }>,
    candidates: staging.candidates as Array<{ exercise_type?: string; grammar_pattern_slug?: string | null; payload?: Record<string, unknown> | null; review_status?: string }>,
    learningItems: staging.learningItems as Array<{ base_text: string; item_type: string; context_type?: string; translation_nl?: string | null; translation_en?: string | null; pos?: string | null }>,
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
    console.log(`\n[DRY RUN] Lesson ${input.lessonNumber} validation passed.`)
    console.log(`   Would publish: ${staging.contentUnits.length} content units, ${staging.capabilities.length} capabilities, ${staging.exerciseAssets.length} artifacts,`)
    console.log(`                  ${staging.grammarPatterns.length} grammar patterns, ${staging.learningItems.length} learning items, ${staging.candidates.length} exercise candidates, ${staging.clozeContexts.length} cloze contexts.`)
    return {
      status: 'ok',
      counts,
      findings,
      durationMs: Date.now() - start,
    }
  }

  // ---- 3. Project (pure). ----------------------------------------------
  const vocab = projectVocab({
    lessonNumber: input.lessonNumber,
    lessonId: input.lessonId,
    level: loaded.lesson.level,
    sections: loaded.sections,
    learningItems: staging.learningItems as never,
    clozeContexts: staging.clozeContexts as never,
  })
  const grammar = projectGrammar({
    lessonNumber: input.lessonNumber,
    lessonId: input.lessonId,
    grammarPatterns: staging.grammarPatterns as never,
    candidates: staging.candidates as never,
  })
  const cloze = projectCloze({ clozeContexts: staging.clozeContexts as never })

  // Past this point we MUST have a Supabase client — writes happen below.
  if (!supabase) {
    throw new Error('runCapabilityStage reached the write phase without a Supabase client (dry-run paths must short-circuit earlier)')
  }
  // ---- 4. Write — content_units. ---------------------------------------
  const stagedContentUnits = staging.contentUnits as Array<ContentUnitInput>
  const contentUnitIdsBySlug = await upsertContentUnits(supabase, stagedContentUnits)
  counts.contentUnits = contentUnitIdsBySlug.size
  const contentUnitIds = [...contentUnitIdsBySlug.values()]

  // ---- 5. Write — learning_capabilities. -------------------------------
  // Capabilities come pre-built from staging (capabilities.ts produced upstream
  // by materialize-capabilities.ts). Decision 5b appends contextual_cloze rows
  // for dialogue lines that have cloze contexts. Decision 3b (ADR 0006) stamps
  // lesson_id on every lesson-derived capability — the runner is invoked per
  // lesson, so the projecting lesson IS the introducing lesson by construction.
  // Decision 3's morphology tie-break is preserved as a special case: only
  // morphology-introducing lessons emit affixed_form_pair capabilities, so
  // those rows still get the rule-introducing lesson's id. Podcasts are not
  // projected here; they're carved out from the lesson_id invariant.

  // ---- 5a. Pre-load DB→DB item state (needed for legacy-bundle filter). ---
  // The item DB load is moved here (before the legacy-bundle filter) so we can
  // build the key set that the new path will emit. This allows the filter to be
  // key-set-based rather than source-kind-based, preserving audio caps
  // (audio_recognition, dictation) and other item caps that the new path does
  // NOT emit (only the 4 base text caps are projected by projectItemsFromTypedRows).
  // The itemDbResult and itemProjection are consumed by step 5b below.
  const itemDbResult = await loadFromDb(supabase, { lessonId: input.lessonId })
  const distractorPool = await fetchDistractorPool(supabase)
  const itemProjection = projectItemsFromTypedRows({
    rows: itemDbResult.items,
    lessonId: input.lessonId,
    level: loaded.lesson.level,
  })
  // Keys that the new DB→DB path (upsertCapabilitiesSkipIfExists) will write.
  // These are EXCLUDED from the legacy bundle to prevent double-writes.
  // Everything else — audio caps (audio_recognition, dictation) and
  // sentence/dialogue_chunk item caps — stays in the legacy bundle.
  const allItemCaps = itemProjection.perItemPlans.flatMap((p) => p.capabilities)
  const newPathEmittedKeys = new Set(allItemCaps.map((c) => c.canonicalKey))

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

  const stagedCapabilities = (staging.capabilities as Array<{
    canonicalKey: string
    sourceKind: string
    sourceRef: string
    capabilityType: string
    direction: string
    modality: string
    learnerLanguage: string
    projectionVersion: string
    requiredArtifacts: string[]
    prerequisiteKeys?: string[]
  }>)
    // Constraint #1 (Task 6c): item caps written by the new path are excluded from
    // the legacy bundle to prevent double-writes. Only the EXACT canonical keys
    // emitted by projectItemsFromTypedRows are excluded — audio caps
    // (audio_recognition, dictation when item.hasAudio) and sentence/dialogue_chunk
    // item caps flow through this legacy path unchanged, preserving them from
    // the retireOrphanedCapabilities orphan sweep.
    // Slice 2 (Task 6): when usePatternPath, ALSO exclude every pattern-kind cap
    // (the new path owns them all — see the sourceKind rationale in step 5a).
    .filter((capability) => !newPathEmittedKeys.has(capability.canonicalKey))
    .filter((capability) => !(usePatternPath && capability.sourceKind === 'pattern'))
    .map((capability): CapabilityInput => ({
    canonicalKey: capability.canonicalKey,
    sourceKind: capability.sourceKind,
    sourceRef: capability.sourceRef,
    capabilityType: capability.capabilityType,
    direction: capability.direction,
    modality: capability.modality,
    learnerLanguage: capability.learnerLanguage,
    projectionVersion: capability.projectionVersion,
    lessonId: input.lessonId,
    requiredArtifacts: capability.requiredArtifacts,
    prerequisiteKeys: capability.prerequisiteKeys ?? [],
  }))
  const allCapabilities: CapabilityInput[] = [
    ...stagedCapabilities,
    ...vocab.contextualClozeCapabilities,
  ]
  // Decision 3b (ADR 0006): refuse to write any lesson-derived capability with
  // null lesson_id. Podcast source kinds are exempt — see the validator.
  validateLessonIdPresence(allCapabilities)
  // Issue #59: refuse to write any item-source-kind capability whose source_ref
  // slug does not match a learning_item in this snapshot. The validator
  // accepts a minimal structural type ({ base_text: string }) so no cast from
  // LearningItemStagingRow → LearningItemInput is needed.
  validateItemSourceRefResolvability(
    allCapabilities,
    staging.learningItems as ReadonlyArray<{ base_text: string }>,
  )
  const capabilityIdsByKey = await upsertCapabilities(supabase, allCapabilities)
  counts.capabilities = capabilityIdsByKey.size

  // ---- 5b. Write — item capabilities via DB→DB path (Task 6c). -----------
  // Item-source-kind learning_items + caps are projected from typed DB rows
  // (lesson_section_item_rows) instead of staging files (ADR 0011/0012).
  // itemDbResult, distractorPool, itemProjection, and allItemCaps were loaded in
  // step 5a (before the legacy-bundle filter) so the key set was available.
  // This path runs after the staging vocab path (step 5) but before retire so
  // item cap keys are included in emittedKeys for the orphan sweep.
  //
  // Item learning_items are written via upsertLearningItemIdempotent:
  //   - On INSERT: full payload including pos, level, base_text, translations.
  //   - On UPDATE (existing normalized_text): refreshes ONLY translation columns;
  //     pos/level/base_text/is_active are preserved (DB-authoritative per ADR 0011).
  // Item caps are written via upsertCapabilitiesSkipIfExists (INSERT ... ON CONFLICT
  // DO NOTHING): existing caps' FSRS state is never disturbed on re-publish.

  // Resolve which normalized_text to force-regenerate (--regenerate flag).
  const regenerateNormalizedText = input.regenerate?.kind === 'item'
    ? itemSlug(input.regenerate.normalizedText)
    : null

  // Write item learning_items + anchor contexts.
  const itemIdsByNormalizedText = new Map<string, string>()
  for (const plan of itemProjection.perItemPlans) {
    const written = await upsertLearningItemIdempotent(supabase, plan.learningItemInput)
    itemIdsByNormalizedText.set(plan.normalizedText, written.id)
    await upsertItemAnchorContext(supabase, {
      learning_item_id: written.id,
      context_type: plan.anchorContext.context_type,
      source_text: plan.anchorContext.source_text,
      translation_text: plan.anchorContext.translation_text,
      source_lesson_id: input.lessonId,
    })
  }

  // Write item caps via skip-if-exists. Returns only newly-inserted rows;
  // existing rows (already seeded) are not in the returned map.
  // allItemCaps was declared in step 5a (before the legacy-bundle filter).
  const newItemCapIdsByKey = await upsertCapabilitiesSkipIfExists(supabase, allItemCaps)

  // Build a complete canonicalKey→id map for item caps by merging:
  //   1. Newly inserted rows (from upsertCapabilitiesSkipIfExists return value)
  //   2. Already-existing rows (from the pre-loaded itemState map)
  // This is needed for the distractor cap ID lookup and for the orphan sweep.
  const itemCapIdsByKey = new Map<string, string>()
  for (const cap of allItemCaps) {
    const existingCap = itemDbResult.itemState.existingItemCapsByCanonicalKey.get(cap.canonicalKey)
    const newId = newItemCapIdsByKey.get(cap.canonicalKey)
    const id = newId ?? existingCap?.id
    if (id) itemCapIdsByKey.set(cap.canonicalKey, id)
  }

  // Merge item cap IDs into capabilityIdsByKey so retireOrphanedCapabilities
  // includes them in emittedKeys (preventing them from being soft-retired).
  for (const [key, id] of itemCapIdsByKey) {
    capabilityIdsByKey.set(key, id)
  }
  counts.capabilities = capabilityIdsByKey.size

  // ---- 5c. Item distractors — generation gate + write. -------------------
  // recognition_mcq_distractors is the canonical seeded-state signal.
  // Caps already in the table are skipped. The --regenerate path deletes
  // existing distractors for the target item before this check runs.
  const itemCapIds = [...itemCapIdsByKey.values()]
  const seededCapIds = await fetchSeededDistractorCapIds(supabase, itemCapIds)

  // --regenerate: delete existing distractors for the target item first.
  if (regenerateNormalizedText !== null) {
    // Find the caps for this normalized_text (4 caps per item).
    const targetItemRef = `learning_items/${regenerateNormalizedText}`
    const targetCapIds = allItemCaps
      .filter((cap) => cap.sourceRef === targetItemRef)
      .map((cap) => itemCapIdsByKey.get(cap.canonicalKey))
      .filter((id): id is string => id !== undefined)
    if (targetCapIds.length > 0) {
      await deleteItemDistractors(supabase, targetCapIds)
      // Remove from seeded set so generation runs.
      for (const id of targetCapIds) seededCapIds.delete(id)
    }
  }

  // Determine which items need distractor generation (cap not yet seeded).
  const itemsNeedingDistractors = itemProjection.perItemPlans.filter((plan) => {
    // An item needs generation if ANY of its caps is unseeded.
    // (All 4 caps are written atomically by upsertItemDistractors, so
    // we check the recognition cap — the seeded-state canonical signal.)
    return plan.capabilities.some((cap) => {
      const capId = itemCapIdsByKey.get(cap.canonicalKey)
      return capId !== undefined && !seededCapIds.has(capId)
    })
  })

  // Convert perItemPlans → DistractorInputItem format for the generator.
  const distractorItems = itemsNeedingDistractors.map((plan) => ({
    source_item_ref: plan.normalizedText,
    item_type: plan.row.item_type,
    indonesian_text: plan.row.indonesian_text,
    l1_translation: plan.row.l1_translation,
  }))

  // Accumulate generated distractor sets for CS16 gate input.
  // Declared outside the if block so the post-write gate can consume it.
  const generatedDistractorSets = new Map<string, ItemDistractorSet>()

  let itemDistractorSetsWritten = 0
  if (distractorItems.length > 0) {
    const generationResult = await generateItemDistractors(distractorItems, distractorPool, {
      generateFn: hooks.generateFn,
    })

    // Capture generated sets for CS16 gate input (before writing to DB).
    for (const [ref, distSet] of generationResult.distractorsBySourceItemRef) {
      generatedDistractorSets.set(ref, distSet)
    }

    // Build per-table distractor rows: ONE row per item per table, keyed by
    // the cap whose exercise the table serves.
    //
    //   recognition_mcq_distractors ← text_recognition cap
    //     (recognition_mcq reads this table; text_recognition drives recognition_mcq)
    //   cued_recall_distractors     ← l1_to_id_choice cap
    //     (cued_recall builder reads this table; l1_to_id_choice is the primary
    //     cued-recall cap — form_recall also serves cued_recall but l1_to_id_choice
    //     is the direct cap, so we key on it per renderContracts.ts:70)
    //   cloze_mcq_item_distractors  ← NOT written for items in this slice.
    //     The 4 base item caps (text_recognition, l1_to_id_choice, meaning_recall,
    //     form_recall) do NOT include a contextual_cloze cap, which is the cap
    //     the cloze_mcq builder reads for item-sourced cloze. Deferred until the
    //     item cloze cap is projected (likely Task 8 reader wiring).
    //
    // This satisfies the per-cap 1:1 schema invariant: capability_id is the PK
    // in each distractor table; writing 4 rows per item keyed to non-matching
    // cap types would create rows that the runtime builder can never resolve.
    const distractorRows: ItemDistractorRow[] = []
    for (const [sourceItemRef, distSet] of generationResult.distractorsBySourceItemRef) {
      const matchingPlan = itemProjection.perItemPlans.find(
        (p) => p.normalizedText === sourceItemRef,
      )
      if (!matchingPlan) continue

      // recognition_mcq_distractors ← text_recognition cap
      const textRecCap = matchingPlan.capabilities.find(
        (cap) => cap.capabilityType === 'text_recognition',
      )
      const textRecCapId = textRecCap ? itemCapIdsByKey.get(textRecCap.canonicalKey) : undefined
      if (textRecCapId) {
        distractorRows.push({
          capability_id: textRecCapId,
          recognition: distSet.recognition_distractors_nl,
          cued_recall: [],    // not used for this table — adapter writes recognition array
          cloze: [],          // not used for this table
        })
      }

      // cued_recall_distractors ← l1_to_id_choice cap
      const l1ToIdCap = matchingPlan.capabilities.find(
        (cap) => cap.capabilityType === 'l1_to_id_choice',
      )
      const l1ToIdCapId = l1ToIdCap ? itemCapIdsByKey.get(l1ToIdCap.canonicalKey) : undefined
      if (l1ToIdCapId) {
        distractorRows.push({
          capability_id: l1ToIdCapId,
          recognition: [],    // not used for this table
          cued_recall: distSet.cued_recall_distractors_id,
          cloze: [],          // not used for this table
        })
      }

      // cloze_mcq_item_distractors: deferred — no contextual_cloze cap in the
      // 4 base item caps emitted by projectItemsFromTypedRows in this slice.
      // When the item cloze cap is added (Task 8), this block writes it.
    }

    if (distractorRows.length > 0) {
      // Per-cap-1:1 writes: route each row to its target table.
      // recognition rows (text_recognition caps) → recognition_mcq_distractors
      const recognitionRowsToWrite = distractorRows
        .filter((r) => r.recognition.length > 0)
        .map((r) => ({ capability_id: r.capability_id, distractors: r.recognition }))
      // cued_recall rows (l1_to_id_choice caps) → cued_recall_distractors
      const cuedRecallRowsToWrite = distractorRows
        .filter((r) => r.cued_recall.length > 0)
        .map((r) => ({ capability_id: r.capability_id, distractors: r.cued_recall }))
      // cloze_mcq_item_distractors: no rows in this slice (deferred — see comment above).

      const recResult = await upsertRecognitionDistractors(supabase, recognitionRowsToWrite)
      await upsertCuedRecallDistractors(supabase, cuedRecallRowsToWrite)
      // itemDistractorSets is keyed to recognition table written count
      // (the canonical seeded-state signal — if recognition has a row, cued_recall was also written).
      itemDistractorSetsWritten = recResult.written
    }
  }
  counts.itemDistractorSets = itemDistractorSetsWritten

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
  const retired = await retireOrphanedCapabilities(supabase, {
    lessonId: input.lessonId,
    emittedKeys: [...capabilityIdsByKey.keys()],
  })
  if (retired.retiredCount > 0) {
    const previewKeys = retired.retiredKeys.slice(0, 5).join(', ')
    const suffix = retired.retiredKeys.length > 5 ? ', …' : ''
    console.log(`   ✓ Soft-retired ${retired.retiredCount} orphan capabilit${retired.retiredCount === 1 ? 'y' : 'ies'}: ${previewKeys}${suffix}`)
  }

  // ---- 6. Write — capability_content_units (junction). -----------------
  // Junction rows come from staging capabilities[].contentUnitSlugs +
  // capabilities[].relationshipKind (legacy 281–297).
  const stagedJunctions = staging.capabilities as Array<{
    canonicalKey: string
    contentUnitSlugs?: string[]
    relationshipKind?: 'introduced_by' | 'practiced_by' | 'assessed_by' | 'referenced_by'
  }>
  const junctionInputs: CapabilityContentUnitInput[] = []
  for (const cap of stagedJunctions) {
    const capId = capabilityIdsByKey.get(cap.canonicalKey)
    if (!capId) continue
    for (const slug of cap.contentUnitSlugs ?? []) {
      const unitId = contentUnitIdsBySlug.get(slug)
      if (!unitId) continue
      junctionInputs.push({
        capability_id: capId,
        content_unit_id: unitId,
        relationship_kind: cap.relationshipKind ?? 'referenced_by',
      })
    }
  }
  await upsertCapabilityContentUnits(supabase, junctionInputs)

  // ---- 7. Write — capability_artifacts (from staging exerciseAssets). --
  const stagedAssets = staging.exerciseAssets as Array<{
    asset_key: string
    capability_key: string
    artifact_kind: string
    quality_status: 'draft' | 'approved' | 'blocked'
    payload_json?: Record<string, unknown>
  }>
  const artifactInputs: CapabilityArtifactInput[] = []
  for (const asset of stagedAssets) {
    const capId = capabilityIdsByKey.get(asset.capability_key)
    if (!capId) continue
    // Decision R/Q (PR 1): item-sourced caps no longer use capability_artifacts.
    // Translations come from learning_items.translation_{nl,en} (Decision R) and
    // audio from capability_audio_refs (Decision Q). Skipping here stops writing
    // stale artifact rows; the reader (byKind/item.ts) does not read them.
    if (asset.capability_key.startsWith("item:")) continue
    artifactInputs.push({
      capability_id: capId,
      artifact_kind: asset.artifact_kind,
      quality_status: asset.quality_status,
      artifact_ref: asset.asset_key,
      artifact_json: asset.payload_json ?? {},
      artifact_fingerprint: asset.asset_key,
    })
  }

  // ---- 7b. Dialogue-line typed rows (Decision 5b / PR 2 slice). ---------
  // Dialogue-line caps are appended downstream by projectVocab
  // (vocab.ts:163-203). Their renderable data is the typed `dialogue_clozes`
  // row, written via `replaceDialogueClozes` below — the SOLE persisted
  // representation. No capability_artifacts are emitted for dialogue_line
  // (renderContracts: dialogue_line → []); structure is guaranteed by the typed
  // table + validateDialogueClozes + HC15. See projectors/dialogueArtifacts.ts.
  const dialogueArtifactsResult = projectDialogueArtifacts({
    contextualClozeCapabilities: vocab.contextualClozeCapabilities,
    capabilityIdsByKey,
    clozeContexts: staging.clozeContexts as never,
    sections: loaded.sections,
  })
  findings.push(...dialogueArtifactsResult.findings)

  // Pre-write validator (PR 2) — fails CRITICAL on missing/malformed cloze
  // shape so the typed-table reader never has to defend against it at
  // runtime.
  const dialogueClozeFindings = validateDialogueClozes(dialogueArtifactsResult.dialogueClozes)
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
  // The pairs are keyed by the SAME affixedFormPairSourceRef the caps were
  // emitted with, so cap.sourceRef ↔ pair join is exact.
  const affixedPairsBySourceRef = new Map<string, AffixedPairSource>(
    (pipelineInput.affixedFormPairs ?? []).map((p) => [
      affixedFormPairSourceRef(input.lessonNumber, p),
      { root: p.root, derived: p.derived, allomorphRule: p.allomorphRule },
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

  const capabilityArtifactIds = await upsertCapabilityArtifacts(supabase, artifactInputs)
  counts.capabilityArtifacts = capabilityArtifactIds.length

  // PR 2 — typed dialogue_clozes table write. Replaces the trio of
  // capability_artifacts rows the reader used to read.
  const dialogueClozesLanded = await replaceDialogueClozes(
    supabase,
    dialogueArtifactsResult.dialogueClozes,
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

  // ---- 8. Write — grammar_patterns (PGRST205 fallback preserved). ------
  // Slice 2 (Task 6): when usePatternPath, the pattern path (step 5d) already
  // upserted the NEW patterns + cutover-deleted the legacy ones. Re-running the
  // legacy upsert here would RE-CREATE the legacy-slug patterns the cutover just
  // removed, so it is skipped; grammarPatternUpsert carries the new ids instead.
  const grammarPatternUpsert =
    usePatternPath && patternResult
      ? { idsBySlug: patternResult.patternIdsBySlug, tableMissing: patternResult.tableMissing }
      : await upsertGrammarPatterns(supabase, grammar.grammarPatterns)

  // ---- 9. Write — learning_items + anchor contexts. -----------------------
  // Decision R (PR 1): translations now written to learning_items.translation_{nl,en}
  // directly via upsertLearningItem (the learningItemInput carries the fields).
  // replaceItemMeanings is NO LONGER called for item caps — item_meanings rows
  // become stale and will be dropped in the final cleanup PR (PR 7).
  const publishedItemIds: string[] = []
  const dialogueItemIds = new Set<string>()
  for (const plan of vocab.perItemPlans) {
    const item = await upsertLearningItem(supabase, plan.learningItemInput)
    publishedItemIds.push(item.id)
    if (plan.item.item_type === 'dialogue_chunk') dialogueItemIds.add(item.id)
    await upsertItemAnchorContext(supabase, {
      learning_item_id: item.id,
      context_type: plan.anchorContext.context_type,
      source_text: plan.anchorContext.source_text,
      translation_text: plan.anchorContext.translation_text,
      source_lesson_id: input.lessonId,
    })
  }
  counts.learningItems = publishedItemIds.length
  counts.deferredDialogueChunks = vocab.deferredDialogueKeys.size

  // ---- 10. Write — exercise_variants. -----------------------------------
  const patternIdsBySlug = grammarPatternUpsert.tableMissing
    ? new Map<string, string>()
    : await fetchGrammarPatternIdsBySlug(supabase)
  // Slice 2 (Task 6): seed with the pattern path's exercise_variants (the
  // grammar dual-write moved there); the legacy grammar branch below is skipped
  // when usePatternPath. `legacyVariantsLanded` tracks ONLY the legacy loop's
  // landings (for the staging write-back gate, which concerns staging candidates).
  const exerciseVariantIds: string[] = usePatternPath && patternResult
    ? [...patternResult.exerciseVariantIds]
    : []
  let legacyVariantsLanded = 0
  let grammarExerciseRowsLanded = 0
  for (const variant of grammar.exerciseVariants) {
    if (variant.kind === 'grammar') {
      // Pattern path owns grammar exercises when active — skip the legacy
      // staging-candidate-driven grammar write entirely.
      if (usePatternPath) continue
      const grammarPatternId = variant.grammarPatternSlug
        ? patternIdsBySlug.get(variant.grammarPatternSlug) ?? null
        : null
      if (variant.grammarPatternSlug && !grammarPatternId) continue
      const result = await insertExerciseVariantGrammar(supabase, {
        lesson_id: variant.lessonId,
        exercise_type: variant.exercise_type,
        grammar_pattern_id: grammarPatternId,
        payload_json: variant.payload_json,
        answer_key_json: variant.answer_key_json,
      })
      if (result.ok && result.id) { exerciseVariantIds.push(result.id); legacyVariantsLanded++ }

      // PR 4 dual-write: also land the typed grammar-exercise row. Keyed by
      // grammar_pattern_id (NOT capability_id). The shared mapper + CS13
      // validator + DB NOT NULL guard the shape; a DB error fails loud.
      if (grammarPatternId) {
        const built = buildGrammarExerciseRow(variant.exercise_type, variant.payload_json, variant.answer_key_json)
        if (built) {
          const typedResult = await insertGrammarExerciseTyped(supabase, built.table, {
            ...built.columns,
            grammar_pattern_id: grammarPatternId,
            lesson_id: variant.lessonId,
          })
          if (!typedResult.ok) {
            throw new Error(`PR4 typed grammar-exercise write failed (${built.table}, ${variant.exercise_type}): ${typedResult.error}`)
          }
          grammarExerciseRowsLanded++
        }
      }
    } else {
      const contextId = await findContextIdBySourceText(supabase, variant.sourceText)
      if (!contextId) continue
      const grammarPatternId = variant.grammarPatternSlug
        ? patternIdsBySlug.get(variant.grammarPatternSlug) ?? null
        : null
      const result = await insertExerciseVariantVocab(supabase, {
        context_id: contextId,
        exercise_type: variant.exercise_type,
        grammar_pattern_id: grammarPatternId,
        payload_json: variant.payload_json,
        answer_key_json: variant.answer_key_json,
      })
      if (result.ok && result.id) { exerciseVariantIds.push(result.id); legacyVariantsLanded++ }
    }
  }
  const exerciseVariantsLanded = exerciseVariantIds.length
  counts.exerciseVariants = exerciseVariantsLanded
  // Additive: 5d already counted the pattern path's typed rows; this adds the
  // legacy loop's (0 when usePatternPath).
  counts.grammarExerciseRows += grammarExerciseRowsLanded

  // Staging write-back #1 — mirror legacy 712–722. After exercise_variants
  // land + count verification, mark approved candidates as `published` in
  // candidates.ts so re-runs skip them. Only proceeds when the count check
  // confirms rows are actually in DB. Slice 2 (Task 6): the count is over the
  // LEGACY loop only — the pattern path's grammar exercises come from the DB,
  // not staging candidates.ts, so they are out of scope for this write-back.
  const legacyVariantCount = usePatternPath
    ? grammar.exerciseVariants.filter((v) => v.kind !== 'grammar').length
    : grammar.exerciseVariants.length
  if (legacyVariantsLanded > 0 && legacyVariantsLanded >= legacyVariantCount) {
    markCandidatesPublished(staging.stagingDir, staging.candidates as CandidateStagingRow[])
    console.log(`   ✓ candidates.ts marked published in staging (${legacyVariantsLanded} rows)`)
  } else if (legacyVariantCount > 0) {
    console.warn(`   ⚠ Expected ${legacyVariantCount} legacy exercise_variants, landed ${legacyVariantsLanded} — staging NOT marked published`)
  }

  // ---- 11. Write — cloze contexts. -------------------------------------
  let clozeLanded = 0
  for (const plan of cloze.plans) {
    const item = await findLearningItemBySlug(supabase, plan.learning_item_slug)
    if (!item) continue
    const result = await upsertClozeContext(supabase, {
      learning_item_id: item.id,
      source_text: plan.source_text,
      translation_text: plan.translation_text,
      difficulty: plan.difficulty,
      topic_tag: plan.topic_tag,
      source_lesson_id: input.lessonId,
    })
    if (!result.skipped) clozeLanded++
  }
  counts.clozeContexts = clozeLanded

  // ---- 12. Verify (CS7 → CS8 → CS9 → CS14 → CS15 → CS16 → CS17). -------
  // Composed behind the Capability Gate post-write entry point (gate.ts).
  // Same verifiers, same order, same findings — the cs9HasError check below
  // filters by gate: 'CS9' instead of using the now-inlined integrityReport.

  // ---- CS14 (item POS) — writtenItems from the item projector. -----------
  // projectItemsFromTypedRows emits pos=null for all items because
  // lesson_section_item_rows has no pos column (POS is the Lesson Stage's job,
  // per ADR 0012). CS14 will emit WARNINGs for null-pos word/phrase items. This
  // is the gate correctly surfacing a real state: item POS is not yet populated
  // on the new DB→DB path. A follow-up task (after Lesson Stage POS enrichment
  // is proven) will propagate POS into the typed rows.
  const writtenItems = itemProjection.perItemPlans.map((plan) => ({
    normalized_text: plan.normalizedText,
    item_type: plan.learningItemInput.item_type,
    pos: plan.learningItemInput.pos ?? null,
  }))

  // ---- CS15 (item distractor coverage) — per-cap distractor presence flag. --
  // An item cap is considered "covered" if its capId was in seededCapIds before
  // generation (already seeded on a prior run) OR if the item appears in
  // generatedDistractorSets (newly generated this run). All 4 caps per item
  // share coverage status because distractors are written atomically per item.
  const itemCapsWithDistractorFlag: ItemCapForCoverageCheck[] = allItemCaps.map((cap) => {
    const capId = itemCapIdsByKey.get(cap.canonicalKey)
    const isSeededAlready = capId !== undefined && seededCapIds.has(capId)
    const isGeneratedThisRun = generatedDistractorSets.has(
      // sourceRef is 'learning_items/<normalizedText>'
      cap.sourceRef.replace(/^learning_items\//, ''),
    )
    return {
      capabilityKey: cap.canonicalKey,
      normalizedText: cap.sourceRef.replace(/^learning_items\//, ''),
      hasDistractors: isSeededAlready || isGeneratedThisRun,
    }
  })

  // ---- CS16 (item distractor quality) — build DistractorSetRow[] for each ----
  // generated set. Uses the distractorPool's normalized_texts as the in-pool set.
  // Only newly generated sets are validated here (pre-existing seeded sets were
  // checked on their own publish run; re-checking on every idempotent re-run
  // would produce redundant noise).
  const poolNormalizedTexts = new Set<string>([
    ...distractorPool.map((p) => p.source_item_ref.toLowerCase()),
    // Also include items written this run (becak ordering: in pool post-write).
    ...[...itemIdsByNormalizedText.keys()].map((k) => k.toLowerCase()),
  ])
  const distractorSetRows: DistractorSetRow[] = []
  for (const [sourceItemRef, distSet] of generatedDistractorSets) {
    const plan = itemProjection.perItemPlans.find((p) => p.normalizedText === sourceItemRef)
    if (!plan) continue
    const textRecCap = plan.capabilities.find((c) => c.capabilityType === 'text_recognition')
    if (textRecCap) {
      distractorSetRows.push({
        capabilityKey: textRecCap.canonicalKey,
        answerText: sourceItemRef,
        arrayName: 'recognition_distractors_nl',
        distractors: distSet.recognition_distractors_nl as unknown as string[],
        isIndonesian: false, // NL Dutch — not Indonesian
      })
    }
    const l1ToIdCap = plan.capabilities.find((c) => c.capabilityType === 'l1_to_id_choice')
    if (l1ToIdCap) {
      distractorSetRows.push({
        capabilityKey: l1ToIdCap.canonicalKey,
        answerText: sourceItemRef,
        arrayName: 'cued_recall_distractors_id',
        distractors: distSet.cued_recall_distractors_id as unknown as string[],
        isIndonesian: true, // Indonesian filler words
      })
    }
    // cloze_distractors_id: deferred — no cloze cap in base 4 item caps (Task 8).
  }
  const distractorSetsInput = { sets: distractorSetRows, poolNormalizedTexts }

  // ---- CS17 (cross-lesson duplicates) — normalized texts written this run. ---
  const itemDuplicatesInput = {
    lessonId: input.lessonId,
    lessonNumber: input.lessonNumber,
    writtenNormalizedTexts: [...itemIdsByNormalizedText.keys()],
  }

  const postWriteFindings = await runCapabilityGatePostWrite(supabase, {
    lessonId: input.lessonId,
    declared: {
      contentUnits: stagedContentUnits.length,
      // Slice 2 (Task 6): when usePatternPath, the lesson's grammar_patterns are
      // the NEW pattern set (legacy cutover-deleted); exercise_variants are what
      // this run actually wrote (pattern path + legacy vocab).
      grammarPatterns: usePatternPath && patternResult
        ? patternResult.patternsUpserted
        : grammar.grammarPatterns.length,
      capabilities: allCapabilities.length,
      capabilityArtifacts: artifactInputs.length,
      learningItems: publishedItemIds.length,
      exerciseVariants: usePatternPath ? exerciseVariantsLanded : grammar.exerciseVariants.length,
      clozeContexts: cloze.plans.length,
    },
    contentUnitIds,
    capabilityIds,
    capabilityArtifactIds,
    learningItemIds: publishedItemIds,
    exerciseVariantIds,
    grammarPatternIds: [...grammarPatternUpsert.idsBySlug.values()],
    publishedItemIds,
    dialogueItemIds,
    // CS14-17: item kind gate inputs (assembled above from the item path).
    writtenItems,
    itemCapsWithDistractorFlag,
    distractorSets: distractorSetsInput,
    itemDuplicatesInput,
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

  // Staging write-back #2 — mirror legacy 925–963. Only after seed-integrity
  // (CS9) passes do we mark learning-items.ts entries as published or
  // deferred_dialogue. Writing earlier would mark items published before
  // verifying the DB state, risking a permanent skip if the DB write failed.
  const cs9HasError = postWriteFindings.some((f) => f.gate === 'CS9' && f.severity === 'error')
  if (publishedItemIds.length > 0 && !cs9HasError) {
    markLearningItemsPublishedOrDeferred(
      staging.stagingDir,
      staging.learningItems as LearningItemStagingRow[],
      vocab.deferredDialogueKeys,
    )
    console.log(`   ✓ learning-items.ts marked published/deferred in staging (${publishedItemIds.length} items, ${vocab.deferredDialogueKeys.size} deferred)`)
  } else if (publishedItemIds.length === 0 && vocab.deferredDialogueKeys.size > 0) {
    // Edge case: only deferrals, nothing published — still persist the
    // deferred markers so subsequent runs see the intent.
    markLearningItemsDeferralsOnly(
      staging.stagingDir,
      staging.learningItems as LearningItemStagingRow[],
      vocab.deferredDialogueKeys,
    )
    console.log(`   ✓ learning-items.ts marked deferral-only in staging (${vocab.deferredDialogueKeys.size} dialogue chunks)`)
  } else if (cs9HasError) {
    console.warn('   ⚠ Seed-integrity (CS9) failed — staging NOT marked published')
  }

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

  // POS coverage (informational; mirrors legacy 968–976).
  if (vocab.perItemPlans.length > 0) {
    const coverageItems = vocab.perItemPlans.map((p) => ({
      base_text: p.item.base_text,
      item_type: p.item.item_type,
      pos: p.learningItemInput.pos ?? undefined,
    }))
    const coverage = validatePOS(coverageItems).coverage
    console.log(`\n[POS-coverage] Lesson ${input.lessonNumber} word/phrase items by POS:`)
    for (const [pos, count] of Object.entries(coverage).sort()) {
      console.log(`  ${pos}: ${count}`)
    }
  }

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
