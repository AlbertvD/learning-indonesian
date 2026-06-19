import fs from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type {
  LessonStageInput,
  LessonStageOutput,
  ValidationFinding,
} from './model'
import { runLessonGate } from './gate'
import {
  upsertLesson,
  upsertLessonSections,
  replaceLessonDialogueLines,
  replaceLessonSectionItemRows,
  replaceLessonSectionGrammarCategories,
  replaceLessonSectionGrammarTopics,
  replaceLessonSectionAffixedPairs,
  type DialogueLineInput,
  type ItemRowInput,
  type GrammarCategoryInput,
  type GrammarTopicInput,
  type AffixedPairRowInput,
} from './adapter'
import { ensureLessonAudio } from './audio'
import { setLessonVoicesForLesson } from '../../../set-lesson-voices'
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
import { enrichMissingEnContent } from './enrichEnTranslations'
import { projectSections, type AffixedPairInput } from './projectSections'
import { cleanItemText } from '../../clean-item-text'
import { writeLessonWithEnrichedSections } from './stagingWriteback'
import { runLessonCountParity } from './verify/countParity'
import { runLessonContentNonEmpty } from './verify/contentNonEmpty'

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

interface StagingBundle {
  lesson: LessonStaging
  /** PR 6: morphology-patterns.ts (sibling staging file; only some lessons). */
  affixedFormPairs: AffixedPairInput[]
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
 *   5. Adapter writes (lesson, sections).
 *   6. Audio synthesis (per-text TTS via audio.ts).
 *   7. Return typed report.
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
      options?: { deterministicOnly?: boolean },
    ) => Promise<GrammarTopicsEnrichmentResult>
    enrichDialogueTranslations?: (lines: DialogueLine[]) => Promise<DialogueTranslationResult>
    enrichEnContent?: typeof enrichMissingEnContent
  } = {},
): Promise<LessonStageOutput> {
  const start = Date.now()
  const findings: ValidationFinding[] = []
  const load = hooks.loadStaging ?? RUNNER_INTERNALS.loadStaging
  const createClient = hooks.createSupabaseClient ?? RUNNER_INTERNALS.createSupabaseClient

  const staging = await load(input.lessonNumber)

  // ---- Enrichment (pre-validation). ----
  // Two enrichers run in sequence, both mutating staging.lesson.sections in
  // place so the validators + section upsert see populated values.
  //
  //   1. grammar_topics — cohesive lesson-level summary, one chip-worthy
  //      label set written to every grammar/reference_table section. Runs
  //      unconditionally; in dry-run we force the deterministic path (no
  //      LLM cost) so GT1 has populated values to validate against.
  //   2. dialogue translations — fills empty Dutch translations on
  //      `content.lines[].translation` so the lesson reader shows them.
  //      LLM-only; skipped in dry-run to avoid cost.
  //   3. EN content (PR 6, ADR 0012) — fills English across items, dialogue
  //      lines, and grammar (title/rules/examples). The Lesson Stage owns all
  //      learner-facing translations. Runs AFTER dialogue Dutch enrichment so
  //      it has the Dutch as context. LLM-only; skipped in dry-run.
  //
  // After enrichment the cached lesson.ts on disk is rewritten so
  // subsequent runs skip the LLM calls. Disk writeback is gated on
  // !input.dryRun — dry-run must not mutate the working tree.
  let stagingDirty = false

  const enrichTopics = hooks.enrichGrammarTopics ?? enrichMissingGrammarTopics
  const topicsResult = await enrichTopics(
    staging.lesson.sections,
    input.lessonNumber,
    { deterministicOnly: input.dryRun },
  )
  if (topicsResult.filledSectionCount > 0) stagingDirty = true

  if (!input.dryRun) {
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

    // EN content enrichment (PR 6) — fills items + dialogue + grammar English.
    const enrichEn = hooks.enrichEnContent ?? enrichMissingEnContent
    const enResult = await enrichEn(staging.lesson.sections)
    if (enResult.filled.items > 0 || enResult.filled.dialogueLines > 0 || enResult.filled.grammarCategories > 0) {
      stagingDirty = true
    }

    if (stagingDirty) {
      writeLessonWithEnrichedSections(
        input.lessonNumber,
        staging.lesson as unknown as Record<string, unknown>,
      )
    }
  }

  // Project the enriched sections (+ morphology pairs) into the typed
  // capability-contract rows. Pure — no DB needed — so it runs before the
  // dry-run short-circuit, and the projected rows are reused for the
  // typed-table writes below. GT9 (sectionShape) validates them inside the gate.
  const projected = projectSections({
    lessonNumber: input.lessonNumber,
    sections: staging.lesson.sections,
    affixedPairs: staging.affixedFormPairs,
  })

  // The Lesson Gate — one consolidated pre-write validator over the GT* family
  // (ADR 0013 §3). Runs AFTER enrichment so GT1/GT8/GT9 see populated values.
  // `mode` is the only knob: a real publish runs post-enrichment with
  // EN-completeness CRITICAL; a dry-run is the standalone pre-flight on the raw
  // (LLM-un-enriched) lesson, relaxing EN-completeness to warnings (fixing the
  // dry-run-fails-on-missing-EN wart). All structural checks stay CRITICAL in
  // both modes. Raw staging voice values pass through as-is (undefined when
  // staging omits them) so GT4 can tell "orchestrator fills it" from "broken".
  findings.push(
    ...runLessonGate({
      lesson: {
        primary_voice: staging.lesson.primary_voice,
        dialogue_voices: staging.lesson.dialogue_voices,
      },
      sections: staging.lesson.sections,
      projected,
      mode: input.dryRun ? 'pre-flight' : 'publish',
    }),
  )

  const errors = findings.filter((f) => f.severity === 'error')
  if (errors.length > 0) {
    return {
      status: 'validation_failed',
      lesson: { id: '', orderIndex: staging.lesson.order_index, title: staging.lesson.title },
      counts: { sections: 0, audioClipsSynthesised: 0, audioClipsReused: 0 },
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

  const { count: sectionCount, idsByOrderIndex: sectionIdsByOrderIndex } =
    await upsertLessonSections(supabase, lesson.id, input.lessonNumber, staging.lesson.sections)

  // PR 2 — write `lesson_dialogue_lines` typed satellite rows for every
  // dialogue section. Replaces the per-line shape that previously lived only
  // inside `lesson_sections.content.lines[]`. capability-stage's
  // dialogue_clozes projector FKs to these rows by id.
  const dialogueLineInputs: DialogueLineInput[] = []
  const dialogueSectionIds: string[] = []
  for (const section of staging.lesson.sections) {
    const content = section.content as { type?: unknown; lines?: unknown } | undefined
    if (content?.type !== 'dialogue') continue
    const sectionId = sectionIdsByOrderIndex.get(section.order_index)
    if (!sectionId) continue
    dialogueSectionIds.push(sectionId)
    if (!Array.isArray(content.lines)) continue
    for (const [idx, raw] of (content.lines as Array<Record<string, unknown>>).entries()) {
      const text = typeof raw?.text === 'string' ? raw.text.trim() : ''
      if (!text) continue
      const translation = typeof raw?.translation === 'string' ? raw.translation.trim() : ''
      if (!translation) continue
      const speakerRaw = typeof raw?.speaker === 'string' ? raw.speaker.trim() : ''
      const speaker = speakerRaw ? speakerRaw : null
      // PR 6: translation_nl mirrors the legacy Dutch `translation`;
      // translation_en is filled by the lesson-stage EN enricher.
      const translationEn = typeof raw?.translation_en === 'string' && raw.translation_en.trim()
        ? raw.translation_en.trim()
        : null
      dialogueLineInputs.push({
        section_id: sectionId,
        lesson_id: lesson.id,
        line_index: idx,
        source_line_ref: `lesson-${input.lessonNumber}/section-${section.order_index}/line-${idx}`,
        text,
        speaker,
        translation,
        translation_nl: translation,
        translation_en: translationEn,
      })
    }
  }
  const dialogueLineCount = await replaceLessonDialogueLines(
    supabase,
    dialogueSectionIds,
    dialogueLineInputs,
  )

  // PR 6 — typed lesson-section capability-contract writes. Resolve the pure
  // projection's section order_index → DB section_id, then replace each typed
  // table. Write-only at merge — the future Capability Stage (#98/#99) reads them.
  const itemRowInputs: ItemRowInput[] = []
  const itemSectionIds = new Set<string>()
  for (const row of projected.itemRows) {
    const sectionId = sectionIdsByOrderIndex.get(row.sourceSectionOrderIndex)
    if (!sectionId) continue
    itemSectionIds.add(sectionId)
    itemRowInputs.push({
      section_id: sectionId,
      lesson_id: lesson.id,
      display_order: row.display_order,
      source_item_ref: row.source_item_ref,
      item_type: row.item_type,
      indonesian_text: row.indonesian_text,
      l1_translation: row.l1_translation,
      l2_translation: row.l2_translation,
    })
  }
  const itemRowCount = await replaceLessonSectionItemRows(
    supabase,
    [...itemSectionIds],
    itemRowInputs,
  )

  const grammarCategoryInputs: GrammarCategoryInput[] = []
  const grammarTopicInputs: GrammarTopicInput[] = []
  const grammarSectionIds = new Set<string>()
  for (const cat of projected.grammarCategories) {
    const sectionId = sectionIdsByOrderIndex.get(cat.sourceSectionOrderIndex)
    if (!sectionId) continue
    grammarSectionIds.add(sectionId)
    grammarCategoryInputs.push({
      section_id: sectionId,
      lesson_id: lesson.id,
      display_order: cat.display_order,
      title: cat.title,
      title_en: cat.title_en,
      rules: cat.rules,
      rules_en: cat.rules_en,
      examples: cat.examples,
    })
  }
  for (const topic of projected.grammarTopics) {
    const sectionId = sectionIdsByOrderIndex.get(topic.sourceSectionOrderIndex)
    if (!sectionId) continue
    grammarSectionIds.add(sectionId)
    grammarTopicInputs.push({
      section_id: sectionId,
      lesson_id: lesson.id,
      topic_label: topic.topic_label,
    })
  }
  const grammarCategoryCount = await replaceLessonSectionGrammarCategories(
    supabase,
    [...grammarSectionIds],
    grammarCategoryInputs,
  )
  const grammarTopicCount = await replaceLessonSectionGrammarTopics(
    supabase,
    [...grammarSectionIds],
    grammarTopicInputs,
  )

  const affixedPairInputs: AffixedPairRowInput[] = projected.affixedPairs.map((p) => ({
    lesson_id: lesson.id,
    section_id: null, // morphology has no lesson.ts section
    source_ref: p.source_ref,
    pattern_source_ref: p.pattern_source_ref,
    affix: p.affix,
    root_text: p.root_text,
    derived_text: p.derived_text,
    allomorph_rule: p.allomorph_rule,
    affix_type: p.affix_type,
    affix_gloss: p.affix_gloss,
    allomorph_class: p.allomorph_class,
    circumfix_left: p.circumfix_left,
    circumfix_right: p.circumfix_right,
    productive: p.productive,
    carrier_text: p.carrier_text,
  }))
  const affixedPairCount = await replaceLessonSectionAffixedPairs(
    supabase,
    lesson.id,
    affixedPairInputs,
  )

  // Voice config must be applied to the lesson BEFORE collecting audio texts.
  // collectLessonPageTexts reads primary_voice / dialogue_voices to decide which
  // vocab + dialogue strings to voice — but staging files DON'T carry voices
  // (they're computed deterministically from order_index + dialogue speakers).
  // setLessonVoicesForLesson persists them (lessons.primary_voice + lesson_speakers)
  // AND returns them; apply onto staging.lesson so the collector actually voices
  // the page. (Bug fix #168: previously this read the null staging voices →
  // 0 texts → 0 audio synthesised on every fresh publish.)
  const voiceAssignment = await setLessonVoicesForLesson({
    lessonId: lesson.id,
    orderIndex: lesson.orderIndex,
    supabase,
    dryRun: input.dryRun ?? false,
  })
  staging.lesson.primary_voice = voiceAssignment.primaryVoice
  staging.lesson.dialogue_voices = voiceAssignment.dialogueVoices
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

  // ---- Post-write verification (the Lesson Gate's "did the write land" layer,
  // ADR 0013 §2/§5). Reads back ONLY this lesson's just-written rows and asserts
  // per-table count parity (LV1) + content blob non-empty per section (LV2).
  // Self-contained to the lesson → fresh-lesson-safe. On failure, Stage A
  // returns `partial` (non-ok) with NO rollback — lesson content is a
  // regenerable projection; re-publish is the fix.
  const postWriteFindings: ValidationFinding[] = [
    ...(await runLessonCountParity(supabase, {
      lessonId: lesson.id,
      declared: {
        sections: sectionCount,
        dialogueLines: dialogueLineCount,
        itemRows: itemRowCount,
        grammarCategories: grammarCategoryCount,
        grammarTopics: grammarTopicCount,
        affixedPairs: affixedPairCount,
      },
    })),
    ...(await runLessonContentNonEmpty(supabase, { lessonId: lesson.id })),
  ]
  findings.push(...postWriteFindings)

  // Classify on the post-write findings specifically — not the whole array.
  // Pre-write errors already short-circuited above, but scoping here keeps the
  // verdict correct once slice 2 adds warning-severity pre-write findings
  // (ADR 0013 §3: pre-flight relaxes EN-completeness to warnings).
  const postWriteFailed = postWriteFindings.some((f) => f.severity === 'error')

  return {
    status: postWriteFailed ? 'partial' : 'ok',
    lesson,
    counts: {
      sections: sectionCount,
      audioClipsSynthesised: audio.synthesised,
      audioClipsReused: audio.reused,
      dialogueLines: dialogueLineCount,
      itemRows: itemRowCount,
      grammarCategories: grammarCategoryCount,
      grammarTopics: grammarTopicCount,
      affixedPairs: affixedPairCount,
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
 *   - grammar category example sentences (categories[].examples[].indonesian):
 *     voice via primary_voice. The Dutch `rules` are explanation text, never voiced.
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
        // Strip orthographic parentheticals so TTS voices the clean word, not the
        // bracketed gloss — same rule projectSections applies to the item rows.
        out.push({ text: cleanItemText(item.indonesian.trim()), voiceId: primaryVoice })
      }
    } else if (type === 'grammar') {
      // Grammar example sentences are authored, learner-facing Indonesian shown
      // (and played) in the lesson reader's grammar cards. The Dutch `rules` are
      // explanation text and are never voiced.
      if (!primaryVoice) continue
      const categories = section.content.categories
      if (!Array.isArray(categories)) continue
      for (const cat of categories as Array<{ examples?: unknown }>) {
        if (!Array.isArray(cat.examples)) continue
        for (const ex of cat.examples as Array<{ indonesian?: unknown }>) {
          if (typeof ex.indonesian !== 'string' || !ex.indonesian.trim()) continue
          out.push({ text: ex.indonesian.trim(), voiceId: primaryVoice })
        }
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

  // PR 6: morphology-patterns.ts is a sibling staging file present only for
  // morphology-introducing lessons (L9 today). The Lesson Stage now owns the
  // affixed-pair lesson-content (ADR 0012) and projects it to
  // lesson_section_affixed_pairs. Absent file → empty list (no morphology).
  const affixedFormPairs =
    (await readStagingExport<AffixedPairInput[]>(
      path.join(stagingDir, 'morphology-patterns.ts'),
    )) ?? []

  return { lesson, affixedFormPairs }
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
