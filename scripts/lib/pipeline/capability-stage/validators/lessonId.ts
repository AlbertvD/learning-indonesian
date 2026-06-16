/**
 * validators/lessonId.ts — Decision 3b (ADR 0006).
 *
 * Defensive guard against authoring or projector regressions: every
 * lesson-derived capability must carry the projecting lesson's id. Podcast
 * source kinds (`podcast_segment_src`, `podcast_phrase_src`) are explicitly carved
 * out — the schema's CHECK constraint admits null lesson_id only for them.
 *
 * This validator throws synchronously before `upsertCapabilities` writes to
 * the DB, so a regression fails the pipeline run loud and early rather than
 * silently shipping null-lesson rows that the planner then bypasses.
 *
 * See `docs/adr/0006-extend-lesson-id-to-all-capabilities.md`.
 */

import type { CapabilityInput } from '../adapter'

const PODCAST_SOURCE_KINDS = new Set(['podcast_segment_src', 'podcast_phrase_src'])

export function validateLessonIdPresence(capabilities: CapabilityInput[]): void {
  const violations = capabilities.filter(
    (c) => c.lessonId == null && !PODCAST_SOURCE_KINDS.has(c.sourceKind),
  )
  if (violations.length === 0) return
  const sample = violations.slice(0, 5).map((c) => c.canonicalKey).join(', ')
  throw new Error(
    `[lessonId validator] ${violations.length} capability/ies emitted with null lessonId ` +
    `for non-podcast source_kind. Sample: ${sample}. ` +
    `See ADR 0006 / Decision 3b.`,
  )
}
