/**
 * gate.ts — the Lesson Gate's consolidated pre-write validator (slice 2,
 * ADR 0013 §3).
 *
 * ONE entry point over the lesson-stage's pre-write validator family
 * (GT1/GT4/GT5/GT6/GT8/GT9), replacing the six scattered per-concern calls the
 * runner used to make. Parameterised by a single `mode`; the mode flag is the
 * ONLY difference between the two run-points, so the convenience pre-flight and
 * the authoritative in-stage publish check cannot drift:
 *
 *   - publish    (in-stage, post-enrichment, pre-write) — the AUTHORITATIVE
 *     gate; enriched-translation completeness (EN + dialogue NL) is CRITICAL.
 *   - pre-flight (standalone, raw authored lesson, before LLM enrichment) — the
 *     SAME validators with enriched-translation completeness relaxed to warnings
 *     (the enrichers have not run). This is what fixes the dry-run-fails-on-
 *     missing-translation wart.
 *
 * What flexes with the mode = the async-LLM-enriched translation columns the
 * enrichers (skipped in dry-run) fill: GT9's EN (l2_translation / title_en /
 * rules_en / example.english) AND GT8's dialogue NL `translation` (a fresh
 * lesson from cataloging has lines as `[{speaker, text}]`, no translation yet).
 * Everything else — section type + sub-shape, voice config, grammar_topics,
 * per-item display fields, dialogue `text`, typed-row structural fields, item
 * NL (authored at catalog time) — stays CRITICAL in BOTH modes.
 *
 * Self-contained to the lesson (ADR 0013 §4): every validator inspects only
 * this lesson's authored sections + its own projection — never a cross-lesson
 * pool. Pure: no DB, no network — isolation-testable.
 */

import type { ValidationFinding } from './model'
import type { ProjectSectionsOutput } from './projectSections'
import { validateGrammarTopics } from './validators/grammarTopics'
import { validateLessonVoices } from './validators/lessonVoices'
import { validateSectionType } from './validators/sectionType'
import { validatePerItem } from './validators/perItem'
import { validateDialogueLines } from './validators/dialogueLines'
import { validateSectionShape } from './validators/sectionShape'

export type LessonGateMode = 'pre-flight' | 'publish'

export interface LessonGateInput {
  lesson: { primary_voice?: string | null; dialogue_voices?: Record<string, string> | null }
  sections: Array<{ id?: string; title?: string; order_index?: number; content: Record<string, unknown> }>
  projected: ProjectSectionsOutput
  mode: LessonGateMode
}

export function runLessonGate(input: LessonGateInput): ValidationFinding[] {
  const { lesson, sections, projected, mode } = input
  // Severity for async-LLM-enriched translation completeness (EN + dialogue NL).
  // Relaxed pre-enrichment; CRITICAL once the enrichers have run.
  const enrichedSeverity = mode === 'pre-flight' ? 'warning' : 'error'

  return [
    // GT1 — grammar_topics present/non-empty/unprefixed (structural).
    ...validateGrammarTopics(sections),
    // GT4 — voice config covers every dialogue speaker (structural).
    ...validateLessonVoices(
      { primary_voice: lesson.primary_voice, dialogue_voices: lesson.dialogue_voices },
      sections,
    ),
    // GT5 — canonical section type + per-type sub-shape (structural).
    ...validateSectionType(sections),
    // GT6 — per-item display fields the reader shows (structural).
    ...validatePerItem(sections),
    // GT8 — dialogue line shape: `text` (authored, always CRITICAL) + NL
    // `translation` (async-enriched; flexes with the mode like EN — a fresh
    // lesson from cataloging has no translation until the NL enricher runs).
    ...validateDialogueLines(sections, { nlSeverity: enrichedSeverity }),
    // GT9 — typed capability-contract row shape. Structural fields CRITICAL in
    // both modes; EN-completeness flexes with the mode.
    ...validateSectionShape(projected, { enSeverity: enrichedSeverity }),
  ]
}
