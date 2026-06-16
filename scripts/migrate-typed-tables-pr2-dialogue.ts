#!/usr/bin/env bun
/**
 * migrate-typed-tables-pr2-dialogue.ts
 *
 * ⚠️ ALREADY EXECUTED — DO NOT RE-RUN. This one-shot bridge reads the legacy
 * `capability_artifacts` table, which was DROPPED in Slice 4b (#102). Re-running
 * it post-drop returns a PGRST205 "table not found" runtime error. Retained as a
 * paper-trail record of the PR 2 migration only.
 *
 * One-shot bridge for PR 2 — moves dialogue_line content from the legacy
 * 3-artifact shape (`capability_artifacts` rows for `cloze_context`,
 * `cloze_answer`, `translation:l1`) plus the in-content dialogue lines on
 * `lesson_sections.content.lines[]` into the typed satellite tables
 * `lesson_dialogue_lines` + `dialogue_clozes`.
 *
 * BACKGROUND
 * ----------
 * PR 2 (this PR) introduces:
 *   1. A pipeline writer for `lesson_dialogue_lines` (lesson-stage runner) and
 *      `dialogue_clozes` (capability-stage projector). Re-publishing a lesson
 *      populates both typed tables from staging.
 *   2. A typed-table reader at `src/lib/exercise-content/byKind/dialogueLine.ts`
 *      that JOINs `dialogue_clozes → lesson_dialogue_lines` and fails loud
 *      when the row is missing.
 *
 * The reader switches over on this PR's deploy. Re-publish covers any lesson
 * the pipeline can publish — which is currently only L9 (the only lesson with
 * dialogue_line caps). L5/7/8 have cloze gaps that block re-publish and
 * legitimately stay un-bridged for now.
 *
 * However, even on L9 the typed tables start empty (PR 0 created the tables
 * only). Without this bridge, a deploy without an immediate re-publish would
 * surface the new fail-loud reader's `dialogue_line_typed_row_missing` diagnostic
 * for every active dialogue_line cap. This bridge populates the typed rows
 * from the existing artifacts + sections data so the deploy + re-publish
 * sequence stays safe.
 *
 * WHAT THIS DOES
 * --------------
 * For every active `dialogue_line` capability:
 *   1. Look up the source dialogue line from `lesson_sections.content.lines[]`
 *      using the cap's `source_ref` (lesson-N/section-M/line-K). Find the
 *      matching `lesson_sections` row by (lesson_id, order_index=M), then
 *      index into `content.lines[K]`.
 *   2. Upsert a `lesson_dialogue_lines` row keyed by UNIQUE(source_line_ref).
 *   3. Read the 3 `capability_artifacts` rows (`cloze_context`,
 *      `cloze_answer`, `translation:l1`) for the cap.
 *   4. Insert a `dialogue_clozes` row keyed by UNIQUE(capability_id), with
 *      `sentence_with_blank` from cloze_context.source_text,
 *      `answer_text` from cloze_answer.value,
 *      `translation_text` from translation:l1.value,
 *      and `dialogue_line_id` from step 2.
 *
 * IDEMPOTENCY
 * -----------
 * `lesson_dialogue_lines` upserts on UNIQUE(source_line_ref).
 * `dialogue_clozes` upserts on UNIQUE(capability_id).
 * A second run with no source changes is a no-op (existing rows match, no
 * inserts performed).
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * - Lessons with no dialogue_line caps. Nothing to bridge.
 * - Caps whose `source_ref` resolves to no dialogue line in lesson_sections
 *   (broken authoring upstream). Logged as a CRITICAL anomaly; script aborts.
 * - Caps missing one of the three artifacts. Logged as a CRITICAL anomaly;
 *   script aborts.
 *
 * USAGE
 *   bun scripts/migrate-typed-tables-pr2-dialogue.ts --dry-run   # preview, no writes
 *   bun scripts/migrate-typed-tables-pr2-dialogue.ts             # apply
 *   Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY in .env.local.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// ── Env loading (mirror migrate-typed-tables-pr1-complete.ts) ────────────────
function loadEnv() {
  const envPath = '.env.local'
  if (!fs.existsSync(envPath)) return
  const env = fs.readFileSync(envPath, 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const DRY_RUN = process.argv.includes('--dry-run')

interface CapabilityRow {
  id: string
  canonical_key: string
  source_ref: string
  lesson_id: string
}

interface ArtifactRow {
  capability_id: string
  artifact_kind: string
  artifact_json: Record<string, unknown>
}

interface LessonSectionRow {
  id: string
  lesson_id: string
  order_index: number
  content: { type?: string; lines?: Array<{ text?: string; speaker?: string; translation?: string }> } | null
}

const SOURCE_REF_RE = /^lesson-(\d+)\/section-(\d+)\/line-(\d+)$/u

interface ResolvedDialogueLine {
  section_id: string
  lesson_id: string
  line_index: number
  source_line_ref: string
  text: string
  speaker: string | null
  translation: string
}

interface ResolvedDialogueCloze {
  capability_id: string
  source_line_ref: string
  sentence_with_blank: string
  answer_text: string
  translation_text: string
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('Error: VITE_SUPABASE_URL (from .env.local) and SUPABASE_SERVICE_KEY are required.')
    process.exit(1)
  }
  const supabase: SupabaseClient = createClient(url, key)

  console.log(`PR 2 dialogue typed-table bridge — dry-run=${DRY_RUN}`)
  console.log('Surfaces: lesson_dialogue_lines ← lesson_sections.content.lines[]')
  console.log('          dialogue_clozes ← capability_artifacts(cloze_context/cloze_answer/translation:l1)\n')

  // ── BEFORE counts ─────────────────────────────────────────────────────────
  const before = await counts(supabase)
  console.log(`BEFORE: lesson_dialogue_lines=${before.lesson_dialogue_lines}, dialogue_clozes=${before.dialogue_clozes}`)

  // ── 1. Active dialogue_line capabilities ──────────────────────────────────
  const { data: capsData, error: capsError } = await supabase
    .schema('indonesian')
    .from('learning_capabilities')
    .select('id, canonical_key, source_ref, lesson_id')
    .eq('source_kind', 'dialogue_line_src')
    .is('retired_at', null)
  if (capsError) throw new Error(capsError.message)
  const caps = (capsData ?? []) as CapabilityRow[]
  console.log(`Found ${caps.length} active dialogue_line capabilit${caps.length === 1 ? 'y' : 'ies'}.`)
  if (caps.length === 0) {
    console.log('Nothing to do.')
    return
  }

  // ── 2. Lesson sections (filtered to lessons that have dialogue_line caps) ─
  const lessonIds = [...new Set(caps.map((c) => c.lesson_id))]
  const { data: sectionsData, error: sectionsError } = await supabase
    .schema('indonesian')
    .from('lesson_sections')
    .select('id, lesson_id, order_index, content')
    .in('lesson_id', lessonIds)
  if (sectionsError) throw new Error(sectionsError.message)
  const sections = (sectionsData ?? []) as LessonSectionRow[]
  // Index by (lesson_id, order_index) for O(1) lookup.
  const sectionByKey = new Map<string, LessonSectionRow>()
  for (const sec of sections) {
    sectionByKey.set(`${sec.lesson_id}:${sec.order_index}`, sec)
  }

  // ── 3. Artifacts for the cap set ──────────────────────────────────────────
  const capIds = caps.map((c) => c.id)
  const { data: artifactsData, error: artifactsError } = await supabase
    .schema('indonesian')
    .from('capability_artifacts')
    .select('capability_id, artifact_kind, artifact_json')
    .in('capability_id', capIds)
    .in('artifact_kind', ['cloze_context', 'cloze_answer', 'translation:l1'])
    .eq('quality_status', 'approved')
  if (artifactsError) throw new Error(artifactsError.message)
  const artifacts = (artifactsData ?? []) as ArtifactRow[]
  // Index by (capability_id, artifact_kind) → payload.
  const artifactByKey = new Map<string, ArtifactRow>()
  for (const a of artifacts) {
    artifactByKey.set(`${a.capability_id}:${a.artifact_kind}`, a)
  }

  // ── 4. Resolve every cap into one dialogue line + one cloze row ──────────
  const dialogueLines: ResolvedDialogueLine[] = []
  const dialogueLineByRef = new Map<string, ResolvedDialogueLine>() // dedupe by source_line_ref
  const dialogueClozes: ResolvedDialogueCloze[] = []
  const anomalies: string[] = []

  for (const cap of caps) {
    const match = cap.source_ref.match(SOURCE_REF_RE)
    if (!match) {
      anomalies.push(`cap ${cap.canonical_key}: source_ref "${cap.source_ref}" does not match lesson-N/section-M/line-K`)
      continue
    }
    const [, , sectionIdxStr, lineIdxStr] = match
    const sectionIdx = Number(sectionIdxStr)
    const lineIdx = Number(lineIdxStr)

    const section = sectionByKey.get(`${cap.lesson_id}:${sectionIdx}`)
    if (!section) {
      anomalies.push(`cap ${cap.canonical_key}: no lesson_sections row at lesson_id=${cap.lesson_id}, order_index=${sectionIdx}`)
      continue
    }
    if (section.content?.type !== 'dialogue') {
      anomalies.push(`cap ${cap.canonical_key}: section at order_index=${sectionIdx} is type "${section.content?.type ?? '<null>'}", not "dialogue"`)
      continue
    }
    const lines = section.content.lines
    if (!Array.isArray(lines) || lines.length <= lineIdx) {
      anomalies.push(`cap ${cap.canonical_key}: section.lines[${lineIdx}] is out of range (lines.length=${lines?.length ?? 0})`)
      continue
    }
    const line = lines[lineIdx]
    const text = typeof line?.text === 'string' ? line.text.trim() : ''
    const translation = typeof line?.translation === 'string' ? line.translation.trim() : ''
    const speakerRaw = typeof line?.speaker === 'string' ? line.speaker.trim() : ''
    const speaker = speakerRaw ? speakerRaw : null
    if (!text || !translation) {
      anomalies.push(`cap ${cap.canonical_key}: line ${lineIdx} missing text="${text}" / translation="${translation}"`)
      continue
    }

    const ctx = artifactByKey.get(`${cap.id}:cloze_context`)
    const ans = artifactByKey.get(`${cap.id}:cloze_answer`)
    const tr = artifactByKey.get(`${cap.id}:translation:l1`)
    if (!ctx || !ans || !tr) {
      anomalies.push(`cap ${cap.canonical_key}: missing artifact(s) — ctx=${!!ctx}, ans=${!!ans}, tr=${!!tr}`)
      continue
    }
    const sourceText = typeof (ctx.artifact_json as { source_text?: unknown })?.source_text === 'string'
      ? ((ctx.artifact_json as { source_text: string }).source_text)
      : ''
    const answerValue = typeof (ans.artifact_json as { value?: unknown })?.value === 'string'
      ? ((ans.artifact_json as { value: string }).value).trim()
      : ''
    const translationValue = typeof (tr.artifact_json as { value?: unknown })?.value === 'string'
      ? ((tr.artifact_json as { value: string }).value).trim()
      : ''
    if (!sourceText.includes('___') || !answerValue || !translationValue) {
      anomalies.push(`cap ${cap.canonical_key}: artifact shape malformed — sourceText has___=${sourceText.includes('___')}, answer="${answerValue}", translation="${translationValue}"`)
      continue
    }

    const sourceLineRef = cap.source_ref
    if (!dialogueLineByRef.has(sourceLineRef)) {
      const resolved: ResolvedDialogueLine = {
        section_id: section.id,
        lesson_id: cap.lesson_id,
        line_index: lineIdx,
        source_line_ref: sourceLineRef,
        text,
        speaker,
        translation,
      }
      dialogueLines.push(resolved)
      dialogueLineByRef.set(sourceLineRef, resolved)
    }
    dialogueClozes.push({
      capability_id: cap.id,
      source_line_ref: sourceLineRef,
      sentence_with_blank: sourceText,
      answer_text: answerValue,
      translation_text: translationValue,
    })
  }

  console.log(`\nPlan: ${dialogueLines.length} lesson_dialogue_lines row(s), ${dialogueClozes.length} dialogue_clozes row(s).`)
  if (anomalies.length > 0) {
    console.error('\n✗ Anomalies (CRITICAL — bridge aborted):')
    for (const a of anomalies) console.error(`  - ${a}`)
    process.exit(1)
  }

  if (DRY_RUN) {
    console.log('\nDialogue lines:')
    for (const ln of dialogueLines) {
      console.log(`  [dry-run] would upsert ${ln.source_line_ref} (${ln.speaker ?? 'narrator'}): "${ln.text.slice(0, 60)}…"`)
    }
    console.log('\nDialogue clozes:')
    for (const dc of dialogueClozes) {
      console.log(`  [dry-run] would upsert cap=${dc.capability_id} ref=${dc.source_line_ref} blank="${dc.sentence_with_blank.slice(0, 60)}…" answer="${dc.answer_text}"`)
    }
    console.log('\n[DRY RUN] No writes performed.')
    return
  }

  // ── 5. Apply — lesson_dialogue_lines first (dialogue_clozes FKs to it) ────
  let lineCount = 0
  for (const ln of dialogueLines) {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lesson_dialogue_lines')
      .upsert(
        {
          section_id: ln.section_id,
          lesson_id: ln.lesson_id,
          line_index: ln.line_index,
          source_line_ref: ln.source_line_ref,
          text: ln.text,
          speaker: ln.speaker,
          translation: ln.translation,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'source_line_ref' },
      )
      .select('id, source_line_ref')
      .single()
    if (error) {
      console.error(`! lesson_dialogue_lines upsert failed for ${ln.source_line_ref}: ${error.message}`)
      process.exit(1)
    }
    if (data) lineCount++
  }

  // ── 6. Apply — dialogue_clozes (resolve dialogue_line_id by source_line_ref) ─
  // Bulk-read the lesson_dialogue_lines we just wrote to get ids.
  const refs = dialogueLines.map((l) => l.source_line_ref)
  const { data: ldlData, error: ldlError } = await supabase
    .schema('indonesian')
    .from('lesson_dialogue_lines')
    .select('id, source_line_ref')
    .in('source_line_ref', refs)
  if (ldlError) throw new Error(ldlError.message)
  const idByRef = new Map<string, string>()
  for (const r of (ldlData ?? []) as Array<{ id: string; source_line_ref: string }>) {
    idByRef.set(r.source_line_ref, r.id)
  }

  let clozeCount = 0
  for (const dc of dialogueClozes) {
    const dialogueLineId = idByRef.get(dc.source_line_ref)
    if (!dialogueLineId) {
      console.error(`! dialogue_clozes: no lesson_dialogue_lines.id found for ${dc.source_line_ref}`)
      process.exit(1)
    }
    const { data, error } = await supabase
      .schema('indonesian')
      .from('dialogue_clozes')
      .upsert(
        {
          capability_id: dc.capability_id,
          dialogue_line_id: dialogueLineId,
          sentence_with_blank: dc.sentence_with_blank,
          answer_text: dc.answer_text,
          translation_text: dc.translation_text,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'capability_id' },
      )
      .select('id')
      .single()
    if (error) {
      console.error(`! dialogue_clozes upsert failed for cap=${dc.capability_id}: ${error.message}`)
      process.exit(1)
    }
    if (data) clozeCount++
  }

  const after = await counts(supabase)
  console.log(`\nWrote: lesson_dialogue_lines=${lineCount}, dialogue_clozes=${clozeCount}`)
  console.log(`AFTER: lesson_dialogue_lines=${after.lesson_dialogue_lines}, dialogue_clozes=${after.dialogue_clozes}`)
  console.log(`Delta: lesson_dialogue_lines ${before.lesson_dialogue_lines} → ${after.lesson_dialogue_lines} ` +
    `(+${after.lesson_dialogue_lines - before.lesson_dialogue_lines}), ` +
    `dialogue_clozes ${before.dialogue_clozes} → ${after.dialogue_clozes} ` +
    `(+${after.dialogue_clozes - before.dialogue_clozes})`)
  console.log('\n✓ Bridge complete.')
}

async function counts(supabase: SupabaseClient): Promise<{ lesson_dialogue_lines: number; dialogue_clozes: number }> {
  const lines = await supabase
    .schema('indonesian')
    .from('lesson_dialogue_lines')
    .select('id', { count: 'exact', head: true })
  if (lines.error) throw new Error(lines.error.message)
  const clozes = await supabase
    .schema('indonesian')
    .from('dialogue_clozes')
    .select('id', { count: 'exact', head: true })
  if (clozes.error) throw new Error(clozes.error.message)
  return { lesson_dialogue_lines: lines.count ?? 0, dialogue_clozes: clozes.count ?? 0 }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
