import type { ValidationFinding } from '../model'

interface SectionLike {
  title?: string
  order_index?: number
  content: Record<string, unknown>
}

/**
 * GT8 (PR 2) — dialogue line shape gate.
 *
 * Every line inside a `content.type === 'dialogue'` section must carry
 * `text` (non-empty string) and `translation` (non-empty string). The
 * dialogue translation enricher runs BEFORE this validator (see
 * runner.ts:115 — `enrichMissingDialogueTranslations`), so by the time
 * we get here every line should already have its NL translation populated.
 *
 * `speaker` may be null or omitted (narrator lines have no speaker).
 *
 * CRITICAL on any missing required field — without these, the dialogue_line
 * capability rows the capability-stage writes will fail their fail-loud
 * read in `src/lib/exercise-content/byKind/dialogueLine.ts`.
 */
export function validateDialogueLines(sections: SectionLike[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

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
          severity: 'error',
          message:
            `dialogue line ${idx} in section "${section.title ?? '?'}" has empty \`translation\` ` +
            `— enrichMissingDialogueTranslations should have populated it before validation`,
          context: ctx,
        })
      }
    }
  }

  return findings
}
