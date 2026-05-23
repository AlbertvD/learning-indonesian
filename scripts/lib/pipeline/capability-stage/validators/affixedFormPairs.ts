import type { AffixedFormPairRowInput } from '../adapter'
import type { ValidationFinding } from '../model'

/**
 * CS12 (PR 3) — typed `affixed_form_pairs` shape gate.
 *
 * Runs against the projector output before the adapter writes. Ensures every
 * projected row satisfies the contract the typed-table reader
 * (`src/lib/exercise-content/byKind/affixedFormPair.ts`) depends on:
 *
 *   - `root_text` is non-empty
 *   - `derived_text` is non-empty
 *   - `allomorph_rule` is non-empty (the DB column is NOT NULL; the rule is
 *     always required for these pairs — staging carries it for every pair)
 *   - `source_ref` matches `lesson-N/morphology/<slug>`
 *   - one row per `capability_id` (the table has UNIQUE(capability_id))
 *
 * Fails CRITICAL (error) on any violation — the publish aborts before the
 * adapter writes. This is the §1.5 fail-loud cure for the silent-skip class.
 *
 * Note: the projector at `projectors/morphology.ts` already emits CS12 findings
 * for caps with no resolvable id / no source pair / empty fields BEFORE the row
 * reaches this list. This validator is the belt-and-braces gate: the adapter
 * writes only when every projected row is valid by shape.
 */
export function validateAffixedFormPairs(rows: AffixedFormPairRowInput[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  const sourceRefRe = /^lesson-\d+\/morphology\/.+$/u
  const seenCapabilityIds = new Set<string>()

  for (const row of rows) {
    const ctx = { capabilityKey: row.capability_id }

    if (!sourceRefRe.test(row.source_ref)) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `affixed_form_pairs row has malformed source_ref "${row.source_ref}" — expected lesson-N/morphology/<slug>`,
        context: ctx,
      })
      continue
    }

    if (!row.root_text.trim()) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `affixed_form_pairs.root_text for ${row.source_ref} is empty`,
        context: ctx,
      })
      continue
    }

    if (!row.derived_text.trim()) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `affixed_form_pairs.derived_text for ${row.source_ref} is empty`,
        context: ctx,
      })
      continue
    }

    if (!row.allomorph_rule.trim()) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `affixed_form_pairs.allomorph_rule for ${row.source_ref} is empty (column is NOT NULL)`,
        context: ctx,
      })
      continue
    }

    if (seenCapabilityIds.has(row.capability_id)) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message:
          `duplicate affixed_form_pairs row for capability_id ${row.capability_id} ` +
          `(source_ref="${row.source_ref}") — the table has UNIQUE(capability_id), the insert will fail`,
        context: ctx,
      })
      continue
    }
    seenCapabilityIds.add(row.capability_id)
  }

  return findings
}
