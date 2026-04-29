import { projectCapabilities } from '../../src/lib/capabilities/capabilityCatalog'
import { ARTIFACT_KINDS } from '../../src/lib/capabilities/artifactRegistry'
import type {
  ArtifactKind,
  CapabilitySourceProgressRequirement,
  CurrentAffixedFormPair,
  ProjectedCapability,
} from '../../src/lib/capabilities/capabilityTypes'
import type { SkillType } from '../../src/types/learning'

export type PipelineSeverity = 'CRITICAL' | 'WARNING'

export interface PipelineFinding {
  severity: PipelineSeverity
  rule: string
  detail: string
  ref?: string
}

export interface StagingLessonInput {
  lessonNumber: number
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

export interface StagingLessonPageBlock {
  block_key: string
  source_ref: string
  source_refs: string[]
  content_unit_slugs: string[]
  block_kind: 'hero' | 'section' | 'exposure' | 'practice_bridge' | 'recap'
  display_order: number
  payload_json: Record<string, unknown>
  source_progress_event?: Extract<
    CapabilitySourceProgressRequirement,
    { kind: 'source_progress' }
  >['requiredState']
  capability_key_refs: string[]
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

function sourceRefForLearningItem(baseText: string): string {
  return `learning_items/${stableSlug(baseText)}`
}

function grammarSourceRef(lessonNumber: number, slug: string): string {
  return `${sourceRefForLesson(lessonNumber)}/pattern-${stableSlug(slug)}`
}

function affixedFormPairSourceRef(lessonNumber: number, pair: CurrentAffixedFormPair): string {
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

function skillTypeForCapability(capability: ProjectedCapability): SkillType {
  return capability.skillType
}

function draftArtifactAssets(capability: ProjectedCapability): StagingExerciseAsset[] {
  return capability.requiredArtifacts.map(artifactKind => ({
    asset_key: `${capability.canonicalKey}:${artifactKind}`,
    capability_key: capability.canonicalKey,
    artifact_kind: artifactKind,
    quality_status: 'draft',
    payload_json: {
      sourceRef: capability.sourceRef,
      capabilityType: capability.capabilityType,
      skillType: skillTypeForCapability(capability),
      placeholder: true,
      reason: 'Generated scaffold only; a reviewed typed artifact must approve this.',
    },
  }))
}

export function buildCapabilityStagingFromContent(input: StagingLessonInput & {
  contentUnits: StagingContentUnit[]
}): CapabilityStagingPlan {
  const learningItems = dedupeLearningItems(input.learningItems)
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

  const projection = projectCapabilities({
    learningItems: learningItems.map(item => ({
      id: stableSlug(item.base_text),
      baseText: item.base_text,
      meanings: [
        ...(item.translation_nl ? [{ language: 'nl' as const, text: item.translation_nl }] : []),
        ...(item.translation_en ? [{ language: 'en' as const, text: item.translation_en }] : []),
      ],
      acceptedAnswers: {
        id: [item.base_text],
        l1: [item.translation_nl ?? item.translation_en ?? ''].filter(Boolean),
      },
      hasAudio: false,
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
  })

  function relationshipKindForCapability(capability: ProjectedCapability): StagingCapability['relationshipKind'] {
    if (capability.capabilityType === 'l1_to_id_choice') return 'introduced_by'
    return capability.capabilityType.includes('recognition') ? 'introduced_by' : 'practiced_by'
  }

  const capabilities: StagingCapability[] = projection.capabilities.map((capability: ProjectedCapability) => {
    const unit = itemUnitsBySourceRef.get(capability.sourceRef)
      ?? patternUnitsBySourceRef.get(capability.sourceRef)
      ?? affixedPairUnitsBySourceRef.get(capability.sourceRef)
    return {
      ...capability,
      contentUnitSlugs: unit ? [unit.unit_slug] : [],
      relationshipKind: relationshipKindForCapability(capability),
    }
  })

  return {
    capabilities,
    exerciseAssets: capabilities.flatMap(draftArtifactAssets),
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

function vocabStripTitle(contextType: string): string {
  switch (contextType) {
    case 'vocabulary_list': return 'Woordenschat'
    case 'numbers': return 'Getallen'
    case 'expressions': return 'Uitdrukkingen'
    case 'dialogue': return 'Dialoog'
    default: return contextType.replace(/_/g, ' ')
  }
}

function vocabStripPayloadType(contextType: string): string {
  if (contextType === 'vocabulary_list') return 'vocabulary'
  if (contextType === 'dialogue') return 'dialogue'
  if (contextType === 'numbers' || contextType === 'expressions') return contextType
  return 'reading'
}

export function buildLessonPageBlocksFromStaging(input: StagingLessonInput & {
  contentUnits: StagingContentUnit[]
  capabilities: StagingCapability[]
}): StagingLessonPageBlock[] {
  const lessonSourceRef = sourceRefForLesson(input.lessonNumber)
  const blocks: StagingLessonPageBlock[] = []

  const capabilitiesByUnitSlug = new Map<string, string[]>()
  for (const capability of input.capabilities) {
    for (const slug of capability.contentUnitSlugs) {
      const keys = capabilitiesByUnitSlug.get(slug) ?? []
      keys.push(capability.canonicalKey)
      capabilitiesByUnitSlug.set(slug, keys)
    }
  }

  const grammarPatternUnitsBySlug = new Map<string, StagingContentUnit>()
  for (const unit of input.contentUnits) {
    if (unit.unit_kind === 'grammar_pattern') {
      grammarPatternUnitsBySlug.set(unit.unit_slug, unit)
    }
  }

  // 1. Hero
  blocks.push({
    block_key: `${lessonSourceRef}-hero`,
    source_ref: lessonSourceRef,
    source_refs: [lessonSourceRef],
    content_unit_slugs: [],
    block_kind: 'hero',
    display_order: 0,
    payload_json: {
      title: input.lesson.title,
      level: input.lesson.level,
    },
    capability_key_refs: [],
  })

  // 2. Lesson sections (grammar -> reading section + pattern callouts; other types -> reading sections)
  for (const section of input.lesson.sections) {
    const sectionContent = section.content as Record<string, unknown>
    const contentType = typeof sectionContent.type === 'string' ? sectionContent.type : 'reading'
    const baseOrder = 100 + section.order_index * 100

    if (contentType === 'exercises') {
      // Exercises happen via /session?lesson=...&mode=lesson_practice; not a lesson-page block.
      continue
    }

    if (contentType === 'grammar') {
      const intro = sectionContent.intro
      const categories = Array.isArray(sectionContent.categories) ? sectionContent.categories : []

      if (typeof intro === 'string' && intro.trim()) {
        blocks.push({
          block_key: `${lessonSourceRef}-section-${section.order_index}-grammar-intro`,
          source_ref: lessonSourceRef,
          source_refs: [lessonSourceRef],
          content_unit_slugs: [],
          block_kind: 'section',
          display_order: baseOrder,
          payload_json: {
            type: 'grammar',
            title: section.title,
            intro,
          },
          source_progress_event: 'pattern_noticing_seen',
          capability_key_refs: [],
        })
      }

      categories.forEach((rawCategory, idx) => {
        if (!rawCategory || typeof rawCategory !== 'object') return
        const category = rawCategory as Record<string, unknown>
        const title = typeof category.title === 'string' && category.title.trim()
          ? category.title
          : `${section.title} ${idx + 1}`
        const slug = stableSlug(title) || `category-${idx + 1}`
        const patternUnit = grammarPatternUnitsBySlug.get(`pattern-${slug}`)
        blocks.push({
          block_key: `${lessonSourceRef}-section-${section.order_index}-pattern-${slug}`,
          source_ref: lessonSourceRef,
          source_refs: [lessonSourceRef],
          content_unit_slugs: patternUnit ? [patternUnit.unit_slug] : [],
          block_kind: 'section',
          display_order: baseOrder + 10 + idx,
          payload_json: {
            type: 'grammar',
            title,
            categories: [category],
          },
          source_progress_event: 'pattern_noticing_seen',
          capability_key_refs: patternUnit ? capabilitiesByUnitSlug.get(patternUnit.unit_slug) ?? [] : [],
        })
      })
    } else {
      // Generic reading section (text/culture/pronunciation/etc.)
      blocks.push({
        block_key: `${lessonSourceRef}-section-${section.order_index}`,
        source_ref: lessonSourceRef,
        source_refs: [lessonSourceRef],
        content_unit_slugs: [],
        block_kind: 'section',
        display_order: baseOrder,
        payload_json: {
          ...sectionContent,
          type: contentType,
          title: section.title,
        },
        source_progress_event: 'section_exposed',
        capability_key_refs: [],
      })
    }
  }

  // 3. Affixed form pairs (morphology, e.g. lesson 9): one Morfologie block per lesson grouping all pairs as cards
  const affixedFormPairUnits = input.contentUnits.filter(unit => unit.unit_kind === 'affixed_form_pair')
  if (affixedFormPairUnits.length > 0) {
    const pairSourceRefs = new Set<string>([lessonSourceRef])
    for (const unit of affixedFormPairUnits) {
      pairSourceRefs.add(unit.source_ref)
      const patternSourceRef = typeof unit.payload_json.patternSourceRef === 'string'
        ? unit.payload_json.patternSourceRef
        : null
      if (patternSourceRef) pairSourceRefs.add(patternSourceRef)
    }
    blocks.push({
      block_key: `${lessonSourceRef}-morphology`,
      source_ref: lessonSourceRef,
      source_refs: [...pairSourceRefs],
      content_unit_slugs: affixedFormPairUnits.map(unit => unit.unit_slug),
      block_kind: 'section',
      display_order: 500,
      payload_json: {
        type: 'morphology',
        title: 'Morfologie',
        items: affixedFormPairUnits.map(unit => ({
          indonesian: typeof unit.payload_json.derived === 'string' ? unit.payload_json.derived : '',
          dutch: typeof unit.payload_json.root === 'string'
            ? `van ${unit.payload_json.root}`
            : '',
        })),
      },
      source_progress_event: 'pattern_noticing_seen',
      capability_key_refs: affixedFormPairUnits.flatMap(unit => capabilitiesByUnitSlug.get(unit.unit_slug) ?? []),
    })
  }

  // 4. Vocab strips: one block per learning-item context_type group
  const itemsByContext = new Map<string, StagingLessonInput['learningItems']>()
  for (const item of input.learningItems) {
    const arr = itemsByContext.get(item.context_type) ?? []
    arr.push(item)
    itemsByContext.set(item.context_type, arr)
  }

  const sortedContexts = [...itemsByContext.keys()].sort()
  sortedContexts.forEach((contextType, contextIdx) => {
    const items = itemsByContext.get(contextType) ?? []
    if (items.length === 0) return
    const itemUnitSlugs: string[] = []
    const stripCapabilityKeys: string[] = []
    for (const item of items) {
      const slug = `item-${stableSlug(item.base_text)}`
      itemUnitSlugs.push(slug)
      const keys = capabilitiesByUnitSlug.get(slug) ?? []
      stripCapabilityKeys.push(...keys)
    }
    blocks.push({
      block_key: `${lessonSourceRef}-${contextType.replace(/_/g, '-')}`,
      source_ref: lessonSourceRef,
      source_refs: [lessonSourceRef],
      content_unit_slugs: itemUnitSlugs,
      block_kind: 'section',
      display_order: 1000 + contextIdx * 10,
      payload_json: {
        type: vocabStripPayloadType(contextType),
        title: vocabStripTitle(contextType),
        items: items.map(item => ({
          indonesian: item.base_text,
          dutch: item.translation_nl ?? '',
        })),
      },
      source_progress_event: 'section_exposed',
      capability_key_refs: stripCapabilityKeys,
    })
  })

  // 4. Practice bridge: one block linking to lesson_practice mode
  const recognitionCapabilityKeys = input.capabilities
    .filter(capability => capability.capabilityType === 'text_recognition')
    .map(capability => capability.canonicalKey)
  blocks.push({
    block_key: `${lessonSourceRef}-practice-bridge`,
    source_ref: lessonSourceRef,
    source_refs: [lessonSourceRef],
    content_unit_slugs: [],
    block_kind: 'practice_bridge',
    display_order: 9000,
    payload_json: {
      label: 'Oefen deze les',
    },
    source_progress_event: 'intro_completed',
    capability_key_refs: recognitionCapabilityKeys,
  })

  // 5. Recap
  blocks.push({
    block_key: `${lessonSourceRef}-recap`,
    source_ref: lessonSourceRef,
    source_refs: [lessonSourceRef],
    content_unit_slugs: [],
    block_kind: 'recap',
    display_order: 9999,
    payload_json: { title: 'Samenvatting' },
    source_progress_event: 'lesson_completed',
    capability_key_refs: [],
  })

  return blocks
}

export function validateLessonPageBlocks(input: {
  blocks: StagingLessonPageBlock[]
  contentUnits: StagingContentUnit[]
  capabilities: StagingCapability[]
}): PipelineFinding[] {
  const findings: PipelineFinding[] = []
  const blockKeys = new Set<string>()
  const unitSlugs = new Set(input.contentUnits.map(unit => unit.unit_slug))
  const capabilityKeys = new Set(input.capabilities.map(capability => capability.canonicalKey))

  for (const block of input.blocks) {
    if (!isStableSlug(block.block_key)) {
      findings.push(finding('CRITICAL', 'lesson-block-key-not-stable', `Invalid block_key "${block.block_key}"`, block.block_key))
    }
    if (blockKeys.has(block.block_key)) {
      findings.push(finding('CRITICAL', 'lesson-block-duplicate-key', block.block_key, block.block_key))
    }
    blockKeys.add(block.block_key)

    for (const slug of block.content_unit_slugs) {
      if (!unitSlugs.has(slug)) {
        findings.push(finding('CRITICAL', 'lesson-block-content-unit-missing', `Unknown content unit "${slug}"`, block.block_key))
      }
    }
    for (const key of block.capability_key_refs) {
      if (!capabilityKeys.has(key)) {
        findings.push(finding('CRITICAL', 'lesson-block-capability-missing', `Unknown capability "${key}"`, block.block_key))
      }
    }
  }

  return findings
}
