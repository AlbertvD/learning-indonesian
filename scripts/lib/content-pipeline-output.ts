import { projectCapabilities } from '../../src/lib/capabilities/capabilityCatalog'
import { ARTIFACT_KINDS } from '../../src/lib/capabilities/artifactRegistry'
import type {
  ArtifactKind,
  CapabilitySourceProgressRequirement,
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
}

export interface StagingContentUnit {
  content_unit_key: string
  source_ref: string
  source_section_ref: string
  unit_kind: 'lesson_section' | 'learning_item' | 'grammar_pattern'
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

function finding(severity: PipelineSeverity, rule: string, detail: string, ref?: string): PipelineFinding {
  return { severity, rule, detail, ref }
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

  input.learningItems.forEach((item, index) => {
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

  const projection = projectCapabilities({
    learningItems: input.learningItems.map(item => ({
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
  })

  function relationshipKindForCapability(capability: ProjectedCapability): StagingCapability['relationshipKind'] {
    if (capability.capabilityType === 'l1_to_id_choice') return 'introduced_by'
    return capability.capabilityType.includes('recognition') ? 'introduced_by' : 'practiced_by'
  }

  const capabilities: StagingCapability[] = projection.capabilities.map((capability: ProjectedCapability) => {
    const unit = itemUnitsBySourceRef.get(capability.sourceRef)
      ?? patternUnitsBySourceRef.get(capability.sourceRef)
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

export function buildLessonPageBlocksFromStaging(input: StagingLessonInput & {
  contentUnits: StagingContentUnit[]
  capabilities: StagingCapability[]
}): StagingLessonPageBlock[] {
  const lessonSourceRef = sourceRefForLesson(input.lessonNumber)
  const blocks: StagingLessonPageBlock[] = [{
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
  }]

  const capabilitiesByUnitSlug = new Map<string, string[]>()
  for (const capability of input.capabilities) {
    for (const slug of capability.contentUnitSlugs) {
      const keys = capabilitiesByUnitSlug.get(slug) ?? []
      keys.push(capability.canonicalKey)
      capabilitiesByUnitSlug.set(slug, keys)
    }
  }

  input.contentUnits
    .filter(unit => unit.unit_kind !== 'lesson_section')
    .forEach((unit, index) => {
      blocks.push({
        block_key: `${lessonSourceRef}-${unit.unit_slug}-exposure`,
        source_ref: lessonSourceRef,
        source_refs: [unit.source_ref],
        content_unit_slugs: [unit.unit_slug],
        block_kind: 'exposure',
        display_order: 100 + index * 10,
        payload_json: unit.payload_json,
        source_progress_event: unit.unit_kind === 'grammar_pattern' ? 'pattern_noticing_seen' : 'section_exposed',
        capability_key_refs: capabilitiesByUnitSlug.get(unit.unit_slug) ?? [],
      })
      blocks.push({
        block_key: `${lessonSourceRef}-${unit.unit_slug}-practice`,
        source_ref: lessonSourceRef,
        source_refs: [unit.source_ref],
        content_unit_slugs: [unit.unit_slug],
        block_kind: 'practice_bridge',
        display_order: 101 + index * 10,
        payload_json: {
          label: 'Practice this content',
        },
        source_progress_event: unit.unit_kind === 'grammar_pattern' ? 'guided_practice_completed' : 'intro_completed',
        capability_key_refs: (capabilitiesByUnitSlug.get(unit.unit_slug) ?? []).filter(key => key.includes(':text_recognition:')),
      })
    })

  blocks.push({
    block_key: `${lessonSourceRef}-recap`,
    source_ref: lessonSourceRef,
    source_refs: [lessonSourceRef],
    content_unit_slugs: [],
    block_kind: 'recap',
    display_order: 9999,
    payload_json: { title: 'Recap' },
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
