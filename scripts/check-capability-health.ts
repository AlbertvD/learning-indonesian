import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  itemSlug,
  projectCapabilities,
  validateCapabilities,
  validateCapability,
  type CapabilityHealthReport,
  type CurrentContentSnapshot,
  type CurrentLearningItem,
  type ProjectedCapability,
} from '@/lib/capabilities'
import { projectPodcastCapabilities } from './lib/pipeline/podcast-stage/podcastProjectionRules'
import { resolveExercise } from '../src/lib/exercises/exerciseResolver'

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
  prerequisiteKeys?: string[]
  difficultyLevel?: number
  goalTags?: string[]
  sourceFingerprint?: string
}

export interface CapabilityHealthSnapshot {
  capabilities: RuntimeHealthCapability[]
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
    sourceKind: capability.sourceKind ?? 'vocabulary_src',
    sourceRef: capability.sourceRef,
    capabilityType: capability.capabilityType,
    skillType: capability.skillType,
    direction: capability.direction ?? 'id_to_l1',
    modality: capability.modality ?? 'text',
    learnerLanguage: capability.learnerLanguage ?? 'nl',
    // Slice 4b: required_artifacts retired; readiness no longer reads it.
    requiredArtifacts: [],
    prerequisiteKeys: capability.prerequisiteKeys ?? [],
    difficultyLevel: capability.difficultyLevel ?? 1,
    goalTags: capability.goalTags ?? [],
    projectionVersion: capability.projectionVersion ?? 'v1',
    sourceFingerprint: capability.sourceFingerprint ?? capability.sourceRef,
  }
}

export function checkCapabilityHealthSnapshot(snapshot: CapabilityHealthSnapshot): CapabilityRuntimeHealthReport {
  const critical: CapabilityHealthFinding[] = []
  const warnings: CapabilityHealthFinding[] = []

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

    // Slice 4b: readiness + exercise resolution are decided purely by the typed
    // RENDER_CONTRACTS routing (no capability_artifacts bag). A ready/published
    // cap that resolves to no exercise is the remaining failure mode.
    const readiness = validateCapability({ capability: projected })
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

// Wrapper kept (not deleted) so the index-fallback shape — required when
// base_text is empty in partial staging fixtures — stays colocated with the
// itemSlug delegation. Switching this from a hyphenating mangler to itemSlug
// is the audit-side counterpart to the issue #59 production fix; orphaned
// rows (caps whose source_ref doesn't match) now surface correctly here.
function stableItemId(item: { base_text?: string; baseText?: string }, index: number): string {
  const text = item.base_text ?? item.baseText ?? ''
  return itemSlug(text) || `item-${index + 1}`
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

  return {
    snapshot: {
      learningItems,
      grammarPatterns,
      podcastSegments,
      podcastPhrases,
      affixedFormPairs,
      stagedLessons: [],
    },
  }
}

export async function buildCapabilityHealthReport(stagingPath: string): Promise<CapabilityHealthReport> {
  const { snapshot } = await loadStagedContentSnapshot(stagingPath)
  // Decision 4: concatenate shared catalog + podcast rules.
  const projection = projectCapabilities(snapshot)
  const allCapabilities = [...projection.capabilities, ...projectPodcastCapabilities(snapshot)]
  return validateCapabilities({
    projection: { ...projection, capabilities: allCapabilities },
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
    prerequisiteKeys: metadataStringArray(metadata, 'prerequisiteKeys'),
    difficultyLevel: typeof metadata.difficultyLevel === 'number' ? metadata.difficultyLevel : 1,
    goalTags: metadataStringArray(metadata, 'goalTags'),
    sourceFingerprint: String(row.source_fingerprint ?? ''),
  }
}

export async function loadDbCapabilityHealthSnapshot(args: Extract<CapabilityHealthArgs, { mode: 'db' }>): Promise<CapabilityHealthSnapshot> {
  const supabase = createServiceClient()
  const db = () => supabase.schema('indonesian')

  // Scope by learning_capabilities.lesson_id (ADR 0006). The lesson-id is
  // derived from args.sourceRef which has the shape "lesson-<order_index>".
  //
  // Phase 1 of retiring lesson_page_blocks (2026-05-20): the previous
  // implementation read lesson_page_blocks → derived contentUnitSlugs →
  // fetched content_units → built knownSourceRefs. All of that fed only the
  // retired `ready_capability_unreachable_source_ref` warning (the warning
  // had no orthogonal source to validate against — knownSourceRefs was
  // derived from the same caps it was supposed to check). With the warning
  // gone, the entire page-block + content-units path is dead.
  const lessonNumberMatch = /^lesson-(\d+)$/.exec(args.sourceRef)
  const capabilityRows: Array<Record<string, unknown>> = []
  if (lessonNumberMatch) {
    const lessonNumber = Number(lessonNumberMatch[1])
    const { data: lessonRow, error: lessonErr } = await db()
      .from('lessons')
      .select('id')
      .eq('order_index', lessonNumber)
      .maybeSingle()
    if (lessonErr) throw lessonErr
    if (lessonRow) {
      const { data, error } = await db()
        .from('learning_capabilities')
        .select('*')
        .eq('lesson_id', lessonRow.id)
      if (error) throw error
      capabilityRows.push(...((data ?? []) as Array<Record<string, unknown>>))
    }
  }
  return {
    capabilities: capabilityRows.map(toRuntimeCapability),
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
    console.error(error instanceof Error ? error.message : JSON.stringify(error, null, 2))
    process.exit(1)
  }
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
}

if (isMainModule()) {
  main()
}
