/**
 * vocabulary/gate.ts — the vocab module's item-layer Capability Gate.
 *
 * Thin composition over the existing item validators (imported, not copied),
 * split into the two phases the write physically straddles:
 *
 *   runVocabGatePreWrite(items) — pure, against the projection. Errors here
 *     short-circuit the publish before any write. CS4/CS4b (meaning + translation),
 *     CS19 (separator convention — the real publish blocker), CS20 (length).
 *     CS5 POS is DELIBERATELY NOT run here: the projection's pos is null by
 *     construction (POS is backfilled after insert), so a pre-write POS check only
 *     yields noise — POS is validated post-backfill by CS14 instead (plan §0.5).
 *
 *   runVocabGatePostWrite(supabase, input) — against the just-written rows / DB.
 *     CS14 (POS, post-backfill — the correct placement), CS15 (distractor coverage,
 *     reads the seeded count — MUST run after the distractor seed), CS23 (audio
 *     coverage — §0.8/#165), CS17 (cross-lesson duplicates, DB-aware).
 */

import type { ValidationFinding } from '../model'
import type { CapabilitySupabaseClient } from '../adapter'

import { validatePerItemMeaning } from '../validators/perItemMeaning'
import { validateItemTranslations } from '../validators/itemTranslations'
import { validateItemSeparatorConvention } from '../validators/itemSeparatorConvention'
import { validateItemLength } from '../validators/itemLength'
import { validateItemPos, type ItemForPosCheck } from '../validators/itemPos'
import { validateItemDuplicates, type ItemDuplicatesInput } from '../validators/itemDuplicates'
import { validateDistractorCoverage, type CapDistractorCount } from './validateCoverage'

// ---------------------------------------------------------------------------
// Pre-write
// ---------------------------------------------------------------------------

/** One item, as projected, for the pre-write gate. Superset of the four pure
 *  validators' input shapes. */
export interface VocabItemForGate {
  base_text: string
  item_type: string
  context_type?: string
  translation_nl?: string | null
  translation_en?: string | null
}

export function runVocabGatePreWrite(items: VocabItemForGate[]): ValidationFinding[] {
  return [
    ...validatePerItemMeaning(items), // CS4
    ...validateItemTranslations(items), // CS4b (ERROR on null translation_nl)
    ...validateItemSeparatorConvention(items), // CS19 (ERROR on comma-as-OR / ";")
    ...validateItemLength(items), // CS20 (WARN — likely mis-tagged sentence)
  ]
}

// ---------------------------------------------------------------------------
// Audio coverage (CS23 — §0.8 / #165)
// ---------------------------------------------------------------------------

export interface VocabAudioCoverageItem {
  normalizedText: string
  itemType: string
  hasAudioClip: boolean
}

/**
 * Audio is assumed to exist (the vocab stage emits audio caps for every word/phrase
 * item). A missing audio_clip is flagged WARN here — surfaced, not blocked. The
 * hard Stage-A error that halts the publish on an unvoiced vocab word is #165.
 */
export function validateAudioCoverage(items: VocabAudioCoverageItem[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  for (const i of items) {
    if (i.itemType !== 'word' && i.itemType !== 'phrase') continue
    if (!i.hasAudioClip) {
      findings.push({
        gate: 'CS23',
        severity: 'warning',
        message:
          `Item "${i.normalizedText}" has no audio clip — its audio capabilities ` +
          `(recognise_meaning_from_audio_cap/dictation) will not render until the Lesson Stage voices ` +
          `it. The hard Stage-A enforcement is tracked in #165.`,
        context: { itemSlug: i.normalizedText },
      })
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// Post-write
// ---------------------------------------------------------------------------

export interface VocabGatePostWriteInput {
  /** Item rows as written THIS run, with post-backfill pos (CS14). */
  posItems: ItemForPosCheck[]
  /** Item caps with their seeded distractor counts (CS15). Built AFTER the seed. */
  coverage: CapDistractorCount[]
  /** Audio coverage flags (CS23). */
  audio: VocabAudioCoverageItem[]
  /** Cross-lesson duplicate check (CS17, DB-aware). */
  duplicates: ItemDuplicatesInput
}

export async function runVocabGatePostWrite(
  supabase: CapabilitySupabaseClient,
  input: VocabGatePostWriteInput,
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = []
  findings.push(...validateItemPos(input.posItems)) // CS14 (post-backfill)
  findings.push(...validateDistractorCoverage(input.coverage)) // CS15 (seeded count)
  findings.push(...validateAudioCoverage(input.audio)) // CS23
  findings.push(...(await validateItemDuplicates(supabase, input.duplicates))) // CS17
  return findings
}
