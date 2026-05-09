import type { ValidationFinding } from '../model'

const GRAMMAR_PREFIX = /^\s*(grammar|grammatica)\s*:\s*/i

interface SectionLike {
  id?: string
  content: Record<string, unknown>
}

/**
 * GT1 — Every grammar / reference_table section MUST have non-empty
 * `content.grammar_topics: string[]`. Each entry is trimmed and must NOT carry
 * a `"grammar:"` / `"grammatica:"` prefix (which would indicate the topic was
 * derived from a section title rather than authored explicitly).
 */
export function validateGrammarTopics(sections: SectionLike[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const section of sections) {
    const type = section.content?.type
    if (type !== 'grammar' && type !== 'reference_table') continue

    const raw = section.content?.grammar_topics
    const isArray = Array.isArray(raw)

    if (!isArray) {
      findings.push({
        gate: 'GT1',
        severity: 'error',
        message: `Section content.grammar_topics is missing for ${type} section`,
        context: { sectionId: section.id },
      })
      continue
    }

    const entries = (raw as unknown[]).filter((t): t is string => typeof t === 'string')
    const trimmed = entries.map((t) => t.trim()).filter((t) => t.length > 0)

    if (trimmed.length === 0) {
      findings.push({
        gate: 'GT1',
        severity: 'error',
        message: `Section content.grammar_topics is empty for ${type} section`,
        context: { sectionId: section.id },
      })
      continue
    }

    const prefixed = trimmed.filter((t) => GRAMMAR_PREFIX.test(t))
    if (prefixed.length > 0) {
      findings.push({
        gate: 'GT1',
        severity: 'error',
        message:
          `Section content.grammar_topics contains "grammar:"/"grammatica:" ` +
          `prefixed entries (${prefixed.join(', ')}); strip the prefix`,
        context: { sectionId: section.id },
      })
    }
  }

  return findings
}
