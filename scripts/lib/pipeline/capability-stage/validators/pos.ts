/**
 * CS5 — POS validator.
 *
 * Thin wrapper around scripts/lib/validate-pos.validatePOS so that runner.ts
 * can route POS findings into the unified `ValidationFinding` channel.
 * Behaviour matches capability-stage-legacy.ts:467–482:
 *   - missing pos on word/phrase → warning
 *   - invalid pos value → error (runner short-circuits before DB writes)
 *   - coverage report is informational and surfaced via runner's post-write hook
 */

import type { ValidationFinding } from '../model'
import { validatePOS, type StagingItem } from '../../../validate-pos'

export interface POSValidatorResult {
  findings: ValidationFinding[]
  coverage: Record<string, number>
}

export function validatePosTags(items: StagingItem[]): POSValidatorResult {
  const result = validatePOS(items)
  const findings: ValidationFinding[] = []

  for (const message of result.warnings) {
    findings.push({ gate: 'CS5', severity: 'warning', message })
  }
  for (const message of result.criticalErrors) {
    findings.push({ gate: 'CS5', severity: 'error', message })
  }

  return { findings, coverage: result.coverage }
}
