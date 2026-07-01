/**
 * verify/seedIntegrity.ts — CS9 seed hook (post-write).
 *
 * Extracted from capability-stage-legacy.ts:805–923. Reviewability check:
 * every non-dialogue published item must have an NL meaning. dialogue_chunks
 * are skipped here because they're already AND-gated pre-write by the
 * deferredDialogueChunks gate (vocab projector).
 *
 * Slice 4c (#102): the second render path — "OR ≥1 item_context with an active
 * exercise_variant" — was retired with the exercise_variants table. The typed
 * grammar-exercise tables key on grammar_pattern_id+lesson_id (not item_contexts),
 * so the variant path could not be repointed; grammar renderability is certified
 * separately (HC15 / RENDER_CONTRACTS). The invariant narrows to "NL-covered only,"
 * which is exactly Step 6.1 — so the old Step 6.3 cross-check is now subsumed.
 *
 * "NL meaning" = learning_items.translation_nl non-empty (Decision R, PR 1).
 * item_meanings was dropped in Slice 4a; readMeaningCoverage now reads
 * learning_items.translation_nl / translation_en directly.
 *
 * Catches the 2026-04-24 incident's non-dialogue orphan pattern (sentences
 * that landed without translations or variants).
 */

import type { CapabilitySupabaseClient } from '../adapter'
import { readMeaningCoverage, readContextCoverage } from '../adapter'
import type { ValidationFinding } from '../model'

export interface SeedIntegrityInput {
  publishedItemIds: string[]
  /** Dialogue learning_item.id's — skipped from non-dialogue reviewability check. */
  dialogueItemIds: Set<string>
}

export interface SeedIntegrityReport {
  findings: ValidationFinding[]
  /** Hint for the runner's POS coverage report. */
  totals: {
    nlCovered: number
    enCovered: number
    contextCovered: number
    unreviewable: number
    nonDialogueCount: number
    dialogueCount: number
  }
}

export async function runSeedIntegrity(
  supabase: CapabilitySupabaseClient,
  input: SeedIntegrityInput,
): Promise<SeedIntegrityReport> {
  const findings: ValidationFinding[] = []

  if (input.publishedItemIds.length === 0) {
    return {
      findings,
      totals: {
        nlCovered: 0,
        enCovered: 0,
        contextCovered: 0,
        unreviewable: 0,
        nonDialogueCount: 0,
        dialogueCount: 0,
      },
    }
  }

  const { nlCovered, enCovered } = await readMeaningCoverage(supabase, input.publishedItemIds)
  const { ctxCovered } = await readContextCoverage(supabase, input.publishedItemIds)

  const nonDialogueIds = input.publishedItemIds.filter((id) => !input.dialogueItemIds.has(id))
  const dialogueCount = input.publishedItemIds.length - nonDialogueIds.length

  // Step 6.1 — NL meaning required for non-dialogue items.
  const missingNl = nonDialogueIds.filter((id) => !nlCovered.has(id))
  if (missingNl.length > 0) {
    findings.push({
      gate: 'CS9',
      severity: 'error',
      message:
        `${missingNl.length}/${nonDialogueIds.length} non-dialogue items missing NL meaning ` +
        `(IDs: ${missingNl.slice(0, 5).join(', ')}${missingNl.length > 5 ? `, +${missingNl.length - 5} more` : ''})`,
      context: { table: 'learning_items' },
    })
  }

  // Step 6.2 — every published item has at least one context.
  const missingCtx = input.publishedItemIds.filter((id) => !ctxCovered.has(id))
  if (missingCtx.length > 0) {
    findings.push({
      gate: 'CS9',
      severity: 'error',
      message:
        `${missingCtx.length}/${input.publishedItemIds.length} items have no context — ` +
        `they cannot appear in sessions ` +
        `(IDs: ${missingCtx.slice(0, 5).join(', ')}${missingCtx.length > 5 ? `, +${missingCtx.length - 5} more` : ''})`,
      context: { table: 'item_contexts' },
    })
  }

  // Step 6.3 (retired Slice 4c #102) — the variant-path reviewability cross-check
  // was "NL meaning OR a context with an active exercise_variant." With the
  // exercise_variants table dropped, the variant path is gone and the check
  // narrows to "NL-covered only" — which is exactly Step 6.1 above. So the set of
  // unreviewable non-dialogue items IS `missingNl`; no separate walk/finding.
  return {
    findings,
    totals: {
      nlCovered: nlCovered.size,
      enCovered: enCovered.size,
      contextCovered: ctxCovered.size,
      unreviewable: missingNl.length,
      nonDialogueCount: nonDialogueIds.length,
      dialogueCount,
    },
  }
}
