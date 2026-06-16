import {
  itemSlug,
  type CurrentAffixedFormPair,
} from '@/lib/capabilities'

/**
 * content-pipeline-output.ts — shared staging-shape types + the source_ref / slug
 * formula homes used across the pipeline.
 *
 * Slice 5b (#147 5b.7): the legacy staging-regeneration surface that used to live
 * here is RETIRED. Deleted with the Capability Stage's no-disk cutover:
 *   - buildContentUnitsFromStaging / buildCapabilityStagingFromContent (the
 *     staging → capabilities/content-units/exercise-assets regeneration)
 *   - buildArtifactsForCapability + the artifact payload builders + ArtifactBuildContext
 *   - validateContentUnits / validateCapabilityStaging / validateExerciseAssets +
 *     hasConcreteArtifactPayload (the lint-staging capability pre-flight validators,
 *     whose caller was removed in 5b.6b; the checks live in the Capability Gate)
 *   - the StagingCapability / StagingExerciseAsset / CapabilityStagingPlan /
 *     PipelineFinding / AudioClipCoverage types they used
 * None had a live caller (the runner went DB-only in 5b.1–5b.6; podcast/materialize
 * use `projectCapabilities` from capabilityCatalog, not this file).
 *
 * What remains is the shared vocabulary the DB-native projectors still consume:
 *   - `StagingLessonInput`   — the offline staging shape (generate-staging-files.ts)
 *   - `StagingContentUnit`   — the content-unit row shape (capability-stage
 *                              projectors/contentUnits.ts + verify/residualParity reuse it)
 *   - `stableSlug` / `contentUnitKey` / `sourceRefForLesson` /
 *     `sourceRefForLearningItem` / `affixedFormPairSourceRef` — the canonical
 *     slug + source_ref formula homes (one home, no byte-identity drift between
 *     the legacy and DB-native paths).
 */

export interface StagingLessonInput {
  lessonNumber: number
  // ADR 0006 (Decision 3b): the DB UUID of the lesson, when known. Stamped
  // onto every emitted capability so the on-disk capabilities.ts mirrors what
  // the DB row will carry. Optional because pure offline generators
  // (generate-staging-files.ts when no service key is available) cannot
  // resolve the UUID; the runner's published rows are still authoritative.
  lessonId?: string | null
  lesson: {
    title: string
    level: string
    module_id: string
    order_index: number
    sections: Array<{
      title: string
      order_index: number
      content: { type: string; [key: string]: unknown }
    }>
  }
  learningItems: Array<{
    base_text: string
    item_type: 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
    context_type: string
    translation_nl?: string
    translation_en?: string
    source_page?: number | null
    review_status?: string
  }>
  grammarPatterns: Array<{
    slug: string
    pattern_name: string
    description?: string
    complexity_score?: number
    confusion_group?: string | null
    example?: string // e.g. "Sepedanya hitam — Zijn/haar fiets is zwart"
  }>
  affixedFormPairs?: CurrentAffixedFormPair[]
}

export interface StagingContentUnit {
  content_unit_key: string
  source_ref: string
  source_section_ref: string
  unit_kind: 'lesson_section' | 'learning_item' | 'grammar_pattern' | 'affixed_form_pair'
  unit_slug: string
  display_order: number
  payload_json: Record<string, unknown>
  source_fingerprint: string
}

// Exported so the capability-stage pattern projector (projectPatternsFromCategories)
// derives grammar-pattern slugs from category titles with the SAME formula the
// rest of the pipeline uses — one home for the slug formula.
export function stableSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Exported so the DB-native content_units builder (capability-stage/projectors/
// contentUnits.ts) reuses the EXACT key formula — one home, no byte-identity drift.
export function contentUnitKey(input: {
  sourceRef: string
  sourceSectionRef: string
  unitSlug: string
}): string {
  return `${input.sourceRef}::${input.sourceSectionRef}::${input.unitSlug}`
}

export function sourceRefForLesson(lessonNumber: number): string {
  return `lesson-${lessonNumber}`
}

// Exported so projectors/vocab.ts (projectItemsFromTypedRows) can build the
// same source_ref formula from the typed DB path — one home for the formula.
export function sourceRefForLearningItem(baseText: string): string {
  // Per issue #59: must match learning_items.normalized_text exactly so the
  // runtime resolver (capabilityContentService.fetchLearningItemsByKey) can
  // resolve item-source-kind caps. stableSlug mangles spaces to hyphens.
  return `learning_items/${itemSlug(baseText)}`
}

// Exported (PR 3): the capability-stage runner keys its affixed_form_pairs
// typed-row projector by this same ref so the join cap.source_ref ↔ pair is
// identical to the one the content-unit + capability emission uses.
export function affixedFormPairSourceRef(lessonNumber: number, pair: CurrentAffixedFormPair): string {
  return pair.sourceRef || `${sourceRefForLesson(lessonNumber)}/morphology/${stableSlug(`${pair.root}-${pair.derived}`)}`
}
