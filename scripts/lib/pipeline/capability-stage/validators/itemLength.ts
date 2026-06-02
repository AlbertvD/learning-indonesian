/**
 * CS20 — item length guard (pre-write, item kind; ADR 0014 / Fix 1a).
 *
 * KIND is the productive-ceiling gate (sentence/dialogue_chunk are dropped at
 * harvest, `itemHarvest.ts`); a word/phrase running >= LENGTH_GUARD_TOKEN_THRESHOLD
 * tokens is a secondary "likely mis-tagged sentence" smell. WARN-only, never an
 * error: long fixed expressions (`terima kasih kembali`, idioms, multi-word
 * collocations) are legitimate lexical chunks (architect Q2). The warning prompts
 * a human to re-check the item_type, nothing more.
 *
 * Pure (no DB, no I/O). sentence/dialogue_chunk items are skipped — they are
 * dropped wholesale by the harvest filter, so flagging their length would be
 * noise.
 */

import type { ValidationFinding } from '../model'
import { LENGTH_GUARD_TOKEN_THRESHOLD, tokenCount } from '../itemHarvest'

export interface ItemForLengthCheck {
  base_text: string
  item_type: string
}

export function validateItemLength(items: ItemForLengthCheck[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  for (const item of items) {
    if (item.item_type !== 'word' && item.item_type !== 'phrase') continue
    const n = tokenCount(item.base_text)
    if (n >= LENGTH_GUARD_TOKEN_THRESHOLD) {
      findings.push({
        gate: 'CS20',
        severity: 'warning',
        message:
          `Item "${item.base_text}" (${item.item_type}) runs ${n} tokens ` +
          `(>= ${LENGTH_GUARD_TOKEN_THRESHOLD}) — likely a mis-tagged sentence. ` +
          `Confirm item_type: a genuine lexical chunk this long is rare (warn-only; ` +
          `long fixed expressions like "terima kasih kembali" are legitimate).`,
        context: { itemSlug: item.base_text.slice(0, 40) },
      })
    }
  }
  return findings
}
