import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ArtifactKind } from '../src/lib/capabilities/capabilityTypes'

type ArtifactQualityStatus = 'draft' | 'approved' | 'blocked' | 'deprecated'

export interface StagedExerciseAsset {
  asset_key: string
  capability_key: string
  artifact_kind: ArtifactKind
  quality_status: ArtifactQualityStatus
  payload_json: Record<string, unknown> | null
}

export interface ArtifactApprovalArgs {
  lesson: number
  apply: boolean
  stagingPath: string
}

export interface ArtifactApprovalPlan {
  approved: Array<{
    assetKey: string
    capabilityKey: string
    artifactKind: ArtifactKind
    qualityStatus: 'approved'
  }>
  blocked: Array<{
    assetKey: string
    capabilityKey: string
    artifactKind: ArtifactKind
    reason: string
  }>
  unchanged: Array<{
    assetKey: string
    capabilityKey: string
    artifactKind: ArtifactKind
    qualityStatus: ArtifactQualityStatus
  }>
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString)
}

function hasReviewMetadata(payload: Record<string, unknown>): boolean {
  return nonEmptyString(payload.reviewedBy) && nonEmptyString(payload.reviewedAt)
}

export function isConcreteArtifactPayload(kind: ArtifactKind, payload: unknown): boolean {
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

export function parseApproveArtifactsArgs(args: string[]): ArtifactApprovalArgs {
  const knownArgs = new Set(['--lesson', '--apply', '--dry-run', '--staging'])
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

  const stagingIndex = args.indexOf('--staging')
  const stagingPath = stagingIndex >= 0
    ? args[stagingIndex + 1]
    : `scripts/data/staging/lesson-${lesson}/exercise-assets.ts`
  if (!stagingPath || stagingPath.startsWith('--')) throw new Error('--staging requires a path')

  return {
    lesson,
    apply,
    stagingPath,
  }
}

export function planArtifactApproval(input: { assets: StagedExerciseAsset[] }): ArtifactApprovalPlan {
  const approved: ArtifactApprovalPlan['approved'] = []
  const blocked: ArtifactApprovalPlan['blocked'] = []
  const unchanged: ArtifactApprovalPlan['unchanged'] = []

  for (const asset of input.assets) {
    const payload = asset.payload_json
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      blocked.push({
        assetKey: asset.asset_key,
        capabilityKey: asset.capability_key,
        artifactKind: asset.artifact_kind,
        reason: 'missing_payload',
      })
      continue
    }
    if (payload.placeholder === true) {
      blocked.push({
        assetKey: asset.asset_key,
        capabilityKey: asset.capability_key,
        artifactKind: asset.artifact_kind,
        reason: 'placeholder_payload',
      })
      continue
    }
    if (!isConcreteArtifactPayload(asset.artifact_kind, payload)) {
      blocked.push({
        assetKey: asset.asset_key,
        capabilityKey: asset.capability_key,
        artifactKind: asset.artifact_kind,
        reason: 'incomplete_concrete_payload',
      })
      continue
    }
    if (asset.quality_status !== 'draft' && asset.quality_status !== 'approved') {
      blocked.push({
        assetKey: asset.asset_key,
        capabilityKey: asset.capability_key,
        artifactKind: asset.artifact_kind,
        reason: 'status_not_approvable',
      })
      continue
    }
    if (!hasReviewMetadata(payload)) {
      blocked.push({
        assetKey: asset.asset_key,
        capabilityKey: asset.capability_key,
        artifactKind: asset.artifact_kind,
        reason: 'missing_review_metadata',
      })
      continue
    }
    if (asset.quality_status === 'approved') {
      unchanged.push({
        assetKey: asset.asset_key,
        capabilityKey: asset.capability_key,
        artifactKind: asset.artifact_kind,
        qualityStatus: asset.quality_status,
      })
      continue
    }
    approved.push({
      assetKey: asset.asset_key,
      capabilityKey: asset.capability_key,
      artifactKind: asset.artifact_kind,
      qualityStatus: 'approved',
    })
  }

  return { approved, blocked, unchanged }
}

async function loadAssets(stagingPath: string): Promise<StagedExerciseAsset[]> {
  const absolutePath = path.resolve(stagingPath)
  if (!fs.existsSync(absolutePath)) throw new Error(`Staging file not found: ${stagingPath}`)
  const module = await import(pathToFileURL(absolutePath).href) as { exerciseAssets?: StagedExerciseAsset[] }
  return module.exerciseAssets ?? []
}

function applyApproval(assets: StagedExerciseAsset[], plan: ArtifactApprovalPlan): StagedExerciseAsset[] {
  const approvedKeys = new Set(plan.approved.map(asset => asset.assetKey))
  return assets.map(asset => approvedKeys.has(asset.asset_key)
    ? { ...asset, quality_status: 'approved' }
    : asset)
}

async function main() {
  const args = parseApproveArtifactsArgs(process.argv.slice(2))
  const assets = await loadAssets(args.stagingPath)
  const plan = planArtifactApproval({ assets })
  console.log(JSON.stringify({
    mode: args.apply ? 'apply' : 'dry-run',
    counts: {
      approved: plan.approved.length,
      blocked: plan.blocked.length,
      unchanged: plan.unchanged.length,
    },
    plan,
  }, null, 2))

  if (args.apply) {
    const nextAssets = applyApproval(assets, plan)
    fs.writeFileSync(
      path.resolve(args.stagingPath),
      `// Reviewed via approve-staged-capability-artifacts.ts\nexport const exerciseAssets = ${JSON.stringify(nextAssets, null, 2)}\n`,
    )
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
