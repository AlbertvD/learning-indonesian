import type { ValidationFinding } from '../model'

interface SectionLike {
  id?: string
  content: Record<string, unknown>
}

/**
 * GT6 — Every embedded item in a `lesson_sections.content` payload must have
 * its display fields. Stage-B-only enrichment fields (pos, level, dialogue
 * line translation) are warnings in Phase 1; they become errors in Phase 2
 * once `linguist-structurer` prompts emit them (per spec §4 GT6).
 *
 * Item types covered:
 *  - vocabulary / expressions / numbers — items[]: indonesian + (dutch | english)
 *  - dialogue — lines[]: text + speaker
 */
export function validatePerItem(sections: SectionLike[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const section of sections) {
    const type = section.content?.type
    if (type === 'vocabulary' || type === 'expressions' || type === 'numbers') {
      const items = section.content.items
      if (!Array.isArray(items)) continue
      for (const [idx, raw] of items.entries()) {
        findings.push(...checkItem(section.id, idx, raw, type as string))
      }
    } else if (type === 'dialogue') {
      const lines = section.content.lines
      if (!Array.isArray(lines)) continue
      for (const [idx, raw] of lines.entries()) {
        findings.push(...checkDialogueLine(section.id, idx, raw))
      }
    }
  }

  return findings
}

function checkItem(
  sectionId: string | undefined,
  idx: number,
  item: unknown,
  type: string,
): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  const slug = `${type}[${idx}]`
  const ctx = { sectionId, itemSlug: slug }

  const indonesian = isNonEmptyString((item as Record<string, unknown>)?.indonesian)
    ? ((item as Record<string, unknown>).indonesian as string).trim()
    : null

  if (!indonesian) {
    findings.push({
      gate: 'GT6',
      severity: 'error',
      message: `${type} item is missing required field 'indonesian'`,
      context: ctx,
    })
    return findings // can't proceed without indonesian
  }

  const dutch = (item as Record<string, unknown>)?.dutch
  const english = (item as Record<string, unknown>)?.english
  if (!isNonEmptyString(dutch) && !isNonEmptyString(english)) {
    findings.push({
      gate: 'GT6',
      severity: 'error',
      message: `${type} item "${indonesian}" is missing both 'dutch' and 'english' translation`,
      context: ctx,
    })
  }

  // Stage-B-only enrichment — warnings in Phase 1.
  if (!isNonEmptyString((item as Record<string, unknown>)?.pos)) {
    findings.push({
      gate: 'GT6',
      severity: 'warning',
      message: `${type} item "${indonesian}" is missing 'pos' (Stage-B distractor cascade requires it)`,
      context: ctx,
    })
  }
  if (!isNonEmptyString((item as Record<string, unknown>)?.level)) {
    findings.push({
      gate: 'GT6',
      severity: 'warning',
      message: `${type} item "${indonesian}" is missing 'level' (Stage-B tier filtering requires it)`,
      context: ctx,
    })
  }

  return findings
}

function checkDialogueLine(
  sectionId: string | undefined,
  idx: number,
  line: unknown,
): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  const slug = `dialogue.lines[${idx}]`
  const ctx = { sectionId, itemSlug: slug }

  const text = (line as Record<string, unknown>)?.text
  if (!isNonEmptyString(text)) {
    findings.push({
      gate: 'GT6',
      severity: 'error',
      message: `dialogue line is missing required field 'text'`,
      context: ctx,
    })
  }

  const speaker = (line as Record<string, unknown>)?.speaker
  if (!isNonEmptyString(speaker)) {
    findings.push({
      gate: 'GT6',
      severity: 'error',
      message: `dialogue line is missing required field 'speaker' (needed for voice routing)`,
      context: ctx,
    })
  }

  // Stage-B-only enrichment — warnings in Phase 1. Dialogue translations are
  // empty strings in current staging; Phase 2 fills them.
  const translation = (line as Record<string, unknown>)?.translation
  if (!isNonEmptyString(translation)) {
    findings.push({
      gate: 'GT6',
      severity: 'warning',
      message: `dialogue line has empty 'translation' (Stage-B capability authoring will fill it)`,
      context: ctx,
    })
  }

  return findings
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
