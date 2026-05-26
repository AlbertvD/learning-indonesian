import type { ValidationFinding } from '../model'

interface SectionLike {
  title?: string
  order_index?: number
  content: Record<string, unknown>
}

export interface DialogueLinesOptions {
  /**
   * Severity for a missing NL `translation`. `error` in publish mode
   * (post-enrichment); `warning` in pre-flight mode (the NL dialogue enricher,
   * skipped in dry-run, has not run — a fresh lesson from cataloging carries
   * lines as `[{speaker, text}]` with no translation yet). The `text` check is
   * always `error` (text is authored at catalog time). ADR 0013 §2/§3.
   */
  nlSeverity?: 'error' | 'warning'
}

/**
 * GT8 (PR 2) — dialogue line shape gate.
 *
 * Every line inside a `content.type === 'dialogue'` section must carry
 * `text` (non-empty string, authored at catalog time → always CRITICAL) and
 * `translation` (non-empty NL string). The dialogue NL translation is filled by
 * `enrichMissingDialogueTranslations` (runner.ts), which is SKIPPED in dry-run —
 * so in pre-flight mode the translation is treated as an async-enriched column
 * and relaxed to a warning (`nlSeverity`), mirroring GT9's EN handling.
 *
 * `speaker` may be null or omitted (narrator lines have no speaker).
 *
 * CRITICAL `text` is required because without it the dialogue_line capability
 * rows the capability-stage writes will fail their fail-loud read in
 * `src/lib/exercise-content/byKind/dialogueLine.ts`.
 */
export function validateDialogueLines(
  sections: SectionLike[],
  options: DialogueLinesOptions = {},
): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  const nlSeverity = options.nlSeverity ?? 'error'

  for (const section of sections) {
    if (section.content?.type !== 'dialogue') continue
    const lines = section.content.lines
    if (!Array.isArray(lines)) continue

    for (const [idx, raw] of (lines as Array<Record<string, unknown>>).entries()) {
      const ctx = {
        sectionOrderIndex: section.order_index,
        sectionTitle: section.title,
        lineIndex: idx,
      }

      const text = typeof raw?.text === 'string' ? raw.text.trim() : ''
      if (!text) {
        findings.push({
          gate: 'GT8',
          severity: 'error',
          message: `dialogue line ${idx} in section "${section.title ?? '?'}" is missing required \`text\``,
          context: ctx,
        })
        continue
      }

      const translation = typeof raw?.translation === 'string' ? raw.translation.trim() : ''
      if (!translation) {
        findings.push({
          gate: 'GT8',
          severity: nlSeverity,
          message:
            `dialogue line ${idx} in section "${section.title ?? '?'}" has empty \`translation\` (NL) ` +
            `— enrichMissingDialogueTranslations did not populate it (relaxed to warning in pre-flight)`,
          context: ctx,
        })
      }
    }
  }

  return findings
}
