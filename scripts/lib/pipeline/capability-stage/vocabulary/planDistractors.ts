/**
 * cap-v2 Slice 1 — the pure distractor-write planner.
 *
 * Composes the pure selectors (`selectDistractors.ts`) over Pool(N) into the
 * (capability_id, item_id) pointer rows the writer persists to the `distractors`
 * table. Pure and deterministic — the DB store (Pool(N) fetch, embedding cache,
 * idempotency, writes) is the thin shell around this.
 *
 * Capability → distractor-kind seam (grounded from runner.ts:620-694):
 *   text_recognition  → meaning distractors (recognition_mcq: see ID, pick NL)
 *   audio_recognition → meaning distractors (listening_mcq: hear, pick NL —
 *                       newly curated; had no curated path before, spec §4a)
 *   l1_to_id_choice   → form distractors (cued_recall: see NL, pick ID)
 *   everything else (meaning_recall, form_recall, dictation, contextual_cloze)
 *                     → no distractors (typed / typed-cloze, no MCQ options)
 */

import {
  selectFormDistractors,
  selectMeaningDistractors,
  withPosFallback,
  DEFAULT_SYNONYM_THRESHOLD,
  type DistractorCandidate,
  type MeaningCandidate,
} from './selectDistractors'

/** Capability types whose MCQ options are L1 glosses (ranked by meaning). */
const MEANING_DISTRACTOR_TYPES = new Set(['text_recognition', 'audio_recognition'])
/** Capability types whose MCQ options are Indonesian forms (ranked orthographically). */
const FORM_DISTRACTOR_TYPES = new Set(['l1_to_id_choice'])

/** Whether a capability type carries curated MCQ distractors (vs typed/recall).
 *  The single source of the seam — coverage validation reuses it so the two
 *  never drift. */
export function capWantsDistractors(capabilityType: string): boolean {
  return MEANING_DISTRACTOR_TYPES.has(capabilityType) || FORM_DISTRACTOR_TYPES.has(capabilityType)
}

/** An item as it appears in the cumulative Pool(N), carrying both surfaces. */
export interface PoolItem {
  itemId: string
  /** Indonesian written form (`normalized_text`) — the form-distractor key. */
  form: string
  /** L1 (Dutch) gloss (`translation_nl`) — the meaning-distractor key. */
  meaning: string
  /** POS (`learning_items.pos`), null if the Haiku backfill could not classify. */
  pos: string | null
  /** Precomputed embedding of `meaning`. */
  embedding: number[]
}

/** One item capability to seed distractors for (the answer item it belongs to). */
export interface SeedCap {
  capabilityId: string
  capabilityType: string
  item: PoolItem
}

/** A wrong-option pointer row destined for the `distractors` table. */
export interface DistractorPointerRow {
  capabilityId: string
  itemId: string
}

export interface PlanOptions {
  /** Distractors per capability (runtime renders min(k, available)). Default 3. */
  k?: number
  synonymThreshold?: number
}

/**
 * Plan the distractor pointer rows for a set of item capabilities. Each cap is
 * routed to the form or meaning selector by its type; typed capabilities emit
 * nothing. Candidates are Pool(N) minus the answer item, with same-POS
 * preference (relaxed when undersupplied).
 */
export function planDistractorWrites(
  caps: SeedCap[],
  pool: PoolItem[],
  opts: PlanOptions = {},
): DistractorPointerRow[] {
  const k = opts.k ?? 3
  const synonymThreshold = opts.synonymThreshold ?? DEFAULT_SYNONYM_THRESHOLD
  const rows: DistractorPointerRow[] = []

  for (const cap of caps) {
    if (!capWantsDistractors(cap.capabilityType)) continue
    const wantsMeaning = MEANING_DISTRACTOR_TYPES.has(cap.capabilityType)

    // Candidates: the whole pool except the answer item, with the POS rung.
    const others = pool.filter((p) => p.itemId !== cap.item.itemId)
    const candidates = withPosFallback(cap.item.pos, others, k)

    const chosen = wantsMeaning
      ? selectMeaningDistractors(
          { meaning: cap.item.meaning, embedding: cap.item.embedding },
          candidates.map((c): MeaningCandidate => ({ itemId: c.itemId, meaning: c.meaning, embedding: c.embedding })),
          k,
          { synonymThreshold },
        )
      : selectFormDistractors(
          cap.item.form,
          candidates.map((c): DistractorCandidate => ({ itemId: c.itemId, text: c.form })),
          k,
        )

    for (const c of chosen) rows.push({ capabilityId: cap.capabilityId, itemId: c.itemId })
  }

  return rows
}
