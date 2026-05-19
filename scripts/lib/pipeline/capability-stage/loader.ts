/**
 * capability-stage/loader.ts — input boundary for the deep module.
 *
 * Two read sources:
 *   1. DB (Stage A's outputs): `lessons`, `lesson_sections`, `lesson_page_blocks`,
 *      `audio_clips`. Replaces the legacy `lesson.ts` staging-file read.
 *   2. Staging files (everything downstream of `lesson.ts`):
 *      learning-items / grammar-patterns / candidates / cloze-contexts /
 *      content-units / capabilities / exercise-assets / lesson-page-blocks.
 *      Mirrors capability-stage-legacy.ts:67–101 minus the `lesson.ts` read.
 *
 * The deep module's external interface remains
 *   { lessonNumber, lessonId, dryRun }
 * and Stage A's runLessonStage must have run first so the DB rows exist.
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  fetchLessonAudioCoverage,
  type AudioClipMeta,
  type CapabilitySupabaseClient,
} from './adapter'

export interface LoadedLessonRow {
  id: string
  module_id: string
  order_index: number
  title: string
  level: string
  primary_voice: string | null
}

export interface LoadedLessonSection {
  id: string
  title: string
  content: Record<string, unknown>
  order_index: number
}

export interface LoadedLessonPageBlock {
  block_key: string
  source_ref: string
  source_refs: string[]
  content_unit_slugs: string[]
  block_kind: string
  display_order: number
  payload_json: Record<string, unknown>
}

export interface LoadedStaging {
  learningItems: Array<Record<string, unknown>>
  grammarPatterns: Array<Record<string, unknown>>
  candidates: Array<Record<string, unknown>>
  clozeContexts: Array<Record<string, unknown>>
  contentUnits: Array<Record<string, unknown>>
  capabilities: Array<Record<string, unknown>>
  lessonPageBlocks: Array<Record<string, unknown>>
  exerciseAssets: Array<Record<string, unknown>>
  affixedFormPairs: Array<Record<string, unknown>>
  stagingDir: string
}

export interface LoadedLesson {
  lesson: LoadedLessonRow
  sections: LoadedLessonSection[]
  pageBlocks: LoadedLessonPageBlock[]
  /**
   * Map of `normalized_text` (via normalizeTtsText) → audio clip metadata for
   * every audio_clips row attached to this lesson, primary-voice preferred.
   * Replaces the older `audioNormalizedTexts: Set<string>` so the projector
   * can both flag `hasAudio` AND build a concrete `audio_clip` artifact
   * payload from the same source. Empty when the loader runs without a
   * Supabase client (dry-run / offline staging generator).
   */
  audioClipsByNormalizedText: Map<string, AudioClipMeta>
  staging: LoadedStaging
}

// ---------------------------------------------------------------------------
// DB reads (Stage A outputs)
// ---------------------------------------------------------------------------

export async function loadStageAOutputsFromDb(
  supabase: CapabilitySupabaseClient,
  input: { lessonNumber: number; lessonId: string },
): Promise<Omit<LoadedLesson, 'staging'>> {
  const { lessonId, lessonNumber } = input

  const { data: lessonRow, error: lessonError } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, module_id, order_index, title, level, primary_voice')
    .eq('id', lessonId)
    .single()
  if (lessonError) throw new Error(`Failed to load lessons.id=${lessonId}: ${lessonError.message}`)
  if (!lessonRow) throw new Error(`No lessons row found for id=${lessonId} (Stage A must run first)`)

  const { data: sectionsData, error: sectionsError } = await supabase
    .schema('indonesian')
    .from('lesson_sections')
    .select('id, title, content, order_index')
    .eq('lesson_id', lessonId)
    .order('order_index', { ascending: true })
  if (sectionsError) throw sectionsError

  const { data: pageBlocksData, error: pageBlocksError } = await supabase
    .schema('indonesian')
    .from('lesson_page_blocks')
    .select('block_key, source_ref, source_refs, content_unit_slugs, block_kind, display_order, payload_json')
    .eq('source_ref', `lesson-${lessonNumber}`)
    .order('display_order', { ascending: true })
  if (pageBlocksError) throw pageBlocksError

  const typedLessonRow = lessonRow as LoadedLessonRow
  const audioClipsByNormalizedText = await fetchLessonAudioCoverage(
    supabase,
    lessonId,
    typedLessonRow.primary_voice,
  )

  return {
    lesson: typedLessonRow,
    sections: (sectionsData ?? []) as LoadedLessonSection[],
    pageBlocks: ((pageBlocksData ?? []) as Array<Partial<LoadedLessonPageBlock>>).map((b) => ({
      block_key: b.block_key ?? '',
      source_ref: b.source_ref ?? '',
      source_refs: b.source_refs ?? [],
      content_unit_slugs: b.content_unit_slugs ?? [],
      block_kind: b.block_kind ?? '',
      display_order: b.display_order ?? 0,
      payload_json: (b.payload_json ?? {}) as Record<string, unknown>,
    })),
    audioClipsByNormalizedText,
  }
}

// ---------------------------------------------------------------------------
// Staging-file reads (mirrors capability-stage-legacy.ts:52–101 minus lesson.ts)
// ---------------------------------------------------------------------------

async function readStagingFile<T>(filePath: string): Promise<T | null> {
  if (!fs.existsSync(filePath)) return null
  // Bun resolves absolute file paths directly; file:// prefix handles cross-platform.
  const module = await import(`file://${filePath}`)
  const values = Object.values(module)
  return values.length > 0 ? (values[0] as T) : null
}

export async function loadStagingFiles(lessonNumber: number): Promise<LoadedStaging> {
  const stagingDir = path.join(
    process.cwd(),
    'scripts', 'data', 'staging', `lesson-${lessonNumber}`,
  )
  if (!fs.existsSync(stagingDir)) {
    throw new Error(`Staging directory not found: ${stagingDir}`)
  }

  const [learningItems, grammarPatterns, candidates, clozeContexts] = await Promise.all([
    readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'learning-items.ts')),
    readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'grammar-patterns.ts')),
    readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'candidates.ts')),
    readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'cloze-contexts.ts')),
  ])
  const [contentUnits, capabilities, lessonPageBlocks, exerciseAssets, affixedFormPairs] = await Promise.all([
    readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'content-units.ts')),
    readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'capabilities.ts')),
    readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'lesson-page-blocks.ts')),
    readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'exercise-assets.ts')),
    readStagingFile<Array<Record<string, unknown>>>(path.join(stagingDir, 'morphology-patterns.ts')),
  ])

  return {
    learningItems: learningItems ?? [],
    grammarPatterns: grammarPatterns ?? [],
    candidates: candidates ?? [],
    clozeContexts: clozeContexts ?? [],
    contentUnits: contentUnits ?? [],
    capabilities: capabilities ?? [],
    lessonPageBlocks: lessonPageBlocks ?? [],
    exerciseAssets: exerciseAssets ?? [],
    affixedFormPairs: affixedFormPairs ?? [],
    stagingDir,
  }
}

// ---------------------------------------------------------------------------
// Combined load: Stage A outputs (DB) + staging files (disk)
// ---------------------------------------------------------------------------

export async function loadLesson(
  supabase: CapabilitySupabaseClient | null,
  input: { lessonNumber: number; lessonId: string },
): Promise<LoadedLesson> {
  // When supabase is null (dry-run-without-service-key), fall back to
  // staging-only mode: sections come from `staging/lesson.ts` which
  // mirrors what Stage A writes to lesson_sections.
  if (!supabase) return loadLessonForDryRun(input)
  const [stageA, staging] = await Promise.all([
    loadStageAOutputsFromDb(supabase, input),
    loadStagingFiles(input.lessonNumber),
  ])
  return { ...stageA, staging }
}

/**
 * Dry-run loader: reads staging files only, no DB access. Sections are
 * sourced from staging `lesson.ts` (equivalent to what Stage A would write
 * to `lesson_sections`). Used by runCapabilityStage when dryRun is set
 * AND no Supabase client is available — preserves the legacy "dry-run
 * without SUPABASE_SERVICE_KEY" UX.
 */
export async function loadLessonForDryRun(
  input: { lessonNumber: number; lessonId: string },
): Promise<LoadedLesson> {
  const staging = await loadStagingFiles(input.lessonNumber)
  const stagedLesson = await readStagingFile<{
    title?: string
    level?: string
    module_id?: string
    order_index?: number
    sections?: Array<{ title: string; content: Record<string, unknown>; order_index: number }>
  }>(path.join(staging.stagingDir, 'lesson.ts'))

  return {
    lesson: {
      id: input.lessonId,
      module_id: stagedLesson?.module_id ?? '',
      order_index: stagedLesson?.order_index ?? input.lessonNumber,
      title: stagedLesson?.title ?? `Lesson ${input.lessonNumber}`,
      level: stagedLesson?.level ?? 'A1',
      primary_voice: null,
    },
    sections: (stagedLesson?.sections ?? []).map((s, idx) => ({
      id: `staging-section-${idx}`,
      title: s.title,
      content: s.content,
      order_index: s.order_index,
    })),
    pageBlocks: [],
    audioClipsByNormalizedText: new Map(),
    staging,
  }
}
