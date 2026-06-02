// src/lib/capabilities/separatorConvention.ts
//
// The single, tree-neutral definition of the alternative-answer separator
// convention (CONTEXT.md → Typed Artifact). Imported by BOTH the browser
// bundle (the runtime grader, answerNormalization.checkAnswer) and the pipeline
// (the CS19 Capability Gate validator + the HC24 health check) via
// '@/lib/capabilities'. Co-location here — not in the runtime-only
// answerNormalization.ts — is the anti-drift mechanism: a regex duplicated
// across the src/ ↔ scripts/ boundary would re-introduce exactly the drift this
// module fixes (target-architecture §8; PR #129 plan §2a, data-architect m-1).
//
// Canonical stored separator = "/". A "/"-joined value lists equally-acceptable
// forms ("huis / woning"). ";" is a legacy/authoring convenience the staging
// generator's normaliseDutchTranslation already rewrites to "/"; it is split
// here defensively so legacy DB values still grade. A COMMA is NOT a separator —
// it can sit inside one legitimate translation, so comma-delimited
// "alternatives" are a mis-encoding the gate/health-check flag rather than
// silently split.

/** A comma "alternatives" list is only suspected when every segment is this
 *  short — a longer segment indicates a single clause that merely contains an
 *  internal comma, which is legitimate. (PR #129 plan §2c.) */
const MAX_COMMA_SEGMENT_TOKENS = 3

/**
 * Split an answer value into its acceptable alternatives. Splits on the
 * canonical "/" and — defensively, for legacy values — on ";". NEVER splits on
 * a comma. Segments are trimmed; empties are dropped.
 */
export function splitAlternatives(value: string): string[] {
  return value
    .split(/[/;]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

export type SeparatorViolation = 'semicolon' | 'comma_as_or'

function tokenCount(segment: string): number {
  return segment.trim().split(/\s+/).filter(Boolean).length
}

/** Known legitimate comma-bearing Dutch meanings that must never be flagged as
 *  comma-as-OR (trim + lowercase compared). Populated from the plan §2e survey:
 *  these are set-phrase replies where the comma is punctuation, not an OR — e.g.
 *  `baik-baik saja` = "Goed, dank u wel" ("Fine, thank you"), one reply, not the
 *  two alternatives "goed" / "dank u wel". */
export const DUTCH_COMMA_EXEMPTIONS: ReadonlySet<string> = new Set<string>([
  'goed, dank u wel',
])

/**
 * Classify a Dutch (`learning_items.translation_nl`) answer value's separator.
 * Returns the violation kind, or null when the value is canonical or a single
 * legitimate clause.
 *
 *   - 'semicolon'   — the value contains ";" (must be "/").
 *   - 'comma_as_or' — the value has NO "/" and splits into >=2 comma-segments
 *                     each <= MAX_COMMA_SEGMENT_TOKENS tokens ("vader, meneer,
 *                     u"). A single Dutch clause with an internal comma has a
 *                     longer segment and is NOT flagged. No verb-detection
 *                     (item POS is null per CS14) — kind + segment length only.
 *
 * `exempt` is a denylist (trim + lowercase compared) of legitimate
 * comma-bearing Dutch meanings.
 */
export function classifyDutchSeparator(
  value: string,
  exempt: ReadonlySet<string> = DUTCH_COMMA_EXEMPTIONS,
): SeparatorViolation | null {
  if (value.includes(';')) return 'semicolon'
  if (value.includes('/')) return null
  if (exempt.has(value.trim().toLowerCase())) return null
  const segments = value.split(',').map((s) => s.trim()).filter(Boolean)
  if (segments.length >= 2 && segments.every((s) => tokenCount(s) <= MAX_COMMA_SEGMENT_TOKENS)) {
    return 'comma_as_or'
  }
  return null
}

/**
 * Classify an Indonesian-side answer value's separator
 * (`item_answer_variants` / `accepted_answers:id`). Only ";" is flagged — a
 * comma in Indonesian is NEVER a separator (verbless equative clauses like
 * "dia guru" make short comma-segments normal), so the comma-as-OR heuristic is
 * deliberately not applied. Warn-level at the callsite.
 */
export function classifyIndonesianSeparator(value: string): SeparatorViolation | null {
  return value.includes(';') ? 'semicolon' : null
}
