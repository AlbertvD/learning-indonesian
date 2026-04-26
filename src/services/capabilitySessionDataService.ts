import { supabase } from '@/lib/supabase'
import { validateCapability, type CapabilityReadiness } from '@/lib/capabilities/capabilityContracts'
import type { ArtifactIndex, ArtifactQualityStatus } from '@/lib/capabilities/artifactRegistry'
import {
  CAPABILITY_PROJECTION_VERSION,
  type ArtifactKind,
  type CapabilityDirection,
  type CapabilityModality,
  type CapabilitySourceKind,
  type CapabilitySourceProgressRequirement,
  type CapabilityType,
  type LearnerLanguage,
  type ProjectedCapability,
  type SourceProgressRequirement,
} from '@/lib/capabilities/capabilityTypes'
import type { LearnerCapabilityStateRow } from '@/lib/capabilities/capabilityScheduler'
import { getDueCapabilitiesFromRows } from '@/lib/capabilities/capabilityScheduler'
import type { LearnerSourceProgress, ReviewEvidence } from '@/lib/pedagogy/sourceProgressGates'
import type { PlannerCapability, PlannerLearnerCapabilityState } from '@/lib/pedagogy/pedagogyPlanner'
import type { CapabilitySessionDataAdapter, CapabilitySessionDataRequest, CapabilitySessionDataSnapshot } from '@/lib/session/capabilitySessionLoader'
import type { SkillType } from '@/types/learning'
import type {
  CapabilityPublicationStatus,
  CapabilityReadinessStatus,
} from '@/services/capabilityService'

interface SupabaseSchemaClient {
  schema(schema: 'indonesian'): {
    from(table: string): any
  }
}

const CAPABILITY_COLUMNS = [
  'id',
  'canonical_key',
  'source_kind',
  'source_ref',
  'capability_type',
  'direction',
  'modality',
  'learner_language',
  'projection_version',
  'readiness_status',
  'publication_status',
  'source_fingerprint',
  'artifact_fingerprint',
  'metadata_json',
].join(',')

interface LearningCapabilityDbRow {
  id: string
  canonical_key: string
  source_kind: CapabilitySourceKind
  source_ref: string
  capability_type: CapabilityType
  direction: CapabilityDirection
  modality: CapabilityModality
  learner_language: LearnerLanguage
  projection_version: string
  readiness_status: CapabilityReadinessStatus
  publication_status: CapabilityPublicationStatus
  source_fingerprint: string | null
  artifact_fingerprint: string | null
  metadata_json: Record<string, unknown> | null
}

interface LearnerCapabilityStateDbRow {
  id: string
  user_id: string
  capability_id: string
  canonical_key_snapshot: string
  activation_state: LearnerCapabilityStateRow['activationState']
  stability: number | null
  difficulty: number | null
  last_reviewed_at: string | null
  next_due_at: string | null
  review_count: number
  lapse_count: number
  consecutive_failure_count: number
  state_after_json?: Record<string, unknown> | null
  state_version: number
}

interface CapabilityArtifactDbRow {
  capability_id: string
  artifact_kind: ArtifactKind
  quality_status: ArtifactQualityStatus
  artifact_json: unknown
}

interface SourceProgressDbRow {
  user_id: string
  source_ref: string
  source_section_ref: string
  current_state: LearnerSourceProgress['currentState']
  completed_event_types: LearnerSourceProgress['completedEventTypes']
}

const DEFAULT_SOURCE_SECTION_REF = '__lesson__'
const sourceProgressStates = new Set<SourceProgressRequirement['requiredState']>([
  'section_exposed',
  'intro_completed',
  'heard_once',
  'pattern_noticing_seen',
  'guided_practice_completed',
  'lesson_completed',
])

function arrayOfStrings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? value
    : null
}

function isSourceProgressRequiredState(value: unknown): value is SourceProgressRequirement['requiredState'] {
  return typeof value === 'string' && sourceProgressStates.has(value as SourceProgressRequirement['requiredState'])
}

function sourceProgressRequirement(value: unknown): CapabilitySourceProgressRequirement | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  if (raw.kind === 'none') {
    return {
      kind: 'none',
      reason: typeof raw.reason === 'string'
        ? raw.reason as Extract<CapabilitySourceProgressRequirement, { kind: 'none' }>['reason']
        : 'legacy_projection',
    }
  }
  if (raw.kind === 'source_progress' && typeof raw.sourceRef === 'string' && isSourceProgressRequiredState(raw.requiredState)) {
    return {
      kind: 'source_progress',
      sourceRef: raw.sourceRef,
      requiredState: raw.requiredState,
    }
  }
  return undefined
}

const lessonSequencedCapabilityTypes = new Set<CapabilityType>([
  'text_recognition',
  'meaning_recall',
  'form_recall',
  'audio_recognition',
  'dictation',
  'pattern_recognition',
  'pattern_contrast',
  'contextual_cloze',
])

function requiresConcreteSourceProgress(row: LearningCapabilityDbRow): boolean {
  return (
    (row.source_kind === 'item' || row.source_kind === 'pattern' || row.source_kind === 'dialogue_line')
    && lessonSequencedCapabilityTypes.has(row.capability_type)
  )
}

function toProjectedCapability(row: LearningCapabilityDbRow): ProjectedCapability | null {
  const metadata = row.metadata_json ?? {}
  const skillType = typeof metadata.skillType === 'string' ? metadata.skillType as SkillType : null
  const requiredArtifacts = arrayOfStrings(metadata.requiredArtifacts) as ArtifactKind[] | null
  const prerequisiteKeys = arrayOfStrings(metadata.prerequisiteKeys)
  const difficultyLevel = typeof metadata.difficultyLevel === 'number' ? metadata.difficultyLevel : null
  const goalTags = arrayOfStrings(metadata.goalTags) ?? []
  const requiredSourceProgress = sourceProgressRequirement(metadata.requiredSourceProgress)

  if (!skillType || !requiredArtifacts || !prerequisiteKeys || difficultyLevel == null) return null
  if (requiresConcreteSourceProgress(row) && requiredSourceProgress?.kind !== 'source_progress') return null
  if (requiredSourceProgress?.kind === 'source_progress' && requiredSourceProgress.sourceRef !== row.source_ref) return null

  return {
    canonicalKey: row.canonical_key,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    capabilityType: row.capability_type,
    skillType,
    direction: row.direction,
    modality: row.modality,
    learnerLanguage: row.learner_language,
    requiredArtifacts,
    requiredSourceProgress,
    prerequisiteKeys,
    difficultyLevel,
    goalTags,
    projectionVersion: CAPABILITY_PROJECTION_VERSION,
    sourceFingerprint: row.source_fingerprint ?? '',
    artifactFingerprint: row.artifact_fingerprint ?? '',
  }
}

function toPlannerCapability(row: LearningCapabilityDbRow, projection: ProjectedCapability): PlannerCapability {
  const metadata = row.metadata_json ?? {}
  return {
    id: row.id,
    canonicalKey: projection.canonicalKey,
    sourceKind: projection.sourceKind,
    sourceRef: projection.sourceRef,
    capabilityType: projection.capabilityType,
    skillType: projection.skillType,
    readinessStatus: row.readiness_status,
    publicationStatus: row.publication_status,
    prerequisiteKeys: projection.prerequisiteKeys,
    requiredSourceProgress: projection.requiredSourceProgress,
    difficultyLevel: typeof metadata.difficultyLevel === 'number' ? metadata.difficultyLevel : undefined,
    goalTags: arrayOfStrings(metadata.goalTags) ?? undefined,
  }
}

function toLearnerRow(
  row: LearnerCapabilityStateDbRow,
  capabilityById: Map<string, LearningCapabilityDbRow>,
): LearnerCapabilityStateRow {
  const capability = capabilityById.get(row.capability_id)
  return {
    id: row.id,
    userId: row.user_id,
    capabilityId: row.capability_id,
    canonicalKeySnapshot: row.canonical_key_snapshot,
    activationState: row.activation_state,
    readinessStatus: capability?.readiness_status ?? 'unknown',
    publicationStatus: capability?.publication_status ?? 'draft',
    stability: row.stability,
    difficulty: row.difficulty,
    lastReviewedAt: row.last_reviewed_at,
    nextDueAt: row.next_due_at,
    reviewCount: row.review_count,
    lapseCount: row.lapse_count,
    consecutiveFailureCount: row.consecutive_failure_count,
    stateVersion: row.state_version,
  }
}

function buildArtifactIndex(
  rows: CapabilityArtifactDbRow[],
  capabilityById: Map<string, LearningCapabilityDbRow>,
): ArtifactIndex {
  const index: ArtifactIndex = {}
  for (const row of rows) {
    const capability = capabilityById.get(row.capability_id)
    if (!capability) continue
    index[row.artifact_kind] ??= []
    index[row.artifact_kind]!.push({
      qualityStatus: row.quality_status,
      capabilityKey: capability.canonical_key,
      sourceRef: capability.source_ref,
      value: row.artifact_json,
    })
  }
  return index
}

function toPlannerState(row: LearnerCapabilityStateRow): PlannerLearnerCapabilityState {
  return {
    canonicalKey: row.canonicalKeySnapshot,
    activationState: row.activationState,
    reviewCount: row.reviewCount,
    successfulReviewCount: Math.max(0, row.reviewCount - row.lapseCount - row.consecutiveFailureCount),
  }
}

function toSourceProgress(row: SourceProgressDbRow): LearnerSourceProgress {
  return {
    sourceRef: row.source_ref,
    sourceSectionRef: row.source_section_ref ?? DEFAULT_SOURCE_SECTION_REF,
    currentState: row.current_state,
    completedEventTypes: row.completed_event_types ?? [],
  }
}

export function createCapabilitySessionDataService(client: SupabaseSchemaClient = supabase): CapabilitySessionDataAdapter {
  const db = () => client.schema('indonesian')

  return {
    async listLearnerCapabilityStates(request) {
      const { data: capabilities, error: capabilitiesError } = await db()
        .from('learning_capabilities')
        .select('*')
      if (capabilitiesError) throw capabilitiesError
      const capabilityById = new Map<string, LearningCapabilityDbRow>(
        ((capabilities ?? []) as LearningCapabilityDbRow[]).map(row => [row.id, row]),
      )

      const { data, error } = await db()
        .from('learner_capability_state')
        .select('*')
        .eq('user_id', request.userId)
      if (error) throw error

      return (data ?? []).map((row: LearnerCapabilityStateDbRow) => toLearnerRow(row, capabilityById))
    },

    async loadCapabilitySessionData(request: CapabilitySessionDataRequest): Promise<CapabilitySessionDataSnapshot> {
      const [
        capabilitiesResult,
        statesResult,
        sourceProgressResult,
      ] = await Promise.all([
        db()
          .from('learning_capabilities')
          .select(CAPABILITY_COLUMNS)
          .eq('readiness_status', 'ready')
          .eq('publication_status', 'published'),
        db().from('learner_capability_state').select('*').eq('user_id', request.userId),
        db().from('learner_source_progress_state').select('*').eq('user_id', request.userId),
      ])

      if (capabilitiesResult.error) throw capabilitiesResult.error
      if (statesResult.error) throw statesResult.error
      if (sourceProgressResult.error) throw sourceProgressResult.error

      const capabilityRows = (capabilitiesResult.data ?? []) as LearningCapabilityDbRow[]
      const capabilityById = new Map(capabilityRows.map(row => [row.id, row]))
      const capabilityIds = capabilityRows.map(row => row.id)
      const artifactsResult = capabilityIds.length > 0
        ? await db()
            .from('capability_artifacts')
            .select('*')
            .in('capability_id', capabilityIds)
        : { data: [], error: null }
      if (artifactsResult.error) throw artifactsResult.error
      const artifactIndex = buildArtifactIndex((artifactsResult.data ?? []) as CapabilityArtifactDbRow[], capabilityById)

      const capabilitiesByKey = new Map<string, ProjectedCapability>()
      const readinessByKey = new Map<string, CapabilityReadiness>()
      const readyCapabilities: PlannerCapability[] = []

      for (const row of capabilityRows) {
        const projection = toProjectedCapability(row)
        if (!projection) {
          readinessByKey.set(row.canonical_key, { status: 'unknown', reason: 'Capability metadata is incomplete for safe rendering.' })
          continue
        }
        capabilitiesByKey.set(row.canonical_key, projection)
        const readiness = row.readiness_status === 'ready'
          ? validateCapability({ capability: projection, artifacts: artifactIndex })
          : { status: row.readiness_status, reason: `Capability readiness is ${row.readiness_status}` } as CapabilityReadiness
        readinessByKey.set(row.canonical_key, readiness)
        readyCapabilities.push(toPlannerCapability(row, projection))
      }

      const schedulerRows = ((statesResult.data ?? []) as LearnerCapabilityStateDbRow[])
        .map(row => toLearnerRow(row, capabilityById))
      const dueCount = getDueCapabilitiesFromRows({
        now: request.now,
        limit: Number.MAX_SAFE_INTEGER,
        rows: schedulerRows,
      }).length
      const currentSourceRefs = Array.from(new Set(
        ((sourceProgressResult.data ?? []) as SourceProgressDbRow[])
          .map(row => row.source_ref)
          .filter(Boolean),
      ))
      const recentFailures = schedulerRows
        .filter(row => row.consecutiveFailureCount >= 2 && row.lastReviewedAt != null)
        .map(row => ({
          canonicalKey: row.canonicalKeySnapshot,
          failedAt: row.lastReviewedAt!,
          consecutiveFailures: row.consecutiveFailureCount,
        }))

      return {
        schedulerRows,
        plannerInput: {
          userId: request.userId,
          preferredSessionSize: request.preferredSessionSize,
          dueCount,
          readyCapabilities,
          learnerCapabilityStates: schedulerRows.map(toPlannerState),
          sourceProgress: ((sourceProgressResult.data ?? []) as SourceProgressDbRow[]).map(toSourceProgress),
          recentReviewEvidence: [] satisfies ReviewEvidence[],
          currentSourceRefs,
          activeGoalTags: [],
          maxNewDifficultyLevel: 5,
          recentFailures,
        },
        capabilitiesByKey,
        readinessByKey,
        artifactIndex,
      }
    },
  }
}

export const capabilitySessionDataService = createCapabilitySessionDataService()
