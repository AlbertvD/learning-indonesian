import { SECTION_CONTENT_TYPES, type SectionContentType, type ValidationFinding } from '../model'

interface SectionLike {
  id?: string
  content: Record<string, unknown>
}

const CANONICAL: ReadonlySet<string> = new Set(SECTION_CONTENT_TYPES)

/**
 * GT5 — Every section's `content.type` must be in the canonical 10-value set
 * AND its `content` payload must conform to the per-type sub-shape (per spec
 * §4 GT5 table). The grammar/reference_table grammar_topics rule lives in
 * GT1; GT5 only confirms the type discriminator and the per-type shape.
 */
export function validateSectionType(sections: SectionLike[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const section of sections) {
    const type = section.content?.type
    if (type === undefined || type === null) {
      findings.push({
        gate: 'GT5',
        severity: 'error',
        message: 'Section is missing content.type discriminator',
        context: { sectionId: section.id },
      })
      continue
    }

    if (typeof type !== 'string' || !CANONICAL.has(type)) {
      findings.push({
        gate: 'GT5',
        severity: 'error',
        message:
          `Section content.type is "${String(type)}", which is not in the canonical set ` +
          `(${SECTION_CONTENT_TYPES.join(', ')})`,
        context: { sectionId: section.id },
      })
      continue
    }

    const subShapeFinding = checkSubShape(type as SectionContentType, section)
    if (subShapeFinding) findings.push(subShapeFinding)
  }

  return findings
}

function checkSubShape(
  type: SectionContentType,
  section: SectionLike,
): ValidationFinding | null {
  const c = section.content
  const ctx = { sectionId: section.id }

  switch (type) {
    case 'text': {
      const hasParagraphs = isNonEmptyArrayOfString(c.paragraphs)
      const hasLegacy =
        typeof c.intro === 'string' && c.intro.trim().length > 0
        || isNonEmptyArrayOfString(c.sentences)
        || isNonEmptyArrayOfString(c.examples)
        || isNonEmptyArrayOfString(c.spelling)
      if (!hasParagraphs && !hasLegacy) {
        return {
          gate: 'GT5',
          severity: 'error',
          message: 'text section requires paragraphs[] or one of intro/sentences[]/examples[]/spelling[]',
          context: ctx,
        }
      }
      return null
    }
    case 'grammar':
    case 'reference_table':
      // Sub-shape is permissive at GT5; GT1 enforces grammar_topics.
      return null
    case 'vocabulary':
    case 'expressions':
    case 'numbers': {
      if (!isNonEmptyArray(c.items)) {
        return {
          gate: 'GT5',
          severity: 'error',
          message: `${type} section requires non-empty items[]`,
          context: ctx,
        }
      }
      return null
    }
    case 'dialogue': {
      if (!isNonEmptyArray(c.lines)) {
        return {
          gate: 'GT5',
          severity: 'error',
          message: 'dialogue section requires non-empty lines[]',
          context: ctx,
        }
      }
      return null
    }
    case 'pronunciation': {
      if (!isNonEmptyArray(c.letters)) {
        return {
          gate: 'GT5',
          severity: 'error',
          message: 'pronunciation section requires non-empty letters[]',
          context: ctx,
        }
      }
      return null
    }
    case 'culture':
      // No sub-shape requirement in Phase 1.
      return null
    case 'exercises': {
      if (!isNonEmptyArray(c.exercises)) {
        return {
          gate: 'GT5',
          severity: 'error',
          message: 'exercises section requires non-empty exercises[]',
          context: ctx,
        }
      }
      return null
    }
  }
}

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0
}

function isNonEmptyArrayOfString(value: unknown): value is string[] {
  return Array.isArray(value) && value.some((v) => typeof v === 'string' && v.trim().length > 0)
}
