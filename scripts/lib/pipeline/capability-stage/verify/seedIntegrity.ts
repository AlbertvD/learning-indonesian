/**
 * verify/seedIntegrity.ts — CS9 seed hook (post-write).
 *
 * Extracted from capability-stage-legacy.ts:805–923. Reviewability cross-
 * check: every non-dialogue published item must have an NL meaning OR at
 * least one item_context with an active exercise_variant. Either one of
 * the two render paths satisfies filterEligible — dialogue_chunks are
 * skipped here because they're already AND-gated pre-write by the
 * deferredDialogueChunks gate (vocab projector).
 *
 * Catches the 2026-04-24 incident's non-dialogue orphan pattern (sentences
 * that landed without meanings or variants).
 */

import type { CapabilitySupabaseClient } from '../adapter'
import { readMeaningCoverage, readContextCoverage, readActiveVariantContextIds } from '../adapter'
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
  const { ctxCovered, ctxIdsByItem } = await readContextCoverage(supabase, input.publishedItemIds)

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
      context: { table: 'item_meanings' },
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

  // Step 6.3 — non-dialogue reviewability cross-check.
  const allCtxIds = [...ctxIdsByItem.values()].flat()
  const ctxIdsWithActiveVariant = allCtxIds.length > 0
    ? await readActiveVariantContextIds(supabase, allCtxIds)
    : new Set<string>()
  const unreviewable: string[] = []
  for (const id of nonDialogueIds) {
    if (nlCovered.has(id)) continue                                  // NL-path satisfied
    const itemCtxIds = ctxIdsByItem.get(id) ?? []
    if (itemCtxIds.some((cid) => ctxIdsWithActiveVariant.has(cid))) continue // variant-path satisfied
    unreviewable.push(id)
  }
  if (unreviewable.length > 0) {
    findings.push({
      gate: 'CS9',
      severity: 'error',
      message:
        `${unreviewable.length}/${nonDialogueIds.length} non-dialogue items are unreviewable — ` +
        `neither an NL meaning nor any context with an active exercise_variant. ` +
        `IDs: ${unreviewable.slice(0, 10).join(', ')}` +
        (unreviewable.length > 10 ? `, +${unreviewable.length - 10} more` : ''),
      context: { table: 'learning_items' },
    })
  }

  return {
    findings,
    totals: {
      nlCovered: nlCovered.size,
      enCovered: enCovered.size,
      contextCovered: ctxCovered.size,
      unreviewable: unreviewable.length,
      nonDialogueCount: nonDialogueIds.length,
      dialogueCount,
    },
  }
}
