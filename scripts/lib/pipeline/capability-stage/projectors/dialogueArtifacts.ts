/**
 * projectors/dialogueArtifacts.ts — emit the typed `dialogue_clozes` row that
 * makes a dialogue_line:produce_form_from_context_cap capability renderable.
 *
 * Decision 5b in projectors/vocab.ts emits the capability ROW for every
 * dialogue line whose slug matches an authored cloze context; this projector
 * emits the satellite data those caps need to render.
 *
 * PR 2 slice (target state): the SOLE persisted representation is one
 * `dialogue_clozes` row per cap (sentence_with_blank, answer_text,
 * translation_text + a FK to lesson_dialogue_lines). No capability_artifacts
 * are written — the runtime reader (byKind/dialogueLine.ts) reads the typed
 * table, structure is guaranteed by its NOT NULL columns + the pre-write
 * validateDialogueClozes gate + the live HC15, and readiness requires no
 * artifact bag (renderContracts: dialogue_line → []). The legacy three-artifact
 * emission (cloze_context / cloze_answer / translation:l1) was removed here.
 */

import { itemSlug } from '@/lib/capabilities'

import type { CapabilityInput, DialogueClozeInput } from '../adapter'
import type { ValidationFinding } from '../model'
import type { VocabStagingClozeContext } from './vocab'

export interface DialogueArtifactsInput {
  /**
   * The `contextualClozeCapabilities` returned by `projectVocab`. Only caps
   * with `sourceKind === 'dialogue_line_src'` are processed — the helper is a
   * no-op on any other shape so callers can pass the whole list safely.
   */
  contextualClozeCapabilities: ReadonlyArray<CapabilityInput>
  /**
   * Capability id-by-canonical-key map returned by `upsertCapabilities`
   * (adapter.ts:120). Used to attach each artifact to the correct
   * `capability_id`.
   */
  capabilityIdsByKey: ReadonlyMap<string, string>
  /**
   * Staged cloze contexts from `cloze-contexts.ts`. The helper matches dialogue
   * lines to authored entries by `itemSlug(line.text) === itemSlug(ctx.learning_item_slug)`,
   * the same key shape `dialogueLineSourceRefs` in vocab.ts:208 emits caps on.
   */
  clozeContexts: ReadonlyArray<VocabStagingClozeContext>
  /**
   * Lesson sections (`lesson_sections.content` shape). The helper walks
   * dialogue sections to recover `line_text` and `speaker` per source_ref —
   * the same source_ref shape vocab.ts:222 mints (`lesson-N/section-M/line-K`).
   */
  sections: ReadonlyArray<{ content: Record<string, unknown>; order_index: number }>
}

export interface DialogueArtifactsOutput {
  /**
   * Typed `dialogue_clozes` rows — one per dialogue_line capability, and the
   * sole persisted representation (PR 2 slice). The adapter resolves
   * `source_line_ref` to `dialogue_line_id` via the UNIQUE index at write time.
   * No capability_artifacts are emitted; structure is guaranteed by the table's
   * NOT NULL columns + validateDialogueClozes + HC15.
   */
  dialogueClozes: DialogueClozeInput[]
  findings: ValidationFinding[]
}

interface ResolvedLine {
  text: string
  speaker: string | null
}

/**
 * Strip trailing sentence punctuation from a cloze answer. The runtime
 * compares user input against this value at PR 4's builder; punctuation in
 * the persisted answer would force a learner to type `pohon.` for a literal
 * match. The agent spec at .claude/agents/cloze-creator.md:111 already
 * recommends emitting the bare token, but PR 1 normalizes defensively in
 * case an author leaves the period attached.
 */
function normalizeClozeAnswer(raw: string): string {
  return raw.replace(/[.,!?;:"]+$/u, '').trim()
}

/**
 * Build a Map<sourceRef, ResolvedLine> from the lesson's dialogue sections.
 * source_ref shape mirrors vocab.ts:222 (`<lessonSourceRef>/section-M/line-K`),
 * stripped of the lesson prefix so the input can be matched against the cap's
 * full source_ref via endsWith. We instead key on the full sourceRef the cap
 * carries — cheaper and unambiguous.
 */
function collectDialogueLinesBySourceRef(
  sections: DialogueArtifactsInput['sections'],
  lessonSourceRef: string,
): Map<string, ResolvedLine> {
  const map = new Map<string, ResolvedLine>()
  for (const section of sections) {
    const content = section.content as { type?: unknown; lines?: unknown } | undefined
    if (content?.type !== 'dialogue') continue
    if (!Array.isArray(content.lines)) continue
    const lines = content.lines as Array<{ text?: unknown; speaker?: unknown }>
    for (const [idx, raw] of lines.entries()) {
      const text = typeof raw?.text === 'string' ? raw.text.trim() : ''
      if (!text) continue
      const speaker =
        typeof raw?.speaker === 'string' && raw.speaker.trim() ? raw.speaker.trim() : null
      const sourceRef = `${lessonSourceRef}/section-${section.order_index}/line-${idx}`
      map.set(sourceRef, { text, speaker })
    }
  }
  return map
}

function inferLessonSourceRef(capability: CapabilityInput): string | null {
  const match = capability.sourceRef.match(/^(lesson-\d+)\//u)
  return match ? match[1] : null
}

/**
 * Project dialogue-line artifacts from authored cloze contexts and lesson
 * sections. Pure function — no I/O. Caller upserts the returned artifacts
 * via the standard adapter path; caller appends findings to the runner's
 * findings array.
 *
 * Caps without a matching dialogue line in `sections` are skipped silently
 * (their source_ref points outside this projection's section set — should
 * not happen in practice since the projector mints both sides of the
 * dependency). Caps whose matching `clozeContext` is missing or has no
 * `cloze_answer` are skipped and surface a CS10 finding.
 */
export function projectDialogueArtifacts(input: DialogueArtifactsInput): DialogueArtifactsOutput {
  const dialogueClozes: DialogueClozeInput[] = []
  const findings: ValidationFinding[] = []

  const dialogueCaps = input.contextualClozeCapabilities.filter(
    (cap) => cap.sourceKind === 'dialogue_line_src' && cap.capabilityType === 'produce_form_from_context_cap',
  )
  if (dialogueCaps.length === 0) {
    return { dialogueClozes, findings }
  }

  const lessonSourceRef = inferLessonSourceRef(dialogueCaps[0])
  if (!lessonSourceRef) {
    findings.push({
      gate: 'CS10',
      severity: 'error',
      message: `dialogue_line capability has malformed sourceRef "${dialogueCaps[0].sourceRef}" — expected "lesson-N/section-M/line-K"`,
      context: { capabilityKey: dialogueCaps[0].canonicalKey },
    })
    return { dialogueClozes, findings }
  }

  const linesBySourceRef = collectDialogueLinesBySourceRef(input.sections, lessonSourceRef)

  const ctxBySlug = new Map<string, VocabStagingClozeContext>()
  for (const ctx of input.clozeContexts) {
    if (typeof ctx?.learning_item_slug !== 'string') continue
    const key = itemSlug(ctx.learning_item_slug)
    if (!ctxBySlug.has(key)) ctxBySlug.set(key, ctx)
  }

  for (const cap of dialogueCaps) {
    const capId = input.capabilityIdsByKey.get(cap.canonicalKey)
    if (!capId) {
      findings.push({
        gate: 'CS10',
        severity: 'error',
        message: `dialogue_line capability "${cap.canonicalKey}" has no id in the upsert result — was it inserted?`,
        context: { capabilityKey: cap.canonicalKey },
      })
      continue
    }

    const line = linesBySourceRef.get(cap.sourceRef)
    if (!line) {
      findings.push({
        gate: 'CS10',
        severity: 'error',
        message: `dialogue_line capability "${cap.canonicalKey}" sourceRef "${cap.sourceRef}" does not resolve to a dialogue line in lesson_sections — projector emitted a cap with no source line`,
        context: { capabilityKey: cap.canonicalKey },
      })
      continue
    }

    const ctx = ctxBySlug.get(itemSlug(line.text))
    if (!ctx) {
      findings.push({
        gate: 'CS10',
        severity: 'error',
        message: `dialogue_line capability "${cap.canonicalKey}" line text "${line.text.slice(0, 60)}…" has no matching clozeContexts entry — projectVocab should not have emitted this cap`,
        context: { capabilityKey: cap.canonicalKey },
      })
      continue
    }

    const rawAnswer = typeof ctx.cloze_answer === 'string' ? ctx.cloze_answer : ''
    const answer = normalizeClozeAnswer(rawAnswer)
    if (!answer) {
      findings.push({
        gate: 'CS10',
        severity: 'error',
        message: `dialogue_line cloze entry for slug "${ctx.learning_item_slug}" is missing the required \`cloze_answer\` field (the word that fills \`___\`) — artifact set skipped`,
        context: { capabilityKey: cap.canonicalKey },
      })
      continue
    }

    if (typeof ctx.source_text !== 'string' || !ctx.source_text.includes('___')) {
      findings.push({
        gate: 'CS10',
        severity: 'error',
        message: `dialogue_line cloze entry for slug "${ctx.learning_item_slug}" has malformed source_text — must contain exactly one \`___\` placeholder`,
        context: { capabilityKey: cap.canonicalKey },
      })
      continue
    }

    if (typeof ctx.translation_text !== 'string' || !ctx.translation_text.trim()) {
      findings.push({
        gate: 'CS10',
        severity: 'error',
        message: `dialogue_line cloze entry for slug "${ctx.learning_item_slug}" has empty translation_text — required for the translation:l1 artifact`,
        context: { capabilityKey: cap.canonicalKey },
      })
      continue
    }

    // Typed satellite row — the sole persisted representation for dialogue_line
    // caps (PR 2 slice). The adapter resolves source_line_ref to
    // lesson_dialogue_lines.id at write time. No capability_artifacts are
    // written; structure is guaranteed by the table's NOT NULL columns +
    // validateDialogueClozes + HC15.
    dialogueClozes.push({
      capability_id: capId,
      source_line_ref: cap.sourceRef,
      sentence_with_blank: ctx.source_text,
      answer_text: answer,
      translation_text: ctx.translation_text.trim(),
    })
  }

  return { dialogueClozes, findings }
}
