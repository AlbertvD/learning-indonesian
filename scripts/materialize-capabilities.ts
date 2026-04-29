import type {
  ArtifactKind,
  CapabilityAlias,
  CapabilityDirection,
  CapabilityModality,
  CapabilitySourceKind,
  CapabilityType,
  LearnerLanguage,
  ProjectedCapability,
} from '../src/lib/capabilities/capabilityTypes'
import { hasApprovedArtifact, type ArtifactIndex } from '../src/lib/capabilities/artifactRegistry'
import { projectCapabilities } from '../src/lib/capabilities/capabilityCatalog'
import { validateCapabilities } from '../src/lib/capabilities/capabilityContracts'
import { loadStagedContentSnapshot } from './check-capability-health'

type ReadinessStatus = 'ready' | 'blocked' | 'exposure_only' | 'deprecated' | 'unknown'
type PublicationStatus = 'draft' | 'published' | 'retired'
type MappingKind = 'rename' | 'split' | 'merge' | 'grammar_inference' | 'manual'
type MigrationConfidence = CapabilityAlias['migrationConfidence']

export interface MaterializationAlias extends CapabilityAlias {
  mappingKind?: MappingKind
}

export interface LearnerBackfillCandidate {
  userId: string
  capabilityId: string
  canonicalKey: string
  readinessStatus: ReadinessStatus
  publicationStatus: PublicationStatus
}

export interface CapabilityInsertPlan {
  canonicalKey: string
  sourceKind: CapabilitySourceKind
  sourceRef: string
  capabilityType: CapabilityType
  direction: CapabilityDirection
  modality: CapabilityModality
  learnerLanguage: LearnerLanguage
  projectionVersion: string
  readinessStatus: ReadinessStatus
  publicationStatus: PublicationStatus
  sourceFingerprint: string
  artifactFingerprint: string
  metadataJson: Record<string, unknown>
}

export interface ArtifactUpsertPlan {
  capabilityKey: string
  sourceRef: string
  artifactKind: ArtifactKind
  qualityStatus: 'approved'
  artifactFingerprint: string
}

export interface AliasUpsertPlan {
  oldCanonicalKey: string
  newCanonicalKey: string
  aliasReason: string
  mappingKind: MappingKind
  migrationConfidence: MigrationConfidence
  splitGroupId?: string
  weight?: number
}

export interface BackfillWritePlan {
  userId: string
  capabilityId: string
  canonicalKeySnapshot: string
  activationSource: 'admin_backfill'
}

export interface BlockedBackfillPlan {
  userId?: string
  capabilityId?: string
  canonicalKey: string
  reason: 'dry_run' | 'capability_not_ready_or_published' | 'migration_confidence_requires_review'
}

export interface CapabilityMaterializationPlan {
  capabilityInserts: CapabilityInsertPlan[]
  artifactUpserts: ArtifactUpsertPlan[]
  aliasUpserts: AliasUpsertPlan[]
  backfillWrites: BackfillWritePlan[]
  blockedBackfills: BlockedBackfillPlan[]
}

export interface PlanCapabilityMaterializationInput {
  capabilities: ProjectedCapability[]
  existingCanonicalKeys: Set<string>
  aliases: MaterializationAlias[]
  applyBackfill: boolean
  learnerBackfillCandidates?: LearnerBackfillCandidate[]
  readinessByCanonicalKey?: Map<string, ReadinessStatus>
  approvedArtifactsByCapabilityKey?: Map<string, ArtifactKind[]>
}

export interface MaterializeArgs {
  dryRun: boolean
  applyBackfill: boolean
  stagingPath: string
}

const autoBackfillConfidences = new Set<MigrationConfidence>(['exact', 'high'])

function inferMappingKind(alias: MaterializationAlias): MappingKind {
  if (alias.mappingKind) return alias.mappingKind
  if (alias.reason === 'split') return 'split'
  if (alias.reason === 'merge') return 'merge'
  if (alias.reason.includes('grammar')) return 'grammar_inference'
  if (alias.reason === 'manual') return 'manual'
  return 'rename'
}

function assertNoFragileAliasGraph(aliases: MaterializationAlias[]): void {
  const oldKeys = new Set(aliases.map(alias => alias.oldCanonicalKey))
  const edges = aliases.map(alias => [alias.oldCanonicalKey, alias.newCanonicalKey] as const)

  for (const [oldKey, newKey] of edges) {
    if (oldKey === newKey) {
      throw new Error(`Alias cycle detected for ${oldKey}`)
    }
    if (oldKeys.has(newKey)) {
      throw new Error(`Alias cycle or chain longer than one hop detected: ${oldKey} -> ${newKey}`)
    }
  }
}

export function parseMaterializeArgs(args: string[]): MaterializeArgs {
  const stagingIndex = args.indexOf('--staging')
  if (stagingIndex >= 0 && (!args[stagingIndex + 1] || args[stagingIndex + 1].startsWith('--'))) {
    throw new Error('--staging requires a path')
  }

  return {
    dryRun: !args.includes('--apply-backfill'),
    applyBackfill: args.includes('--apply-backfill'),
    stagingPath: stagingIndex >= 0 ? args[stagingIndex + 1] : 'scripts/data/staging/lesson-1',
  }
}

export function planCapabilityMaterialization(input: PlanCapabilityMaterializationInput): CapabilityMaterializationPlan {
  assertNoFragileAliasGraph(input.aliases)

  const capabilityInserts = input.capabilities
    .filter(capability => !input.existingCanonicalKeys.has(capability.canonicalKey))
    .map((capability): CapabilityInsertPlan => ({
      canonicalKey: capability.canonicalKey,
      sourceKind: capability.sourceKind,
      sourceRef: capability.sourceRef,
      capabilityType: capability.capabilityType,
      direction: capability.direction,
      modality: capability.modality,
      learnerLanguage: capability.learnerLanguage,
      projectionVersion: capability.projectionVersion,
      readinessStatus: input.readinessByCanonicalKey?.get(capability.canonicalKey) ?? 'unknown',
      publicationStatus: 'draft',
      sourceFingerprint: capability.sourceFingerprint,
      artifactFingerprint: capability.artifactFingerprint,
      metadataJson: {
        skillType: capability.skillType,
        requiredArtifacts: capability.requiredArtifacts,
        prerequisiteKeys: capability.prerequisiteKeys,
        requiredSourceProgress: capability.requiredSourceProgress ?? null,
        difficultyLevel: capability.difficultyLevel,
        goalTags: capability.goalTags,
      },
    }))

  const artifactUpserts = input.capabilities.flatMap(capability => (
    (input.approvedArtifactsByCapabilityKey?.get(capability.canonicalKey) ?? []).map((artifactKind): ArtifactUpsertPlan => ({
      capabilityKey: capability.canonicalKey,
      sourceRef: capability.sourceRef,
      artifactKind,
      qualityStatus: 'approved',
      artifactFingerprint: `${capability.artifactFingerprint}:${artifactKind}`,
    }))
  ))

  const aliasUpserts = input.aliases.map((alias): AliasUpsertPlan => ({
    oldCanonicalKey: alias.oldCanonicalKey,
    newCanonicalKey: alias.newCanonicalKey,
    aliasReason: alias.reason,
    mappingKind: inferMappingKind(alias),
    migrationConfidence: alias.migrationConfidence,
  }))

  const blockedBackfills: BlockedBackfillPlan[] = []
  if (input.applyBackfill) {
    for (const alias of input.aliases) {
      if (!autoBackfillConfidences.has(alias.migrationConfidence)) {
        blockedBackfills.push({
          canonicalKey: alias.newCanonicalKey,
          reason: 'migration_confidence_requires_review',
        })
      }
    }
  }

  const backfillWrites: BackfillWritePlan[] = []
  for (const candidate of input.learnerBackfillCandidates ?? []) {
    if (!input.applyBackfill) {
      blockedBackfills.push({
        userId: candidate.userId,
        capabilityId: candidate.capabilityId,
        canonicalKey: candidate.canonicalKey,
        reason: 'dry_run',
      })
      continue
    }
    if (candidate.readinessStatus !== 'ready' || candidate.publicationStatus !== 'published') {
      blockedBackfills.push({
        userId: candidate.userId,
        capabilityId: candidate.capabilityId,
        canonicalKey: candidate.canonicalKey,
        reason: 'capability_not_ready_or_published',
      })
      continue
    }
    backfillWrites.push({
      userId: candidate.userId,
      capabilityId: candidate.capabilityId,
      canonicalKeySnapshot: candidate.canonicalKey,
      activationSource: 'admin_backfill',
    })
  }

  return {
    capabilityInserts,
    artifactUpserts,
    aliasUpserts,
    backfillWrites,
    blockedBackfills,
  }
}

function readinessMapFromReport(input: ReturnType<typeof validateCapabilities>): Map<string, ReadinessStatus> {
  return new Map(input.results.map(result => [result.canonicalKey, result.readiness.status]))
}

function approvedArtifactMap(input: {
  capabilities: ProjectedCapability[]
  artifacts: ArtifactIndex
}): Map<string, ArtifactKind[]> {
  return new Map(input.capabilities.map(capability => [
    capability.canonicalKey,
    capability.requiredArtifacts.filter(artifactKind => hasApprovedArtifact({
      index: input.artifacts,
      kind: artifactKind,
      capabilityKey: capability.canonicalKey,
      sourceRef: capability.sourceRef,
    })),
  ]))
}

export async function buildMaterializationPlanFromStaging(input: {
  stagingPath: string
  applyBackfill: boolean
  existingCanonicalKeys?: Set<string>
  learnerBackfillCandidates?: LearnerBackfillCandidate[]
}): Promise<CapabilityMaterializationPlan> {
  const { snapshot, artifacts } = await loadStagedContentSnapshot(input.stagingPath)
  const projection = projectCapabilities(snapshot)
  const health = validateCapabilities({ projection, artifacts })

  return planCapabilityMaterialization({
    capabilities: projection.capabilities,
    existingCanonicalKeys: input.existingCanonicalKeys ?? new Set(),
    aliases: projection.aliases,
    applyBackfill: input.applyBackfill,
    learnerBackfillCandidates: input.learnerBackfillCandidates,
    readinessByCanonicalKey: readinessMapFromReport(health),
    approvedArtifactsByCapabilityKey: approvedArtifactMap({
      capabilities: projection.capabilities,
      artifacts,
    }),
  })
}

if (process.argv[1]?.endsWith('materialize-capabilities.ts')) {
  const args = parseMaterializeArgs(process.argv.slice(2))
  const plan = await buildMaterializationPlanFromStaging({
    stagingPath: args.stagingPath,
    applyBackfill: args.applyBackfill,
  })

  console.log(JSON.stringify({
    mode: args.dryRun ? 'dry-run' : 'admin-backfill',
    message: args.applyBackfill
      ? 'Admin backfill mode requested. This reviewed adapter only writes rows represented by backfillWrites when DB execution is wired with admin credentials.'
      : 'Dry run complete. No database writes were attempted.',
    plan,
  }, null, 2))
}
