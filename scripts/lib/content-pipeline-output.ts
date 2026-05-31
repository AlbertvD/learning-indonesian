import {
  ARTIFACT_KINDS,
  itemSlug,
  projectCapabilities,
  type ArtifactKind,
  type CurrentAffixedFormPair,
  type ProjectedCapability,
} from '@/lib/capabilities'
import { projectPodcastCapabilities } from './pipeline/podcast-stage/podcastProjectionRules'
import { normalizeTtsText } from './tts-normalize'

/**
 * Per-lesson audio coverage map keyed by `normalizeTtsText(base_text)`.
 * Populated by the capability-stage loader from `audio_clips` rows; an empty
 * map preserves the offline-generator path (no audio capabilities emitted).
 */
export interface AudioClipCoverage {
  storage_path: string
  voice_id: string
}

export type PipelineSeverity = 'CRITICAL' | 'WARNING'

export interface PipelineFinding {
  severity: PipelineSeverity
  rule: string
  detail: string
  ref?: string
}

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

export interface StagingCapability extends ProjectedCapability {
  id?: string
  contentUnitSlugs: string[]
  relationshipKind: 'introduced_by' | 'practiced_by' | 'assessed_by' | 'referenced_by'
}

export interface StagingExerciseAsset {
  asset_key: string
  capability_key: string
  artifact_kind: string
  quality_status: 'draft' | 'approved' | 'blocked'
  payload_json: Record<string, unknown>
}

export interface CapabilityStagingPlan {
  capabilities: StagingCapability[]
  exerciseAssets: StagingExerciseAsset[]
}

function stableSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isStableSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value)
}

function contentUnitKey(input: {
  sourceRef: string
  sourceSectionRef: string
  unitSlug: string
}): string {
  return `${input.sourceRef}::${input.sourceSectionRef}::${input.unitSlug}`
}

function sourceRefForLesson(lessonNumber: number): string {
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

function grammarSourceRef(lessonNumber: number, slug: string): string {
  return `${sourceRefForLesson(lessonNumber)}/pattern-${stableSlug(slug)}`
}

// Exported (PR 3): the capability-stage runner keys its affixed_form_pairs
// typed-row projector by this same ref so the join cap.source_ref ↔ pair is
// identical to the one the content-unit + capability emission uses.
export function affixedFormPairSourceRef(lessonNumber: number, pair: CurrentAffixedFormPair): string {
  return pair.sourceRef || `${sourceRefForLesson(lessonNumber)}/morphology/${stableSlug(`${pair.root}-${pair.derived}`)}`
}

function finding(severity: PipelineSeverity, rule: string, detail: string, ref?: string): PipelineFinding {
  return { severity, rule, detail, ref }
}

type LearningItem = StagingLessonInput['learningItems'][number]

function appendUniqueDelimited(current: string | undefined, next: string | undefined): string | undefined {
  const parts = new Set<string>()
  for (const value of [current, next]) {
    if (!value?.trim()) continue
    value
      .split(/\s+\/\s+|\s*;\s*/)
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => parts.add(part))
  }
  return parts.size > 0 ? [...parts].join(' / ') : undefined
}

function mergedItemType(current: LearningItem['item_type'], next: LearningItem['item_type']): LearningItem['item_type'] {
  const rank: Record<LearningItem['item_type'], number> = {
    word: 0,
    phrase: 1,
    sentence: 2,
    dialogue_chunk: 3,
  }
  return rank[next] > rank[current] ? next : current
}

function mergedSourcePage(current: number | null | undefined, next: number | null | undefined): number | null {
  if (current == null) return next ?? null
  if (next == null) return current
  return Math.min(current, next)
}

function mergedReviewStatus(current: string | undefined, next: string | undefined): string | undefined {
  if (current === 'published' || next === 'published') return 'published'
  return current ?? next
}

function dedupeLearningItems(items: LearningItem[]): LearningItem[] {
  const bySourceRef = new Map<string, LearningItem>()

  for (const item of items) {
    const key = sourceRefForLearningItem(item.base_text)
    const existing = bySourceRef.get(key)
    if (!existing) {
      bySourceRef.set(key, { ...item, base_text: item.base_text.trim() })
      continue
    }

    bySourceRef.set(key, {
      ...existing,
      item_type: mergedItemType(existing.item_type, item.item_type),
      context_type: existing.context_type === 'vocabulary_list' ? existing.context_type : item.context_type,
      translation_nl: appendUniqueDelimited(existing.translation_nl, item.translation_nl),
      translation_en: appendUniqueDelimited(existing.translation_en, item.translation_en),
      source_page: mergedSourcePage(existing.source_page, item.source_page),
      review_status: mergedReviewStatus(existing.review_status, item.review_status),
    })
  }

  return [...bySourceRef.values()]
}

export function buildContentUnitsFromStaging(input: StagingLessonInput): StagingContentUnit[] {
  const lessonSourceRef = sourceRefForLesson(input.lessonNumber)
  const units: StagingContentUnit[] = []

  for (const section of input.lesson.sections) {
    const sectionRef = `${lessonSourceRef}/section-${section.order_index}`
    const unitSlug = `section-${section.order_index}-${stableSlug(section.title || section.content.type)}`
    units.push({
      content_unit_key: contentUnitKey({
        sourceRef: lessonSourceRef,
        sourceSectionRef: sectionRef,
        unitSlug,
      }),
      source_ref: lessonSourceRef,
      source_section_ref: sectionRef,
      unit_kind: 'lesson_section',
      unit_slug: unitSlug,
      display_order: section.order_index,
      payload_json: {
        title: section.title,
        contentType: section.content.type,
      },
      source_fingerprint: fingerprint(section),
    })
  }

  dedupeLearningItems(input.learningItems).forEach((item, index) => {
    const slug = stableSlug(item.base_text)
    units.push({
      content_unit_key: contentUnitKey({
        sourceRef: sourceRefForLearningItem(item.base_text),
        sourceSectionRef: `${lessonSourceRef}/section-${item.context_type === 'dialogue' ? 'dialogue' : 'vocabulary'}`,
        unitSlug: `item-${slug}`,
      }),
      source_ref: sourceRefForLearningItem(item.base_text),
      source_section_ref: `${lessonSourceRef}/section-${item.context_type === 'dialogue' ? 'dialogue' : 'vocabulary'}`,
      unit_kind: 'learning_item',
      unit_slug: `item-${slug}`,
      display_order: 1000 + index,
      payload_json: {
        baseText: item.base_text,
        itemType: item.item_type,
        translationNl: item.translation_nl ?? '',
        translationEn: item.translation_en ?? '',
      },
      source_fingerprint: fingerprint(item),
    })
  })

  input.grammarPatterns.forEach((pattern, index) => {
    const slug = stableSlug(pattern.slug)
    units.push({
      content_unit_key: contentUnitKey({
        sourceRef: grammarSourceRef(input.lessonNumber, slug),
        sourceSectionRef: `${lessonSourceRef}/section-grammar`,
        unitSlug: `pattern-${slug}`,
      }),
      source_ref: grammarSourceRef(input.lessonNumber, slug),
      source_section_ref: `${lessonSourceRef}/section-grammar`,
      unit_kind: 'grammar_pattern',
      unit_slug: `pattern-${slug}`,
      display_order: 2000 + index,
      payload_json: {
        slug,
        name: pattern.pattern_name,
        description: pattern.description ?? '',
        complexityScore: pattern.complexity_score ?? null,
      },
      source_fingerprint: fingerprint(pattern),
    })
  })

  for (const [index, pair] of (input.affixedFormPairs ?? []).entries()) {
    const sourceRef = affixedFormPairSourceRef(input.lessonNumber, pair)
    const slug = stableSlug(pair.id || `${pair.root}-${pair.derived}`)
    units.push({
      content_unit_key: contentUnitKey({
        sourceRef,
        sourceSectionRef: `${lessonSourceRef}/section-morphology`,
        unitSlug: `morphology-${slug}`,
      }),
      source_ref: sourceRef,
      source_section_ref: `${lessonSourceRef}/section-morphology`,
      unit_kind: 'affixed_form_pair',
      unit_slug: `morphology-${slug}`,
      display_order: 3000 + index,
      payload_json: {
        root: pair.root,
        derived: pair.derived,
        allomorphRule: pair.allomorphRule ?? '',
        patternSourceRef: pair.patternSourceRef ?? sourceRef,
      },
      source_fingerprint: fingerprint(pair),
    })
  }

  return units.sort((a, b) => a.display_order - b.display_order || a.unit_slug.localeCompare(b.unit_slug))
}

export function validateContentUnits(units: StagingContentUnit[]): PipelineFinding[] {
  const findings: PipelineFinding[] = []
  const identities = new Set<string>()
  const slugs = new Set<string>()

  for (const unit of units) {
    if (!isStableSlug(unit.unit_slug)) {
      findings.push(finding('CRITICAL', 'content-unit-slug-not-stable', `Invalid unit_slug "${unit.unit_slug}"`, unit.unit_slug))
    }
    const identity = `${unit.source_ref}|${unit.source_section_ref}|${unit.unit_slug}`
    if (identities.has(identity)) {
      findings.push(finding('CRITICAL', 'content-unit-duplicate-identity', identity, unit.unit_slug))
    }
    identities.add(identity)
    if (slugs.has(unit.unit_slug)) {
      findings.push(finding('CRITICAL', 'content-unit-duplicate-slug', `Duplicate globally addressed unit_slug "${unit.unit_slug}"`, unit.unit_slug))
    }
    slugs.add(unit.unit_slug)
  }

  return findings
}

export interface ArtifactBuildContext {
  learningItemsBySourceRef: Map<string, { base_text: string; translation_nl?: string }>
  grammarPatternsBySourceRef: Map<string, { pattern_name: string; description?: string; example?: string }>
  affixedFormPairsBySourceRef: Map<string, { root: string; derived: string; allomorphRule?: string }>
  /**
   * Audio coverage keyed by `normalizeTtsText(base_text)`. Drives the
   * `audio_clip` artifact payload (storagePath); empty map → no audio caps
   * exist so this lookup is never invoked.
   */
  audioClipsByNormalizedText: ReadonlyMap<string, AudioClipCoverage>
}

function requireLearningItem(
  capability: ProjectedCapability,
  ctx: ArtifactBuildContext,
  artifactKind: string,
): { base_text: string; translation_nl?: string } {
  const item = ctx.learningItemsBySourceRef.get(capability.sourceRef)
  if (!item) {
    throw new Error(
      `buildArtifactsForCapability: no learning_item found for sourceRef "${capability.sourceRef}" ` +
      `(artifact_kind="${artifactKind}", capability="${capability.canonicalKey}")`,
    )
  }
  return item
}

function requireGrammarPattern(
  capability: ProjectedCapability,
  ctx: ArtifactBuildContext,
  artifactKind: string,
): { pattern_name: string; description?: string; example?: string } {
  const pattern = ctx.grammarPatternsBySourceRef.get(capability.sourceRef)
  if (!pattern) {
    throw new Error(
      `buildArtifactsForCapability: no grammar_pattern found for sourceRef "${capability.sourceRef}" ` +
      `(artifact_kind="${artifactKind}", capability="${capability.canonicalKey}")`,
    )
  }
  return pattern
}

function requireAffixedFormPair(
  capability: ProjectedCapability,
  ctx: ArtifactBuildContext,
  artifactKind: string,
): { root: string; derived: string; allomorphRule?: string } {
  const pair = ctx.affixedFormPairsBySourceRef.get(capability.sourceRef)
  if (!pair) {
    throw new Error(
      `buildArtifactsForCapability: no affixed_form_pair found for sourceRef "${capability.sourceRef}" ` +
      `(artifact_kind="${artifactKind}", capability="${capability.canonicalKey}")`,
    )
  }
  return pair
}

function buildPayloadForKind(
  kind: string,
  capability: ProjectedCapability,
  ctx: ArtifactBuildContext,
): Record<string, unknown> {
  switch (kind) {
    case 'base_text': {
      const item = requireLearningItem(capability, ctx, kind)
      if (!item.base_text) {
        throw new Error(
          `buildArtifactsForCapability: learning_item "${capability.sourceRef}" has empty base_text`,
        )
      }
      return { value: item.base_text }
    }
    case 'accepted_answers:id': {
      const item = requireLearningItem(capability, ctx, kind)
      if (!item.base_text) {
        throw new Error(
          `buildArtifactsForCapability: learning_item "${capability.sourceRef}" has empty base_text (needed for accepted_answers:id)`,
        )
      }
      return { values: [item.base_text] }
    }
    case 'accepted_answers:l1': {
      const item = requireLearningItem(capability, ctx, kind)
      if (!item.translation_nl) {
        throw new Error(
          `buildArtifactsForCapability: learning_item "${capability.sourceRef}" has no translation_nl (needed for accepted_answers:l1)`,
        )
      }
      return { values: [item.translation_nl] }
    }
    case 'meaning:l1': {
      const item = requireLearningItem(capability, ctx, kind)
      if (!item.translation_nl) {
        throw new Error(
          `buildArtifactsForCapability: learning_item "${capability.sourceRef}" has no translation_nl (needed for meaning:l1)`,
        )
      }
      return { value: item.translation_nl }
    }
    case 'root_derived_pair': {
      const pair = requireAffixedFormPair(capability, ctx, kind)
      return { root: pair.root, derived: pair.derived }
    }
    case 'allomorph_rule': {
      const pair = requireAffixedFormPair(capability, ctx, kind)
      if (!pair.allomorphRule) {
        throw new Error(
          `buildArtifactsForCapability: affixed_form_pair "${capability.sourceRef}" has no allomorphRule (needed for allomorph_rule)`,
        )
      }
      return { rule: pair.allomorphRule }
    }
    case 'pattern_explanation:l1': {
      const pattern = requireGrammarPattern(capability, ctx, kind)
      if (!pattern.description) {
        throw new Error(
          `buildArtifactsForCapability: grammar_pattern "${capability.sourceRef}" has no description (needed for pattern_explanation:l1)`,
        )
      }
      return { value: pattern.description }
    }
    case 'pattern_example': {
      const pattern = requireGrammarPattern(capability, ctx, kind)
      if (!pattern.example) {
        throw new Error(
          `buildArtifactsForCapability: grammar_pattern "${capability.sourceRef}" has no example field (needed for pattern_example). ` +
          `Add an "example" string (e.g. 'Rumah besar — Een groot huis') to scripts/data/staging/lesson-*/grammar-patterns.ts.`,
        )
      }
      return { value: pattern.example }
    }
    case 'audio_clip': {
      const item = requireLearningItem(capability, ctx, kind)
      const clip = ctx.audioClipsByNormalizedText.get(normalizeTtsText(item.base_text))
      if (!clip) {
        // Should never happen — the snapshot only sets hasAudio=true when a
        // matching audio_clip exists, and the artifact builder only runs for
        // capabilities the catalog actually emitted. A miss here means the
        // ctx map was rebuilt with stale data.
        throw new Error(
          `buildArtifactsForCapability: audio_clip artifact requested for "${capability.sourceRef}" but no audio_clip is registered for normalized_text="${normalizeTtsText(item.base_text)}"`,
        )
      }
      return { storagePath: clip.storage_path, voiceId: clip.voice_id }
    }
    default:
      throw new Error(
        `buildArtifactsForCapability: unknown or unsupported artifact_kind "${kind}" for capability "${capability.canonicalKey}". ` +
        `Supported kinds: base_text, accepted_answers:id, accepted_answers:l1, meaning:l1, audio_clip, root_derived_pair, allomorph_rule, pattern_explanation:l1, pattern_example.`,
      )
  }
}

export function buildArtifactsForCapability(
  capability: ProjectedCapability,
  ctx: ArtifactBuildContext,
): StagingExerciseAsset[] {
  return capability.requiredArtifacts.map((artifactKind): StagingExerciseAsset => ({
    asset_key: `${capability.canonicalKey}:${artifactKind}`,
    capability_key: capability.canonicalKey,
    artifact_kind: artifactKind,
    quality_status: 'approved',
    payload_json: buildPayloadForKind(artifactKind, capability, ctx),
  }))
}

export function buildCapabilityStagingFromContent(input: StagingLessonInput & {
  contentUnits: StagingContentUnit[]
  /**
   * Per-lesson audio coverage from the capability-stage loader. Drives the
   * snapshot's `hasAudio` flag (which gates `audio_recognition` + `dictation`
   * capability emission in capabilityCatalog.ts:106) and the `audio_clip`
   * artifact payload. Optional — offline callers (generate-staging-files.ts,
   * tests) omit it and get no audio capabilities, preserving prior behavior.
   */
  audioClipsByNormalizedText?: ReadonlyMap<string, AudioClipCoverage>
}): CapabilityStagingPlan {
  const learningItems = dedupeLearningItems(input.learningItems)
  const audioClipsByNormalizedText: ReadonlyMap<string, AudioClipCoverage> =
    input.audioClipsByNormalizedText ?? new Map()
  const itemUnitsBySourceRef = new Map(
    input.contentUnits
      .filter(unit => unit.unit_kind === 'learning_item')
      .map(unit => [unit.source_ref, unit]),
  )
  const patternUnitsBySourceRef = new Map(
    input.contentUnits
      .filter(unit => unit.unit_kind === 'grammar_pattern')
      .map(unit => [unit.source_ref, unit]),
  )
  const affixedPairUnitsBySourceRef = new Map(
    input.contentUnits
      .filter(unit => unit.unit_kind === 'affixed_form_pair')
      .map(unit => [unit.source_ref, unit]),
  )

  const snapshot = {
    learningItems: learningItems.map(item => ({
      // Per issue #59: this id feeds `learning_items/${id}` in
      // capabilityCatalog.ts:50 → must match learning_items.normalized_text.
      // stableSlug hyphenates spaces; itemSlug preserves them.
      id: itemSlug(item.base_text),
      baseText: item.base_text,
      meanings: [
        ...(item.translation_nl ? [{ language: 'nl' as const, text: item.translation_nl }] : []),
        ...(item.translation_en ? [{ language: 'en' as const, text: item.translation_en }] : []),
      ],
      acceptedAnswers: {
        id: [item.base_text],
        l1: [item.translation_nl ?? item.translation_en ?? ''].filter(Boolean),
      },
      hasAudio: audioClipsByNormalizedText.has(normalizeTtsText(item.base_text)),
    })),
    grammarPatterns: input.grammarPatterns.map(pattern => ({
      id: stableSlug(pattern.slug),
      sourceRef: grammarSourceRef(input.lessonNumber, pattern.slug),
      name: pattern.pattern_name,
      examples: [],
    })),
    affixedFormPairs: (input.affixedFormPairs ?? []).map(pair => ({
      id: pair.id,
      sourceRef: affixedFormPairSourceRef(input.lessonNumber, pair),
      root: pair.root,
      derived: pair.derived,
      allomorphRule: pair.allomorphRule,
      patternSourceRef: affixedFormPairSourceRef(input.lessonNumber, pair),
    })),
  }
  const sharedProjection = projectCapabilities(snapshot)
  // Decision 4: concatenate shared catalog + podcast rules. Staging-driven
  // call sites never carry podcast snapshots, so projectPodcastCapabilities
  // returns [] in this path; the wiring exists for symmetry with other callers.
  const projection = {
    ...sharedProjection,
    capabilities: [...sharedProjection.capabilities, ...projectPodcastCapabilities(snapshot)],
  }

  function relationshipKindForCapability(capability: ProjectedCapability): StagingCapability['relationshipKind'] {
    if (capability.capabilityType === 'l1_to_id_choice') return 'introduced_by'
    return capability.capabilityType.includes('recognition') ? 'introduced_by' : 'practiced_by'
  }

  // ADR 0006: stamp lessonId on every lesson-derived capability. Podcast
  // source kinds are exempt (the constraint admits null only for podcasts).
  // When input.lessonId is missing (offline generator with no service key),
  // emit null and let the next publish overwrite. The runner's DB writes
  // remain the authoritative source.
  const PODCAST_SOURCE_KINDS = new Set(['podcast_segment', 'podcast_phrase'])
  const capabilities: StagingCapability[] = projection.capabilities.map((capability: ProjectedCapability) => {
    const unit = itemUnitsBySourceRef.get(capability.sourceRef)
      ?? patternUnitsBySourceRef.get(capability.sourceRef)
      ?? affixedPairUnitsBySourceRef.get(capability.sourceRef)
    return {
      ...capability,
      lessonId: PODCAST_SOURCE_KINDS.has(capability.sourceKind)
        ? null
        : (input.lessonId ?? null),
      contentUnitSlugs: unit ? [unit.unit_slug] : [],
      relationshipKind: relationshipKindForCapability(capability),
    }
  })

  // Build the per-kind artifact context from the (deduped) staging input, keyed
  // on the same sourceRef helpers that drive content-unit emission. Capabilities
  // look up their source row by sourceRef, then materialize the concrete
  // payload for each required artifact kind.
  const artifactCtx: ArtifactBuildContext = {
    learningItemsBySourceRef: new Map(
      learningItems.map(item => [
        sourceRefForLearningItem(item.base_text),
        { base_text: item.base_text, translation_nl: item.translation_nl },
      ]),
    ),
    grammarPatternsBySourceRef: new Map(
      input.grammarPatterns.map(pattern => [
        grammarSourceRef(input.lessonNumber, pattern.slug),
        {
          pattern_name: pattern.pattern_name,
          description: pattern.description,
          example: pattern.example,
        },
      ]),
    ),
    affixedFormPairsBySourceRef: new Map(
      (input.affixedFormPairs ?? []).map(pair => [
        affixedFormPairSourceRef(input.lessonNumber, pair),
        { root: pair.root, derived: pair.derived, allomorphRule: pair.allomorphRule },
      ]),
    ),
    audioClipsByNormalizedText,
  }

  return {
    capabilities,
    exerciseAssets: capabilities.flatMap(cap => buildArtifactsForCapability(cap, artifactCtx)),
  }
}

export function validateCapabilityStaging(input: {
  capabilities: StagingCapability[]
  contentUnits: StagingContentUnit[]
}): PipelineFinding[] {
  const findings: PipelineFinding[] = []
  const unitSlugs = new Set(input.contentUnits.map(unit => unit.unit_slug))

  for (const capability of input.capabilities) {
    if (!capability.contentUnitSlugs.length) {
      findings.push(finding('CRITICAL', 'capability-content-unit-missing', 'Capability has no content-unit relationship', capability.canonicalKey))
      continue
    }
    for (const slug of capability.contentUnitSlugs) {
      if (!unitSlugs.has(slug)) {
        findings.push(finding('CRITICAL', 'capability-content-unit-missing', `Unknown content unit "${slug}"`, capability.canonicalKey))
      }
    }
  }

  return findings
}

const VALID_ASSET_STATUSES = new Set(['draft', 'approved', 'blocked'])
const VALID_ARTIFACT_KINDS = new Set<string>(ARTIFACT_KINDS)

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString)
}

export function hasConcreteArtifactPayload(artifactKind: ArtifactKind | string, payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const record = payload as Record<string, unknown>
  if (record.placeholder === true) return false

  switch (artifactKind) {
    case 'base_text':
    case 'meaning:l1':
    case 'meaning:nl':
    case 'meaning:en':
    case 'translation:l1':
    case 'pattern_explanation:l1':
    case 'pattern_example':
    case 'cloze_answer':
      return nonEmptyString(record.value)
    case 'accepted_answers:id':
    case 'accepted_answers:l1':
      return nonEmptyStringArray(record.values)
    case 'cloze_context':
      return nonEmptyString(record.sentence) && nonEmptyString(record.answer)
    case 'audio_clip':
    case 'audio_segment':
      return nonEmptyString(record.storagePath) || nonEmptyString(record.url)
    case 'exercise_variant':
      return nonEmptyString(record.variantId) || Boolean(record.payload)
    case 'transcript_segment':
      return nonEmptyString(record.transcript)
    case 'root_derived_pair':
      return nonEmptyString(record.root) && nonEmptyString(record.derived)
    case 'allomorph_rule':
      return nonEmptyString(record.rule)
    case 'minimal_pair':
      return nonEmptyStringArray(record.values)
    case 'dialogue_speaker_context':
      return nonEmptyString(record.speaker) || nonEmptyString(record.context)
    case 'podcast_gist_prompt':
      return nonEmptyString(record.prompt)
    case 'timecoded_phrase':
      return nonEmptyString(record.phrase) && typeof record.startMs === 'number'
    case 'production_rubric':
      return nonEmptyString(record.rubric) || nonEmptyStringArray(record.criteria)
    default:
      return false
  }
}

function hasTypedApprovedValue(artifactKind: string, payload: Record<string, unknown>): boolean {
  return hasConcreteArtifactPayload(artifactKind, payload)
}

export function validateExerciseAssets(input: {
  exerciseAssets: StagingExerciseAsset[]
  capabilities: StagingCapability[]
}): PipelineFinding[] {
  const findings: PipelineFinding[] = []
  const capabilityByKey = new Map(input.capabilities.map(capability => [capability.canonicalKey, capability]))
  const assetKeys = new Set<string>()
  const coverage = new Set<string>()

  for (const asset of input.exerciseAssets) {
    const ref = asset?.asset_key ?? `${asset?.capability_key ?? '?'}:${asset?.artifact_kind ?? '?'}`
    if (!asset?.asset_key) {
      findings.push(finding('CRITICAL', 'exercise-asset-key-missing', 'Exercise asset is missing asset_key', ref))
    } else if (assetKeys.has(asset.asset_key)) {
      findings.push(finding('CRITICAL', 'exercise-asset-duplicate-key', `Duplicate asset_key "${asset.asset_key}"`, ref))
    }
    if (asset?.asset_key) assetKeys.add(asset.asset_key)

    if (!VALID_ASSET_STATUSES.has(asset?.quality_status)) {
      findings.push(finding('CRITICAL', 'exercise-asset-status-invalid', `Invalid quality_status "${asset?.quality_status ?? ''}"`, ref))
    }

    if (!VALID_ARTIFACT_KINDS.has(asset?.artifact_kind)) {
      findings.push(finding('CRITICAL', 'exercise-asset-kind-invalid', `Invalid artifact_kind "${asset?.artifact_kind ?? ''}"`, ref))
    }

    const capability = capabilityByKey.get(asset?.capability_key)
    if (!capability) {
      findings.push(finding('CRITICAL', 'exercise-asset-capability-missing', `Unknown capability "${asset?.capability_key ?? ''}"`, ref))
      continue
    }

    if (!capability.requiredArtifacts.includes(asset.artifact_kind as ArtifactKind)) {
      findings.push(finding('CRITICAL', 'exercise-asset-kind-not-required',
        `Artifact "${asset.artifact_kind}" is not required by capability "${asset.capability_key}"`, ref))
    }
    coverage.add(`${asset.capability_key}::${asset.artifact_kind}`)

    const payload = asset.payload_json && typeof asset.payload_json === 'object' ? asset.payload_json : {}
    if (asset.quality_status === 'approved' && payload.placeholder === true) {
      findings.push(finding('CRITICAL', 'exercise-asset-approved-placeholder',
        'Approved exercise asset still has placeholder=true; generated scaffolds must remain draft until reviewed typed artifacts replace them', ref))
    }
    if (asset.quality_status === 'approved' && !hasTypedApprovedValue(asset.artifact_kind, payload)) {
      findings.push(finding('CRITICAL', 'exercise-asset-approved-value-missing',
        'Approved exercise asset must provide a typed payload for its artifact kind', ref))
    }
  }

  for (const capability of input.capabilities) {
    for (const artifactKind of capability.requiredArtifacts) {
      if (!coverage.has(`${capability.canonicalKey}::${artifactKind}`)) {
        findings.push(finding('CRITICAL', 'exercise-asset-required-missing',
          `Missing required artifact "${artifactKind}" for capability "${capability.canonicalKey}"`, capability.canonicalKey))
      }
    }
  }

  return findings
}

