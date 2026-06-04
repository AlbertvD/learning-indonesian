import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'
import {
  deriveSkillTypeFromCapabilityType,
  validateCapability,
  type CapabilityReadiness,
  type ProjectedCapability,
} from '@/lib/capabilities'

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
  lesson_id?: string | null
  // Decision F (2026-05-22): typed columns replace metadata_json as the source
  // of truth. The promoter projects from these, matching the runtime adapter
  // (src/lib/session-builder/adapter.ts), so the two never diverge.
  prerequisite_keys?: string[] | null
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
  if (
    !row.source_kind
    || !row.source_ref
    || !row.capability_type
    || !row.direction
    || !row.modality
    || !row.learner_language
    || !row.projection_version
  ) {
    return null
  }

  // Decision F (2026-05-22): project from the typed columns and derive skillType
  // from capability_type — the same projection the runtime adapter uses. The
  // pre-fold path read these from metadata_json, which is no longer written, so
  // the promoter saw stale data and blocked otherwise-ready caps.
  return {
    canonicalKey: row.canonical_key,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    capabilityType: row.capability_type,
    skillType: deriveSkillTypeFromCapabilityType(row.capability_type),
    direction: row.direction,
    modality: row.modality,
    learnerLanguage: row.learner_language,
    // Slice 4b: required_artifacts retired; readiness derives from typed-contract routing.
    requiredArtifacts: [],
    prerequisiteKeys: row.prerequisite_keys ?? [],
    lessonId: row.lesson_id ?? null,
    projectionVersion: row.projection_version,
  }
}

export async function loadPromotionPlan(args: PromoteCapabilitiesArgs): Promise<CapabilityPromotionPlan> {
  const supabase = createServiceClient()
  const db = () => supabase.schema('indonesian')

  // Scope by learning_capabilities.lesson_id (mandatory per ADR 0006).
  // This replaces the pre-#61 path that scoped via
  // lesson_page_blocks.capability_key_refs[] ∪ capability_content_units joined
  // through this lesson's content_units. Per the proof in
  // docs/plans/2026-05-17-drop-capability-key-refs.md §Promoter-semantic-equivalence,
  // the new scope is a strict superset of the old union.
  const { data: lessonRow, error: lessonErr } = await db()
    .from('lessons')
    .select('id')
    .eq('order_index', args.lesson)
    .maybeSingle()
  if (lessonErr) throw lessonErr
  if (!lessonRow) {
    return planCapabilityPromotion({ capabilities: [], healthResults: [] })
  }

  const { data: capabilityRowsData, error: capsError } = await db()
    .from('learning_capabilities')
    .select('*')
    .eq('lesson_id', lessonRow.id)
    .is('retired_at', null)
  if (capsError) throw capsError
  const capabilityRows = ((capabilityRowsData ?? []) as CapabilityRow[])
  const scopedCapabilityKeys = capabilityRows.map(row => row.canonical_key)
  if (scopedCapabilityKeys.length === 0) {
    return planCapabilityPromotion({ capabilities: [], healthResults: [] })
  }

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
    healthResults.push({
      canonicalKey: capability.canonicalKey,
      readiness: validateCapability({ capability }),
    })
  }

  return planCapabilityPromotion({
    scopedCapabilityKeys,
    capabilities: capabilityRows,
    healthResults,
  })
}

export async function applyPromotionPlan(plan: CapabilityPromotionPlan): Promise<void> {
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
