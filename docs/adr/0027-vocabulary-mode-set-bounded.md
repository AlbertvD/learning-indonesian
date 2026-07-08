# ADR 0027: The vocabulary capability mode-set is bounded to 3 introduced modes (2 at rest)

## Status

Accepted (2026-07-08). Slice 1 of `docs/plans/2026-07-08-vocab-mode-set-reduction-and-graduation.md`
(reviewed: staff-engineer, architect, data-architect — all PASS after corrections). Supersedes no prior
ADR; it narrows the per-facet model ADR 0003 established (cross-referenced there). Relates to ADR 0011
(capability content is DB-authoritative after seeding — the retirement mechanism this ADR reuses) and
ADR 0007 (receptive-before-productive staging — the reason #1 stays as the introduction vehicle).

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

**Bound the vocabulary mode-set to 3 introduced modes, permanently retiring 3, and graduate to 2 at
steady state.**

### The kept set (`KEPT_VOCAB_CAP_TYPES`, `src/lib/capabilities/vocabModeSet.ts`)

1. **`recognise_meaning_from_text_cap`** (#1, id→l1, `prerequisiteKeys: []`) — the root/scaffold. Kept as
   the single receptive introduction vehicle: low learning burden, MCQ-first exposure, unlocks the
   Phase-1/2 staging gate for every other mode on the word.
2. **`recognise_meaning_from_audio_cap`** (#3, audio→l1, prereq #1) — **never retired.** Aural
   comprehension is a distinct skill no text-modality card trains; there is no substitute mode for it in
   the kept set.
3. **`produce_form_from_meaning_cap`** (#6, l1→id, prereq #1) — **never retired.** The productive
   frontier; recall subsumes recognition, so this is the highest-value single card per word.

### The dropped set (`DROPPED_VOCAB_CAP_TYPES`, same module)

- **`recognise_form_from_meaning_cap`** (#2, l1→id MCQ/"choice") — same direction as #6 in a strictly
  weaker (multiple-choice) form; post-recall recognition drilling approximates Karpicke's inert
  repeated-study condition once #6 exists.
- **`recall_meaning_from_text_cap`** (#4, id→l1 typed recall) — transfer asymmetry means productive
  practice (#6) already strengthens receptive knowledge; receptive depth is additionally served outside
  the vocabulary capability entirely (the reader / Lezen, and dialogue cloze). Keeping #4 as a first
  exposure would also invert the learning-burden staging (typed recall is not a cheap Phase-1 entry).
- **`produce_form_from_audio_cap`** (#5, dictation) — approximated by #3 (aural decoding) + #6
  (orthographic production) combined; its marginal distinct contribution does not justify a third
  lifelong card.

Both constants are exported from one dependency-free module (no Supabase / browser-client imports, same
posture as `src/lib/analytics/mastery/mastered.ts`) so the projector (`projectors/vocab.ts`), the second
diagnostic definition (`capabilityCatalog.ts`), the one-off retirement script
(`scripts/retire-dropped-vocab-modes.ts`), and the structural health checks (HC-A/HC-B,
`check-supabase-deep.ts`) cannot define the 3-mode split independently and drift from each other.

### Retirement mechanism — reuse, not reinvent

The dropped modes are retired for **already-introduced words too** (not just suppressed going forward),
using the existing soft-retire seam (`softRetireCapabilities`,
`scripts/lib/pipeline/capability-stage/adapter.ts`): `retired_at = now()` + the companion
`learner_capability_state.next_due_at` clear (HC14). This is what makes the change a near-term unclog
rather than a slow drift — retiring in place removes ~40–55% of the sampled due-now vocab backlog
immediately. FSRS history (`stability`/`difficulty`/`lapseCount`/`reviewCount`) is preserved and the
retirement is reversible (an un-retire would need to explicitly set `next_due_at`; out of scope here, see
§6 of the reduction plan).

### #6's prerequisite moves from #2 to #1

Before this ADR, `produce_form_from_meaning_cap`'s `prerequisiteKeys` pointed at #2's canonical key
(`recognise_form_from_meaning_cap`). With #2 retired, that prereq must be rewritten to #1's key — both in
the projector (new words) and via a one-off script pass over already-seeded rows (existing words) —
otherwise every not-yet-introduced #6 becomes permanently unintroducible
(`missing_prerequisite`, `src/lib/session-builder/pedagogy.ts:320`).

### Graduation — retire #1 from review once #6 reaches mastery strength (Slice 2, this ADR's steady state)

Once `produce_form_from_meaning_cap` reaches a **recency-free mastery-strength bar** —
`reviewCount ≥ 4 ∧ stability ≥ 14 ∧ consecutiveFailureCount = 0` — the scaffold (#1) is retired from *due
scheduling and introduction*, converging the word to **2 lifelong cards** (#3 + #6). The bar is
deliberately the recency-free core of `isCapabilityMastered`
(`src/lib/analytics/mastery/mastered.ts:24-32`), not the full predicate: the full predicate additionally
requires `lastReviewedAt` within 30 days, and a mature #6's FSRS interval routinely exceeds 30 days between
its own reviews — using the full predicate would flicker the scaffold in and out of "graduated" every
time #6's interval passed the 30-day mark, oscillating instead of converging. A failure
(`consecutiveFailureCount > 0`) breaks the strength predicate immediately and the scaffold re-enters the
queue for free (the rule is stateless — no stored "graduated" flag to reconcile).

Graduation applies to **scheduling only**: #1 stays reachable via the explicit lesson-practice pass; only
due-queue membership and new-capability introduction are suppressed. #3 and #6 are never suppressed.

### Maintenance-ceiling rationale

At 2,359 live words: 6 modes ≈ 30–40 maintenance reviews/day at maturity (dwarfing a 25-card
`preferredSessionSize`); 3 modes (this ADR's introduced state) roughly halves that; 2 modes at full
graduation ≈ 10–13 reviews/day — comfortably inside a single session. The 3→2 convergence is gradual
(months, as #6 cards individually cross the strength bar) so the ceiling is reached progressively, not as
a step function.

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

## Consequences

- **Content retirement, not a schema change.** `learning_capabilities.retired_at` + `prerequisite_keys`
  are existing columns; Slice 1 is a one-off UPDATE script (DB-authoritative-after-seeding, ADR 0011), not
  a migration.
- **Analytics denominator shrinks with the numerator together.** `get_lessons_overview`'s `% mastered`
  computation (`scripts/migration.sql`) filters `retired_at IS NULL` for both mastered-count and
  ready-count, so retiring #2/#4/#5 removes them from both sides — no separate analytics fix needed for
  Slice 1. Slice 2's graduation (numerator shrinks, denominator doesn't) is a distinct, later problem
  handled by Slice 3's subsumption rule — out of this ADR's Slice-1 scope but documented here because it
  is the natural continuation of the same mode-set-bounding idea.
- **Every future new lesson mints 3 caps/word, not 6**, from the moment the projector trim lands — the
  defect cannot regrow via ordinary re-publish.
- **Distractor/junction child rows** of retired caps are preserved-but-unread (soft-retire only UPDATEs;
  `distractors.capability_id` never CASCADEs).
- **No code removal** in the exhaustive switches / render contracts that still enumerate the dropped
  types (`deriveSkillTypeFromCapabilityType`, `RENDER_CONTRACTS`) — legacy rows exist in history and the
  types remain valid `CapabilityType` union members; only the *emission* stops.
