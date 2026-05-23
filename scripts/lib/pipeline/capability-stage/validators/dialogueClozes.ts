import type { DialogueClozeInput } from '../adapter'
import type { ValidationFinding } from '../model'

/**
 * CS11 (PR 2) — typed `dialogue_clozes` shape gate.
 *
 * Runs against the projector output before the adapter writes. Ensures every
 * projected row satisfies the contract the typed-table reader
 * (`src/lib/exercise-content/byKind/dialogueLine.ts`) depends on:
 *
 *   - `sentence_with_blank` contains exactly one `___` placeholder
 *   - `answer_text` is non-empty (already normalised by projector)
 *   - `translation_text` is non-empty (already trimmed by projector)
 *   - `source_line_ref` matches `lesson-N/section-M/line-K`
 *
 * Fails CRITICAL (error) on any violation — the publish aborts before the
 * adapter writes. This is the §1.5 fail-loud cure for the silent-skip class.
 *
 * Note: the projector at `projectors/dialogueArtifacts.ts` already emits
 * CS10 findings on the same conditions BEFORE the row reaches this list.
 * CS11 is the belt-and-braces gate: the adapter writes only when every
 * projected row is valid by shape, regardless of which upstream path emitted it.
 */
export function validateDialogueClozes(rows: DialogueClozeInput[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  const sourceLineRefRe = /^lesson-\d+\/section-\d+\/line-\d+$/u
  const seenCapabilityIds = new Set<string>()

  for (const row of rows) {
    const ctx = {
      sourceLineRef: row.source_line_ref,
    }

    if (!sourceLineRefRe.test(row.source_line_ref)) {
      findings.push({
        gate: 'CS11',
        severity: 'error',
        message: `dialogue_clozes row has malformed source_line_ref "${row.source_line_ref}" — expected lesson-N/section-M/line-K`,
        context: ctx,
      })
      continue
    }

    const blankCount = (row.sentence_with_blank.match(/___/g) ?? []).length
    if (blankCount !== 1) {
      findings.push({
        gate: 'CS11',
        severity: 'error',
        message:
          `dialogue_clozes.sentence_with_blank for ${row.source_line_ref} contains ${blankCount} ` +
          `\`___\` placeholders — expected exactly one`,
        context: ctx,
      })
      continue
    }

    if (!row.answer_text.trim()) {
      findings.push({
        gate: 'CS11',
        severity: 'error',
        message: `dialogue_clozes.answer_text for ${row.source_line_ref} is empty`,
        context: ctx,
      })
      continue
    }

    if (!row.translation_text.trim()) {
      findings.push({
        gate: 'CS11',
        severity: 'error',
        message: `dialogue_clozes.translation_text for ${row.source_line_ref} is empty`,
        context: ctx,
      })
      continue
    }

    if (seenCapabilityIds.has(row.capability_id)) {
      findings.push({
        gate: 'CS11',
        severity: 'error',
        message:
          `duplicate dialogue_clozes row for capability_id ${row.capability_id} ` +
          `(source_line_ref="${row.source_line_ref}") — the table has UNIQUE(capability_id), the insert will fail`,
        context: ctx,
      })
      continue
    }
    seenCapabilityIds.add(row.capability_id)
  }

  return findings
}
