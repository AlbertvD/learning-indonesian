import fs from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type {
  LessonStageInput,
  LessonStageOutput,
  ValidationFinding,
} from './model'
import { validateBlockKind } from './validators/blockKind'
import { validatePayloadAudio } from './validators/payloadAudio'
import { validateLessonVoices } from './validators/lessonVoices'
import { validateSectionType } from './validators/sectionType'
import { validatePerItem } from './validators/perItem'
import { validateGrammarTopics } from './validators/grammarTopics'
import { classifyBlockKind, type LegacyBlockKind } from './classifier'
import {
  upsertLesson,
  upsertLessonSections,
  upsertLessonPageBlocks,
  type PageBlockInput,
} from './adapter'
import { ensureLessonAudio } from './audio'
import {
  enrichMissingGrammarTopics,
  type GrammarTopicsEnrichmentResult,
} from './enrichGrammarTopics'
import {
  enrichMissingDialogueTranslations,
  collectDialogueLines,
  applyDialogueTranslationsToSections,
  type DialogueTranslationResult,
  type DialogueLine,
} from './enrichDialogueTranslations'
import { writeLessonWithEnrichedSections } from './stagingWriteback'

interface LessonStaging {
  title: string
  description?: string | null
  level: string
  module_id: string
  order_index: number
  primary_voice?: string | null
  dialogue_voices?: Record<string, string> | null
  sections: Array<{ title: string; content: Record<string, unknown>; order_index: number }>
}

interface PageBlockStaging {
  block_key: string
  source_ref: string
  source_refs?: string[]
  content_unit_slugs?: string[]
  block_kind: string
  display_order: number
  payload_json?: Record<string, unknown>
  capability_key_refs?: string[]
}

interface PatternStaging {
  slug: string
  pattern_name: string
  complexity_score: number
}

interface StagingBundle {
  lesson: LessonStaging
  pageBlocks: PageBlockStaging[]
  grammarPatterns: PatternStaging[]
}

const RUNNER_INTERNALS = {
  loadStaging,
  createSupabaseClient,
}

/**
 * The Stage A entry point. Sequence (per spec §7.5):
 *   1. Load staging input from disk.
 *   2. Run validators GT1–GT7. Collect findings.
 *   3. Validation errors short-circuit before any DB writes.
 *   4. dryRun returns early (no DB / no audio).
 *   5. Run classifier on page-blocks (legacy block_kind → canonical 7-value).
 *   6. Adapter writes (lesson, sections, page-blocks).
 *   7. Audio synthesis (per-text TTS via audio.ts).
 *   8. Return typed report.
 */
export async function runLessonStage(
  input: LessonStageInput,
  // Hooks let the runner.test.ts replace the file-loading + supabase-client
  // initialization + TTS client without going to disk or to the network.
  hooks: {
    loadStaging?: typeof loadStaging
    createSupabaseClient?: typeof createSupabaseClient
    synthesizer?: (text: string, voiceId: string) => Promise<Buffer>
    enrichGrammarTopics?: (
      sections: Array<{ title?: string; order_index?: number; content: Record<string, unknown> }>,
      lessonNumber: number,
    ) => Promise<GrammarTopicsEnrichmentResult>
    enrichDialogueTranslations?: (lines: DialogueLine[]) => Promise<DialogueTranslationResult>
  } = {},
): Promise<LessonStageOutput> {
  const start = Date.now()
  const findings: ValidationFinding[] = []
  const load = hooks.loadStaging ?? RUNNER_INTERNALS.loadStaging
  const createClient = hooks.createSupabaseClient ?? RUNNER_INTERNALS.createSupabaseClient

  const staging = await load(input.lessonNumber)

  // ---- Enrichment (pre-validation). ----
  // Two enrichers run in sequence, both mutating staging.lesson.sections in
  // place so the validators + section upsert see populated values. Both are
  // skipped in dry-run to avoid LLM cost — validators will then surface any
  // missing fields without touching the network.
  //
  //   1. grammar_topics — cohesive lesson-level summary, one chip-worthy
  //      label set written to every grammar/reference_table section.
  //   2. dialogue translations — fills empty Dutch translations on
  //      `content.lines[].translation` so the lesson reader shows them.
  //
  // After enrichment the cached lesson.ts on disk is rewritten so
  // subsequent runs skip the LLM calls.
  if (!input.dryRun) {
    let stagingDirty = false

    const enrichTopics = hooks.enrichGrammarTopics ?? enrichMissingGrammarTopics
    const topicsResult = await enrichTopics(staging.lesson.sections, input.lessonNumber)
    if (topicsResult.filledSectionCount > 0) stagingDirty = true

    const dialogueLines = collectDialogueLines(staging.lesson.sections)
    if (dialogueLines.length > 0) {
      const enrichDialogues = hooks.enrichDialogueTranslations ?? enrichMissingDialogueTranslations
      const dialogueResult = await enrichDialogues(dialogueLines)
      if (dialogueResult.translationsByText.size > 0) {
        const applied = applyDialogueTranslationsToSections(
          staging.lesson.sections,
          dialogueResult.translationsByText,
        )
        if (applied > 0) stagingDirty = true
      }
    }

    if (stagingDirty) {
      writeLessonWithEnrichedSections(
        input.lessonNumber,
        staging.lesson as unknown as Record<string, unknown>,
      )
    }
  }

  // GT1 (grammar_topics) runs AFTER enrichment so it sees populated values.
  // GT3, GT5, GT6 walk every section. GT4 walks the lesson + sections.
  // GT7 (grammar pattern shape) remains in capability-stage (CS6) since
  // grammar_patterns is capability-stage's territory.
  findings.push(...validateGrammarTopics(staging.lesson.sections))
  findings.push(...validatePayloadAudio(staging.pageBlocks))
  // Pass through raw staging values (undefined when staging omits the field)
  // so GT4 can distinguish "not configured in staging — orchestrator handles
  // it" from "explicitly provided but null/empty — broken authoring".
  findings.push(
    ...validateLessonVoices(
      {
        primary_voice: staging.lesson.primary_voice,
        dialogue_voices: staging.lesson.dialogue_voices,
      },
      staging.lesson.sections,
    ),
  )
  findings.push(...validateSectionType(staging.lesson.sections))
  findings.push(...validatePerItem(staging.lesson.sections))

  // GT2 runs AFTER classification — classify first, then validate.
  const classifiedBlocks: PageBlockInput[] = staging.pageBlocks.map((block) => ({
    block_key: block.block_key,
    source_ref: block.source_ref,
    source_refs: block.source_refs ?? [block.source_ref],
    content_unit_slugs: block.content_unit_slugs ?? [],
    block_kind: classifyBlockKind({
      legacyKind: block.block_kind as LegacyBlockKind,
      payloadType: (block.payload_json?.type as PageBlockInput['block_kind']) ?? undefined,
      contentUnitSlugs: block.content_unit_slugs ?? [],
    }),
    display_order: block.display_order,
    payload_json: block.payload_json ?? {},
    capability_key_refs: block.capability_key_refs ?? [],
  }))
  findings.push(...validateBlockKind(classifiedBlocks))

  const errors = findings.filter((f) => f.severity === 'error')
  if (errors.length > 0) {
    return {
      status: 'validation_failed',
      lesson: { id: '', orderIndex: staging.lesson.order_index, title: staging.lesson.title },
      counts: { sections: 0, pageBlocks: 0, audioClipsSynthesised: 0, audioClipsReused: 0 },
      findings,
      durationMs: Date.now() - start,
    }
  }

  if (input.dryRun) {
    return {
      status: 'ok',
      lesson: { id: '', orderIndex: staging.lesson.order_index, title: staging.lesson.title },
      counts: {
        sections: staging.lesson.sections.length,
        pageBlocks: classifiedBlocks.length,
        audioClipsSynthesised: 0,
        audioClipsReused: 0,
      },
      findings,
      durationMs: Date.now() - start,
    }
  }

  const supabase = createClient()

  const lesson = await upsertLesson(supabase, {
    module_id: staging.lesson.module_id,
    order_index: staging.lesson.order_index,
    title: staging.lesson.title,
    description: staging.lesson.description ?? null,
    level: staging.lesson.level,
  })

  const sectionCount = await upsertLessonSections(supabase, lesson.id, staging.lesson.sections)
  const pageBlockCount = await upsertLessonPageBlocks(supabase, classifiedBlocks)

  // Collect audio texts AFTER the lesson row + voices are persisted, since
  // ensureLessonAudio re-runs setLessonVoicesForLesson which reads the row.
  const audioTexts = collectLessonPageTexts(staging.lesson)
  const audioBudget = input.audioBudget?.maxNewSyntheses ?? 500
  const audio = await ensureLessonAudio({
    lessonId: lesson.id,
    orderIndex: lesson.orderIndex,
    texts: audioTexts,
    audioBudget,
    supabase,
    synthesizer: hooks.synthesizer,
  })

  return {
    status: 'ok',
    lesson,
    counts: {
      sections: sectionCount,
      pageBlocks: pageBlockCount,
      audioClipsSynthesised: audio.synthesised,
      audioClipsReused: audio.reused,
    },
    findings,
    durationMs: Date.now() - start,
  }
}

/**
 * Walk the lesson's sections and produce the (text, voiceId) pairs Stage A
 * expects audio for:
 *   - dialogue lines: voice via lesson.dialogue_voices[speaker]
 *   - vocabulary / expressions / numbers items: voice via primary_voice
 *
 * Reading-section paragraphs use long-form lesson narration (separate path,
 * §1.5 E) and are out of scope here.
 */
export function collectLessonPageTexts(
  lesson: Pick<LessonStaging, 'sections' | 'primary_voice' | 'dialogue_voices'>,
): Array<{ text: string; voiceId: string }> {
  const out: Array<{ text: string; voiceId: string }> = []
  const primaryVoice = lesson.primary_voice ?? null

  for (const section of lesson.sections) {
    const type = section.content?.type
    if (type === 'dialogue') {
      const lines = section.content.lines
      if (!Array.isArray(lines)) continue
      for (const line of lines as Array<{ text?: unknown; speaker?: unknown }>) {
        if (typeof line.text !== 'string' || !line.text.trim()) continue
        if (typeof line.speaker !== 'string') continue
        const voice = lesson.dialogue_voices?.[line.speaker.trim()]
        if (!voice) continue
        out.push({ text: line.text.trim(), voiceId: voice })
      }
    } else if (type === 'vocabulary' || type === 'expressions' || type === 'numbers') {
      if (!primaryVoice) continue
      const items = section.content.items
      if (!Array.isArray(items)) continue
      for (const item of items as Array<{ indonesian?: unknown }>) {
        if (typeof item.indonesian !== 'string' || !item.indonesian.trim()) continue
        out.push({ text: item.indonesian.trim(), voiceId: primaryVoice })
      }
    }
  }

  return out
}

async function loadStaging(lessonNumber: number): Promise<StagingBundle> {
  const stagingDir = path.join(
    process.cwd(),
    'scripts',
    'data',
    'staging',
    `lesson-${lessonNumber}`,
  )
  if (!fs.existsSync(stagingDir)) {
    throw new Error(`Staging directory not found: ${stagingDir}`)
  }

  const lesson = (await readStagingExport<LessonStaging>(
    path.join(stagingDir, 'lesson.ts'),
  )) ?? null
  if (!lesson) throw new Error(`scripts/data/staging/lesson-${lessonNumber}/lesson.ts is empty or unreadable`)

  const grammarPatterns =
    (await readStagingExport<PatternStaging[]>(path.join(stagingDir, 'grammar-patterns.ts'))) ?? []
  const pageBlocks =
    (await readStagingExport<PageBlockStaging[]>(
      path.join(stagingDir, 'lesson-page-blocks.ts'),
    )) ?? []

  return { lesson, grammarPatterns, pageBlocks }
}

async function readStagingExport<T>(filePath: string): Promise<T | null> {
  if (!fs.existsSync(filePath)) return null
  const module = await import(`file://${filePath}`)
  const values = Object.values(module)
  return values.length > 0 ? (values[0] as T) : null
}

function createSupabaseClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_KEY is not set — required for Stage A writes')
  }
  return createClient(url, serviceKey)
}
