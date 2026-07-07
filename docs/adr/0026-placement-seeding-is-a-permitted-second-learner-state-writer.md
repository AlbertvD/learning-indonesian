# ADR 0026: Placement Seeding Is A Permitted Second Learner-State Writer

## Status

**Accepted (2026-07-07) — ratified by the owner**, who confirmed the anti-churn value of pre-seeding a heritage learner's known words justifies the carve-out (the alternative — activation-only, re-grinding hundreds of known words — was explicitly considered and declined). This ADR was §7.4's ratification gate for Bet-1 slice 2 (the placement probe): `docs/plans/2026-07-06-loanword-bridge-placement-onboarding.md`. Review lineage: **`architect` APPROVED the scoping** (r2), **`data-architect` co-signed the seed shape** (the §4.3 seed table *is* their specification). Implementation still gated only on §7.5 (derive the frozen FSRS constants from the live engine + the golden round-trip test), which is implementation-time work, not a decision. Slice 1 (the loanword bridge) shipped independently 2026-07-07 and has no dependency on this ADR.

## Context

**ADR 0004 reserves all learner-state writes to the Review Processor** (plus a migration-time admin backfill): *"Runtime app code must not write learner capability state or capability review events directly."* Its load-bearing payoff is **bug localization** — every transition of `learner_capability_state` flows through one seam, so review-state bugs have exactly one place to be.

The placement probe (slice 2) is a ~20–30-item adaptive staircase over the frequency bands. Its whole purpose is to let a **heritage learner / returner** (the Indo community, mixed NL-ID families) skip the regrind: someone who already knows ~400 words would otherwise meet all of them as brand-new cards at short intervals for weeks. To prevent that, placement must **pre-seed FSRS state** for words it judges known — which is a learner-state write, i.e. exactly what ADR 0004 forbids from anything but the Review Processor.

**Two ADR-0004-compliant alternatives were considered and rejected** (spec §4.4):

- **Mint-on-first-review (the reading-harvest precedent).** Harvest words are *new* to the learner, so minting state on their first real review is correct there. Placement words are *claimed-known* — mint-on-first-review reproduces the exact regrind this feature exists to prevent. Same eligibility-gate problem, opposite knowledge state.
- **Replay the probe answers through `commit_capability_answer_report`.** This can only cover the ~20–30 **tested** items, not the inferred fully-cleared **bands** — a silent shrinking of the deliverable (goal-erosion). And fabricating commit *events* for the untested inferred words would **corrupt the event log's meaning** — every `capability_review_events` row is, by contract, a real learner answer — which is *worse* for data honesty than a flagged, reversible state row.

So placement needs a genuine, tightly-scoped exception to ADR 0004 — not a loophole, a named carve-out with an invariant that *preserves* ADR 0004's guarantee.

## Decision

**Placement seeding is a permitted *second* writer of `learner_capability_state`**, scoped to exactly the following and nothing more:

1. **One RPC.** A single `SECURITY DEFINER` function `apply_placement_result(p_band_slugs text[], p_known_texts text[])`, `auth.uid()`-scoped (no `user_id` argument), one transaction. It resolves band slugs → collection ids and calls the existing `set_collection_activation` RPC per band (never a hand-rolled `learner_collection_activation` writer), then seeds FSRS state for judged-known words. Seeding alone schedules nothing — the activation half is what makes the words eligible.
2. **Insert-only / only-if-absent.** The RPC inserts a `learner_capability_state` row **only where none already exists** for that `(learner, capability)`. It **never updates** an existing row. A learner who has already reviewed a word keeps their real history untouched.
3. **The §4.3 seed shape** (data-architect-specified): `activation_source='placement'`, `review_count=3` (lands in `'strengthening'` in both mastery readers — never `'introduced'`, never `'mastered'`), `last_reviewed_at = NULL`, `next_due_at = now() + jitter`, and **frozen, version-pinned** `stability`/`difficulty` constants derived once from the real FSRS engine and tied to `fsrsAlgorithmVersion` (never re-implemented in PL/pgSQL). `fsrs_state_json` mirrors these so the existing generic read-and-resubmit commit path round-trips with zero placement-specific client code.
4. **Reversibility predicate.** `delete from learner_capability_state where activation_source='placement' and last_reviewed_at is null` matches exactly the rows never genuinely reviewed. `last_reviewed_at` flips exactly once, irreversibly, on the first real commit — the honesty + reversibility key.
5. **No `capability_review_events` writes, ever.** The event log stays **exclusively Review-Processor-owned**. Placement writes state rows only; it fabricates no events.

### The load-bearing invariant

> **Placement CREATES initial rows only; it never MUTATES an existing row. The Review Processor remains the sole mutator of `learner_capability_state`.**

This is what preserves ADR 0004's bug-localization guarantee. The two writers operate on **disjoint row-states**: placement only ever brings a `(learner, capability)` pair from *no row* to *one clean seeded row*; every subsequent transition of that row — and every transition of any row that already exists — still flows through the Review Processor's single seam. So "why is this review state wrong?" still has exactly one answer path (the Review Processor), because placement can only have created a well-formed initial row, never transitioned one. Provenance is carried by `activation_source='placement'`, which is **sticky forever** (the commit RPC's `coalesce` never overwrites it) and must **not** be read as "still unreviewed" — `last_reviewed_at IS NULL` is the unreviewed signal.

## Consequences

- **Heritage learners skip the regrind.** Claimed-known words enter as `'strengthening'`, scheduled at a real (jittered) interval instead of as new cards. Mastery is still *earned* by real reviews — `review_count=3` can never read as `'mastered'` (which needs ≥4 real reviews).
- **Fully reversible until first real use.** A retake can only *add* rows (only-if-absent), never overwrite real history; the `last_reviewed_at IS NULL` predicate cleanly removes every un-reviewed seed. No `placement_runs` audit table is needed (reversibility + provenance come from the row itself).
- **ADR 0004's guarantee is preserved, not weakened.** Bug localization holds because create-only and mutate-only are disjoint operations on disjoint row-states; the event log's "every event is a real answer" invariant is fully intact.
- **This is the second — and, by intent, the last — permitted learner-state writer.** Any *third* writer, or any attempt to let placement *update* an existing row, requires its own ADR. The carve-out is deliberately narrow.
- **Guardrails required before merge** (spec §4.5 / §7.5): a golden round-trip test (seeded row → one real "Good" review → no stability cliff, engine continues from the seeded stability/difficulty) and a frozen-constants version-pin test that fails if `fsrsAlgorithmVersion` changes without re-deriving the constants. The `activation_source` CHECK gains `'placement'`; `check-supabase-deep` asserts the CHECK includes it and that `anon` has **no** execute grant on the RPC.
- **Read-models need zero new branches** (data-architect): the analytics readers already treat a `'strengthening'`/practiced row correctly, and the event-driven series stay invisible to seeds until a real review lands.

## Related

- [ADR 0004: Capability review commits are atomic and idempotent](./0004-capability-review-commits-are-atomic-and-idempotent.md) — the invariant this ADR carves an exception into; **superseded-in-part by this ADR** for the create-only placement path (see the back-link there).
- `docs/plans/2026-07-06-loanword-bridge-placement-onboarding.md` §4.2–§4.5, §7.4–§7.5 — the placement-probe design, the seed shape, and the two remaining slice-2 gates (this ADR + the frozen-constants derivation).
- Memory `project_loanword_bridge_placement_onboarding` — program state; records this ADR as the slice-2 ratification gate.
