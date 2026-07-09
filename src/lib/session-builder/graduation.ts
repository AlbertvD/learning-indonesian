import type { CapabilityType, ProjectedCapability } from '@/lib/capabilities'
import { hasMasteryStrength } from '@/lib/analytics/mastery/mastered'
import type { DueCapability, LearnerCapabilityStateRow } from './dueFilter'

// ── Vocab graduation — retire MCQ scaffolds from due scheduling once their
// typed successor(s) reach mastery strength ──
// docs/plans/2026-07-08-vocab-mode-set-reduction-and-graduation.md §4.2 (shipped,
// `#1 ← #6`), amended by docs/plans/2026-07-09-vocab-four-card-ladder.md §2.4
// (PR-A added `#2 ← #6`; PR-B repoints `#1 ← #6` to `#1 ← (#3′ ∨ #6)` now that
// #3′ is itself a typed recall card — see below), ADR 0027-vocabulary-mode-set-bounded.md.
//
// Four-card model (per-word): #1 `recognise_meaning_from_text_cap` and #2
// `recognise_form_from_meaning_cap` are MCQ scaffolds — one per direction
// (comprehension / production) — that graduate out of due scheduling once a
// qualifying typed successor for the same word reaches mastery STRENGTH. #2's
// only successor is #6 `produce_form_from_meaning_cap` (the production
// frontier). #1's successors are #3′ `recognise_meaning_from_audio_cap` (now
// ear-only typed meaning recall, PR-B §2.3 — never an MCQ) OR #6 — the OR is
// load-bearing: listening-disabled users have #3′ stripped from their snapshot
// (`listeningFilter.ts`), so a #3′-only trigger would leave #1 — a cued MCQ —
// as their lifelong card, contradicting the model's thesis that every lifelong
// card must be uncued. With the OR, their #1 graduates via #6 instead (§2.6).
// #3′ and #6 themselves are NEVER suppressed. At full graduation a word rests
// at 2 lifelong cards (#3′ + #6) instead of 4. This module is the runtime half
// of both rules: it removes #1/#2 entries from the due list; nothing is
// written to the DB (stateless — see below).
//
// `GRADUATION_RULES` maps each scaffold type to its successor type(s) — a
// small scaffold→successors table rather than copy-pasted branches, so a
// future scaffold or an OR-successor set is one map entry, not a new code path.
//
// Uses `hasMasteryStrength` (mastered.ts), NOT `isCapabilityMastered`: the
// latter's 30-day recency window would flicker a mature #6 card in and out of
// "mastered" between its own (increasingly spaced-out) reviews, oscillating
// the graduation instead of converging it (spec §1 defect 1 — the reason this
// helper exists as a separate predicate rather than reusing the analytics
// label). Stateless by construction: a lapse (a successor's
// consecutiveFailureCount going > 0) breaks the strength predicate on the
// very next build and the scaffold reappears in the due list on its own —
// there is no stored "graduated" flag to reconcile, so reversal is free
// (Ebbinghaus; Nelson 1978).
//
// Fail-safe by construction: every branch that cannot PROVE a scaffold→successor
// graduation pair for the same word falls through unsuppressed — a missing
// capability projection, a missing successor scheduler state, a non-vocab
// source kind, or a vocab type that is not a scaffold (#3′ aural/typed, #6 itself).
// (§4.3 of the shipped spec deliberately has NO intro-suppression counterpart
// — a placement-seeded word whose #1 is never introduced would leave its key
// out of `satisfiedKeys`, permanently blocking a morphology root's
// derived-form prereq, affixedCapabilities.ts:49-57 + pedagogy.ts:320.
// Introduction stays untouched; only due-scheduling is cut.)
//
// **Sequencing note (four-card-ladder spec §2.4, staff-engineer):** the
// #1-trigger OR-repoint lands here in PR-B, not PR-A — repointing #1 at #3′
// while #3′ was still the old MCQ format would have graduated #1 on
// MCQ-earned strength, then flickered when PR-B hardened #3′ to a typed
// format. PR-A shipped only the format-independent `#2 ← #6` rule with `#1 ← #6`
// unchanged; PR-B (this commit) adds `#3′` to #1's successor set once #3′ is
// itself typed. Transitional cost, named and accepted: a matured #1 whose
// strength came solely from #3′'s OLD MCQ-earned stability will re-suppress
// via the same #3′ key once #3′'s typed format re-earns strength (or via #6
// in the meantime) — no reconciliation needed, same stateless-reversal
// property as a lapse.
//
// Mirrors `reserveGrammarDueFloor`'s composition style (compose.ts): a pure
// function over the already-loaded snapshot. The builder applies it to
// `orderedDue` immediately after `getDueCapabilities`, BEFORE the grammar
// due-floor / size cut — so the shed feeds `dueCount` (→ `openSlots`,
// loadBudget.ts:24) and `backlogDueCount` (model.ts) equally. See builder.ts.
const GRADUATION_RULES: ReadonlyMap<CapabilityType, readonly CapabilityType[]> = new Map([
  ['recognise_meaning_from_text_cap', ['recognise_meaning_from_audio_cap', 'produce_form_from_meaning_cap']], // #1 ← (#3′ ∨ #6) — PR-B repoint
  ['recognise_form_from_meaning_cap', ['produce_form_from_meaning_cap']], // #2 ← #6 (PR-A)
])

export function suppressGraduatedVocabDue(
  orderedDue: readonly DueCapability[],
  capabilitiesByKey: ReadonlyMap<string, ProjectedCapability>,
  schedulerRows: readonly LearnerCapabilityStateRow[],
): DueCapability[] {
  // sourceRef → successor capabilityType → scheduler state, vocab only,
  // scoped to whichever types appear as a successor in GRADUATION_RULES
  // (#3′ `recognise_meaning_from_audio_cap` and #6 `produce_form_from_meaning_cap`).
  const successorTypes = new Set<CapabilityType>([...GRADUATION_RULES.values()].flat())
  const stateBySourceRefAndType = new Map<string, Map<CapabilityType, LearnerCapabilityStateRow>>()
  for (const row of schedulerRows) {
    const capability = capabilitiesByKey.get(row.canonicalKeySnapshot)
    if (!capability) continue
    if (capability.sourceKind !== 'vocabulary_src') continue
    if (!successorTypes.has(capability.capabilityType)) continue
    let byType = stateBySourceRefAndType.get(capability.sourceRef)
    if (!byType) {
      byType = new Map<CapabilityType, LearnerCapabilityStateRow>()
      stateBySourceRefAndType.set(capability.sourceRef, byType)
    }
    byType.set(capability.capabilityType, row)
  }

  return orderedDue.filter(due => {
    const capability = capabilitiesByKey.get(due.canonicalKeySnapshot)
    if (!capability) return true // missing projection — never suppress
    if (capability.sourceKind !== 'vocabulary_src') return true // non-vocab family

    const successors = GRADUATION_RULES.get(capability.capabilityType)
    if (!successors) return true // not a scaffold type (#3/#6/other) — never suppressed

    const byType = stateBySourceRefAndType.get(capability.sourceRef)
    if (!byType) return true // no successor state for this word yet — never suppress

    const graduated = successors.some(successorType => {
      const state = byType.get(successorType)
      if (!state) return false
      return hasMasteryStrength({
        reviewCount: state.reviewCount,
        stability: state.stability,
        consecutiveFailureCount: state.consecutiveFailureCount,
      })
    })
    return !graduated
  })
}
