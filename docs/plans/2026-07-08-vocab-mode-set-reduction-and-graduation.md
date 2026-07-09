---
status: implementing
implementation: PR #398 (Slice 1), PR #397 (Slice 2), PR #399 (Slice 3)
reviewed_by:
  - staff-engineer (2026-07-08 — PASS after corrections: §3.2 live-run gate, §4.3 removed, recency-window fix folded into Slice 3)
  - architect (2026-07-08 — PASS after corrections: Slice-3 authenticated-role RLS test, ADR 0027, vocab module-spec update, shared mode-set constant, §4.1 parity-regex fix)
  - data-architect (2026-07-08 — PASS after corrections, sign-off covers the WHOLE plan incl. Slice 1 content UPDATE: capabilityCatalog.ts trim, softRetireCapabilities chunking, cite fixes, Slice-3 join shape)
supersedes:
  - docs/plans/2026-07-08-vocab-mode-graduation-design.md (Mechanism A shape revised; see §8 Minimum Mechanism / rejected alternatives)
---

# Vocabulary mode-set reduction (6→3) + single-rule graduation (3→2)

Implements the thesis reviewed and confirmed in `docs/plans/2026-07-08-vocab-learning-model-review-brief.md`
(review outcome appended there, 2026-07-08): the review-load stall is caused by an **unbounded per-word
cost** (6 lifelong FSRS cards per word), not by the `openSlots` intake policy. This spec bounds that cost
with the **least mechanism the codebase already owns**.

**End state per word:** introduced with **3 modes** — `recognise_meaning_from_text_cap` (#1, scaffold/root),
`recognise_meaning_from_audio_cap` (#3, aural — never retired), `produce_form_from_meaning_cap` (#6,
productive frontier — never retired). Once #6 reaches mastery strength, #1 stops being scheduled → **2
lifelong cards**. Modes #2 (`recognise_form_from_meaning_cap`), #4 (`recall_meaning_from_text_cap`) and
#5 (`produce_form_from_audio_cap`) are retired from the model entirely.

Verified-live baseline (2026-07-08): 2,359 words × 6 = 14,154 vocab caps; owner account frontier frozen
(`review_backlog_exhausts_budget`, lessons 9–30 at 0 introductions).

## 1. Why this shape (deviations from the reviewed draft — read first)

The earlier draft (`2026-07-08-vocab-mode-graduation-design.md`) proposed a **stateless 4-rule build-time
due-suppression** plus a separate authoring trim. Main-thread code verification (2026-07-08) found three
defects that change the shape:

1. **The graduation trigger cannot reuse `isCapabilityMastered` verbatim.** That predicate requires
   `lastReviewedAt` within 30 days (`src/lib/analytics/mastery/mastered.ts:32`). A mature #6 card's FSRS
   interval exceeds 30 days precisely at the horizon where graduation matters, so the successor would
   flicker out of "mastered" between its own reviews and **un-graduate the scaffold every time** — the
   suppression would oscillate instead of converging. The trigger must be the **recency-free strength
   core**: `reviewCount ≥ 4 ∧ stability ≥ 14 ∧ consecutiveFailureCount = 0` (extracted as a shared helper
   so it cannot drift from `isCapabilityMastered`).
2. **The draft's "analytics unaffected" claim is wrong.** `get_lessons_overview` computes
   `% mastered = mastered_count / ready_count` over **all non-retired caps** (`scripts/migration.sql:1957-2006`),
   and the mastered numerator carries the 30-day recency term. A suppressed-but-active card ages out of the
   numerator after 30 days → lesson mastery **regresses** as words graduate; and any card never introduced
   would sit in the denominator forever, capping lessons at ~50%. This is why the mode-set reduction lands
   as **content retirement** (denominator fixes itself) and the graduation slice ships with a numerator
   subsumption rule (§4 Slice 3).
3. **The prerequisite ladder breaks if #2 merely stops being scheduled.** Every #6 cap's
   `prerequisite_keys = [#2's canonical key]` (`scripts/lib/pipeline/capability-stage/projectors/vocab.ts:238`),
   and the intro gate requires prereqs ⊆ satisfiedKeys (`src/lib/session-builder/pedagogy.ts:320`). Removing
   #2 without rewriting #6's prereq makes every not-yet-introduced #6 **permanently unintroducible**. The
   prereq must be rewritten to #1's key (which is what the trimmed projector emits for new words).

The codebase already owns the whole retirement mechanism: `learning_capabilities.retired_at` soft-retirement
(readers filter `retired_at IS NULL` — session RPC `scripts/migration.sql:4023`, lessons overview `:1973`,
placement `:4259`), the HC14-compliant retire write that also clears `learner_capability_state.next_due_at`
(`scripts/lib/pipeline/capability-stage/adapter.ts:178-198` `softRetireCapabilities`), and the per-lesson
orphan sweep. **Using it retires the dropped modes for already-introduced words too**, which is what makes
this the near-term unclog (the draft's suppression-only approach honestly modeled "0 due today" impact);
FSRS history is untouched and the operation is reversible.

## 2. Pedagogical grounding (confirmed in review; full citations in the brief §3)

- **Which 3 modes.** #6 productive recall is the frontier (recall subsumes recognition; transfer runs
  upward — Karpicke & Roediger 2008; Rowland). #3 aural is a **distinct construct** productive typing never
  trains (Milton & Hopkins 2006; Uchihara 2025) — never retired. #1 stays as the single receptive scaffold
  because introduction needs a low-burden Phase-1 entry (Nation's learning burden; the staging gate needs a
  Phase-1/2 sibling to unlock Phase 3+ — `pedagogy.ts:360-369`) and MCQ first exposure is that vehicle.
- **Why drop #4 (receptive recall) rather than keep it as the scaffold:** transfer asymmetry — productive
  practice strengthens receptive knowledge strongly, the reverse weakly; receptive depth is additionally
  served by the reader (Lezen) and dialogue cloze. Typed receptive recall as a *first* exposure would
  invert the learning-burden staging.
- **Why drop #2:** same direction as #6 (l1→id) in weaker (MCQ) form — post-recall recognition drilling
  approximates Karpicke's inert repeated-study condition.
- **Why drop #5 (dictation):** ≈ #3 (aural decoding) + #6 (orthographic production); its distinct
  contribution does not justify a third lifelong card. (Brief §3 guardrails.)
- **Graduation bar (retire #1 at #6 mastery-strength, not first success):** recall subsumes recognition
  *knowledge* but not recognition *speed* (TAP; Barenberg & Roelle 2021) → deep bar; successive-relearning
  criterion (Rawson & Dunlosky) ≈ `reviewCount ≥ 4 ∧ stability ≥ 14`.
- **Lapse reversal is free:** the rule is stateless; a #6 failure (`consecutiveFailureCount > 0`) breaks
  the strength predicate and the scaffold re-enters the queue; savings clears it fast (Ebbinghaus; Nelson 1978).
- **No forced-intake reserve** (confirmed rejected): it fights FSRS and diverges; `openSlots` self-paces
  once per-word cost is bounded.

## 3. Slice 1 — mode-set reduction to {#1, #3, #6} (near-term unclog + acquisition bound)

One PR. Content-side only; no schema, no migration.sql change, no learner-data mutation beyond the
documented HC14 `next_due_at` clearing that every soft-retire already performs.

### 3.0 Shared mode-set constant + ADR (architect corrections, 2026-07-08)

- **One home for the contract**: export `KEPT_VOCAB_CAP_TYPES` / `DROPPED_VOCAB_CAP_TYPES` from
  `src/lib/capabilities/` (dependency-free, importable by both app and scripts — same posture as
  `mastered.ts`). The projector (§3.1), the one-off script (§3.2), and HC-A/HC-B (§3.3) all import it;
  the 3-mode invariant must not be hard-coded in three places.
- **ADR**: this permanently changes the vocabulary capability model (6 modes → 3 introduced → 2 at rest)
  and introduces graduation. Write **`docs/adr/0027-vocabulary-mode-set-bounded.md`** (0026 is taken by
  placement seeding) capturing: which 3
  modes and why, never-retire-aural, the mastery-strength graduation bar, and the maintenance-ceiling
  rationale (brief §2e). Reference it from `projectors/vocab.ts` and cross-link from ADR 0003 (whose
  per-facet model this narrows). Lands in the Slice 1 PR.

### 3.1 Projector trim — `scripts/lib/pipeline/capability-stage/projectors/vocab.ts`

Emit 3 caps per item instead of 6:
- keep `recognise_meaning_from_text_cap` (#1, root, `prerequisiteKeys: []`);
- keep `recognise_meaning_from_audio_cap` (#3, `prerequisiteKeys: [#1 key]`) — unchanged;
- keep `produce_form_from_meaning_cap` (#6) with **`prerequisiteKeys: [#1 key]`** (was `[#2 key]`);
- delete the #2, #4, #5 emissions.

Same-PR module-spec updates: `docs/current-system/modules/capability-stage-vocabulary.md` §2 documents
"4 text caps + 2 audio caps per item" — update to the 3-mode emission (and fix that spec's pre-existing
`item` → `vocabulary_src` source_kind drift while there).

**Second-definition trim (data-architect MAJOR, 2026-07-08):** `src/lib/capabilities/capabilityCatalog.ts:37-95`
is an uncoordinated second definition of the vocab capability shape — still 6 modes with #6's prereq
pointing at #2 — consumed by `scripts/materialize-capabilities.ts:232` and
`scripts/check-capability-health.ts:330`. Trim its vocab-items loop to mirror the 3-mode + #1-prereq
shape (import the §3.0 shared constant) in the same PR, so the diagnostic tools cannot disagree with the
live projector.

Update `__tests__/projectors/vocab.test.ts` accordingly (cap count, key set, the #6 prereq assertion).
Check `vocabulary/gate.ts` + `validateCoverage.ts` for per-item cap-count or per-type assumptions
(CS15 iterates the *emitted* set, so it follows the trim; verify nothing asserts the dropped types).
Grep `scripts/lib/pipeline/capability-stage/{lint,verify}/` for dropped-type or count-parity assertions
and update them to the 3-mode expectation.

Re-publish convergence (verified): the item slice writes via `upsertCapabilitiesSkipIfExists`
(INSERT … ON CONFLICT DO NOTHING — never resurrects a retired row) and then sweeps
`retireOrphanedCapabilities(lessonId, emittedKeys, ['vocabulary_src'])`
(`vocabulary/publish.ts:198,234-238`) — with the trimmed emit set, any future re-publish *re-retires*
dropped modes rather than resurrecting them. The runner's un-retiring `upsertCapabilities` path never
writes `vocabulary_src` (disjoint source_kind ownership).

### 3.2 One-off retirement + prereq-rewrite script — `scripts/retire-dropped-vocab-modes.ts`

Dry-run by default; `--apply` to execute; service key. Two steps:

1. **Retire**: select `learning_capabilities` ids where `source_kind='vocabulary_src'`,
   `capability_type IN DROPPED_VOCAB_CAP_TYPES` (§3.0 constant), `retired_at IS NULL`; retire via the
   **exported** `softRetireCapabilities` seam (export it from `capability-stage/adapter.ts` — reuse,
   don't reimplement: it is the HC14-compliant write that sets `retired_at` AND clears
   `learner_capability_state.next_due_at` for all users).
   **Chunking is mandatory (data-architect MAJOR, 2026-07-08):** the seam's two `.in()` updates are
   un-chunked and have only ever run at per-lesson scale (tens of ids); this run is ~7,077 ids and would
   hit the known Kong request-URL length failure (`src/lib/morphology/adapter.ts:215-217`,
   `src/lib/chunkedQuery.ts:26`) — and the seam's two writes are sequential/non-transactional, so a
   mid-run failure would strand caps retired with `next_due_at` uncleared (HC14-shaped). Add internal
   chunking to `softRetireCapabilities` itself (the canonical seam; future large callers recur), and
   verify the batch size at dry-run stage, not live.
2. **Rewrite #6 prereqs**: for every `vocabulary_src` / `produce_form_from_meaning_cap` row, set
   `prerequisite_keys = [buildCanonicalKey(#1 for the same source_ref)]` (build in TS via the same
   `buildCanonicalKey` the projector uses; key shape `cap:v1:vocabulary_src:<ref>:<type>:<dir>:<modality>:<lang>`,
   `src/lib/capabilities/canonicalKey.ts:42`). Idempotent (skip rows already pointing at the #1 key).
   Inherently per-row (each row gets a distinct value): use bounded concurrency (small `Promise.all`
   batches), not a fully sequential ~2,359-round-trip loop.

Print a verification report: retired count (expect ≈ 3 × 2,359 minus already-retired), rewritten count,
and zero-remaining assertions. The dry-run must also reconcile the `capability_type` values it targets
against the live DB's distinct set (guards against the gated capability-naming Phase-A rename shifting
type strings under the script — architect note, 2026-07-08). Ships in the same PR as §3.1 so the DB and the generator can never disagree
for longer than one deploy.

**Live-run gate (staff-engineer correction, 2026-07-08):** the `--apply` run writes
`learner_capability_state.next_due_at` across ALL users (a precious-table write, one-way in practice —
see §6 reanimation quirk). It is NOT part of autonomous PR execution: Sonnet builds the script + tests
and merges with dry-run evidence only; the owner (or main thread with the owner's go-ahead) executes
`--apply` as a separate gated step, immediately after confirming the nightly backup checkpoint exists
(`docs/process/restore-runbook.md`), then re-runs `make check-supabase-deep`.

### 3.3 Health checks — `scripts/check-supabase-deep.ts`

Two new structural checks:
- **HC-A**: zero live (`retired_at IS NULL`) `vocabulary_src` caps of the three dropped types.
- **HC-B**: zero live `vocabulary_src` `produce_form_from_meaning_cap` rows whose `prerequisite_keys`
  reference a dropped-type key.

### 3.4 What needs NO change (verified, with cites)

- **Session builder / intro gate**: retired caps vanish from the RPC snapshot (`migration.sql:4023`); their
  learner-state rows drop out client-side (`session-builder/adapter.ts:348` filters by `capabilityById.has`).
  `satisfiedKeys` / staging-gate unlock (`unlockedSourceRefs`) are served by #1/#3 (both Phase 1).
- **Analytics**: retired caps leave numerator AND denominator of `get_lessons_overview` together (`:1973`).
  Live effect: lesson % mastered shifts (denominator −50%, some mastered #2/#4 leave the numerator) — net
  up for most learners; acceptable and directionally honest.
- **Cross-family prereqs**: morphology's root-vocab prereq points at #1
  (`projectors/affixedCapabilities.ts:49-57`); grammar/cloze reference no item caps. Nothing dangles.
- **Placement seeding** (`apply_placement_result`, `migration.sql:4251-4259`) filters `retired_at IS NULL`
  → seeds 3 modes. Direct client readers also verified: `src/lib/lessons/adapter.ts:240-264` and
  `src/lib/morphology/adapter.ts:219-230` both filter `retired_at IS NULL`; `get_collections_overview` and
  `get_text_coverage` key exclusively off #1 (kept).
- **Distractor/junction child rows** of retired caps are preserved-but-unread: soft-retire only UPDATEs, so
  the `distractors.capability_id` ON DELETE CASCADE (`migration.sql:1405`) never fires, and HC26 already
  excludes retired caps (`check-supabase-deep.ts:1834`).
- **masteryModel / exercise registry / renderContracts**: exhaustive switches and `RENDER_CONTRACTS`
  entries keep the dropped types (legacy rows exist; dead-but-harmless); no code removal.

### 3.5 Modeled impact (owner account)

Immediate: of the sampled due-now set (§2d of the brief), the dropped modes are ~40–55% of due vocab cards —
the backlog falls below `preferredSessionSize` far sooner and `openSlots` reopens. Acquisition: each lesson's
vocab intro queue halves (lesson 1: 396 → 198 caps) → new-word rate roughly doubles at equal slots.
Steady-state maintenance ceiling: ~10–13 reviews/day for the full 2,359-word corpus at 2 mature cards/word
(vs ~30–40 at 6) — comfortably inside a 25-card session.

## 4. Slice 2 — graduation: retire #1 from review once #6 has mastery strength

One PR. Pure client-side scheduling; no schema, no writes.

### 4.1 Strength predicate — `src/lib/analytics/mastery/mastered.ts`

Extract the recency-free core so it cannot drift from the canonical predicate:

```ts
export function hasMasteryStrength(input: { reviewCount: number; stability?: number | null; consecutiveFailureCount: number }): boolean {
  return input.consecutiveFailureCount === 0 && input.reviewCount >= 4 && (input.stability ?? 0) >= 14
}
// isCapabilityMastered(...) = hasMasteryStrength(...) && isRecent(lastReviewedAt, now)
```

Correction (architect, 2026-07-08): `lessons-overview-mastery-parity.test.ts` extracts the predicate
from `mastered.ts` by regexing the **inline literal** (`reviewCount >= 4 && (input.stability ?? 0) >= 14
&& isRecent`), so this extraction breaks its regex. Update the test's extraction in the same PR — the
*semantic* parity is unchanged (same composed predicate), but the test's source-string anchor moves.

### 4.2 Due suppression — new pure helper `src/lib/session-builder/graduation.ts`

`suppressGraduatedVocabDue(orderedDue, capabilitiesByKey, schedulerRows)`:
- build `sourceRef → #6 state` for `vocabulary_src` / `produce_form_from_meaning_cap` rows;
- drop due entries whose capability is `vocabulary_src` / `recognise_meaning_from_text_cap` **and** whose
  same-`sourceRef` #6 satisfies `hasMasteryStrength`.

Composed in `builder.ts` on `orderedDue` (immediately after `getDueCapabilities`, `builder.ts:236-243`),
**before** `reserveGrammarDueFloor`/the size cut and before `backlogDueCount` is taken — so the shed feeds
`dueCount → openSlots` (`builder.ts:361`, `loadBudget.ts:24`) and the Home backlog insight equally. The
adapter's own `dueCount` (`adapter.ts:350`) is overridden by the builder and needs no change. Mirrors the
`reserveGrammarDueFloor` composition style; fail-safe by construction (missing #6 state → no suppression;
non-vocab families untouched).

### 4.3 Intro suppression — REMOVED (staff-engineer correction, 2026-07-08)

An earlier draft suppressed *introduction* of #1 when #6 already has strength (placement-seeded words).
Removed: it creates a real edge — a placement-seeded word that is also a **morphology root** would leave
#1's key permanently out of `satisfiedKeys`, blocking the derived form's cross-prereq
(`affixedCapabilities.ts:49-57` + `pedagogy.ts:320`) — and its value is one saved review per
placement-seeded word. Without it the system self-resolves: #1 is introduced once, its first success
enters `satisfiedKeys`, and §4.2 due-suppression retires it from then on.

### 4.4 Scope decisions

- `#3` and `#6` are **never** suppressed (aural construct; frontier maintenance).
- Graduated #1 remains reachable via the lesson-practice pass (explicit drilling) — only *due scheduling*
  and *introduction* are suppressed.
- Legacy still-active #2/#4/#5 caps: none exist after Slice 1 (retired), so no multi-rule map is needed —
  this is the whole reason the draft's 4-rule tier collapses to one rule.

### 4.5 Tests

1. #6 with strength (reviewCount 4, stability 14, consecFail 0, last review 60d ago) → #1 excluded from due,
   `dueCount` and `backlogDueCount` reduced; #3/#6 retained. (The 60d-ago detail pins the recency-free fix.)
2. #6 below strength → no suppression.
3. Lapse: #6 `consecutiveFailureCount > 0` → #1 reappears next build.
4. Missing #6 state / non-vocab family / other vocab types → untouched.
5. Integration: suppression drops `dueCount` below `preferredSessionSize` → `allowNewCapabilities: true`.

Update `docs/current-system/modules/session-builder.md` (new invariant + seam) in the same commit.

## 5. Slice 3 — mastery analytics under graduation (subsumption + stability-scaled recency)

One PR; touches `scripts/migration.sql` → full gate chain (`make migrate-idempotent-check`, `make migrate`,
`make pre-deploy`) and **both** architect + data-architect sign-off are required for this slice.

Two coupled changes to the mastered predicate's analytics surface — coupled because the staff-engineer
review (2026-07-08) established the second is load-bearing for this design, not "eventual": at convergence
every word rests as 2 long-interval cards, and a fixed 30-day recency window would age BOTH out of the
mastered numerator — the design's success would read as ~0% mastered on the lesson tiles.

1. **Numerator subsumption (graduated scaffold):** a `vocabulary_src` `recognise_meaning_from_text_cap`
   row also counts as mastered when a **same-`source_ref`, non-retired `produce_form_from_meaning_cap`
   sibling** meets the strength predicate (recency-free, matching §4.1 — a recency term here would
   reintroduce the flicker). Join shape (data-architect, 2026-07-08): add `source_ref`/`capability_type`
   to the `lesson_capabilities` CTE select and scope the sibling lookup **within the lesson** — #1 and #6
   for a word always share `lesson_id` (stamped in the same projector iteration, `vocab.ts:183,236`) —
   so no global self-join; `learning_capabilities_source_idx` covers the lookup.
2. **Stability-scaled recency window (kept modes):** replace the fixed 30-day window in
   `isCapabilityMastered`/the SQL mirror with `ageDays ≤ max(30, 2 × stability)`. Intent preserved — a
   card mid-interval is *maintained*, a card overdue by more than a full extra interval is *abandoned* —
   but the window now tracks FSRS maturity instead of contradicting it. TS: extend `isRecent` (or a
   sibling helper) in `mastered.ts` to take `stabilityDays`; SQL:
   `last_reviewed_at >= now() - greatest(interval '30 days', make_interval(days => (coalesce(stability,0) * 2)::int))`.

Both land in `get_lessons_overview` and `scripts/__tests__/lessons-overview-mastery-parity.test.ts` in the
same PR so TS and SQL stay in lockstep (ADR 0015). This also settles the "pre-existing mature-card flicker"
defect (previously §6) for every surface that goes through `isCapabilityMastered`.

**Required test (architect CRITICAL, 2026-07-08):** the subsumption clause adds a correlated read of the
#6 sibling's RLS-protected `learner_capability_state` inside the SECURITY INVOKER `get_lessons_overview`
(`migration.sql:1956`). The parity test is a static source-string check and would stay green through a
silent RLS-deny (subquery returns nothing → subsumption never fires → mastery reads ~0% — the exact
regression this slice prevents). The Slice 3 PR must add a **live execution test** that sets
`local role authenticated` + `local request.jwt.claims`, seeds one user's #1 + strength-level #6 rows, and
asserts the graduated #1 is counted in `mastered_capability_count` (non-empty, non-zero).

Sequencing note: graduation only starts biting when #6 caps reach strength (months away on live data), so
Slice 3 may ship shortly after Slice 2, but before the first real graduations age past 30 days.

Open question for review (not blocking Slices 1–2): should per-cap mastery labels elsewhere
(`masteryModel.ts` consumers, Vaardigheden) be subsumption-aware too, or is lesson-overview the only
surface where the regression is user-visible? (The recency-window fix, by contrast, propagates to all
consumers of `isCapabilityMastered` automatically.) Default: lesson-overview only (Minimum Mechanism);
revisit if a surface visibly regresses.

## 6. Explicitly out of scope

- **Un-retire reanimation quirk** (documented, inherited): `upsertCapabilities` re-emission sets
  `retired_at = NULL` but nothing restores `next_due_at`, so a reanimated cap is never *due* (it can only
  resurface via practice/introduction paths). Irrelevant to this one-way retirement; a reversal script
  would need to set `next_due_at = now()` explicitly.
- Non-vocab families (grammar, morphology, cloze, podcast) — untouched throughout.
- Session-size/intake tuning; the `openSlots` model is confirmed correct as-is.

## 7. Supabase Requirements

### Schema changes
- N/A — no new tables/columns. Slice 1 UPDATEs existing content columns (`retired_at`,
  `prerequisite_keys`) on `learning_capabilities` via a one-off script (not `migration.sql`; it is a data
  correction on capability content, DB-authoritative per ADR 0011, using the existing soft-retire seam).
  Slice 3 redefines `get_lessons_overview` in `migration.sql` (function replace, no table change).

### RLS / grants
- N/A — no new tables or access patterns.

### homelab-configs changes
- N/A — no PostgREST/Kong/GoTrue/Storage change.

### Health check additions
- `check-supabase-deep.ts`: HC-A (no live dropped-mode vocab caps), HC-B (no live #6 with dropped-type
  prereq) — Slice 1.
- `lessons-overview-mastery-parity.test.ts` extension — Slice 3.

## 8. Minimum Mechanism check

| Mechanism | What breaks if omitted |
|---|---|
| Projector trim | New lessons keep minting 6 cards/word — the defect regrows. |
| One-off retire script (reusing `softRetireCapabilities`) | 12k existing caps keep 6× load; due backlog never unclogs; HC14 violated if reimplemented without the `next_due_at` clear. |
| #6 prereq rewrite | Every not-yet-introduced #6 permanently gated on a retired #2 (`missing_prerequisite`). |
| `hasMasteryStrength` extraction | Graduation oscillates at intervals > 30d (recency term) or a second drifting mastery constant appears. |
| Due-suppression helper in builder (pre-cut) | Graduation never feeds `openSlots`/backlog; steady state stays 3 cards not 2. |
| Slice 3 numerator subsumption | Lesson % mastered regresses ~30 days after first graduations. |
| HC-A/HC-B | A future publish/config regression silently resurrects the 6-mode world. |

Rejected as over-mechanism: the draft's 4-rule two-tier retirement map (collapses to 1 rule once Slice 1
retires the dropped modes for existing words); runtime prereq-key relaxation (permanent DB↔runtime drift vs
a one-off rewrite); re-running Stage B on all 30 lessons to let the orphan sweep do the retirement (same
result as the targeted script at ~30× the cost); a stored per-learner "graduated" state machine (stateless
predicate gives reversal for free); a forced new-material session floor (diverges; brief §4).

## 9. Review plan

Per project process: **staff-engineer first** (soundness/simplicity), then **architect** (module placement:
graduation helper seam, projector trim) and **data-architect** (content UPDATE semantics, prereq rewrite,
`dueCount`/`openSlots` interaction, Slice 3 SQL mirror + parity). Slices 1–2 carry no migration;
Slice 3 touches `migration.sql` and requires both sign-offs recorded in `reviewed_by:` before implementation.

Build note (post-approval): Slices are independent PRs in order 1 → 2 → 3; Sonnet builders per
`feedback_fable_designs_sonnet_builds`; each slice's tests + module-spec updates land in the same PR.
