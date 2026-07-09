# ADR 0027: The vocabulary capability mode-set is bounded to 4 introduced modes (2 at rest)

## Status

Accepted (2026-07-08). Slice 1 of `docs/plans/2026-07-08-vocab-mode-set-reduction-and-graduation.md`
(reviewed: staff-engineer, architect, data-architect — all PASS after corrections). Supersedes no prior
ADR; it narrows the per-facet model ADR 0003 established (cross-referenced there). Relates to ADR 0011
(capability content is DB-authoritative after seeding — the retirement mechanism this ADR reuses) and
ADR 0007 (receptive-before-productive staging — the reason #1 stays as the introduction vehicle).

**Amended 2026-07-09 (four-card ladder, `docs/plans/2026-07-09-vocab-four-card-ladder.md`, PR-A;
reviewed staff-engineer/architect/data-architect — all PASS after corrections).** `recognise_form_from_meaning_cap`
(#2) moves back from the dropped set to the kept set — see the Decision section below and the
"2026-07-09 amendment" subsection at the end of this document. Owner decision, ~2-week checkpoint
(~2026-07-23); pre-agreed reversal lever if acquisition load proves too heavy = re-retire #2 via the
existing `scripts/retire-dropped-vocab-modes.ts` shape (one flag), reversing this amendment's
`scripts/unretire-vocab-mode.ts`.

## Context

Every vocabulary item historically emitted **6** lifelong FSRS capabilities: `recognise_meaning_from_text_cap`
(#1, id→l1 recognition), `recognise_form_from_meaning_cap` (#2, l1→id recognition/"choice"),
`recognise_meaning_from_audio_cap` (#3, aural recognition), `recall_meaning_from_text_cap` (#4, id→l1
typed recall), `produce_form_from_meaning_cap` (#6, l1→id typed production), and
`produce_form_from_audio_cap` (#5, dictation). At 2,359 live vocabulary items this is 14,154 vocab caps,
and at maturity (mostly-mastered, long FSRS intervals) each still contributes to the daily review floor —
modeled at ~30–40 maintenance reviews/day for the full corpus, dwarfing a 25-card session. The review-load
stall this caused (`review_backlog_exhausts_budget`, lessons 9–30 frozen at 0 introductions) is diagnosed
in `docs/plans/2026-07-08-vocab-learning-model-review-brief.md`: the unbounded per-word cost, not the
`openSlots` intake policy.

The literature (full citations in the review brief §3) supports collapsing this to fewer, better-chosen
modes:

- Recall subsumes recognition, and transfer runs upward from productive practice to receptive knowledge
  much more strongly than the reverse (Karpicke & Roediger 2008; Rowland) — so a productive-frontier card
  and a receptive-scaffold card cover most of the ground two thin receptive variants (#2, #4) do
  separately.
- Aural comprehension is a distinct construct that typed production never trains (Milton & Hopkins 2006;
  Uchihara 2025) — it cannot be subsumed by any text-modality card.
- Introduction still needs a low-burden Phase-1 entry point (Nation's learning burden; the session-builder
  staging gate requires a Phase-1/2 sibling before Phase 3+ unlocks — `src/lib/session-builder/pedagogy.ts:360-369`)
  — first exposure has to be recognition-first, receptive, and cheap.
- Recall (typed) subsumes recognition (MCQ) *knowledge* but not recognition *speed* (the testing-effect /
  TAP literature — Barenberg & Roelle 2021) — so retiring the receptive scaffold entirely, rather than
  merely de-scheduling it, would be premature; graduation (this ADR's second half) uses a deep,
  successive-relearning-grounded bar rather than a first-success trigger.

## Decision

**Bound the vocabulary mode-set to 4 introduced modes (amended 2026-07-09 from 3 — see below),
permanently retiring 2, and graduate to 2 at steady state.**

### The kept set (`KEPT_VOCAB_CAP_TYPES`, `src/lib/capabilities/vocabModeSet.ts`)

1. **`recognise_meaning_from_text_cap`** (#1, id→l1, `prerequisiteKeys: []`) — the root/scaffold. Kept as
   the single receptive introduction vehicle: low learning burden, MCQ-first exposure, unlocks the
   Phase-1/2 staging gate for every other mode on the word.
2. **`recognise_form_from_meaning_cap`** (#2, l1→id MCQ, prereq #1) — **reinstated 2026-07-09 (four-card
   ladder, `docs/plans/2026-07-09-vocab-four-card-ladder.md`).** The production-direction MCQ scaffold,
   mirroring #1's role on the comprehension side: every direction gets a low-burden multiple-choice
   on-ramp before its uncued/typed lifelong card. Graduates out of due scheduling once #6 reaches mastery
   strength (`#2 ← #6`, same predicate as #1's graduation — `graduation.ts`). This SUPERSEDES the original
   2026-07-08 "same direction as #6 in a strictly weaker form, so it's inert once #6 exists" rationale
   (Karpicke's inert-repeated-study argument) **for the acquisition phase only**: the owner's 2026-07-09
   design dialogue judged that an MCQ on-ramp still earns its keep as a *scaffold* even though it repeats
   #6's direction, provided it graduates away once #6 is established — the inert-drilling objection applies
   to a *lifelong* #2, not a graduating one. Owner decision, ~2-week checkpoint (~2026-07-23) — see the
   amendment note at the end of this document.
3. **`recognise_meaning_from_audio_cap`** (#3, audio→l1, prereq #1) — **never retired.** Aural
   comprehension is a distinct skill no text-modality card trains; there is no substitute mode for it in
   the kept set.
4. **`produce_form_from_meaning_cap`** (#6, l1→id, prereq #1) — **never retired.** The productive
   frontier; recall subsumes recognition, so this is the highest-value single card per word.

### The dropped set (`DROPPED_VOCAB_CAP_TYPES`, same module)

- **`recall_meaning_from_text_cap`** (#4, id→l1 typed recall) — transfer asymmetry means productive
  practice (#6) already strengthens receptive knowledge; receptive depth is additionally served outside
  the vocabulary capability entirely (the reader / Lezen, and dialogue cloze). Keeping #4 as a first
  exposure would also invert the learning-burden staging (typed recall is not a cheap Phase-1 entry).
- **`produce_form_from_audio_cap`** (#5, dictation) — approximated by #3 (aural decoding) + #6
  (orthographic production) combined; its marginal distinct contribution does not justify a third
  lifelong card.

(`recognise_form_from_meaning_cap`, #2, was dropped here 2026-07-08 and reinstated 2026-07-09 — see the
kept-set entry above and the amendment note at the end of this document.)

Both constants are exported from one dependency-free module (no Supabase / browser-client imports, same
posture as `src/lib/analytics/mastery/mastered.ts`) so the projector (`projectors/vocab.ts`), the second
diagnostic definition (`capabilityCatalog.ts`), the one-off retirement/un-retirement scripts
(`scripts/retire-dropped-vocab-modes.ts`, `scripts/unretire-vocab-mode.ts`, 2026-07-09), and the structural
health checks (HC-A/HC-B, `check-supabase-deep.ts`) cannot define the mode split independently and drift
from each other.

### Retirement mechanism — reuse, not reinvent

The dropped modes are retired for **already-introduced words too** (not just suppressed going forward),
using the existing soft-retire seam (`softRetireCapabilities`,
`scripts/lib/pipeline/capability-stage/adapter.ts`): `retired_at = now()` + the companion
`learner_capability_state.next_due_at` clear (HC14). This is what makes the change a near-term unclog
rather than a slow drift — retiring in place removes ~40–55% of the sampled due-now vocab backlog
immediately. FSRS history (`stability`/`difficulty`/`lapseCount`/`reviewCount`) is preserved and the
retirement is reversible (an un-retire would need to explicitly set `next_due_at`; out of scope here, see
§6 of the reduction plan).

### #6's prerequisite moves from #2 to #1 (and STAYS on #1 after the 2026-07-09 amendment)

Before this ADR, `produce_form_from_meaning_cap`'s `prerequisiteKeys` pointed at #2's canonical key
(`recognise_form_from_meaning_cap`). With #2 retired, that prereq must be rewritten to #1's key — both in
the projector (new words) and via a one-off script pass over already-seeded rows (existing words) —
otherwise every not-yet-introduced #6 becomes permanently unintroducible
(`missing_prerequisite`, `src/lib/session-builder/pedagogy.ts:320`).

**2026-07-09 amendment note:** reinstating #2 does NOT move #6's prereq back to #2. The within-word phase
order (#1 P1 → #3 P2 → #2 P3 → #6 P4, via the `capabilityPhase` reorder) plus the Phase-≥3 staging gate
already sequences #2-before-#6 without a prereq edge, and rewriting the prereq back would be a second
full-corpus content UPDATE for no behavioural gain (Minimum Mechanism).

### Graduation — retire the MCQ scaffolds from review once #6 reaches mastery strength (Slice 2 + PR-A, this ADR's steady state)

Once `produce_form_from_meaning_cap` (#6) reaches a **recency-free mastery-strength bar** —
`reviewCount ≥ 4 ∧ stability ≥ 14 ∧ consecutiveFailureCount = 0` — **each of the two MCQ scaffolds** on the
same word, #1 (`recognise_meaning_from_text_cap`) and #2 (`recognise_form_from_meaning_cap`, reinstated
2026-07-09), is retired from *due scheduling*, converging the word to **2 lifelong cards** (#3 + #6). Both
rules share one predicate and one composition point (`graduation.ts`'s `GRADUATION_RULES` scaffold→successor
map — `#1 ← #6` shipped 2026-07-08, `#2 ← #6` added 2026-07-09 PR-A); #1's rule is UNCHANGED by the
amendment (the `#1 ← (#3′ ∨ #6)` OR-repoint is a separate, later PR-B change gated on #3's typed-recall
conversion — see the amendment note below). The bar is deliberately the recency-free core of
`isCapabilityMastered` (`src/lib/analytics/mastery/mastered.ts:24-32`), not the full predicate: the full
predicate additionally requires `lastReviewedAt` within 30 days, and a mature #6's FSRS interval routinely
exceeds 30 days between its own reviews — using the full predicate would flicker the scaffold in and out of
"graduated" every time #6's interval passed the 30-day mark, oscillating instead of converging. A failure
(`consecutiveFailureCount > 0`) breaks the strength predicate immediately and the scaffold re-enters the
queue for free (the rule is stateless — no stored "graduated" flag to reconcile).

Graduation applies to **due scheduling only** (not introduction, per §4.3 of the shipped spec — see
"Considered options" below): #1/#2 stay reachable via the explicit lesson-practice pass; only due-queue
membership is suppressed. #3 and #6 are never suppressed.

### Maintenance-ceiling rationale

At 2,359 live words: 6 modes ≈ 30–40 maintenance reviews/day at maturity (dwarfing a 25-card
`preferredSessionSize`). Two acquisition states have existed so far: the 2026-07-08 3-mode state (roughly
half the original load), and the 2026-07-09 four-card-ladder amendment's **4-mode introduced state**
(`+~33%` intro load over the 3-mode state — the accepted acquisition cost of the reinstated #2 scaffold).
**At-rest is UNCHANGED by the amendment**: once both #1 and #2 graduate, a word converges to the same
**2 lifelong cards ≈ 10–13 reviews/day** for the full corpus — comfortably inside a single session, because
graduation always sheds every MCQ scaffold, regardless of how many were introduced. The 4→2 convergence is
gradual (months, as #6 cards individually cross the strength bar), so the ceiling is reached progressively,
not as a step function; the acquisition-phase cost is reviewed at the ~2026-07-23 checkpoint (see the
amendment note below).

### Slice 3 — Analytics: subsumption + stability-scaled recency (`get_lessons_overview`)

Graduation (previous section) creates two analytics problems the mode-set reduction itself did not, both
fixed together in Slice 3 of the reduction plan (§5) because the staff-engineer review established the
second is load-bearing, not "eventual" — at full convergence every word rests as 2 long-interval cards, and
without the fix below BOTH would age out of the mastered numerator, reading as ~0% mastered on the exact
lessons where graduation succeeded:

- **Numerator subsumption.** Once #1 is retired from due scheduling, its OWN `learner_capability_state`
  stops accumulating recent reviews — a fixed "count only #1 rows that are themselves mastered" numerator
  would make lesson `% mastered` *regress* as words graduate. Fix: a `vocabulary_src`
  `recognise_meaning_from_text_cap` row also counts as mastered when its same-`source_ref`, same-lesson,
  non-retired `produce_form_from_meaning_cap` sibling meets the RECENCY-FREE strength predicate (the same
  bar graduation itself uses — `hasMasteryStrength`, no `lastReviewedAt` term, for the same flicker-avoidance
  reason). Scoped to `get_lessons_overview` only (Minimum Mechanism): `_mastery_label` (used by
  `get_weekly_movement` / `get_collections_overview`) is deliberately left unchanged — a fast weekly pulse and
  a "known words" reading list don't carry the same persistent, always-visible % that a lesson tile does, so
  the same regression there is lower-stakes and out of scope until it visibly matters.
- **Stability-scaled recency window.** Independent of graduation, ANY mature card's FSRS interval can exceed
  30 days between reviews — a fixed 30-day "recently reviewed" window would misreport it as unmastered on
  every session where it isn't due. Fix: `ageDays ≤ max(30, 2 × stability)` — a card mid-interval reads as
  "maintained"; only a card overdue by more than a full extra interval reads as "abandoned". This propagates
  automatically to every consumer of `isCapabilityMastered`/`isRecent` (TS side); on the SQL side it is
  likewise scoped to `get_lessons_overview` only, for the same reason as above.

Both are guarded by `scripts/__tests__/lessons-overview-mastery-parity.test.ts` (ADR 0015 TS↔SQL lockstep)
plus a live authenticated-role execution test (`scripts/verify-lessons-overview-rls.ts`) — the subsumption
clause is a correlated read of a sibling's RLS-protected row inside a SECURITY INVOKER function, and a
static source-string parity test cannot distinguish "wired correctly" from "silently RLS-denied, always
false".

## Considered options

- **Suppress the dropped modes' *scheduling* only, leave them seeded** — rejected. It leaves the 12k
  existing over-scheduled caps in place for already-introduced words (the majority of the near-term
  backlog), so it would not unclog the frozen frontier; a stateless suppression rule also has to be
  re-evaluated on every session build forever, versus a one-time retirement that fixes the data. The
  reduction plan's rejected-alternatives table (§8) also notes this modeled "0 due today" impact was the
  weaker option honestly compared against retirement.
- **A stored per-learner "graduated" state machine** for the #1→#6 handoff — rejected. The strength
  predicate is stateless and gives lapse-reversal for free; a stored flag would need its own reconciliation
  path for the exact lapse case the stateless rule handles automatically.
- **Suppress introduction of #1 for placement-seeded words already at #6 strength** — rejected (an earlier
  draft included this). It creates a real edge: a placement-seeded word that is also a morphology root
  would leave #1's key permanently absent from `satisfiedKeys`, blocking the derived form's cross-prereq
  (`affixedCapabilities.ts:49-57` + `pedagogy.ts:320`) — for one saved review per placement-seeded word.
  Without it, #1 is introduced once, its first success satisfies the prereq, and due-suppression retires it
  from then on; the system self-resolves.
- **A forced new-material session-floor** (reserve slots for intake regardless of due load) — rejected;
  fights FSRS and diverges. Bounding per-word cost lets `openSlots` self-pace correctly instead.
- **Keep 6 modes, rely on `openSlots` tuning alone** — rejected; diagnosed as treating the symptom
  (intake policy) rather than the cause (unbounded per-word cost — see review-brief §1).
- **(2026-07-09) Ship the four-card ladder as a single combined PR** — rejected; sequenced into PR-A
  (mode-set + graduation rule, this amendment), PR-B (#3 typed-recall conversion + the `#1 ← (#3′ ∨ #6)`
  repoint), PR-C (analytics subsumption). Repointing #1's graduation trigger at #3′ before #3′'s format
  actually changes would graduate #1 on MCQ-earned strength, then flicker once PR-B lands — the sequencing
  constraint that forces PR-A/PR-B apart (`docs/plans/2026-07-09-vocab-four-card-ladder.md` §2.4).
- **(2026-07-09) Ship 3 cards now, add #2 back only after empirical evidence of under-acquisition** —
  rejected by the owner in favor of shipping the four-card ladder immediately with a pre-agreed ~2-week
  reversal checkpoint; both directions are one flag-flip apart (`scripts/retire-dropped-vocab-modes.ts` /
  `scripts/unretire-vocab-mode.ts`), so the cost of being wrong in either direction is low.

## Consequences

- **Content retirement, not a schema change.** `learning_capabilities.retired_at` + `prerequisite_keys`
  are existing columns; Slice 1 is a one-off UPDATE script (DB-authoritative-after-seeding, ADR 0011), not
  a migration.
- **Analytics denominator shrinks with the numerator together (Slice 1).** `get_lessons_overview`'s
  `% mastered` computation (`scripts/migration.sql`) filters `retired_at IS NULL` for both mastered-count
  and ready-count, so retiring #2/#4/#5 removes them from both sides — no separate analytics fix needed for
  Slice 1. Slice 2's graduation (numerator shrinks, denominator doesn't) is a distinct, later problem —
  see "Slice 3 — Analytics" above for the subsumption + stability-scaled-recency fix. **2026-07-09
  amendment:** un-retiring #2 (`scripts/unretire-vocab-mode.ts`) symmetrically reverses this for #2 —
  it re-enters both the numerator and denominator together, so lesson `% mastered` dips by #2's
  not-yet-mastered share (denominator +1/word) until #2s are learned or graduated — named, accepted, same
  shape as the four-card-ladder spec's §2.5 "Denominator effect of #2's return" note (that section's
  `#2 ← #6` subsumption pair is PR-C, not this amendment).
- **Every future new lesson mints 4 caps/word (amended 2026-07-09; was 3 caps/word after the 2026-07-08
  trim, 6 before that)**, from the moment the projector re-emits #2 — the defect the original trim fixed
  (an uncoordinated mode-set) cannot regrow via ordinary re-publish, because `KEPT_VOCAB_CAP_TYPES` remains
  the single source of truth for the projector, the second `capabilityCatalog.ts` definition, and both
  one-off scripts.
- **Distractor/junction child rows** of retired caps are preserved-but-unread (soft-retire only UPDATEs;
  `distractors.capability_id` never CASCADEs).
- **No code removal, and — as of the 2026-07-09 amendment — no code ADDITION either, for PR-A specifically**
  in the exhaustive switches / render contracts that still enumerate the dropped types
  (`deriveSkillTypeFromCapabilityType`, `RENDER_CONTRACTS`) — legacy rows exist in history and the types
  remain valid `CapabilityType` union members; only the *emission* stops (or, for #2, resumes). #2 already
  has a live `RENDER_CONTRACTS` entry (`choose_form_ex`, `src/lib/capabilities/renderContracts.ts:89`) from
  before its 2026-07-08 retirement, so PR-A's reinstatement needs zero render-contract changes. **This
  consequence stops being fully true for the wider four-card-ladder PROGRAM once PR-B lands**
  (`docs/plans/2026-07-09-vocab-four-card-ladder.md` §2.3): converting #3 (`recognise_meaning_from_audio_cap`)
  to a typed meaning-from-audio card SPLITS its `RENDER_CONTRACTS` entry (shared today with the podcast
  `recognise_gist_from_audio_cap` contract) and adds a NEW `ExerciseType`, touching the full compile-forced
  gate list (`ExerciseType` union, `RENDER_CONTRACTS`, `ContractInputShapes`, `projectBuilderInput`, the
  byType packager, `exerciseSkeletonVariant`, `feedbackPropsFor`, `exerciseRegistry`, `needsPrimaryMeaning`).
  That is real, additive code — the consequence as originally written ("no code removal") was accurate for
  Slice 1 and remains accurate for PR-A, but would read as false reassurance if left uncaveated once PR-B is
  read as part of the same ADR's steady state.

## 2026-07-09 amendment — four-card ladder (`docs/plans/2026-07-09-vocab-four-card-ladder.md`)

Owner-decided 2026-07-09 after the mode-set reduction shipped and a design dialogue on uncued retrieval:
**every lifelong card should be uncued (MCQ is guessable), and every direction should get an MCQ on-ramp
before it.** #1 already served this role for comprehension; #2's 2026-07-08 retirement left production
with no MCQ on-ramp at all — #6 (`produce_form_from_meaning_cap`) was introduced typed-and-uncued from the
first exposure. Reinstating #2 restores the comprehension/production symmetry: **#1 (learn, MCQ) → #3
(know, typed, forever)** for comprehension; **#2 (learn, MCQ) → #6 (know, typed, forever)** for production.

- **Decision:** ship the 4-card model now, not "3 cards, add #2 back only on evidence." Pre-agreed empirical
  checkpoint ~2026-07-23; pre-agreed reversal = re-retire #2 (`scripts/retire-dropped-vocab-modes.ts`'s
  shape) if acquisition load proves too heavy. Both directions are one flag-flip apart.
- **Cost:** acquisition +33% (3→4 cards/word); at-rest UNCHANGED (2 cards/word once both scaffolds graduate)
  — see the refreshed "Maintenance-ceiling rationale" above.
- **Sequencing (three PRs, staff-engineer):** PR-A (this amendment) = mode-set constant + projector +
  `capabilityCatalog.ts` mirror + `capabilityPhase` reorder + the un-retire script + the `#2 ← #6`
  graduation rule ONLY — the shipped `#1 ← #6` rule is untouched. PR-B = #3's typed meaning-recall
  conversion (render-contract split + new `ExerciseType`) + the `#1 ← (#3′ ∨ #6)` graduation repoint
  (repointing #1 before #3′'s format changes would graduate #1 on MCQ-earned strength, then flicker once
  PR-B lands). PR-C = analytics subsumption pairs become `(#1 ← #3′ ∨ #6)` and `(#2 ← #6)` in
  `get_lessons_overview` (extends the shipped `(#1 ← #6)` pair from "Slice 3 — Analytics" above).
- **Why the OR on #1 (PR-B, noted here for completeness):** listening-disabled users have #3′ stripped from
  the snapshot (`listeningFilter`), so a lane-pure #3′-only trigger would leave #1 — a cued MCQ — as their
  lifelong card, contradicting the model's thesis. With the OR, their #1 graduates via #6 and their set is
  {#1, #2 scaffolds} → {#6} forever — no `listeningFilter` change needed, the OR carries it.
