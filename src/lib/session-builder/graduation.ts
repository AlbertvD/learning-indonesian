import type { ProjectedCapability } from '@/lib/capabilities'
import { hasMasteryStrength } from '@/lib/analytics/mastery/mastered'
import type { DueCapability, LearnerCapabilityStateRow } from './dueFilter'

// ── Vocab graduation — retire #1 from due scheduling at #6 mastery strength ──
// docs/plans/2026-07-08-vocab-mode-set-reduction-and-graduation.md §4.2, ADR
// 0027-vocabulary-mode-set-bounded.md.
//
// End state per word (post Slice 1's mode-set trim): 3 introduced capabilities
// — #1 `recognise_meaning_from_text_cap` (receptive scaffold), #3
// `recognise_meaning_from_audio_cap` (aural, never retired), #6
// `produce_form_from_meaning_cap` (productive frontier, never retired).
// Recall subsumes recognition (Karpicke & Roediger 2008), so once #6 reaches
// mastery STRENGTH for a word, #1 stops earning its own review slot — the
// word settles at 2 lifelong cards instead of 3. This function is the runtime
// half of that rule: it removes #1 entries from the due list; nothing is
// written to the DB (stateless — see below).
//
// Uses `hasMasteryStrength` (mastered.ts), NOT `isCapabilityMastered`: the
// latter's 30-day recency window would flicker a mature #6 card in and out of
// "mastered" between its own (increasingly spaced-out) reviews, oscillating
// the graduation instead of converging it (spec §1 defect 1 — the reason this
// helper exists as a separate predicate rather than reusing the analytics
// label). Stateless by construction: a lapse (#6's consecutiveFailureCount
// going > 0) breaks the strength predicate on the very next build and #1
// reappears in the due list on its own — there is no stored "graduated" flag
// to reconcile, so reversal is free (Ebbinghaus; Nelson 1978).
//
// Fail-safe by construction: every branch that cannot PROVE a #1→#6
// graduation pair for the same word falls through unsuppressed — a missing
// capability projection, a missing #6 scheduler state, a non-vocab source
// kind, or any OTHER vocab mode (#3 aural, #6 itself). #3 and #6 are never
// suppressed; only #1 due entries are ever removed. (§4.3 deliberately has NO
// intro-suppression counterpart — a placement-seeded word whose #1 is never
// introduced would leave its key out of `satisfiedKeys`, permanently blocking
// a morphology root's derived-form prereq, affixedCapabilities.ts:49-57 +
// pedagogy.ts:320. Introduction stays untouched; only due-scheduling is cut.)
//
// Mirrors `reserveGrammarDueFloor`'s composition style (compose.ts): a pure
// function over the already-loaded snapshot. The builder applies it to
// `orderedDue` immediately after `getDueCapabilities`, BEFORE the grammar
// due-floor / session-size cut — so the shed feeds `dueCount` (→ `openSlots`,
// loadBudget.ts:24) and `backlogDueCount` (model.ts) equally. See builder.ts.
export function suppressGraduatedVocabDue(
  orderedDue: readonly DueCapability[],
  capabilitiesByKey: ReadonlyMap<string, ProjectedCapability>,
  schedulerRows: readonly LearnerCapabilityStateRow[],
): DueCapability[] {
  // sourceRef → #6 (produce_form_from_meaning_cap) scheduler state, vocab only.
  const produceStateBySourceRef = new Map<string, LearnerCapabilityStateRow>()
  for (const row of schedulerRows) {
    const capability = capabilitiesByKey.get(row.canonicalKeySnapshot)
    if (!capability) continue
    if (capability.sourceKind !== 'vocabulary_src') continue
    if (capability.capabilityType !== 'produce_form_from_meaning_cap') continue
    produceStateBySourceRef.set(capability.sourceRef, row)
  }

  return orderedDue.filter(due => {
    const capability = capabilitiesByKey.get(due.canonicalKeySnapshot)
    if (!capability) return true // missing projection — never suppress
    if (capability.sourceKind !== 'vocabulary_src') return true // non-vocab family
    if (capability.capabilityType !== 'recognise_meaning_from_text_cap') return true // #3/#6/other vocab types — never suppressed

    const produceState = produceStateBySourceRef.get(capability.sourceRef)
    if (!produceState) return true // no #6 state for this word yet — never suppress

    const graduated = hasMasteryStrength({
      reviewCount: produceState.reviewCount,
      stability: produceState.stability,
      consecutiveFailureCount: produceState.consecutiveFailureCount,
    })
    return !graduated
  })
}
