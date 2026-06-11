# ADR 0016: Mastery-rung history is derived from the review-event log, not snapshotted

## Status

Accepted. Not yet implemented — informs the analytics learner-progress redesign
(design in progress; the two-axis "practice time + mastery progression" model and
its weekly movement signal). Complements ADR 0015 (read-model aggregation runs
server-side) and ADR 0011 (capability content is DB-authoritative after seeding).

## Context

The learner-progress redesign surfaces a **mastery movement** signal — *"N items
advanced a rung this week"* (plus *"M reached `mastered`"*, *"K slipped to
`at_risk`"*) — as the fast pulse on an otherwise slow axis (`mastered` is
deliberately slow: `reviewCount ≥ 4` AND `stability ≥ 14d` AND recent, per
CONTEXT.md → Mastered). To compute movement we need each capability's **rung at
two points in time** and a count of upward transitions in a window.

That raises a storage question: where does the *historical* rung come from?

- **Snapshot it going forward.** Add a `label_history` (or per-commit `label`
  column) that records each capability's rung at every review-commit, then read
  rows back. Implies a new write obligation on the commit path and a growing
  history table.
- **Derive it from data we already store.** `capability_review_events` is an
  **append-only log** (ADR 0004): every row already persists the full FSRS state
  **before and after** that review — `state_before_json` / `state_after_json`,
  each carrying `reviewCount`, `stability`, `lapseCount`,
  `consecutiveFailureCount`, `lastReviewedAt` (migration.sql, the commit RPC).
  The rung is a **pure function** of exactly those fields
  (`labelForCapability`, `src/lib/analytics/mastery/masteryModel.ts:169-177`).
  So `label_before = labelForCapability(state_before_json)` and
  `label_after = labelForCapability(state_after_json)` are recomputable today,
  retroactively, over every review since launch — with **zero new capture**.

The initial instinct ("we need to start tracking historical data") is the reason
this is worth writing down: the history *already exists* in the event log; the
rung was never stored because it was never needed to be — it is cheaper to
recompute a pure function than to persist and maintain its output.

## Decision

**Mastery-rung history — and the weekly movement signal built on it — is derived
by recomputing `labelForCapability` over the `state_before_json` /
`state_after_json` already stored on each `capability_review_events` row. We do
NOT add a `label_history` table or a per-event `label` column.**

- A *rung-up this week* = an event whose `created_at` falls in the window and for
  which `rank(label_after) > rank(label_before)`. The query is **bounded to one
  window of events** — each event is self-contained, so no full-history scan is
  needed.
- Consistent with ADR 0015, the aggregation runs **server-side** (a Postgres
  analytics function over the window), returning small results. If the rung
  predicate is mirrored into SQL there, it carries ADR 0015's parity-test
  obligation against the TS `labelForCapability`.

## Considered alternatives

- **Snapshot a `label_history` row on every review-commit.** *Rejected:* a new
  write-path obligation on the hot commit path plus a monotonically growing
  table, to persist the output of a pure function whose inputs are *already*
  persisted. It also **freezes** historical labels at the then-current
  definition — so a future threshold change would leave history inconsistent with
  the live ladder.
- **Store the computed `label` as a column on each event at commit time.**
  *Rejected for the same freezing reason* plus commit-path coupling: the event
  writer would have to import the analytics label rules. Derivation keeps the
  scheduling/commit path ignorant of the analytics vocabulary.
- **Materialise a denormalised weekly `learner_rung_movement` rollup now.**
  *Rejected as premature* (mirrors ADR 0015's stance): it is live-system
  write-path machinery the Operating Context says to defer pre-launch, and it is
  a clean drop-in behind the same analytics-function contract later **if**
  profiling ever shows the bounded recompute is too slow.

## Consequences

- The weekly movement signal, and any historical rung analytics, are **read-side
  recomputations** over the existing event log. No `label_history` table exists,
  **by design** — a future reader who goes looking for one should find this ADR
  instead.
- Because the rung is always recomputed with the **current** definition, history
  reinterprets consistently when the ladder thresholds change. Upside: no stale
  frozen labels. Caveat to accept: a "moved up this week" number can shift if the
  `labelForCapability` thresholds are later changed — acceptable for a
  motivational signal, and preferable to a history that disagrees with the live
  ladder.
- **Only upward movement and lapse-slips are event-coincident and therefore
  visible.** A `mastered` item going stale (un-reviewed > 30d) drops a rung with
  *no review event*, so staleness-decay is invisible to event-derived
  transitions. This is fine: "advanced a rung" (upward) and "slipped to
  `at_risk`" (a failed review) both coincide with events; staleness-decay is a
  separate, non-celebrated drift that the static funnel already reflects.
- The cheapest-mechanism rule (CLAUDE.md → Minimum Mechanism) is honoured: a pure
  recompute over already-persisted inputs beats a new write path + table.
