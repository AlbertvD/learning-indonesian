import type {
  ArtifactKind,
  CapabilityModality,
  CapabilitySourceKind,
  CapabilityType,
} from '@/lib/capabilities/capabilityTypes'
import type { ArtifactQualityStatus } from '@/lib/capabilities/artifactRegistry'

export type MasteryLabel =
  | 'not_assessed'
  | 'introduced'
  | 'learning'
  | 'strengthening'
  | 'mastered'
  | 'at_risk'

export type MasteryConfidence = 'none' | 'low' | 'medium' | 'high'

export type MasteryDimension =
  | 'text_recognition'
  | 'meaning_recall'
  | 'form_recall'
  | 'listening'
  | 'dictation'
  | 'pattern_recognition'
  | 'pattern_use'
  | 'contextual_cloze'
  | 'morphology'
  | 'exposure'

export interface CapabilityMasteryEvidence {
  capabilityId: string
  canonicalKey: string
  sourceKind: CapabilitySourceKind
  sourceRef: string
  capabilityType: CapabilityType
  modality: CapabilityModality
  readinessStatus: string
  publicationStatus: string
  requiredArtifacts: ArtifactKind[]
  approvedArtifacts: ArtifactKind[]
  sourceProgressState?: string | null
  reviewCount: number
  lapseCount: number
  consecutiveFailureCount: number
  stability?: number | null
  lastReviewedAt?: string | null
}

export interface MasteryDimensionSummary {
  dimension: MasteryDimension
  label: MasteryLabel
  confidence: MasteryConfidence
  capabilityCount: number
  reviewedCapabilityCount: number
  sampleSize: number
  recentReviewCount: number
  modalities: CapabilityModality[]
  sourceKinds: CapabilitySourceKind[]
}

export interface ContentUnitMastery {
  scope: 'content_unit'
  userId: string
  contentUnitId: string
  label: MasteryLabel
  confidence: MasteryConfidence
  assessedCapabilityCount: number
  totalCapabilityCount: number
  dimensions: MasteryDimensionSummary[]
}

export interface PatternMastery {
  scope: 'pattern'
  userId: string
  patternId: string
  label: MasteryLabel
  weakestDimension: MasteryDimension | null
  confidence: MasteryConfidence
  assessedCapabilityCount: number
  totalCapabilityCount: number
  dimensions: MasteryDimensionSummary[]
}

export interface MasteryOverview {
  scope: 'overview'
  userId: string
  generatedAt: string
  label: MasteryLabel
  confidence: MasteryConfidence
  assessedCapabilityCount: number
  totalCapabilityCount: number
  dimensions: MasteryDimensionSummary[]
}

interface SupabaseSchemaClient {
  schema(schema: 'indonesian'): {
    from(table: string): any
  }
}

interface CapabilityContentUnitRow {
  capability_id: string
  relationship_kind?: string
}

interface LearningCapabilityRow {
  id: string
  canonical_key: string
  source_kind: CapabilitySourceKind
  source_ref: string
  capability_type: CapabilityType
  modality: CapabilityModality
  readiness_status: string
  publication_status: string
  metadata_json: Record<string, unknown> | null
}

interface LearnerCapabilityStateRow {
  capability_id: string
  review_count: number | null
  lapse_count: number | null
  consecutive_failure_count: number | null
  stability: number | null
  last_reviewed_at: string | null
}

interface CapabilityArtifactRow {
  capability_id: string
  artifact_kind: ArtifactKind
  quality_status: ArtifactQualityStatus
  artifact_json?: unknown
}

interface SourceProgressRow {
  source_ref: string
  current_state: string
}

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function requiredArtifacts(metadata: Record<string, unknown> | null): ArtifactKind[] {
  const raw = metadata?.requiredArtifacts
  return Array.isArray(raw) && raw.every(item => typeof item === 'string')
    ? raw as ArtifactKind[]
    : []
}

function dimensionForCapability(type: CapabilityType): MasteryDimension {
  switch (type) {
    case 'text_recognition':
      return 'text_recognition'
    case 'meaning_recall':
      return 'meaning_recall'
    case 'form_recall':
      return 'form_recall'
    case 'audio_recognition':
      return 'listening'
    case 'dictation':
      return 'dictation'
    case 'pattern_recognition':
      return 'pattern_recognition'
    case 'pattern_contrast':
      return 'pattern_use'
    case 'contextual_cloze':
      return 'contextual_cloze'
    case 'root_derived_recognition':
      return 'morphology'
    default:
      return 'exposure'
  }
}

function isRecent(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false
  const ageMs = now.getTime() - new Date(iso).getTime()
  return ageMs >= 0 && ageMs <= 30 * 24 * 60 * 60 * 1000
}

function hasCompatibleArtifacts(evidence: CapabilityMasteryEvidence): boolean {
  if (evidence.requiredArtifacts.length === 0) return true
  return evidence.requiredArtifacts.every(kind => evidence.approvedArtifacts.includes(kind))
}

function labelForCapability(evidence: CapabilityMasteryEvidence, now: Date): MasteryLabel {
  if (evidence.consecutiveFailureCount > 0 || evidence.lapseCount > 0) return 'at_risk'
  if (evidence.reviewCount === 0) {
    return evidence.sourceProgressState && evidence.sourceProgressState !== 'not_started'
      ? 'introduced'
      : 'not_assessed'
  }
  if (!hasCompatibleArtifacts(evidence)) return 'learning'
  if (evidence.reviewCount >= 4 && (evidence.stability ?? 0) >= 14 && isRecent(evidence.lastReviewedAt, now)) return 'mastered'
  if (evidence.reviewCount >= 3 || (evidence.stability ?? 0) >= 5) return 'strengthening'
  return 'learning'
}

function confidenceForDimension(input: {
  sampleSize: number
  recentReviewCount: number
  modalities: CapabilityModality[]
  compatibleArtifactCount: number
  capabilityCount: number
}): MasteryConfidence {
  if (input.sampleSize === 0) return 'none'
  let score = 0
  if (input.sampleSize >= 2) score += 1
  if (input.sampleSize >= 5) score += 1
  if (input.recentReviewCount > 0) score += 1
  if (input.modalities.length > 1) score += 1
  if (input.capabilityCount > 0 && input.compatibleArtifactCount === input.capabilityCount) score += 1
  if (score >= 4) return 'high'
  if (score >= 2) return 'medium'
  return 'low'
}

function weakestLabel(labels: MasteryLabel[]): MasteryLabel {
  const rank: Record<MasteryLabel, number> = {
    not_assessed: 0,
    introduced: 1,
    learning: 2,
    at_risk: 2,
    strengthening: 3,
    mastered: 4,
  }
  if (labels.length === 0) return 'not_assessed'
  if (labels.includes('at_risk')) return 'at_risk'
  return labels.reduce((weakest, label) => rank[label] < rank[weakest] ? label : weakest, labels[0]!)
}

function aggregateConfidence(dimensions: MasteryDimensionSummary[]): MasteryConfidence {
  const rank: Record<MasteryConfidence, number> = { none: 0, low: 1, medium: 2, high: 3 }
  const assessed = dimensions.filter(dimension => dimension.confidence !== 'none')
  if (assessed.length === 0) return 'none'
  const min = assessed.reduce((current, dimension) => (
    rank[dimension.confidence] < rank[current] ? dimension.confidence : current
  ), assessed[0]!.confidence)
  return min
}

function missingDimensionSummary(dimension: MasteryDimension): MasteryDimensionSummary {
  return {
    dimension,
    label: 'not_assessed',
    confidence: 'none',
    capabilityCount: 0,
    reviewedCapabilityCount: 0,
    sampleSize: 0,
    recentReviewCount: 0,
    modalities: [],
    sourceKinds: [],
  }
}

function ensureDimensions(
  dimensions: MasteryDimensionSummary[],
  requiredDimensions: MasteryDimension[],
): MasteryDimensionSummary[] {
  const byDimension = new Map(dimensions.map(dimension => [dimension.dimension, dimension]))
  for (const dimension of requiredDimensions) {
    if (!byDimension.has(dimension)) {
      byDimension.set(dimension, missingDimensionSummary(dimension))
    }
  }
  return [...byDimension.values()].sort((a, b) => a.dimension.localeCompare(b.dimension))
}

export function deriveMasteryDimensions(
  evidence: CapabilityMasteryEvidence[],
  now: Date = new Date(),
): MasteryDimensionSummary[] {
  const byDimension = new Map<MasteryDimension, CapabilityMasteryEvidence[]>()
  for (const item of evidence) {
    const dimension = dimensionForCapability(item.capabilityType)
    byDimension.set(dimension, [...(byDimension.get(dimension) ?? []), item])
  }

  return [...byDimension.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dimension, items]) => {
      const labels = items.map(item => labelForCapability(item, now))
      const sampleSize = items.reduce((sum, item) => sum + item.reviewCount, 0)
      const recentReviewCount = items.filter(item => isRecent(item.lastReviewedAt, now)).length
      const compatibleArtifactCount = items.filter(hasCompatibleArtifacts).length
      const modalities = uniq(items.map(item => item.modality)).sort()
      const sourceKinds = uniq(items.map(item => item.sourceKind)).sort()
      const reviewedCapabilityCount = items.filter(item => item.reviewCount > 0).length

      return {
        dimension,
        label: weakestLabel(labels),
        confidence: confidenceForDimension({
          sampleSize,
          recentReviewCount,
          modalities,
          compatibleArtifactCount,
          capabilityCount: items.length,
        }),
        capabilityCount: items.length,
        reviewedCapabilityCount,
        sampleSize,
        recentReviewCount,
        modalities,
        sourceKinds,
      }
    })
}

export function deriveContentUnitMastery(input: {
  userId: string
  contentUnitId: string
  evidence: CapabilityMasteryEvidence[]
  now?: Date
}): ContentUnitMastery {
  const dimensions = deriveMasteryDimensions(input.evidence, input.now)
  return {
    scope: 'content_unit',
    userId: input.userId,
    contentUnitId: input.contentUnitId,
    label: weakestLabel(dimensions.map(dimension => dimension.label)),
    confidence: aggregateConfidence(dimensions),
    assessedCapabilityCount: input.evidence.filter(item => item.reviewCount > 0).length,
    totalCapabilityCount: input.evidence.length,
    dimensions,
  }
}

export function derivePatternMastery(input: {
  userId: string
  patternId: string
  evidence: CapabilityMasteryEvidence[]
  now?: Date
}): PatternMastery {
  const dimensions = ensureDimensions(
    deriveMasteryDimensions(input.evidence, input.now),
    ['pattern_recognition', 'pattern_use'],
  )
  const weakest = weakestLabel(dimensions.map(dimension => dimension.label))
  return {
    scope: 'pattern',
    userId: input.userId,
    patternId: input.patternId,
    label: weakest,
    weakestDimension: dimensions.find(dimension => dimension.label === weakest)?.dimension ?? null,
    confidence: aggregateConfidence(dimensions),
    assessedCapabilityCount: input.evidence.filter(item => item.reviewCount > 0).length,
    totalCapabilityCount: input.evidence.length,
    dimensions,
  }
}

export function deriveMasteryOverview(input: {
  userId: string
  evidence: CapabilityMasteryEvidence[]
  now?: Date
}): MasteryOverview {
  const now = input.now ?? new Date()
  const dimensions = deriveMasteryDimensions(input.evidence, now)
  return {
    scope: 'overview',
    userId: input.userId,
    generatedAt: now.toISOString(),
    label: weakestLabel(dimensions.map(dimension => dimension.label)),
    confidence: aggregateConfidence(dimensions),
    assessedCapabilityCount: input.evidence.filter(item => item.reviewCount > 0).length,
    totalCapabilityCount: input.evidence.length,
    dimensions,
  }
}

function toEvidence(input: {
  capabilities: LearningCapabilityRow[]
  states: LearnerCapabilityStateRow[]
  artifacts: CapabilityArtifactRow[]
  sourceProgress: SourceProgressRow[]
}): CapabilityMasteryEvidence[] {
  const stateByCapabilityId = new Map(input.states.map(state => [state.capability_id, state]))
  const progressBySourceRef = new Map(input.sourceProgress.map(progress => [progress.source_ref, progress.current_state]))

  return input.capabilities.map(capability => {
    const state = stateByCapabilityId.get(capability.id)
    const approvedArtifacts = input.artifacts
      .filter(artifact => artifact.capability_id === capability.id && artifact.quality_status === 'approved')
      .map(artifact => artifact.artifact_kind)
    return {
      capabilityId: capability.id,
      canonicalKey: capability.canonical_key,
      sourceKind: capability.source_kind,
      sourceRef: capability.source_ref,
      capabilityType: capability.capability_type,
      modality: capability.modality,
      readinessStatus: capability.readiness_status,
      publicationStatus: capability.publication_status,
      requiredArtifacts: requiredArtifacts(capability.metadata_json),
      approvedArtifacts: uniq(approvedArtifacts),
      sourceProgressState: progressBySourceRef.get(capability.source_ref) ?? null,
      reviewCount: state?.review_count ?? 0,
      lapseCount: state?.lapse_count ?? 0,
      consecutiveFailureCount: state?.consecutive_failure_count ?? 0,
      stability: state?.stability ?? null,
      lastReviewedAt: state?.last_reviewed_at ?? null,
    }
  })
}

export function createMasteryModel(client: SupabaseSchemaClient) {
  const db = () => client.schema('indonesian')

  async function capabilityRowsByIds(ids: string[]): Promise<LearningCapabilityRow[]> {
    if (ids.length === 0) return []
    const { data, error } = await db()
      .from('learning_capabilities')
      .select('id, canonical_key, source_kind, source_ref, capability_type, modality, readiness_status, publication_status, metadata_json')
      .in('id', ids)
    if (error) throw error
    return (data ?? []) as LearningCapabilityRow[]
  }

  async function learnerStates(userId: string, capabilityIds: string[]): Promise<LearnerCapabilityStateRow[]> {
    if (capabilityIds.length === 0) return []
    const { data, error } = await db()
      .from('learner_capability_state')
      .select('capability_id, review_count, lapse_count, consecutive_failure_count, stability, last_reviewed_at')
      .eq('user_id', userId)
      .in('capability_id', capabilityIds)
    if (error) throw error
    return (data ?? []) as LearnerCapabilityStateRow[]
  }

  async function artifacts(capabilityIds: string[]): Promise<CapabilityArtifactRow[]> {
    if (capabilityIds.length === 0) return []
    const { data, error } = await db()
      .from('capability_artifacts')
      .select('capability_id, artifact_kind, quality_status, artifact_json')
      .in('capability_id', capabilityIds)
    if (error) throw error
    return (data ?? []) as CapabilityArtifactRow[]
  }

  async function sourceProgress(userId: string, sourceRefs: string[]): Promise<SourceProgressRow[]> {
    if (sourceRefs.length === 0) return []
    const { data, error } = await db()
      .from('learner_source_progress_state')
      .select('source_ref, current_state')
      .eq('user_id', userId)
      .in('source_ref', uniq(sourceRefs))
    if (error) throw error
    return (data ?? []) as SourceProgressRow[]
  }

  async function evidenceForCapabilities(userId: string, capabilities: LearningCapabilityRow[]): Promise<CapabilityMasteryEvidence[]> {
    const capabilityIds = capabilities.map(capability => capability.id)
    const [states, artifactRows, progressRows] = await Promise.all([
      learnerStates(userId, capabilityIds),
      artifacts(capabilityIds),
      sourceProgress(userId, capabilities.map(capability => capability.source_ref)),
    ])
    return toEvidence({ capabilities, states, artifacts: artifactRows, sourceProgress: progressRows })
  }

  return {
    async getContentUnitMastery(contentUnitId: string, userId: string): Promise<ContentUnitMastery> {
      const { data, error } = await db()
        .from('capability_content_units')
        .select('capability_id, relationship_kind')
        .eq('content_unit_id', contentUnitId)
      if (error) throw error
      const links = (data ?? []) as CapabilityContentUnitRow[]
      const capabilities = await capabilityRowsByIds(uniq(links.map(link => link.capability_id)))
      const evidence = await evidenceForCapabilities(userId, capabilities)
      return deriveContentUnitMastery({ userId, contentUnitId, evidence })
    },

    async getPatternMastery(patternId: string, userId: string): Promise<PatternMastery> {
      const { data, error } = await db()
        .from('learning_capabilities')
        .select('id, canonical_key, source_kind, source_ref, capability_type, modality, readiness_status, publication_status, metadata_json')
        .eq('source_kind', 'pattern')
        .eq('source_ref', patternId)
      if (error) throw error
      const capabilities = (data ?? []) as LearningCapabilityRow[]
      const evidence = await evidenceForCapabilities(userId, capabilities)
      return derivePatternMastery({ userId, patternId, evidence })
    },

    async getMasteryOverview(userId: string): Promise<MasteryOverview> {
      const { data: stateRows, error: stateError } = await db()
        .from('learner_capability_state')
        .select('capability_id, review_count, lapse_count, consecutive_failure_count, stability, last_reviewed_at')
        .eq('user_id', userId)
      if (stateError) throw stateError
      const states = (stateRows ?? []) as LearnerCapabilityStateRow[]
      const capabilities = await capabilityRowsByIds(uniq(states.map(state => state.capability_id)))
      const [artifactRows, progressRows] = await Promise.all([
        artifacts(capabilities.map(capability => capability.id)),
        sourceProgress(userId, capabilities.map(capability => capability.source_ref)),
      ])
      const evidence = toEvidence({ capabilities, states, artifacts: artifactRows, sourceProgress: progressRows })
      return deriveMasteryOverview({ userId, evidence })
    },
  }
}

async function defaultModel() {
  const { supabase } = await import('@/lib/supabase')
  return createMasteryModel(supabase)
}

export async function getContentUnitMastery(contentUnitId: string, userId: string): Promise<ContentUnitMastery> {
  return (await defaultModel()).getContentUnitMastery(contentUnitId, userId)
}

export async function getPatternMastery(patternId: string, userId: string): Promise<PatternMastery> {
  return (await defaultModel()).getPatternMastery(patternId, userId)
}

export async function getMasteryOverview(userId: string): Promise<MasteryOverview> {
  return (await defaultModel()).getMasteryOverview(userId)
}
