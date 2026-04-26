import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { projectCapabilities } from '../src/lib/capabilities/capabilityCatalog'
import {
  validateCapabilities,
  validateCapability,
  type CapabilityHealthReport,
  type ExerciseAvailabilityIndex,
} from '../src/lib/capabilities/capabilityContracts'
import type { ArtifactIndex } from '../src/lib/capabilities/artifactRegistry'
import type {
  ArtifactKind,
  CapabilitySourceProgressRequirement,
  CurrentContentSnapshot,
  CurrentLearningItem,
  ProjectedCapability,
} from '../src/lib/capabilities/capabilityTypes'
import { resolveExercise } from '../src/lib/exercises/exerciseResolver'
import { collectLessonCapabilityKeys } from './check-capability-release-readiness'

export interface CapabilityHealthExitCodeInput {
  strict: boolean
  criticalCount: number
}

export function getCapabilityHealthExitCode(input: CapabilityHealthExitCodeInput): 0 | 1 {
  return input.strict && input.criticalCount > 0 ? 1 : 0
}

export type CapabilityHealthArgs =
  | {
      strict: boolean
      mode: 'staging'
      stagingPath: string
    }
  | {
      strict: boolean
      mode: 'db'
      lesson: number
      sourceRef: string
    }

export interface CapabilityHealthFinding {
  severity: 'critical' | 'warning'
  rule: string
  detail: string
  canonicalKey?: string
}

export interface RuntimeHealthCapability {
  id?: string
  canonicalKey: string
  sourceKind?: ProjectedCapability['sourceKind']
  sourceRef: string
  capabilityType: ProjectedCapability['capabilityType']
  skillType: ProjectedCapability['skillType']
  direction?: ProjectedCapability['direction']
  modality?: ProjectedCapability['modality']
  learnerLanguage?: ProjectedCapability['learnerLanguage']
  projectionVersion?: ProjectedCapability['projectionVersion']
  readinessStatus: 'ready' | 'unknown' | 'blocked' | 'deprecated'
  publicationStatus: 'published' | 'draft' | 'archived'
  requiredArtifacts: ArtifactKind[]
  requiredSourceProgress?: CapabilitySourceProgressRequirement
  prerequisiteKeys?: string[]
  difficultyLevel?: number
  goalTags?: string[]
  sourceFingerprint?: string
  artifactFingerprint?: string
  exerciseAvailability?: ExerciseAvailabilityIndex
}

export interface RuntimeHealthArtifact {
  capabilityKey: string
  sourceRef?: string
  artifactKind: ArtifactKind
  qualityStatus: 'draft' | 'approved' | 'blocked' | 'deprecated'
  artifactJson: unknown
}

export interface CapabilityHealthSnapshot {
  knownSourceRefs: string[]
  capabilities: RuntimeHealthCapability[]
  artifacts: RuntimeHealthArtifact[]
}

export interface CapabilityRuntimeHealthReport {
  critical: CapabilityHealthFinding[]
  warnings: CapabilityHealthFinding[]
  criticalCount: number
  warningCount: number
}

export function parseCapabilityHealthArgs(args: string[]): CapabilityHealthArgs {
  const knownArgs = new Set(['--strict', '--staging', '--lesson', '--help'])
  for (const arg of args) {
    if (arg.startsWith('--') && !knownArgs.has(arg)) {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  const hasLesson = args.includes('--lesson')
  const hasStaging = args.includes('--staging')
  if (hasLesson && hasStaging) throw new Error('Use either --lesson or --staging, not both')

  const stagingIndex = args.indexOf('--staging')
  if (stagingIndex >= 0 && (!args[stagingIndex + 1] || args[stagingIndex + 1].startsWith('--'))) {
    throw new Error('--staging requires a path')
  }

  const lessonIndex = args.indexOf('--lesson')
  if (lessonIndex >= 0) {
    const rawLesson = args[lessonIndex + 1]
    if (!rawLesson || rawLesson.startsWith('--')) throw new Error('--lesson requires a number')
    const lesson = Number(rawLesson)
    if (!Number.isInteger(lesson) || lesson <= 0) throw new Error('--lesson requires a positive integer')
    return {
      strict: args.includes('--strict'),
      mode: 'db',
      lesson,
      sourceRef: `lesson-${lesson}`,
    }
  }

  return {
    strict: args.includes('--strict'),
    mode: 'staging',
    stagingPath: stagingIndex >= 0 ? args[stagingIndex + 1] : 'scripts/data/staging/lesson-1',
  }
}

function runtimeFinding(
  severity: CapabilityHealthFinding['severity'],
  rule: string,
  detail: string,
  canonicalKey?: string,
): CapabilityHealthFinding {
  return { severity, rule, detail, canonicalKey }
}

function toProjectedCapability(capability: RuntimeHealthCapability): ProjectedCapability {
  return {
    canonicalKey: capability.canonicalKey,
    sourceKind: capability.sourceKind ?? 'item',
    sourceRef: capability.sourceRef,
    capabilityType: capability.capabilityType,
    skillType: capability.skillType,
    direction: capability.direction ?? 'id_to_l1',
    modality: capability.modality ?? 'text',
    learnerLanguage: capability.learnerLanguage ?? 'nl',
    requiredArtifacts: capability.requiredArtifacts,
    requiredSourceProgress: capability.requiredSourceProgress,
    prerequisiteKeys: capability.prerequisiteKeys ?? [],
    difficultyLevel: capability.difficultyLevel ?? 1,
    goalTags: capability.goalTags ?? [],
    projectionVersion: capability.projectionVersion ?? 'v1',
    sourceFingerprint: capability.sourceFingerprint ?? capability.sourceRef,
    artifactFingerprint: capability.artifactFingerprint ?? capability.canonicalKey,
  }
}

function buildRuntimeArtifactIndex(artifacts: RuntimeHealthArtifact[]): ArtifactIndex {
  const index: ArtifactIndex = {}
  for (const artifact of artifacts) {
    if (!hasValidRuntimeArtifactPayload(artifact.artifactKind, artifact.artifactJson)) continue
    const value = artifact.artifactJson
    if (value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>).placeholder === true) {
      continue
    }
    index[artifact.artifactKind] ??= []
    index[artifact.artifactKind]!.push({
      qualityStatus: artifact.qualityStatus,
      capabilityKey: artifact.capabilityKey,
      sourceRef: artifact.sourceRef,
      value,
    })
  }
  return index
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString)
}

function hasValidRuntimeArtifactPayload(kind: ArtifactKind, payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const record = payload as Record<string, unknown>
  if (record.placeholder === true) return false

  switch (kind) {
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

export function checkCapabilityHealthSnapshot(snapshot: CapabilityHealthSnapshot): CapabilityRuntimeHealthReport {
  const critical: CapabilityHealthFinding[] = []
  const warnings: CapabilityHealthFinding[] = []
  const knownSourceRefs = new Set(snapshot.knownSourceRefs)
  const artifactIndex = buildRuntimeArtifactIndex(snapshot.artifacts)

  for (const capability of snapshot.capabilities) {
    const isRuntimeSchedulable = capability.readinessStatus === 'ready' && capability.publicationStatus === 'published'
    if (!isRuntimeSchedulable) {
      warnings.push(runtimeFinding(
        'warning',
        'capability_not_runtime_schedulable',
        `Capability is ${capability.readinessStatus}/${capability.publicationStatus}; sessions will not schedule it.`,
        capability.canonicalKey,
      ))
      continue
    }

    const projected = toProjectedCapability(capability)
    const approvedInvalidArtifacts = snapshot.artifacts.filter(artifact => (
      artifact.capabilityKey === capability.canonicalKey
      && artifact.qualityStatus === 'approved'
      && !hasValidRuntimeArtifactPayload(artifact.artifactKind, artifact.artifactJson)
    ))
    for (const artifact of approvedInvalidArtifacts) {
      critical.push(runtimeFinding(
        'critical',
        'ready_capability_invalid_approved_artifact_payload',
        `Approved artifact "${artifact.artifactKind}" does not satisfy its payload contract.`,
        capability.canonicalKey,
      ))
    }

    const progressRequirement = projected.requiredSourceProgress
    if (
      progressRequirement?.kind === 'source_progress'
      && !knownSourceRefs.has(progressRequirement.sourceRef)
    ) {
      critical.push(runtimeFinding(
        'critical',
        'ready_capability_unknown_source_progress_ref',
        `Required source progress ref "${progressRequirement.sourceRef}" is not present in the lesson/source graph.`,
        capability.canonicalKey,
      ))
    }

    const readiness = validateCapability({
      capability: projected,
      artifacts: artifactIndex,
      exerciseAvailability: capability.exerciseAvailability,
    })
    if (readiness.status === 'blocked' && readiness.missingArtifacts.length > 0) {
      critical.push(runtimeFinding(
        'critical',
        'ready_capability_missing_approved_artifact',
        readiness.reason,
        capability.canonicalKey,
      ))
      continue
    }
    if (readiness.status !== 'ready') {
      critical.push(runtimeFinding(
        'critical',
        'ready_capability_unresolvable_exercise',
        'reason' in readiness ? readiness.reason : `Capability readiness resolved to ${readiness.status}.`,
        capability.canonicalKey,
      ))
      continue
    }

    const resolution = resolveExercise({
      capability: projected,
      readiness,
      artifactIndex,
    })
    if (resolution.status === 'failed') {
      critical.push(runtimeFinding(
        'critical',
        'ready_capability_unresolvable_exercise',
        resolution.details,
        capability.canonicalKey,
      ))
    }
  }

  return {
    critical,
    warnings,
    criticalCount: critical.length,
    warningCount: warnings.length,
  }
}

function stableItemId(item: { base_text?: string; baseText?: string }, index: number): string {
  const text = item.base_text ?? item.baseText ?? `item-${index + 1}`
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `item-${index + 1}`
}

function stableSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function inferLessonSourceRef(absolutePath: string): string {
  const folderName = path.basename(absolutePath).toLowerCase()
  const match = folderName.match(/^lesson-?0*(\d+)$/)
  return match ? `lesson-${Number(match[1])}` : 'lesson-1'
}

function examplesFromPattern(pattern: Record<string, unknown>): string[] {
  if (Array.isArray(pattern.examples)) return pattern.examples.map(String).filter(Boolean)
  const description = String(pattern.description ?? '')
  return Array.from(description.matchAll(/['"]([^'"]{2,})['"]/g))
    .map(match => match[1]?.trim() ?? '')
    .filter(example => example.length > 0)
}

export async function loadStagedContentSnapshot(stagingPath: string): Promise<{
  snapshot: CurrentContentSnapshot
  artifacts: ArtifactIndex
}> {
  const absolutePath = path.resolve(stagingPath)
  if (!existsSync(absolutePath)) {
    throw new Error(`Staging path does not exist: ${stagingPath}`)
  }

  const learningItemsPath = path.join(absolutePath, 'learning-items.ts')
  const grammarPatternsPath = path.join(absolutePath, 'grammar-patterns.ts')
  const podcastSegmentsPath = path.join(absolutePath, 'podcast-segments.ts')
  const podcastPhrasesPath = path.join(absolutePath, 'podcast-phrases.ts')
  const morphologyPatternsPath = path.join(absolutePath, 'morphology-patterns.ts')
  const learningItemsModule = existsSync(learningItemsPath)
    ? await import(pathToFileURL(learningItemsPath).href) as { learningItems?: Array<Record<string, unknown>> }
    : { learningItems: [] }
  const grammarPatternsModule = existsSync(grammarPatternsPath)
    ? await import(pathToFileURL(grammarPatternsPath).href) as { grammarPatterns?: Array<Record<string, unknown>> }
    : { grammarPatterns: [] }
  const podcastSegmentsModule = existsSync(podcastSegmentsPath)
    ? await import(pathToFileURL(podcastSegmentsPath).href) as { podcastSegments?: Array<Record<string, unknown>> }
    : { podcastSegments: [] }
  const podcastPhrasesModule = existsSync(podcastPhrasesPath)
    ? await import(pathToFileURL(podcastPhrasesPath).href) as { podcastPhrases?: Array<Record<string, unknown>> }
    : { podcastPhrases: [] }
  const morphologyPatternsModule = existsSync(morphologyPatternsPath)
    ? await import(pathToFileURL(morphologyPatternsPath).href) as { affixedFormPairs?: Array<Record<string, unknown>> }
    : { affixedFormPairs: [] }

  const learningItems: CurrentLearningItem[] = (learningItemsModule.learningItems ?? []).map((item, index) => {
    const id = String(item.id ?? stableItemId(item, index))
    return {
      id,
      baseText: String(item.base_text ?? item.baseText ?? ''),
      meanings: [
        { language: 'nl', text: String(item.translation_nl ?? '') },
        { language: 'en', text: String(item.translation_en ?? '') },
      ].filter(meaning => meaning.text.length > 0),
      acceptedAnswers: {
        id: [String(item.base_text ?? item.baseText ?? '')].filter(Boolean),
        l1: [String(item.translation_nl ?? item.translation_en ?? '')].filter(Boolean),
      },
      hasAudio: false,
    }
  })

  const lessonSourceRef = inferLessonSourceRef(absolutePath)
  const grammarPatterns = (grammarPatternsModule.grammarPatterns ?? []).map((pattern, index) => {
    const slug = String(pattern.slug ?? pattern.id ?? `pattern-${index + 1}`)
    return {
      id: String(pattern.id ?? slug),
      sourceRef: String(pattern.source_ref ?? pattern.sourceRef ?? `${lessonSourceRef}/pattern-${stableSlug(slug) || index + 1}`),
      name: String(pattern.name ?? pattern.pattern_name ?? `Pattern ${index + 1}`),
      examples: examplesFromPattern(pattern),
    }
  })

  const podcastSegments = (podcastSegmentsModule.podcastSegments ?? []).map((segment, index) => ({
    id: String(segment.id ?? `podcast-segment-${index + 1}`),
    sourceRef: String(segment.source_ref ?? segment.sourceRef ?? `podcast/segment-${index + 1}`),
    hasAudio: segment.hasAudio !== false,
    transcript: String(segment.transcript ?? ''),
    gistPrompt: String(segment.gistPrompt ?? segment.gist_prompt ?? ''),
    exposureOnly: segment.exposureOnly !== false,
  }))

  const podcastPhrases = (podcastPhrasesModule.podcastPhrases ?? []).map((phrase, index) => ({
    id: String(phrase.id ?? `podcast-phrase-${index + 1}`),
    sourceRef: String(phrase.source_ref ?? phrase.sourceRef ?? `podcast/phrase-${index + 1}`),
    text: String(phrase.text ?? phrase.phrase ?? ''),
    translation: String(phrase.translation ?? phrase.translation_nl ?? phrase.translation_en ?? ''),
    segmentSourceRef: phrase.segmentSourceRef != null || phrase.segment_source_ref != null
      ? String(phrase.segmentSourceRef ?? phrase.segment_source_ref)
      : undefined,
  }))

  const affixedFormPairs = (morphologyPatternsModule.affixedFormPairs ?? []).map((pair, index) => ({
    id: String(pair.id ?? `affixed-form-pair-${index + 1}`),
    sourceRef: String(pair.source_ref ?? pair.sourceRef ?? `morphology/pair-${index + 1}`),
    root: String(pair.root ?? ''),
    derived: String(pair.derived ?? ''),
    allomorphRule: pair.allomorphRule != null || pair.allomorph_rule != null
      ? String(pair.allomorphRule ?? pair.allomorph_rule)
      : undefined,
    patternSourceRef: pair.patternSourceRef != null || pair.pattern_source_ref != null
      ? String(pair.patternSourceRef ?? pair.pattern_source_ref)
      : undefined,
  }))

  const artifacts: ArtifactIndex = {}
  const addArtifact = (kind: ArtifactKind, sourceRef: string, approved: boolean): void => {
    artifacts[kind] = [
      ...(artifacts[kind] ?? []),
      { qualityStatus: approved ? 'approved' : 'blocked', sourceRef },
    ]
  }

  for (const item of learningItems) {
    const sourceRef = `learning_items/${item.id}`
    addArtifact('base_text', sourceRef, item.baseText.length > 0)
    addArtifact('meaning:l1', sourceRef, item.meanings.length > 0)
    addArtifact('accepted_answers:l1', sourceRef, (item.acceptedAnswers?.l1?.length ?? 0) > 0)
    addArtifact('accepted_answers:id', sourceRef, (item.acceptedAnswers?.id?.length ?? 0) > 0)
  }

  for (const pattern of grammarPatterns) {
    addArtifact('pattern_explanation:l1', pattern.sourceRef, pattern.name.length > 0)
    addArtifact('pattern_example', pattern.sourceRef, pattern.examples.length > 0)
  }

  for (const segment of podcastSegments) {
    addArtifact('audio_segment', segment.sourceRef, segment.hasAudio)
    addArtifact('transcript_segment', segment.sourceRef, segment.transcript.length > 0)
    addArtifact('podcast_gist_prompt', segment.sourceRef, segment.gistPrompt.length > 0)
  }

  for (const phrase of podcastPhrases) {
    addArtifact('timecoded_phrase', phrase.sourceRef, phrase.text.length > 0)
    addArtifact('translation:l1', phrase.sourceRef, (phrase.translation?.length ?? 0) > 0)
  }

  for (const pair of affixedFormPairs) {
    addArtifact('root_derived_pair', pair.sourceRef, pair.root.length > 0 && pair.derived.length > 0)
    if (pair.allomorphRule) {
      addArtifact('allomorph_rule', pair.sourceRef, pair.allomorphRule.length > 0)
    }
  }

  return {
    snapshot: {
      learningItems,
      grammarPatterns,
      podcastSegments,
      podcastPhrases,
      affixedFormPairs,
      stagedLessons: [],
    },
    artifacts,
  }
}

export async function buildCapabilityHealthReport(stagingPath: string): Promise<CapabilityHealthReport> {
  const { snapshot, artifacts } = await loadStagedContentSnapshot(stagingPath)
  return validateCapabilities({
    projection: projectCapabilities(snapshot),
    artifacts,
  })
}

export interface DbLessonBlockScope {
  source_refs?: string[] | null
  content_unit_slugs?: string[] | null
}

export interface DbContentUnitScope {
  id: string
  source_ref?: string | null
  source_section_ref?: string | null
  unit_slug?: string | null
}

export function filterScopedContentUnits(input: {
  lessonSourceRef: string
  blocks: DbLessonBlockScope[]
  contentUnits: DbContentUnitScope[]
}): DbContentUnitScope[] {
  const allowedSourceRefsBySlug = new Map<string, Set<string>>()
  for (const block of input.blocks) {
    const sourceRefs = new Set(block.source_refs ?? [])
    for (const slug of block.content_unit_slugs ?? []) {
      const existing = allowedSourceRefsBySlug.get(slug) ?? new Set<string>()
      for (const sourceRef of sourceRefs) existing.add(sourceRef)
      allowedSourceRefsBySlug.set(slug, existing)
    }
  }

  return input.contentUnits.filter(unit => {
    if (!unit.unit_slug) return false
    const allowedSourceRefs = allowedSourceRefsBySlug.get(unit.unit_slug)
    if (!allowedSourceRefs) return false
    const sectionIsInLesson = typeof unit.source_section_ref === 'string'
      && unit.source_section_ref.startsWith(`${input.lessonSourceRef}/`)
    const sourceMatchesBlock = typeof unit.source_ref === 'string'
      && allowedSourceRefs.has(unit.source_ref)
    const sourceIsLesson = unit.source_ref === input.lessonSourceRef
    return sectionIsInLesson && (sourceMatchesBlock || sourceIsLesson)
  })
}

function createServiceClient() {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required')
  return createClient(url, serviceKey)
}

function metadataStringArray(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key]
  return Array.isArray(value) ? value.map(String) : []
}

function toRuntimeCapability(row: Record<string, unknown>): RuntimeHealthCapability {
  const metadata = row.metadata_json && typeof row.metadata_json === 'object'
    ? row.metadata_json as Record<string, unknown>
    : {}
  return {
    id: String(row.id ?? ''),
    canonicalKey: String(row.canonical_key ?? ''),
    sourceKind: row.source_kind as RuntimeHealthCapability['sourceKind'],
    sourceRef: String(row.source_ref ?? ''),
    capabilityType: row.capability_type as RuntimeHealthCapability['capabilityType'],
    skillType: String(metadata.skillType ?? row.capability_type ?? 'recognition') as RuntimeHealthCapability['skillType'],
    direction: row.direction as RuntimeHealthCapability['direction'],
    modality: row.modality as RuntimeHealthCapability['modality'],
    learnerLanguage: row.learner_language as RuntimeHealthCapability['learnerLanguage'],
    projectionVersion: row.projection_version as RuntimeHealthCapability['projectionVersion'],
    readinessStatus: row.readiness_status as RuntimeHealthCapability['readinessStatus'],
    publicationStatus: row.publication_status as RuntimeHealthCapability['publicationStatus'],
    requiredArtifacts: metadataStringArray(metadata, 'requiredArtifacts') as ArtifactKind[],
    requiredSourceProgress: metadata.requiredSourceProgress as CapabilitySourceProgressRequirement | undefined,
    prerequisiteKeys: metadataStringArray(metadata, 'prerequisiteKeys'),
    difficultyLevel: typeof metadata.difficultyLevel === 'number' ? metadata.difficultyLevel : 1,
    goalTags: metadataStringArray(metadata, 'goalTags'),
    sourceFingerprint: String(row.source_fingerprint ?? ''),
    artifactFingerprint: String(row.artifact_fingerprint ?? ''),
  }
}

export async function loadDbCapabilityHealthSnapshot(args: Extract<CapabilityHealthArgs, { mode: 'db' }>): Promise<CapabilityHealthSnapshot> {
  const supabase = createServiceClient()
  const db = () => supabase.schema('indonesian')

  const { data: blocks, error: blocksError } = await db()
    .from('lesson_page_blocks')
    .select('source_ref, source_refs, content_unit_slugs, capability_key_refs')
    .eq('source_ref', args.sourceRef)
  if (blocksError) throw blocksError
  const lessonBlocks = (blocks ?? []) as Array<{
    source_ref?: string | null
    source_refs?: string[] | null
    content_unit_slugs?: string[] | null
    capability_key_refs?: string[] | null
  }>

  const contentUnitSlugs = [...new Set(lessonBlocks.flatMap(block => block.content_unit_slugs ?? []))]
  const contentUnitsResult = contentUnitSlugs.length > 0
    ? await db()
        .from('content_units')
        .select('id, source_ref, source_section_ref, unit_slug')
        .in('unit_slug', contentUnitSlugs)
    : { data: [], error: null }
  if (contentUnitsResult.error) throw contentUnitsResult.error
  const contentUnits = filterScopedContentUnits({
    lessonSourceRef: args.sourceRef,
    blocks: lessonBlocks,
    contentUnits: (contentUnitsResult.data ?? []) as Array<{
    id: string
    source_ref?: string | null
    source_section_ref?: string | null
    unit_slug?: string | null
    }>,
  })

  const relationshipRows = contentUnits.length > 0
    ? await db()
        .from('capability_content_units')
        .select('capability:learning_capabilities(canonical_key)')
        .in('content_unit_id', contentUnits.map(unit => unit.id))
    : { data: [], error: null }
  if (relationshipRows.error) throw relationshipRows.error
  const relationshipCapabilities = ((relationshipRows.data ?? []) as Array<{ capability?: { canonical_key: string } | null }>)
    .map(row => row.capability)
    .filter((row): row is { canonical_key: string } => Boolean(row?.canonical_key))
  const scopedCapabilityKeys = collectLessonCapabilityKeys({
    lessonPageBlocks: lessonBlocks.map(block => ({ capability_key_refs: block.capability_key_refs })),
    relationshipCapabilities,
  })

  const capabilityResult = scopedCapabilityKeys.length > 0
    ? await db()
        .from('learning_capabilities')
        .select('*')
        .in('canonical_key', scopedCapabilityKeys)
    : { data: [], error: null }
  if (capabilityResult.error) throw capabilityResult.error
  const capabilityRows = (capabilityResult.data ?? []) as Array<Record<string, unknown>>
  const capabilityIdByKey = new Map(capabilityRows.map(row => [String(row.canonical_key ?? ''), String(row.id ?? '')]))
  const capabilityKeyById = new Map([...capabilityIdByKey.entries()].map(([key, id]) => [id, key]))

  const artifactResult = capabilityRows.length > 0
    ? await db()
        .from('capability_artifacts')
        .select('capability_id, artifact_kind, quality_status, artifact_json')
        .in('capability_id', capabilityRows.map(row => String(row.id ?? '')))
    : { data: [], error: null }
  if (artifactResult.error) throw artifactResult.error

  const knownSourceRefs = new Set<string>([args.sourceRef])
  for (const block of lessonBlocks) {
    if (block.source_ref) knownSourceRefs.add(block.source_ref)
    for (const sourceRef of block.source_refs ?? []) knownSourceRefs.add(sourceRef)
  }
  for (const unit of contentUnits) {
    if (unit.source_ref) knownSourceRefs.add(unit.source_ref)
    if (unit.source_section_ref) knownSourceRefs.add(unit.source_section_ref)
  }
  for (const row of capabilityRows) {
    if (typeof row.source_ref === 'string') knownSourceRefs.add(row.source_ref)
  }

  return {
    knownSourceRefs: [...knownSourceRefs],
    capabilities: capabilityRows.map(toRuntimeCapability),
    artifacts: ((artifactResult.data ?? []) as Array<Record<string, unknown>>).map(artifact => {
      const capabilityId = String(artifact.capability_id ?? '')
      const capabilityKey = capabilityKeyById.get(capabilityId) ?? ''
      const capability = capabilityRows.find(row => String(row.id ?? '') === capabilityId)
      return {
        capabilityKey,
        sourceRef: typeof capability?.source_ref === 'string' ? capability.source_ref : undefined,
        artifactKind: artifact.artifact_kind as ArtifactKind,
        qualityStatus: artifact.quality_status as RuntimeHealthArtifact['qualityStatus'],
        artifactJson: artifact.artifact_json,
      }
    }),
  }
}

export async function buildDbCapabilityHealthReport(args: Extract<CapabilityHealthArgs, { mode: 'db' }>): Promise<CapabilityRuntimeHealthReport> {
  return checkCapabilityHealthSnapshot(await loadDbCapabilityHealthSnapshot(args))
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: npx tsx scripts/check-capability-health.ts [--staging scripts/data/staging/lesson-N | --lesson N] [--strict]')
    process.exit(0)
  }

  try {
    const args = parseCapabilityHealthArgs(process.argv.slice(2))
    const report = args.mode === 'staging'
      ? await buildCapabilityHealthReport(args.stagingPath)
      : await buildDbCapabilityHealthReport(args)
    console.log(JSON.stringify(report, null, 2))
    process.exit(getCapabilityHealthExitCode({ strict: args.strict, criticalCount: report.criticalCount }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
}

if (isMainModule()) {
  main()
}
