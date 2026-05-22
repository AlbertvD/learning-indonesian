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
  type StagingLessonInput,
} from '../../content-pipeline-output'
import {
  createSupabaseClient as defaultCreateSupabaseClient,
  findContextIdBySourceText,
  findLearningItemBySlug,
  insertExerciseVariantGrammar,
  insertExerciseVariantVocab,
  replaceItemMeanings,
  upsertCapabilities,
  upsertCapabilityArtifacts,
  upsertCapabilityContentUnits,
  upsertClozeContext,
  upsertContentUnits,
  upsertGrammarPatterns,
  fetchGrammarPatternIdsBySlug,
  upsertItemAnchorContext,
  upsertLearningItem,
  type CapabilityArtifactInput,
  type CapabilityContentUnitInput,
  type CapabilityInput,
  type CapabilitySupabaseClient,
  type ContentUnitInput,
} from './adapter'
import { loadLesson as defaultLoadLesson, type LoadedLesson } from './loader'

// CS1 (grammar_topics) moved back to lesson-stage (GT1) — lesson_sections
// is Stage A's territory, and lesson-stage now owns the enricher that
// fills `content.grammar_topics`. CS2 (perItemEnrichment) was deleted —
// its checks are now replaced by active enrichments (enrichPos / enrichLevel
// / enrichEnTranslations / enrichDialogueTranslations) that fill the fields
// rather than gating.
import { validateCandidatePayload } from './validators/candidatePayload'
import { validatePerItemMeaning } from './validators/perItemMeaning'
import { validateGrammarPattern } from './validators/grammarPattern'
import { validatePosTags } from './validators/pos'

import { projectVocab } from './projectors/vocab'
import { projectGrammar } from './projectors/grammar'
import { projectCloze } from './projectors/cloze'
import { projectDialogueArtifacts } from './projectors/dialogueArtifacts'

import { validateLessonIdPresence } from './validators/lessonId'
import { validateItemSourceRefResolvability } from './validators/itemSourceRefResolvability'

import { runCountParity } from './verify/countParity'
import { runContentNonEmpty } from './verify/contentNonEmpty'
import { runSeedIntegrity } from './verify/seedIntegrity'

import {
  markCandidatesPublished,
  markLearningItemsPublishedOrDeferred,
  markLearningItemsDeferralsOnly,
  writeLearningItemsWithEnrichedPos,
  type CandidateStagingRow,
  type LearningItemStagingRow,
} from './stagingWriteback'
import { enrichMissingPos } from './enrichPos'
import { enrichMissingEnTranslations } from './enrichEnTranslations'
import { enrichMissingLevel } from './enrichLevel'
import { propagateDialogueTranslationsToLearningItems } from './propagateDialogueTranslations'
import { loadPromotionPlan, applyPromotionPlan } from '../../../promote-capabilities'

import { validatePOS } from '../../validate-pos'

export interface CapabilityStageHooks {
  loadLesson?: typeof defaultLoadLesson
  createSupabaseClient?: () => CapabilitySupabaseClient
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

    // EN translations (LLM via Claude haiku)
    const enResult = await enrichMissingEnTranslations(items.map((i) => ({
      base_text: i.base_text,
      item_type: i.item_type as 'word' | 'phrase' | 'sentence' | 'dialogue_chunk' | 'numbers',
      translation_nl: i.translation_nl,
      translation_en: i.translation_en,
    })))
    if (enResult.translationsByBaseText.size > 0) {
      for (const item of items) {
        const en = enResult.translationsByBaseText.get(item.base_text)
        if (en) item.translation_en = en
      }
      learningItemsDirty = true
    }

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
  findings.push(...validateGrammarPattern(staging.grammarPatterns as Array<{ slug: string; pattern_name: string; complexity_score: number }>))
  findings.push(...validateCandidatePayload(staging.candidates as Array<{ exercise_type?: string; payload?: Record<string, unknown> | null }>))
  findings.push(...validatePerItemMeaning(staging.learningItems as Array<{ base_text: string; context_type?: string; translation_nl?: string | null; translation_en?: string | null }>))
  const posResult = validatePosTags(staging.learningItems as Array<{ base_text: string; item_type: string; pos?: string | null }>)
  findings.push(...posResult.findings)

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
  }>).map((capability): CapabilityInput => ({
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
  const capabilityIds = [...capabilityIdsByKey.values()]

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
    artifactInputs.push({
      capability_id: capId,
      artifact_kind: asset.artifact_kind,
      quality_status: asset.quality_status,
      artifact_ref: asset.asset_key,
      artifact_json: asset.payload_json ?? {},
      artifact_fingerprint: asset.asset_key,
    })
  }

  // ---- 7b. Dialogue-line artifacts (Decision 5b extension). -------------
  // The shared catalog at content-pipeline-output.ts:484 only knows item /
  // pattern / morphology artifact kinds. Dialogue-line caps are appended
  // downstream by projectVocab (vocab.ts:163-203), so their artifacts must
  // also be appended downstream — same `upsertCapabilityArtifacts` adapter,
  // separate projector. See projectors/dialogueArtifacts.ts for the contract.
  const dialogueArtifactsResult = projectDialogueArtifacts({
    contextualClozeCapabilities: vocab.contextualClozeCapabilities,
    capabilityIdsByKey,
    clozeContexts: staging.clozeContexts as never,
    sections: loaded.sections,
  })
  artifactInputs.push(...dialogueArtifactsResult.artifacts)
  findings.push(...dialogueArtifactsResult.findings)

  const capabilityArtifactIds = await upsertCapabilityArtifacts(supabase, artifactInputs)
  counts.capabilityArtifacts = capabilityArtifactIds.length

  // ---- 8. Write — grammar_patterns (PGRST205 fallback preserved). ------
  const grammarPatternUpsert = await upsertGrammarPatterns(supabase, grammar.grammarPatterns)

  // ---- 9. Write — learning_items + meanings + anchor contexts. ---------
  const publishedItemIds: string[] = []
  const dialogueItemIds = new Set<string>()
  for (const plan of vocab.perItemPlans) {
    const item = await upsertLearningItem(supabase, plan.learningItemInput)
    publishedItemIds.push(item.id)
    if (plan.item.item_type === 'dialogue_chunk') dialogueItemIds.add(item.id)
    const meanings = plan.meanings.map((m) => ({ ...m, learning_item_id: item.id }))
    await replaceItemMeanings(supabase, item.id, meanings)
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
  const exerciseVariantIds: string[] = []
  for (const variant of grammar.exerciseVariants) {
    if (variant.kind === 'grammar') {
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
      if (result.ok && result.id) exerciseVariantIds.push(result.id)
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
      if (result.ok && result.id) exerciseVariantIds.push(result.id)
    }
  }
  const exerciseVariantsLanded = exerciseVariantIds.length
  counts.exerciseVariants = exerciseVariantsLanded

  // Staging write-back #1 — mirror legacy 712–722. After exercise_variants
  // land + count verification, mark approved candidates as `published` in
  // candidates.ts so re-runs skip them. Only proceeds when the count check
  // confirms rows are actually in DB.
  if (exerciseVariantsLanded > 0 && exerciseVariantsLanded >= grammar.exerciseVariants.length) {
    markCandidatesPublished(staging.stagingDir, staging.candidates as CandidateStagingRow[])
    console.log(`   ✓ candidates.ts marked published in staging (${exerciseVariantsLanded} rows)`)
  } else if (grammar.exerciseVariants.length > 0) {
    console.warn(`   ⚠ Expected ${grammar.exerciseVariants.length} exercise_variants, landed ${exerciseVariantsLanded} — staging NOT marked published`)
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

  // ---- 12. Verify (CS7 → CS8 → CS9). -----------------------------------
  findings.push(...await runCountParity(supabase, {
    lessonId: input.lessonId,
    declared: {
      contentUnits: stagedContentUnits.length,
      grammarPatterns: grammar.grammarPatterns.length,
      capabilities: allCapabilities.length,
      capabilityArtifacts: artifactInputs.length,
      learningItems: publishedItemIds.length,
      exerciseVariants: grammar.exerciseVariants.length,
      clozeContexts: cloze.plans.length,
    },
    contentUnitIds,
    capabilityIds,
  }))
  findings.push(...await runContentNonEmpty(supabase, {
    contentUnitIds,
    capabilityIds,
    capabilityArtifactIds,
    learningItemIds: publishedItemIds,
    exerciseVariantIds,
    grammarPatternIds: [...grammarPatternUpsert.idsBySlug.values()],
  }))
  const integrityReport = await runSeedIntegrity(supabase, {
    publishedItemIds,
    dialogueItemIds,
  })
  findings.push(...integrityReport.findings)

  // Staging write-back #2 — mirror legacy 925–963. Only after seed-integrity
  // (CS9) passes do we mark learning-items.ts entries as published or
  // deferred_dialogue. Writing earlier would mark items published before
  // verifying the DB state, risking a permanent skip if the DB write failed.
  const cs9HasError = integrityReport.findings.some((f) => f.severity === 'error')
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
