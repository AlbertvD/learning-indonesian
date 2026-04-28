import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'

interface CapabilityStatusRow {
  canonical_key?: string
  readiness_status: string
  publication_status: string
}

interface LessonPageBlockCapabilityRefs {
  capability_key_refs?: string[] | null
}

interface RelationshipCapability {
  canonical_key: string
}

export interface CapabilityReleaseReadinessArgs {
  lesson: number
  sourceRef: string
}

export interface CapabilityReleaseReadinessInput {
  sourceRef: string
  contentUnits: number
  lessonPageBlocks: number
  scopedCapabilityKeys: string[]
  capabilities: CapabilityStatusRow[]
  capabilityArtifacts: number
  capabilityContentUnitRelationships: number
  sourceProgressRows: number
}

export interface CapabilityReleaseReadinessReport {
  releaseReady: boolean
  blockers: string[]
  warnings: string[]
  counts: {
    contentUnits: number
    lessonPageBlocks: number
    scopedCapabilityKeys: number
    readyPublishedCapabilities: number
    draftOrUnknownCapabilities: number
    capabilityArtifacts: number
    capabilityContentUnitRelationships: number
    sourceProgressRows: number
  }
}

export function parseCapabilityReleaseReadinessArgs(args: string[]): CapabilityReleaseReadinessArgs {
  const lessonIndex = args.indexOf('--lesson')
  const knownArgs = new Set(['--lesson'])
  for (const arg of args) {
    if (arg.startsWith('--') && !knownArgs.has(arg)) {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (lessonIndex < 0) throw new Error('--lesson is required')
  const rawLesson = args[lessonIndex + 1]
  if (!rawLesson || rawLesson.startsWith('--')) throw new Error('--lesson requires a number')
  const lesson = Number(rawLesson)
  if (!Number.isInteger(lesson) || lesson <= 0) throw new Error('--lesson requires a positive integer')
  return {
    lesson,
    sourceRef: `lesson-${lesson}`,
  }
}

export function collectLessonCapabilityKeys(input: {
  lessonPageBlocks: LessonPageBlockCapabilityRefs[]
  relationshipCapabilities: RelationshipCapability[]
}): string[] {
  const keys = new Set<string>()
  for (const block of input.lessonPageBlocks) {
    for (const key of block.capability_key_refs ?? []) {
      keys.add(key)
    }
  }
  for (const capability of input.relationshipCapabilities) {
    keys.add(capability.canonical_key)
  }
  return [...keys]
}

export function summarizeCapabilityReleaseReadiness(
  input: CapabilityReleaseReadinessInput,
): CapabilityReleaseReadinessReport {
  const readyPublishedCapabilities = input.capabilities.filter(capability => (
    capability.readiness_status === 'ready'
    && capability.publication_status === 'published'
  )).length
  const returnedCapabilityKeys = new Set(input.capabilities.map(capability => capability.canonical_key).filter(Boolean))
  const missingCapabilityKeys = input.scopedCapabilityKeys.filter(key => !returnedCapabilityKeys.has(key))
  const draftOrUnknownCapabilities = input.capabilities.length - readyPublishedCapabilities
  const blockers: string[] = []
  const warnings: string[] = []

  if (input.contentUnits === 0) blockers.push(`No content units are published for ${input.sourceRef}.`)
  if (input.lessonPageBlocks === 0) blockers.push(`No lesson page blocks are published for ${input.sourceRef}.`)
  if (input.scopedCapabilityKeys.length === 0) blockers.push(`No capability keys are linked to ${input.sourceRef}.`)
  if (missingCapabilityKeys.length > 0) blockers.push(`Missing capability rows for lesson-scoped keys: ${missingCapabilityKeys.join(', ')}`)
  if (readyPublishedCapabilities === 0) blockers.push('No ready/published capabilities are available for capability sessions.')
  if (input.capabilityArtifacts === 0) blockers.push('No capability artifacts are published for scoped capabilities.')
  if (input.capabilityContentUnitRelationships === 0) warnings.push('No capability/content-unit relationships are published for this lesson.')
  if (input.sourceProgressRows === 0) warnings.push('No learner source progress rows exist yet; run a browser lesson-reader smoke test.')

  return {
    releaseReady: blockers.length === 0,
    blockers,
    warnings,
    counts: {
      contentUnits: input.contentUnits,
      lessonPageBlocks: input.lessonPageBlocks,
      scopedCapabilityKeys: input.scopedCapabilityKeys.length,
      readyPublishedCapabilities,
      draftOrUnknownCapabilities,
      capabilityArtifacts: input.capabilityArtifacts,
      capabilityContentUnitRelationships: input.capabilityContentUnitRelationships,
      sourceProgressRows: input.sourceProgressRows,
    },
  }
}

function createServiceClient() {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required')
  return createClient(url, serviceKey)
}

async function countRows(query: any): Promise<number> {
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

async function loadReadinessInput(args: CapabilityReleaseReadinessArgs): Promise<CapabilityReleaseReadinessInput> {
  const supabase = createServiceClient()
  const db = () => supabase.schema('indonesian')

  const { data: contentUnits, error: contentUnitsError } = await db()
    .from('content_units')
    .select('id')
    .eq('source_ref', args.sourceRef)
  if (contentUnitsError) throw contentUnitsError
  const contentUnitIds = (contentUnits ?? []).map((row: { id: string }) => row.id)

  const { data: lessonPageBlocks, error: blocksError } = await db()
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

  const relationshipCapabilities = ((relationshipRows.data ?? []) as Array<{ capability?: RelationshipCapability | null }>)
    .map(row => row.capability)
    .filter((row): row is RelationshipCapability => Boolean(row?.canonical_key))
  const scopedCapabilityKeys = collectLessonCapabilityKeys({
    lessonPageBlocks: (lessonPageBlocks ?? []) as LessonPageBlockCapabilityRefs[],
    relationshipCapabilities,
  })

  const capabilityRows: Array<CapabilityStatusRow & { id: string }> = []
  if (scopedCapabilityKeys.length > 0) {
    const chunkSize = 50
    for (let i = 0; i < scopedCapabilityKeys.length; i += chunkSize) {
      const chunk = scopedCapabilityKeys.slice(i, i + chunkSize)
      const { data, error } = await db()
        .from('learning_capabilities')
        .select('id, canonical_key, readiness_status, publication_status')
        .in('canonical_key', chunk)
      if (error) throw error
      capabilityRows.push(...((data ?? []) as Array<CapabilityStatusRow & { id: string }>))
    }
  }
  const capabilityIds = capabilityRows.map(row => row.id)

  const capabilityArtifacts = capabilityIds.length > 0
    ? await countRows(db()
        .from('capability_artifacts')
        .select('id', { count: 'exact', head: true })
        .in('capability_id', capabilityIds))
    : 0
  const capabilityContentUnitRelationships = contentUnitIds.length > 0 && capabilityIds.length > 0
    ? await countRows(db()
        .from('capability_content_units')
        .select('id', { count: 'exact', head: true })
        .in('content_unit_id', contentUnitIds)
        .in('capability_id', capabilityIds))
    : 0
  const sourceProgressRows = await countRows(db()
    .from('learner_source_progress_state')
    .select('id', { count: 'exact', head: true })
    .eq('source_ref', args.sourceRef))

  return {
    sourceRef: args.sourceRef,
    contentUnits: contentUnitIds.length,
    lessonPageBlocks: (lessonPageBlocks ?? []).length,
    scopedCapabilityKeys,
    capabilities: capabilityRows,
    capabilityArtifacts,
    capabilityContentUnitRelationships,
    sourceProgressRows,
  }
}

async function main() {
  const args = parseCapabilityReleaseReadinessArgs(process.argv.slice(2))
  const input = await loadReadinessInput(args)
  const report = summarizeCapabilityReleaseReadiness(input)
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.blockers.length > 0 ? 1 : 0)
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
