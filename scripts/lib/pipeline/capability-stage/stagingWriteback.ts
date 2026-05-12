/**
 * capability-stage/stagingWriteback.ts — port of legacy 712–722 + 925–963.
 *
 * After a successful publish phase, mark the corresponding staging file
 * entries with their new review_status ('published' or 'deferred_dialogue').
 * This is the feedback loop from publish back to staging — it lets a
 * subsequent run see what's already published and skip re-publishing.
 *
 * The legacy file (`scripts/lib/pipeline/capability-stage-legacy.ts`)
 * performed these writes inline. The fold spec §11 #15 default replaced
 * them with a DB column write (`learning_items.review_status`), but that
 * lost the staging-side state — re-running the pipeline against the same
 * staging files would produce inconsistent diagnostics. Per user feedback
 * 2026-05-12, the staging write-backs are restored.
 *
 * Behaviour preserved from legacy:
 *   - candidates.ts: only re-written after the post-insert
 *     `exercise_variants` count verification confirms rows landed.
 *   - learning-items.ts: only re-written after the seed-integrity hook
 *     (CS9) passes. Writing earlier risks marking items published while a
 *     downstream check later fails — leaving the DB and staging out of sync.
 *   - When NO items publish but deferrals exist, still write staging back
 *     so deferred markers persist (otherwise items stay `pending_review`
 *     forever and the deferral list is recomputed every run with no
 *     record of intent).
 */

import fs from 'node:fs'
import path from 'node:path'

export interface CandidateStagingRow {
  exercise_type?: string
  grammar_pattern_slug?: string | null
  payload?: Record<string, unknown> | null
  review_status?: string
}

export interface LearningItemStagingRow {
  base_text: string
  item_type: string
  context_type?: string
  translation_nl?: string | null
  translation_en?: string | null
  pos?: string | null
  level?: string | null
  review_status?: string
}

/**
 * After successful exercise_variants publish + verification, mark every
 * candidate whose status was `pending_review` or `approved` as
 * `published`. Idempotent: re-running the script after this point will
 * skip them via the approved-filter.
 */
export function markCandidatesPublished(
  stagingDir: string,
  candidates: CandidateStagingRow[],
): void {
  const updated = candidates.map((c) =>
    c.review_status === 'pending_review' || c.review_status === 'approved'
      ? { ...c, review_status: 'published' }
      : c,
  )
  fs.writeFileSync(
    path.join(stagingDir, 'candidates.ts'),
    `// Published via script\nexport const candidates = ${JSON.stringify(updated, null, 2)}\n`,
  )
}

/**
 * After successful learning_items publish + seed-integrity verification,
 * mark every item whose status was `pending_review` / `approved` /
 * `deferred_dialogue` with its new state:
 *   - in deferredKeys → `deferred_dialogue`
 *   - otherwise → `published`
 */
export function markLearningItemsPublishedOrDeferred(
  stagingDir: string,
  learningItems: LearningItemStagingRow[],
  deferredKeys: ReadonlySet<string>,
): void {
  const updated = learningItems.map((item) => {
    const wasCandidate =
      item.review_status === 'pending_review' ||
      item.review_status === 'approved' ||
      item.review_status === 'deferred_dialogue'
    if (!wasCandidate) return item
    if (deferredKeys.has(item.base_text)) return { ...item, review_status: 'deferred_dialogue' }
    return { ...item, review_status: 'published' }
  })
  fs.writeFileSync(
    path.join(stagingDir, 'learning-items.ts'),
    `// Published via script\nexport const learningItems = ${JSON.stringify(updated, null, 2)}\n`,
  )
}

/**
 * Deferral-only path (legacy 947–963): no items were published this run,
 * but some are deferred. Persist the deferred markers so subsequent runs
 * see them.
 */
export function markLearningItemsDeferralsOnly(
  stagingDir: string,
  learningItems: LearningItemStagingRow[],
  deferredKeys: ReadonlySet<string>,
): void {
  const updated = learningItems.map((item) => {
    const wasCandidate =
      item.review_status === 'pending_review' ||
      item.review_status === 'approved' ||
      item.review_status === 'deferred_dialogue'
    if (!wasCandidate) return item
    if (deferredKeys.has(item.base_text)) return { ...item, review_status: 'deferred_dialogue' }
    return item
  })
  fs.writeFileSync(
    path.join(stagingDir, 'learning-items.ts'),
    `// Published via script\nexport const learningItems = ${JSON.stringify(updated, null, 2)}\n`,
  )
}

/**
 * After lesson.ts enrichment (e.g. dialogue translations filled in),
 * write the file back so a subsequent run skips the same work.
 * Preserves the rest of the lesson object — only `sections` is updated
 * (callers pass the full lesson object including primary_voice etc.).
 */
export function writeLessonWithEnrichedSections(
  stagingDir: string,
  lesson: Record<string, unknown>,
): void {
  fs.writeFileSync(
    path.join(stagingDir, 'lesson.ts'),
    `// Enriched by capability-stage\nexport const lesson = ${JSON.stringify(lesson, null, 2)}\n`,
  )
}

/**
 * After POS enrichment runs, write the staging file with the new pos
 * values. Called BEFORE validation so the downstream validators see the
 * populated values rather than the empty-pos staging snapshot.
 */
export function writeLearningItemsWithEnrichedPos(
  stagingDir: string,
  learningItems: LearningItemStagingRow[],
): void {
  fs.writeFileSync(
    path.join(stagingDir, 'learning-items.ts'),
    `// POS-enriched by capability-stage\nexport const learningItems = ${JSON.stringify(learningItems, null, 2)}\n`,
  )
}
