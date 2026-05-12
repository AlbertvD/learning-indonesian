/**
 * CS6 — grammar pattern validator.
 *
 * Moved from lesson-stage/validators/grammarPattern.ts (gate GT7) per the
 * capability-stage fold §11 #19. The rule is unchanged; gate prefix shifts
 * from `GT7` to `CS6`. The pattern list now comes from
 * authoring/linguistStructurer.ts rather than a staging file, but the
 * shape is identical.
 *
 * Rule: every grammar pattern's metadata must have:
 *   - slug — non-empty, matches /^[a-z0-9-]+$/ (kebab-case)
 *   - pattern_name — non-empty trimmed string
 *   - complexity_score — finite number (DB column NOT NULL)
 *   - slugs unique within a single lesson
 */

import type { ValidationFinding } from '../model'

const SLUG_PATTERN = /^[a-z0-9-]+$/

interface PatternLike {
  slug: string
  pattern_name: string
  complexity_score: number
}

export function validateGrammarPattern(patterns: PatternLike[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  const seen = new Set<string>()

  for (const pattern of patterns) {
    const slug = (pattern as Partial<PatternLike>).slug
    const ctxSlug = typeof slug === 'string' && slug.length > 0 ? slug : '(missing-slug)'
    const ctx = { itemSlug: ctxSlug }

    if (typeof slug !== 'string' || slug.trim().length === 0) {
      findings.push({
        gate: 'CS6',
        severity: 'error',
        message: 'Grammar pattern is missing required field slug',
        context: ctx,
      })
    } else if (!SLUG_PATTERN.test(slug)) {
      findings.push({
        gate: 'CS6',
        severity: 'error',
        message: `Grammar pattern slug "${slug}" does not match /^[a-z0-9-]+$/ (kebab-case lowercase only)`,
        context: ctx,
      })
    } else if (seen.has(slug)) {
      findings.push({
        gate: 'CS6',
        severity: 'error',
        message: `Grammar pattern slug "${slug}" is a duplicate within this lesson`,
        context: ctx,
      })
    } else {
      seen.add(slug)
    }

    const name = (pattern as Partial<PatternLike>).pattern_name
    if (typeof name !== 'string' || name.trim().length === 0) {
      findings.push({
        gate: 'CS6',
        severity: 'error',
        message: 'Grammar pattern is missing required field pattern_name',
        context: ctx,
      })
    }

    const complexity = (pattern as Partial<PatternLike>).complexity_score
    if (typeof complexity !== 'number' || !Number.isFinite(complexity)) {
      findings.push({
        gate: 'CS6',
        severity: 'error',
        message: 'Grammar pattern is missing required field complexity_score (must be a finite number)',
        context: ctx,
      })
    }
  }

  return findings
}
