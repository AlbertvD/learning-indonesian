import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'
import { validateCapability, type CapabilityReadiness } from '../src/lib/capabilities/capabilityContracts'
import type { ArtifactIndex } from '../src/lib/capabilities/artifactRegistry'
import type { ArtifactKind, ProjectedCapability } from '../src/lib/capabilities/capabilityTypes'
import { collectLessonCapabilityKeys } from './check-capability-release-readiness'
import { hasConcreteArtifactPayload } from './lib/content-pipeline-output'

interface CapabilityRow {
  id: string
  canonical_key: string
  source_kind?: ProjectedCapability['sourceKind']
  source_ref?: string
  capability_type?: ProjectedCapability['capabilityType']
  direction?: ProjectedCapability['direction']
  modality?: ProjectedCapability['modality']
  learner_language?: ProjectedCapability['learnerLanguage']
  projection_version?: ProjectedCapability['projectionVersion']
  source_fingerprint?: string | null
  artifact_fingerprint?: string | null
  metadata_json?: Record<string, unknown> | null
}

export interface CapabilityArtifactRow {
  artifact_kind: ArtifactKind
  quality_status: 'draft' | 'approved' | 'blocked' | 'deprecated'
  artifact_json: unknown
}

interface PromotionHealthResult {
  canonicalKey: string
  readiness: CapabilityReadiness
}

export interface PromoteCapabilitiesArgs {
  lesson: number
  sourceRef: string
  apply: boolean
}

export interface CapabilityPromotion {
  capabilityId: string
  canonicalKey: string
  readinessStatus: 'ready'
  publicationStatus: 'published'
  allowedExercises: string[]
}

export interface BlockedCapabilityPromotion {
  capabilityId: string | null
  canonicalKey: string
  readinessStatus: Exclude<CapabilityReadiness['status'], 'ready'> | 'blocked'
  reason: string
}

export interface CapabilityPromotionPlan {
  promotions: CapabilityPromotion[]
  blocked: BlockedCapabilityPromotion[]
  warnings: string[]
  counts: {
    scopedCapabilities: number
    promotions: number
    blocked: number
  }
}

export function parsePromoteCapabilitiesArgs(args: string[]): PromoteCapabilitiesArgs {
  const knownArgs = new Set(['--lesson', '--apply', '--dry-run'])
  for (const arg of args) {
    if (arg.startsWith('--') && !knownArgs.has(arg)) {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  const lessonIndex = args.indexOf('--lesson')
  if (lessonIndex < 0) throw new Error('--lesson is required')
  const rawLesson = args[lessonIndex + 1]
  if (!rawLesson || rawLesson.startsWith('--')) throw new Error('--lesson requires a number')
  const lesson = Number(rawLesson)
  if (!Number.isInteger(lesson) || lesson <= 0) throw new Error('--lesson requires a positive integer')

  const apply = args.includes('--apply')
  const dryRun = args.includes('--dry-run')
  if (apply && dryRun) throw new Error('Use either --apply or --dry-run, not both')

  return {
    lesson,
    sourceRef: `lesson-${lesson}`,
    apply,
  }
}

export function planCapabilityPromotion(input: {
  scopedCapabilityKeys?: string[]
  capabilities: Pick<CapabilityRow, 'id' | 'canonical_key'>[]
  healthResults: PromotionHealthResult[]
}): CapabilityPromotionPlan {
  const readinessByKey = new Map(input.healthResults.map(result => [result.canonicalKey, result.readiness]))
  const capabilityByKey = new Map(input.capabilities.map(capability => [capability.canonical_key, capability]))
  const promotions: CapabilityPromotion[] = []
  const blocked: BlockedCapabilityPromotion[] = []
  const warnings: string[] = []

  for (const key of input.scopedCapabilityKeys ?? []) {
    if (!capabilityByKey.has(key)) {
      blocked.push({
        capabilityId: null,
        canonicalKey: key,
        readinessStatus: 'unknown',
        reason: 'Lesson references a capability key that does not exist in learning_capabilities.',
      })
    }
  }

  for (const capability of input.capabilities) {
    const readiness = readinessByKey.get(capability.canonical_key)
    if (!readiness) {
      blocked.push({
        capabilityId: capability.id,
        canonicalKey: capability.canonical_key,
        readinessStatus: 'unknown',
        reason: 'No readiness result was computed for scoped capability.',
      })
      continue
    }
    if (readiness.status === 'ready') {
      if (readiness.allowedExercises.length === 0) {
        blocked.push({
          capabilityId: capability.id,
          canonicalKey: capability.canonical_key,
          readinessStatus: 'blocked',
          reason: 'No allowed exercise path for ready capability.',
        })
        continue
      }
      promotions.push({
        capabilityId: capability.id,
        canonicalKey: capability.canonical_key,
        readinessStatus: 'ready',
        publicationStatus: 'published',
        allowedExercises: readiness.allowedExercises,
      })
      continue
    }
    blocked.push({
      capabilityId: capability.id,
      canonicalKey: capability.canonical_key,
      readinessStatus: readiness.status,
      reason: 'reason' in readiness ? readiness.reason : `Capability is ${readiness.status}.`,
    })
  }

  if (promotions.length === 0) {
    warnings.push('No capabilities are eligible for promotion. The release must remain blocked.')
  }

  return {
    promotions,
    blocked,
    warnings,
    counts: {
      scopedCapabilities: input.capabilities.length,
      promotions: promotions.length,
      blocked: blocked.length,
    },
  }
}

function createServiceClient() {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required')
  return createClient(url, serviceKey)
}

function toProjectedCapability(row: CapabilityRow): ProjectedCapability | null {
  const metadata = row.metadata_json ?? {}
  const skillType = metadata.skillType
  const requiredArtifacts = metadata.requiredArtifacts
  if (
    !row.source_kind
    || !row.source_ref
    || !row.capability_type
    || !row.direction
    || !row.modality
    || !row.learner_language
    || !row.projection_version
    || typeof skillType !== 'string'
    || !Array.isArray(requiredArtifacts)
    || !requiredArtifacts.every(item => typeof item === 'string')
  ) {
    return null
  }

  return {
    canonicalKey: row.canonical_key,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    capabilityType: row.capability_type,
    skillType: skillType as ProjectedCapability['skillType'],
    direction: row.direction,
    modality: row.modality,
    learnerLanguage: row.learner_language,
    requiredArtifacts: requiredArtifacts as ArtifactKind[],
    requiredSourceProgress: metadata.requiredSourceProgress as ProjectedCapability['requiredSourceProgress'],
    prerequisiteKeys: Array.isArray(metadata.prerequisiteKeys) ? metadata.prerequisiteKeys.map(String) : [],
    difficultyLevel: typeof metadata.difficultyLevel === 'number' ? metadata.difficultyLevel : 1,
    goalTags: Array.isArray(metadata.goalTags) ? metadata.goalTags.map(String) : [],
    projectionVersion: row.projection_version,
    sourceFingerprint: row.source_fingerprint ?? '',
    artifactFingerprint: row.artifact_fingerprint ?? '',
  }
}

export function buildPromotionArtifactIndex(input: {
  capability: Pick<ProjectedCapability, 'canonicalKey' | 'sourceRef'>
  artifacts: CapabilityArtifactRow[]
}): ArtifactIndex {
  const index: ArtifactIndex = {}
  for (const artifact of input.artifacts) {
    if (artifact.quality_status !== 'approved') continue
    const value = artifact.artifact_json
    if (!hasConcreteArtifactPayload(artifact.artifact_kind, value)) continue
    index[artifact.artifact_kind] ??= []
    index[artifact.artifact_kind]!.push({
      qualityStatus: artifact.quality_status,
      capabilityKey: input.capability.canonicalKey,
      sourceRef: input.capability.sourceRef,
      value,
    })
  }
  return index
}

async function loadPromotionPlan(args: PromoteCapabilitiesArgs): Promise<CapabilityPromotionPlan> {
  const supabase = createServiceClient()
  const db = () => supabase.schema('indonesian')

  const { data: contentUnits, error: contentUnitsError } = await db()
    .from('content_units')
    .select('id')
    .eq('source_ref', args.sourceRef)
  if (contentUnitsError) throw contentUnitsError
  const contentUnitIds = (contentUnits ?? []).map((row: { id: string }) => row.id)

  const { data: blocks, error: blocksError } = await db()
    .from('lesson_page_blocks')
    .select('capability_key_refs')
    .eq('source_ref', args.sourceRef)
  if (blocksError) throw blocksError

  const relationshipRows = contentUnitIds.length > 0
    ? await db()
        .from('capability_content_units')
        .select('capability:learning_capabilities(canonical_key)')
        .in('content_unit_id', contentUnitIds)
    : { data: [], error: null }
  if (relationshipRows.error) throw relationshipRows.error
  const relationshipCapabilities = ((relationshipRows.data ?? []) as Array<{ capability?: { canonical_key: string } | null }>)
    .map(row => row.capability)
    .filter((row): row is { canonical_key: string } => Boolean(row?.canonical_key))
  const scopedCapabilityKeys = collectLessonCapabilityKeys({
    lessonPageBlocks: (blocks ?? []) as Array<{ capability_key_refs?: string[] | null }>,
    relationshipCapabilities,
  })
  if (scopedCapabilityKeys.length === 0) {
    return planCapabilityPromotion({ capabilities: [], healthResults: [] })
  }

  const { data: capabilities, error: capabilitiesError } = await db()
    .from('learning_capabilities')
    .select('*')
    .in('canonical_key', scopedCapabilityKeys)
  if (capabilitiesError) throw capabilitiesError
  const capabilityRows = (capabilities ?? []) as CapabilityRow[]

  const healthResults: PromotionHealthResult[] = []
  for (const capabilityRow of capabilityRows) {
    const capability = toProjectedCapability(capabilityRow)
    if (!capability) {
      healthResults.push({
        canonicalKey: capabilityRow.canonical_key,
        readiness: { status: 'unknown', reason: 'Capability row cannot be projected for validation.' },
      })
      continue
    }
    const { data: artifacts, error: artifactsError } = await db()
      .from('capability_artifacts')
      .select('artifact_kind, quality_status, artifact_json')
      .eq('capability_id', capabilityRow.id)
    if (artifactsError) throw artifactsError
    healthResults.push({
      canonicalKey: capability.canonicalKey,
      readiness: validateCapability({
        capability,
        artifacts: buildPromotionArtifactIndex({
          capability,
          artifacts: (artifacts ?? []) as CapabilityArtifactRow[],
        }),
      }),
    })
  }

  return planCapabilityPromotion({
    scopedCapabilityKeys,
    capabilities: capabilityRows,
    healthResults,
  })
}

async function applyPromotionPlan(plan: CapabilityPromotionPlan): Promise<void> {
  const supabase = createServiceClient()
  const db = () => supabase.schema('indonesian')
  for (const promotion of plan.promotions) {
    const { error } = await db()
      .from('learning_capabilities')
      .update({
        readiness_status: promotion.readinessStatus,
        publication_status: promotion.publicationStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', promotion.capabilityId)
    if (error) throw error
  }
}

async function main() {
  const args = parsePromoteCapabilitiesArgs(process.argv.slice(2))
  const plan = await loadPromotionPlan(args)
  console.log(JSON.stringify({
    mode: args.apply ? 'apply' : 'dry-run',
    ...plan,
  }, null, 2))
  if (args.apply) {
    if (plan.promotions.length === 0) {
      throw new Error('No capabilities are eligible for promotion; refusing empty apply.')
    }
    await applyPromotionPlan(plan)
  }
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
}

if (isMainModule()) {
  main().catch(error => {
    console.error(error)
    process.exit(1)
  })
}
