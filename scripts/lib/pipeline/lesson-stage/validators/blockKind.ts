import type { ValidationFinding } from '../model'

const CANONICAL: ReadonlySet<string> = new Set([
  'lesson_hero',
  'reading_section',
  'vocab_strip',
  'dialogue_card',
  'pattern_callout',
  'practice_bridge',
  'lesson_recap',
])

interface PageBlockLike {
  block_key: string
  block_kind: string
}

/**
 * GT2 — Every page-block written by the pipeline must have a block_kind in
 * the canonical 7-value reader set. Runs AFTER the classifier — any value
 * outside the set indicates a classifier bug or a row authored before the
 * classifier ran.
 */
export function validateBlockKind(blocks: PageBlockLike[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const block of blocks) {
    if (typeof block.block_kind !== 'string' || !CANONICAL.has(block.block_kind)) {
      findings.push({
        gate: 'GT2',
        severity: 'error',
        message:
          `Page-block has block_kind="${String(block.block_kind)}", which is not in the ` +
          `canonical 7-value reader set`,
        context: { blockKey: block.block_key },
      })
    }
  }

  return findings
}
