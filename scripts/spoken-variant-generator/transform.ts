/**
 * Core transformation engine for spoken variant generation.
 *
 * Pure functions — no I/O, fully testable.
 */

import { allRules, type TransformRule } from './rules.js'
import type {
  SpokenOutput,
  StyleDecision,
  Transformation,
  TranscriptLine,
} from './types.js'

/**
 * Parse a transcript text into lines, preserving line numbers.
 * Blank lines are preserved for alignment.
 */
export function parseTranscript(text: string): TranscriptLine[] {
  const lines = text.split('\n')
  return lines.map((line, i) => ({
    lineNumber: i + 1,
    text: line,
  }))
}

/**
 * Apply a single rule to a line of text for a specific track.
 * Returns the transformed text and any transformation records.
 */
function applyRule(
  text: string,
  rule: TransformRule,
  track: 'learner' | 'natural'
): { text: string; transformations: Transformation[] } {
  const replacement = track === 'learner' ? rule.learner : rule.natural

  // null means "no change for this track"
  if (replacement === null) {
    return { text, transformations: [] }
  }

  const transformations: Transformation[] = []

  // Use a fresh regex each time (global flag means stateful lastIndex)
  const pattern = new RegExp(rule.pattern.source, rule.pattern.flags)
  const matches = [...text.matchAll(pattern)]

  if (matches.length === 0) {
    return { text, transformations: [] }
  }

  for (const match of matches) {
    const ruleTrack: 'learner' | 'natural' | 'both' =
      rule.learner !== null && rule.natural !== null ? 'both' : track

    transformations.push({
      rule: rule.name,
      from: match[0],
      to: match[0].replace(new RegExp(rule.pattern.source, rule.pattern.flags), replacement),
      track: ruleTrack,
    })
  }

  const newText = text.replace(pattern, replacement)
  return { text: newText, transformations }
}

/**
 * Transform a single line through all rules for a given track.
 */
function transformLine(
  text: string,
  rules: TransformRule[],
  track: 'learner' | 'natural'
): { text: string; transformations: Transformation[] } {
  let current = text
  const allTransformations: Transformation[] = []

  for (const rule of rules) {
    const result = applyRule(current, rule, track)
    current = result.text
    allTransformations.push(...result.transformations)
  }

  return { text: current, transformations: allTransformations }
}

/**
 * Generate both spoken tracks from a parsed transcript.
 * Maintains 1:1 line alignment with source.
 */
export function generateSpokenVariants(
  lines: TranscriptLine[],
  rules: TransformRule[] = allRules
): SpokenOutput {
  const learnerSpoken: string[] = []
  const naturalSpoken: string[] = []
  const styleDecisions: StyleDecision[] = []

  for (const line of lines) {
    if (line.text.trim() === '') {
      // Preserve blank lines for alignment
      learnerSpoken.push('')
      naturalSpoken.push('')
      continue
    }

    const learnerResult = transformLine(line.text, rules, 'learner')
    const naturalResult = transformLine(line.text, rules, 'natural')

    learnerSpoken.push(learnerResult.text)
    naturalSpoken.push(naturalResult.text)

    const allTransformations = [
      ...learnerResult.transformations,
      ...naturalResult.transformations,
    ]

    if (allTransformations.length > 0) {
      styleDecisions.push({
        lineNumber: line.lineNumber,
        original: line.text,
        transformations: allTransformations,
      })
    }
  }

  return { learnerSpoken, naturalSpoken, styleDecisions }
}
