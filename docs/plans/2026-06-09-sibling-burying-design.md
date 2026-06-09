---
status: shipped
reviewed_by: [architect]
data_architect: N/A — read-only; no schema/migration/grant/writer-reader-validator change (one SELECT on existing owner-readable capability_review_events, resolved in memory)
implementation: PR #185
merged_at: 2026-06-09
implementation_paths:
  - src/lib/session-builder/siblingBury.ts
  - src/lib/session-builder/builder.ts
  - src/lib/session-builder/adapter.ts
amended_by: docs/plans/2026-06-09-sibling-bury-before-allocate-fix.md
---

> **Amendment (2026-06-09):** the **new-introduction** bury position shipped here
> was wrong — it trimmed the *post-budget* eligible list, so when the top-ranked
> candidates were all today's-word siblings the session collapsed to zero instead
> of filling from the next-ranked new words. Corrected to run **inside
> `planLearningPath`, before `allocateBudget`** (session-size is the hard
> contract). The due/practice bury described below is unchanged. See
> `docs/plans/2026-06-09-sibling-bury-before-allocate-fix.md`.

# Sibling burying — one capability per word per day

## Goal

Stop the **six capabilities of a single word** (`text_recognition`, `audio_recognition`, `meaning_recall`, `l1_to_id_choice`, `form_recall`, `dictation` — all sharing one `source_ref`, e.g. `learning_items/paman`) from clustering into the learner's day. Enforce **at most one capability per `source_ref` per learner per calendar day**, across all sessions, for both due reviews and new introductions. Buried siblings stay overdue/dormant and resurface a later day.

This is the structural half of the "same words scheduled too closely together" problem. The FSRS half (same-session learning/relearning recycles) shipped in `docs/plans/2026-05-21-fsrs-config-tuning.md` (PR #184). FSRS now scatters a word's caps onto independent multi-day intervals, but they still start clustered at introduction and the learner does many short sessions per day — so per-session spacing alone does not de-cluster the *day*. Sibling burying does.

### Why this is the right lever (evidence)

- **Spacing effect.** Cepeda et al. (2006), 839 assessments: distributed practice beats massed across ages/materials/intervals; same-day repetition of related material shows steep diminishing returns.
- **Sibling-specific interference / priming.** A word's caps share meaning, so reviewing `paman→uncle` then `uncle→paman` (or its dictation) the *same day* lets the first **prime** the second — recall becomes artificially easy (echo, not retrieval from long-term memory). A ≥24h gap restores genuine retrieval. This is Anki's stated rationale for burying siblings across days (default behaviour), and is stronger than the generic spacing argument because it is about cued interference between related items, not just repetition timing.
- **Caveat (honest).** For adults *acquiring new* material, within-session massing is less harmful than for children (Cepeda 2008). That caveat is about acquisition, not sibling interference during review, which holds regardless of age. We still bury new-introduction siblings (per Anki default) for the day-declustering and rollout-pacing benefits, but this is the weaker of the two evidentiary legs.

## Plan grounding

Per `CLAUDE.md` § Quality Over Speed, every touched surface audited against the target architecture and the matching module spec.

| Surface | Target architecture reference | Module spec reference | Lands at the right seam? |
|---|---|---|---|
| `src/lib/session-builder/builder.ts` (selection passes) | `docs/target-architecture.md:342-391` (`lib/session-builder/`, **LOCKED**, pure read: "no DB writes, no side effects, no identity minted", line 344) | `docs/current-system/modules/session-builder.md` §3.2 (three passes), §4 (invariants) | Yes. Burying is a pure read-side suppression in the selection passes. It adds no write, mints no identity, and preserves determinism — fully inside the LOCKED module's contract. |
| `src/lib/session-builder/adapter.ts` (Supabase reads → snapshot) | `docs/target-architecture.md:344` (adapter reads), `:379` ("FSRS due-filtering — delegated to analytics.upcoming.dueCapabilities") | `docs/current-system/modules/session-builder.md` §3.1 (four parallel reads) | Yes. Adds a fifth read (today's reviewed `source_ref`s). The target folds due-filtering into `analytics.upcoming` eventually; this read travels with the eligibility inputs when that fold happens. No constraint against it in the target. |
| `src/lib/session-builder/dueFilter.ts` / a new `siblingBury.ts` | n/a (implementation files of the LOCKED module) | `docs/current-system/modules/session-builder.md` §file table | New pure helper in the module, consumed only by `builder.ts` — mirrors the existing `drying.ts` / `dueFilter.ts` shape. |
| `learner_capability_state`, `capability_review_events`, `learning_capabilities` | `docs/target-architecture.md:1114` ("session-builder … read the resulting state; they never write it") | data-model.md | **Read-only.** No schema change, no write, no migration. The new query reads `capability_review_events` (already owner-readable) joined to `learning_capabilities`. |

**No constraints found in the target architecture against adding a read-side sibling-suppression at the session-builder selection seam.** The target's existing composer post-pass `interleaveBySourceRef` (module spec §3.5) already establishes `source_ref` as the in-session spacing key and cites the spacing literature (Karpicke 2009) — this plan extends the same principle from *within-session ordering* to *across-day membership*.

**Data-architect review:** not required. This plan adds no schema, no typed-content-table write, and no change to any writer/reader/validator *shape* — it adds one read of an existing table. `architect` (module placement / seam / invariant fit) is the relevant reviewer.

## Design

### Definition

- **Sibling.** Two capabilities are siblings iff they share a `source_ref`. The sibling key is `source_ref` (e.g. `learning_items/paman`). Every projected capability carries a non-null `sourceRef` (`ProjectedCapability.sourceRef: string`, `capabilityTypes.ts:166`, populated from `row.source_ref` at `adapter.ts:119`) — there is **no null case**, so burying applies uniformly to every candidate. It is correct for every source kind: an `item` word has ~6 siblings; a `pattern` has 2 (`pattern_recognition` + `pattern_contrast`); an `affixed_form_pair` has 2; a `dialogue_line` has 1 (so it's never buried — it always wins its own slot). No source-kind carve-out is needed **and podcasts are safe by construction**: `podcast_segment` / `podcast_phrase` caps are `exposure_only` (`capabilityContracts.ts:15-18,49-50`), so they never reach `readiness:'ready'` and are filtered out of all three selection passes before burying runs (confirmed `capabilitySessionLoader.test.ts:430-433`). Uniform burying therefore only ever sees `ready` schedulable caps, every one of which has a meaningful non-null `source_ref`.
- **Burying.** Excluding a sibling from selection because another sibling of the same `source_ref` has already won the day (either reviewed earlier today, or selected earlier in this build). Buried ≠ rescheduled: no state is written; the cap simply isn't offered today and remains overdue/dormant for a later day.
- **Day.** Local calendar day. `now` is `new Date()` constructed browser-side at the call site (`Session.tsx:114`), so it is already the learner's local wall-clock instant; derive local midnight from it and compare against its UTC instant (`capability_review_events.created_at` is `timestamptz`, `migration.sql:1308`).

### Mechanism (pure read)

**Adapter — one new read, resolved in memory (no JOIN, no embed, no index dependency).** Add a fifth parallel read inside `loadCapabilitySessionData` that selects only the minimal columns from today's review events:

```
capability_review_events?select=capability_id&user_id=eq.<userId>&created_at=gte.<localMidnight>
```

Then resolve each `capability_id → source_ref` **in memory** using the `capabilityById` map the adapter already builds locally (`adapter.ts:259`), and collect the distinct `source_ref`s into `reviewedTodayRefs: Set<string>` on the snapshot. (A `capability_id` reviewed today but no longer ready/published won't be in `capabilityById`; skip it — it can't be a candidate anyway.)

Rationale for in-memory over a DB `JOIN`/embed: the Supabase client can't `JOIN`; an embed would couple to `learning_capabilities` and tempt an index dependency. Resolving in memory needs **no new index** — the `user_id` + `created_at` filter over a ~1.1k-row table is trivial — and keeps this spec strictly read-only with no `scripts/migration.sql` change, which is what preserves the *data-architect-not-required* property. If the review-event table grows large enough to matter, a `(user_id, created_at)` index can be added to the canonical `scripts/migration.sql` as a separate, isolated change; it is **not** needed now and this plan does not assert one exists.

**Builder — thread a `usedRefs` set through the three passes.** A pure helper:

```ts
// siblingBury.ts
export function buryThinSibling<T extends { sourceRef: string }>(
  candidate: T,
  usedRefs: Set<string>,
): boolean   // returns true = keep (and records ref), false = bury
```

Applied in `loadCapabilitySessionPlan` (`builder.ts:208-338`), seeding `usedRefs` from `reviewedTodayRefs`:

1. **Pass 1 — due** (`builder.ts:244-270`). The due list is already sorted most-overdue-first by `getDueCapabilities` (`dueFilter.ts:66`, `nextDueAt` ascending). Walk it; keep the first cap per `source_ref` not in `usedRefs`, record its ref; bury the rest with a `sibling_buried` resolution/suppression entry. → the **most-overdue** sibling wins (FSRS priority). **Implementation trap:** the bury must be applied to `dueCapabilities` (or the array whose `.length` is read) *before* line 317, where `dueCount: dueCapabilities.length` feeds the budget. Burying after `dueCount` is read would break the freed-slot coupling below. State this in the implementation plan.
2. **Pass 2 — practice review** (`builder.ts:272-311`, lesson-scoped modes only). Same walk, continuing the same `usedRefs`.
3. **Pass 3 — new introductions** (`builder.ts:313-337`). The planner's `prioritize` already orders candidates lesson-major + receptive-phase-first. Apply the same `usedRefs` filter so only one new cap per word per day survives — the **lowest-phase (most foundational)** sibling wins (recognition before recall).

**`source_ref` per candidate.** Resolved via `input.capabilitiesByKey.get(canonicalKey).sourceRef` (verify `ProjectedCapability` carries `sourceRef`; if not, parse from `canonical_key`, which embeds it: `cap:v1:item:learning_items/paman:...`). This is the one fact the implementer must confirm against the code — flagged in Open Questions.

### Budget interaction — sessions stay full of *distinct* words

Burying pass 1 **before** the planner runs means `dueCount` (passed at `builder.ts:317` as `dueCapabilities.length`) reflects the post-bury count. Since `openSlots = max(0, preferredSessionSize − dueCount)` (`loadBudget.ts`), a buried due sibling raises `openSlots` by one, and the planner fills that slot with **another word's** new introduction. Net: a buried sibling is replaced by a *different* word, not left as a gap. Session length holds; word-variety rises. This is the one place burying touches existing logic, and it is the desired coupling.

### Invariants preserved

- **Pure read.** No write, no schema change. The LOCKED module's core invariant holds.
- **Determinism.** `reviewedTodayRefs` is a function of DB state + `now`; the `usedRefs` walk is order-deterministic (passes run in fixed order; within a pass candidates are already deterministically sorted). Same inputs → same output.
- **No identity minted.** Unchanged.
- **Degradation, not error.** A buried cap produces a diagnostic-style suppression entry, never throws — same posture as `resolveCandidate` failures.

### Relationship to existing `interleaveBySourceRef`

The composer's `interleaveBySourceRef` (`compose.ts:107-115`; module spec §3.5, §4 invariant line 331) spaces *already-selected* blocks by `source_ref` within a 3-preceding-block window (greedy single-pass, nearest-later-block swap). Sibling burying operates one level up — it governs *which* caps are selected at all. With burying enforcing ≤1 cap per `source_ref` per day, **within a single session there is at most one cap per word**, so the interleave post-pass becomes largely a no-op for item-siblings (it still spaces caps that share a `source_ref` across *different* days' carryover, and still spaces non-item source kinds). Keep it — it is cheap and still covers the residual cases; do not delete it as part of this change (separate concern).

## Edge cases

- **Word with one due cap** (or any single-sibling source, e.g. `dialogue_line`) → it wins; unaffected.
- **Tiny due backlog** (current state post-FSRS-fix) → burying rarely fires; harmless.
- **Lesson-scoped modes** (`lesson_practice` / `lesson_review`) → burying still applies (a lesson's word can still have multiple caps due). No mode carve-out.
- **Multiple sessions same day** → `reviewedTodayRefs` carries the suppression across them, which is the whole point.
- **A cap reviewed today then re-due later today** (possible only under very short intervals) → suppressed by `reviewedTodayRefs`. Correct.

## Testing

Pure-function unit tests (`siblingBury.test.ts`):
- Multiple due siblings, empty `usedRefs` → first kept, rest buried.
- `source_ref` already in `reviewedTodayRefs` → all its caps suppressed.
- Ordering: most-overdue due sibling wins; lowest-phase new sibling wins.

Builder integration tests (extend existing `builder` tests):
- Buried due sibling raises `openSlots` → a distinct word's new intro fills the slot (session size preserved, variety up).
- Determinism: identical snapshot + `now` → identical plan.

Adapter test:
- `reviewedTodayRefs` query returns the correct distinct set for a fixed review log + `now` (local-midnight boundary).

## Supabase Requirements

### Schema changes
- **None.** No new tables, columns, RLS policies, or grants. The new read targets `capability_review_events` (owner-readable today: policy `capability_review_events` owner-select) and `learning_capabilities` (authenticated SELECT). N/A — read-only against existing grants.

### homelab-configs changes
- [ ] PostgREST: N/A — no new schema exposure.
- [ ] Kong: N/A — no new origin/header.
- [ ] GoTrue: N/A.
- [ ] Storage: N/A.

### Health check additions
- N/A — no schema/grant surface to verify. Behaviour is covered by unit + integration tests.

### Migration source-of-truth
- `scripts/migration.sql` not touched.

## Sizing

- **New file:** `src/lib/session-builder/siblingBury.ts` (~30 LOC pure helper + the keep/bury walk).
- **Adapter:** +1 minimal read (`capability_review_events?select=capability_id&...`) + in-memory `capability_id → source_ref` resolve via the local `capabilityById` (`adapter.ts:259`) → `reviewedTodayRefs` on the snapshot. ~15 LOC. The adapter does **not** read `capability_review_events` today (confirmed: four reads at `adapter.ts:237-252`); this adds the fifth.
- **Builder:** seed `usedRefs` from `reviewedTodayRefs`, apply the helper in the three passes, ensure `dueCount` is post-bury (the line-317 trap). ~15 LOC of edits.
- **Tests (authored at implementation, per TDD):** `siblingBury.test.ts` (pure helper) + builder/adapter integration cases. ~120 LOC. Scenarios enumerated in §Testing.
- **Glossary:** **Sibling Capabilities** + **Sibling Burying** sections added to `CONTEXT.md` (done alongside this spec).
- **No deploy step** — frontend code; ships in the normal app image on merge to `main`. No edge-function or migration deploy.

## Open questions

All three opened in the first draft were resolved against the code in architect review (2026-06-09) and are recorded here as closed decisions:

1. **Local-midnight source — RESOLVED.** `now = new Date()` is constructed browser-side at `Session.tsx:114`, already the learner's local instant. Derive local midnight from `now` and compare against its UTC instant (`created_at` is `timestamptz`, `migration.sql:1308`). No timezone config needed.
2. **`ProjectedCapability.sourceRef` — RESOLVED, present and non-nullable.** `sourceRef: string` (`capabilityTypes.ts:166`), populated from `row.source_ref` (`adapter.ts:119`). The earlier "parse from canonical_key" fallback and the null-exemption branch are both deleted — there is no null case (see §Definition).
3. **Suppression-entry plumbing — RESOLVED.** Buried caps are silently dropped from the learner-facing queue but counted in `diagnostics` for dev/telemetry, mirroring the planner's existing `suppressedCapabilities[]` posture (`pedagogy.ts`, module spec §3.3). No new UX surface.
