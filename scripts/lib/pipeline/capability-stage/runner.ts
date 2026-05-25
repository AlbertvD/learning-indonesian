/**
 * capability-stage/runner.ts — Stage B entry point (Slice 1: DB→DB spine).
 *
 * Input: { lessonNumber, lessonId, dryRun }
 * → loadFromDb reads lesson content entirely from the database (no staging files).
 * → Enrichment fills missing pos / level / translation_en in-memory.
 * → Pure projectors fan out capability write plans.
 * → Adapter writes to typed tables (idempotent, skip-if-exists).
 *
 * Sequence:
 *   1. loadFromDb: DB read (lessons + sections + items + audio_clips + dialogue_lines).
 *   2. Enrichment (pos / level / translation_en / dialogue translation propagation).
 *   3. Regenerate content-unit + capability + exercise-asset snapshots in-memory.
 *   4. Validate (CS3–CS6 + translation/pos gates). Errors short-circuit.
 *   5. Dry-run short-circuit.
 *   6. Project (pure): vocab + grammar + cloze.
 *   7. Write (typed tables only, DB, no disk): content_units → capabilities →
 *      capability_content_units → capability_artifacts → grammar_patterns →
 *      learning_items + contexts → exercise_variants → cloze_contexts →
 *      distractor tables.
 *   8. Verify (CS7 → CS8 → CS9).
 *   9. Promote capabilities.
 *
 * No staging-file reads. No disk writes. Enforced by slice1-enforcement.test.ts.
 */

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
  upsertCapabilityArtifacts,
  upsertCapabilityContentUnits,
  upsertClozeContext,
  upsertContentUnits,
  upsertGrammarPatterns,
  fetchGrammarPatternIdsBySlug,
  upsertItemAnchorContext,
  upsertLearningItem,
  replaceDialogueClozes,
  replaceAffixedFormPairs,
  upsertItemDistractors,
  type CapabilityArtifactInput,
  type CapabilityContentUnitInput,
  type CapabilityInput,
  type CapabilitySupabaseClient,
  type ContentUnitInput,
} from './adapter'
import { loadFromDb, type LoadedLesson } from './loader'

import { validateCandidatePayload } from './validators/candidatePayload'
import { validateGrammarExercises } from './validators/grammarExercises'
import { validatePerItemMeaning } from './validators/perItemMeaning'
import { validateGrammarPattern } from './validators/grammarPattern'
import { validatePosTags } from './validators/pos'

import { projectVocab } from './projectors/vocab'
import { projectGrammar } from './projectors/grammar'
import { buildGrammarExerciseRow } from './projectors/grammarExerciseRows'
import { projectCloze } from './projectors/cloze'
import { projectDialogueArtifacts } from './projectors/dialogueArtifacts'
import { projectAffixedFormPairs, type AffixedPairSource } from './projectors/morphology'
import { projectItemDistractors } from './projectors/itemDistractors'

import { validateLessonIdPresence } from './validators/lessonId'
import { validateItemTranslations } from './validators/itemTranslations'
import { validateItemSourceRefResolvability } from './validators/itemSourceRefResolvability'
import { validateDialogueClozes } from './validators/dialogueClozes'
import { validateAffixedFormPairs } from './validators/affixedFormPairs'

import { runCountParity } from './verify/countParity'
import { runContentNonEmpty } from './verify/contentNonEmpty'
import { runSeedIntegrity } from './verify/seedIntegrity'

import { enrichMissingPos } from './enrichPos'
import { enrichMissingEnTranslations } from './enrichEnTranslations'
import { enrichMissingLevel } from './enrichLevel'
import { propagateDialogueTranslationsToLearningItems } from './propagateDialogueTranslations'
import { loadPromotionPlan, applyPromotionPlan } from '../../../promote-capabilities'

import { validatePOS } from '../../validate-pos'

export interface CapabilityStageHooks {
  loadFromDb?: typeof loadFromDb
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
  const loadDb = hooks.loadFromDb ?? loadFromDb

  // ---- 1. Load (DB only). -----------------------------------------------
  const supabase: CapabilitySupabaseClient = createClient()
  const loaded: LoadedLesson = await loadDb(supabase, {
    lessonNumber: input.lessonNumber,
    lessonId: input.lessonId,
  })
  const staging = loaded.staging

  // ---- 1b. Enrichment (pre-validation). --------------------------------
  // Backfill empty pos / level / translation_en / dialogue translations in-
  // process. Enrichments update item rows in-memory; the DB upsert writes them.
  // On re-runs the items already have values so enrichment is a no-op.
  // Skipped during dry-run.
  if (!input.dryRun) {
    type EnrichItem = {
      base_text: string
      item_type: 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
      translation_nl?: string | null
      translation_en?: string | null
      pos?: string | null
      level?: string
    }
    const items = staging.learningItems as EnrichItem[]

    // POS (LLM via Claude)
    const posResult = await enrichMissingPos(items.map((i) => ({
      base_text: i.base_text,
      item_type: i.item_type,
      translation_nl: i.translation_nl,
      translation_en: i.translation_en,
      pos: i.pos,
    })))
    if (posResult.posByBaseText.size > 0) {
      for (const item of items) {
        const pos = posResult.posByBaseText.get(item.base_text)
        if (pos) item.pos = pos
      }
    }

    // Level (deterministic — every item inherits lesson level)
    const levelResult = enrichMissingLevel(items, loaded.lesson.level)
    if (levelResult.filledCount > 0) {
      for (const item of items) {
        const level = levelResult.levelByBaseText.get(item.base_text)
        if (level) item.level = level
      }
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
    }

    // Dialogue translation propagation (deterministic — no LLM call here).
    const propagated = propagateDialogueTranslationsToLearningItems({
      sections: loaded.sections,
      learningItems: items,
    })
    if (propagated > 0) {
      console.log(`   ✓ Dialogue translation propagation: filled translation_nl on ${propagated} dialogue_chunk item(s) from lesson_sections`)
    }
  }

  // ---- 1c. Regenerate snapshots from enriched data (in-memory, no disk). --
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

  staging.contentUnits = regeneratedContentUnits as unknown as Array<Record<string, unknown>>
  staging.capabilities = regeneratedCapabilityPlan.capabilities as unknown as Array<Record<string, unknown>>
  staging.exerciseAssets = regeneratedCapabilityPlan.exerciseAssets as unknown as Array<Record<string, unknown>>

  // ---- 2. Validate (pre-write). ----------------------------------------
  findings.push(...validateGrammarPattern(staging.grammarPatterns as Array<{ slug: string; pattern_name: string; complexity_score: number }>))
  findings.push(...validateCandidatePayload(staging.candidates as Array<{ exercise_type?: string; payload?: Record<string, unknown> | null }>))
  findings.push(...validateGrammarExercises(staging.candidates as Array<{ exercise_type?: string; payload?: Record<string, unknown> | null; review_status?: string }>))
  findings.push(...validatePerItemMeaning(staging.learningItems as Array<{ base_text: string; context_type?: string; translation_nl?: string | null; translation_en?: string | null }>))
  findings.push(...validateItemTranslations(staging.learningItems as Array<{ base_text: string; item_type: string; translation_nl?: string | null; translation_en?: string | null }>))
  const posValidation = validatePosTags(staging.learningItems as Array<{ base_text: string; item_type: string; pos?: string | null }>)
  findings.push(...posValidation.findings)

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

  // ---- 4. Write — content_units. ---------------------------------------
  const stagedContentUnits = staging.contentUnits as Array<ContentUnitInput>
  const contentUnitIdsBySlug = await upsertContentUnits(supabase, stagedContentUnits)
  counts.contentUnits = contentUnitIdsBySlug.size
  const contentUnitIds = [...contentUnitIdsBySlug.values()]

  // ---- 5. Write — learning_capabilities. -------------------------------
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
  validateLessonIdPresence(allCapabilities)
  validateItemSourceRefResolvability(
    allCapabilities,
    staging.learningItems as ReadonlyArray<{ base_text: string }>,
  )
  const capabilityIdsByKey = await upsertCapabilities(supabase, allCapabilities)
  counts.capabilities = capabilityIdsByKey.size
  const capabilityIds = [...capabilityIdsByKey.values()]

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

  // ---- 7. Write — capability_artifacts (non-item source kinds only). ----
  // Item-sourced caps use learning_items.translation_{nl,en} directly (Decision R).
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

  // ---- 7b. Dialogue-line typed rows. ------------------------------------
  const dialogueArtifactsResult = projectDialogueArtifacts({
    contextualClozeCapabilities: vocab.contextualClozeCapabilities,
    capabilityIdsByKey,
    clozeContexts: staging.clozeContexts as never,
    sections: loaded.sections,
  })
  findings.push(...dialogueArtifactsResult.findings)

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

  // ---- 7c. Affixed-form-pair typed rows. --------------------------------
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

  const dialogueClozesLanded = await replaceDialogueClozes(
    supabase,
    dialogueArtifactsResult.dialogueClozes,
  )
  counts.dialogueClozes = dialogueClozesLanded

  const affixedFormPairsLanded = await replaceAffixedFormPairs(
    supabase,
    affixedFormPairsResult.rows,
  )
  counts.affixedFormPairs = affixedFormPairsLanded

  // ---- 8. Write — grammar_patterns. -------------------------------------
  const grammarPatternUpsert = await upsertGrammarPatterns(supabase, grammar.grammarPatterns)

  // ---- 9. Write — learning_items + anchor contexts. ---------------------
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
  const exerciseVariantIds: string[] = []
  let grammarExerciseRowsLanded = 0
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
      if (result.ok && result.id) exerciseVariantIds.push(result.id)
    }
  }
  counts.exerciseVariants = exerciseVariantIds.length
  counts.grammarExerciseRows = grammarExerciseRowsLanded

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

  // ---- 12. Write — curated distractors (Slice 1 new writer). -----------
  // Build and persist distractor rows for every published item capability.
  // Uses the same cumulative pool as the runtime (all items anchored to
  // lessons in this lessonId's context), so distractors are curated from
  // words the learner has seen. Skip-if-exists on capability_id (idempotent).
  if (publishedItemIds.length > 0) {
    const distractorRows = await projectItemDistractors({
      supabase,
      lessonId: input.lessonId,
      capabilityIdsByKey,
      perItemPlans: vocab.perItemPlans,
    })
    if (distractorRows.length > 0) {
      await upsertItemDistractors(supabase, distractorRows)
      console.log(`   ✓ Curated distractors: ${distractorRows.length} capability rows`)
    }
  }

  // ---- 13. Verify (CS7 → CS8 → CS9). -----------------------------------
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

  const status: CapabilityStageOutput['status'] =
    findings.some((f) => f.severity === 'error') ? 'partial' : 'ok'

  // ---- 14. Promote capabilities. ----------------------------------------
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

  // POS coverage (informational).
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

/**
 * Build the lint-staging command for the publish pipeline.
 * Bun executes .ts directly; under node, route through the local tsx CLI.
 */
export function buildLintStagingCommand(lessonNumber: number): {
  command: string
  args: string[]
} {
  const isBun = typeof (process.versions as { bun?: string }).bun === 'string'
  const args = isBun
    ? []
    : [path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')]
  args.push('scripts/lint-staging.ts', '--lesson', String(lessonNumber), '--severity', 'critical')
  return { command: process.execPath, args }
}
