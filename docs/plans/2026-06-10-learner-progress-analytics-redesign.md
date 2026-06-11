---
status: approved
reviewed_by: [architect, data-architect]   # both APPROVE-WITH-CHANGES 2026-06-10; all findings applied below
review_notes: |
  architect (APPROVE-WITH-CHANGES): (1) movement folds into mastery/ — applied §2/§3;
  (2) LOCKED-roster reconciliation note — applied §3; (3) practice-time buckets are a
  deliberate engagement-API extension — applied §3; (4) skill-mode maps over MasteryDimension
  not CapabilityType — applied §2; Q-D stay deferred — applied §3/§7.
  data-architect (APPROVE-WITH-CHANGES): M-1 name upsertItemState writer + grant + dev-stage-force,
  grep-gated DROP — applied §4; M-2 ls_user_started_idx + promote cre_* indexes — applied §5;
  Q-C client-side funnel/gaps, drop 2 RPCs — applied §5/§6; m-2 flip deep-check assertions — applied §5;
  m-3 EmptyState JSDoc — applied §4. Q-B CLOSED safe. Q-A remains implementation-time (low risk).
supersedes: []
grounded_against:
  - docs/target-architecture.md          # lib/analytics LOCKED + bimodal TS/Postgres (:644); sub-module roster incl. engagement/mastery (:682-719); leaderboard listed in target API (:674) — this plan DECOMMISSIONS it; event-log write path already retired (:764)
  - docs/current-system/modules/analytics-mastery.md  # the mastery sub-module contract this EXTENDS (funnel/skill-mode derivers are new; mastered predicate unchanged)
  - docs/current-system/modules/lessons-overview.md   # per-lesson % mastered → per-lesson mini-funnel (tile extension)
  - docs/adr/0015-read-model-aggregation-server-side-parity-tested-mirror.md  # any rung predicate mirrored to SQL carries the parity obligation
  - docs/adr/0016-rung-history-derived-from-event-log.md                      # weekly movement derives from capability_review_events, no label_history table
  - CONTEXT.md → Learner Progress Axes / Practice Time / Mastered / Mastery Model
related:
  - docs/plans/2026-06-09-lesson-status-two-sources-design.md   # shipped % mastered + activation; the tile this extends
  - docs/plans/2026-06-09-lesson-tile-redesign-and-practiced-metric.md
---

# Learner-progress analytics redesign — two axes (Practice Time + Mastery progression), capability/mastery-aligned

## 1. Problem

The learner-facing analytics surfaces speak vocabularies that are **not** the
capability/mastery model, and pile up FSRS machinery the engagement literature
calls "decoration":

- `Progress.tsx`/`MasteryFunnel.tsx` render a **5-stage funnel**
  (`new/anchoring/retrieving/productive/maintenance`) off the **legacy**
  `learner_item_state` table — a parallel "mastery" vocabulary divorced from the
  capability ladder (`at_risk/…/mastered`), and divorced from the `% mastered`
  already shipped on lesson tiles.
- `accuracyBySkillType` (recognition/recall %), `MemoryHealthHero`,
  `avgStability`, latency, and the review forecast are abstract FSRS readouts that
  "don't change practice, support, or planning" (research synthesis 2026-06-10,
  CONTEXT.md → Learner Progress Axes).
- The mastery model (`lib/analytics/mastery/`) already computes a rich,
  capability-aligned interpretation (ladder + 11 dimensions + per-scope rollups)
  but has **one** wired consumer (the tile's `% mastered`); `deriveMasteryOverview`
  / `derivePatternMastery` are built and unused.
- The `leaderboard` view (the only place that aggregates practice *time*) rides
  the same legacy `learner_item_state`; it is being **decommissioned**.

**Goal.** Replace the surfaces with **two capability/mastery-aligned axes** that
keep a learner informed and engaged, deleting the parallel vocabularies and the
decoration. `lib/analytics/` stays **read-only** — derive, never instrument.

## 2. The design (decided — see CONTEXT.md → Learner Progress Axes)

### Axis 1 — Practice Time (input; fast feedback)
Streak · minutes/day · minutes/week · time per session. **Exercises-only**
(the capability/review path is the only writer of `learning_sessions`; reading +
podcasts emit no session — hence the honest name). Per-session duration is the
existing derived `learning_sessions.duration_seconds` (first→last answer elapsed).
Re-homed into `analytics.engagement` reading `learning_sessions` directly (the
`leaderboard` view that aggregates it today is being dropped).

### Axis 2 — Mastery progression (outcome; slow)
The `Mastery Model` ladder shown as a **funnel** (item counts across
`introduced → learning → strengthening → mastered`, `at_risk` flagged) — never a
single slow `% mastered` headline (lower rungs move daily; `mastered` is
deliberately weeks-slow). **Split by content type**: a **Vocabulary funnel** and a
**Grammar funnel**. Each item's rung is rolled up **weakest-wins** (consistent
with `contentUnit`/`pattern`, analytics-mastery.md §3). Scopes: whole-learner
(voortgang), per-lesson (tile mini-funnel, extends shipped `% mastered`),
per-grammar-topic (named `grammar_patterns` + ladder label, via existing
`derivePatternMastery`).

### Weekly Movement (the fast pulse on the slow axis)
"**N items advanced a rung this week**" (+ M reached `mastered`, K slipped to
`at_risk`). Derived read-side by recomputing the rung **before/after** each
`capability_review_events` row in the week window (the JSON snapshots already
carry the FSRS fields `labelForCapability` needs) — **no `label_history` table**
(ADR 0016). Surfaced as a weekly-recap card; only upward moves + lapse-slips are
event-coincident (staleness-decay is invisible, by design — ADR 0016). **Lives in
the `mastery` sub-module** (`deriveWeeklyMovement`), not a separate module — it is
a third deriver over the same `labelForCapability` predicate + the same `MasteryLabel`
rank ordering, which must have a single home (architect finding 1).

### Skill-Mode Gap axes (orthogonal "where's my gap" map)
The 11 internal **`MasteryDimension`s** collapse **weakest-wins** into **3
learner-facing modes** — **Recognise** (receptive), **Produce** (productive),
**Listen** (aural) — each a coarse green/amber strength signal, **gated by
`confidence`** ("not enough data yet" rather than a false-amber gap from low
sample). `exposure` excluded. Raw 11 stay internal (optional drill-down).
**`deriveSkillModeGaps` maps over `MasteryDimension`, NOT `CapabilityType`** — the
12 types already collapse to 11 dimensions (`dimensionForCapability`,
masteryModel.ts:135-159: both `root_derived_*` → `morphology`; `audio_recognition`
→ `listening`), so a type-keyed mapping would double-handle morphology and mislabel
listening (architect finding 4). Dimension→mode:
**Recognise** = {`text_recognition`, `meaning_recall`, `pattern_recognition`,
`contextual_cloze`}; **Produce** = {`l1_to_id_choice`, `form_recall`, `pattern_use`,
`morphology`}; **Listen** = {`listening`, `dictation`}. *(`meaning_recall`
receptive-vs-productive and the `morphology` placement to be confirmed against the
`modality` field in implementation — §7 Q-A.)*

### Surfaces (information architecture)
- **Home / Dashboard (decide + glance):** focal **Start session** CTA (due count
  inline) · **one weekly-pulse strip** ("45 min · ↑12 this week" → voortgang) ·
  at-risk rescue (conditional) · continue-lesson. Declutters today's stacked
  RecencyBadge/rescue/continue/Start (no hierarchy, zero progress sense).
- **Voortgang / Progress (reflect):** Practice Time card · weekly recap ·
  Vocabulary funnel · Grammar funnel + named-topic list · the 3 skill-mode gap
  axes · at-risk "needs review" list.
- **Lessons tiles:** per-lesson mini-funnel + activation status (extends shipped
  `% mastered`).

### Engagement principles (from the 2026-06-10 research synthesis)
- **Kind streak** — coaching language, a forgiveness/freeze affordance (streak
  anxiety is a documented harm). *Freeze MECHANISM is deferred* (write path; not
  needed to land this read-side redesign) — framing + labels are in scope.
- **Coaching labels** — `at_risk` surfaces as "let's strengthen these," not a
  judgement.
- **Every view action-linked** — the at-risk list links to a rescue session.

## 3. Module impact (`lib/analytics/`, target-arch:682-719)

- **`analytics/engagement/`** (new) — `streak`, `streakBest`, `activeDays`, plus
  **deliberately-additive** practice-time buckets (`minutesByDay`, `minutesByWeek`,
  `timePerSession`) — these extend the target `engagement` API (:649-653 lists only
  streak/streakBest/activeDays/recentSessions), a conscious API addition, not drift
  (architect finding 3). Folds the streak/recency bits out of
  `learnerProgressService.ts`; reads `learning_sessions`.
- **`analytics/mastery/`** (extend; spec analytics-mastery.md → update same commit)
  — **three new pure derivers**: `deriveMasteryFunnel` (per-rung counts, split by
  content type), `deriveSkillModeGaps` (11 dimensions → 3 modes, confidence-gated),
  and `deriveWeeklyMovement` (rung-transitions over the event window). The
  `mastered` predicate + the `MasteryLabel` rank ordering + existing scope derivers
  are **unchanged**. All three live in `masteryModel.ts` in place; the deferred
  intra-module file decomposition (model/rules/derive/aggregate/adapter,
  target-arch:682-719) **stays deferred** (Q-D, architect-confirmed) — three pure
  derivers don't trip the threshold; decompose later as its own fold with a
  before-spec.
- **NO `analytics/movement/` sub-module** — weekly movement is a `mastery` deriver
  (above), not a parallel module; a separate module would re-home or re-import the
  ladder rank ordering, the exact parallel-branch anti-pattern (architect finding 1).
- **`analytics/upcoming/`** — shrinks to the **at-risk/lapsing** signal only
  (forecast, lapse-prevention chart, vulnerable-as-chart all cut).
- **`analytics/memory/`** — effectively **removed at the surface**
  (retention/accuracy/health/latency cut); any residual kept only if a surviving
  surface needs it (none identified).
- **`analytics/leaderboard/`** — **not built** (decommissioned).
- **LOCKED-roster reconciliation (do in the same change):** target-arch:686-687
  (top barrel `{engagement, memory, upcoming, progress, leaderboard, mastery}`) and
  :655-674 (the `memory` + `leaderboard` API blocks) are a **LOCKED** roster being
  edited here — update target-architecture.md to drop `memory`/`leaderboard` and
  reflect the funnel/movement/skill-mode derivers under `mastery` (architect
  finding 2). A LOCKED-roster mutation without the doc note is drift.

## 4. Cuts & teardown

- **Components (delete):** `MasteryFunnel`, `MemoryHealthHero`, `DetailedMetrics`
  (accuracy/stability), `ReviewForecastChart`, `VulnerableItemsList` (replaced by
  the at-risk "needs review" list), the Leaderboard page.
- **Hook/services:** strip `itemsByStage`/`skillStats`/`accuracyBySkillType`/
  `lapsePrevention`/`avgLatencyMs`/forecast from `useProgressData` +
  `learnerProgressService`; remove the item-stage methods from
  `learnerStateService` (keep `getLapsingItems` → at-risk).
- **`learner_item_state` (drop) — Q-B CLOSED: safe** (data-architect: no trigger,
  no scheduler, no pipeline writes it; the commit RPC writes only
  `learner_capability_state` + `learning_sessions`; the `leaderboard` view joins it
  read-only). The teardown must cut its **writers**, not just readers:
  - **`learnerStateService.upsertItemState`** (`src/services/learnerStateService.ts:52`)
    — a live **browser write** path via `GRANT SELECT, INSERT, UPDATE`
    (migration.sql:317). Delete in the **same commit** as the `DROP TABLE`, and
    remove the grant line — else a retained call throws PGRST205 (the `item_meanings`
    drop lesson, record c4a462da).
  - **`dev-stage-force.ts:132`** — a dev-tool writer; update/delete in the same PR.
  - Readers `getItemState`/`getItemStates` (lines 9/20) + `useProgressData.ts:88` go
    with the cut funnel.
  - **PR-checklist gate on the `DROP`:** `grep -rn "learner_item_state\|upsertItemState\|getItemState\|getItemStates" src/` returns zero before the migration lands.
- **`leaderboard` view (drop)** + nav entry + route + the stale "leaderboard"
  JSDoc examples in `EmptyState.tsx:18,43` (data-architect m-3).
- **Postgres functions (drop):** the `memory`/forecast/latency analytics
  functions in `2026-05-01-learner-progress-functions.sql` that lose their last
  caller (enumerate in implementation; each drop gated on "no remaining caller").

## 5. Supabase Requirements

### Schema changes
- **New:** no new tables (ADR 0016 — no `label_history`). **Two new indexes** on
  existing tables (data-architect M-2), landed in `scripts/migration.sql`:
  - `CREATE INDEX IF NOT EXISTS ls_user_started_idx ON indonesian.learning_sessions(user_id, started_at);` — `get_practice_time` aggregates here on a growing table on the request path; today only the PK exists.
  - **Promote** `cre_user_created_idx` (`capability_review_events(user_id, created_at DESC)`) — and `cre_user_capability_created_idx` — from the audit-log file `scripts/migrations/2026-05-01-learner-progress-functions.sql:490` into `migration.sql` (it backs `get_weekly_movement`; `make migrate` runs only `migration.sql`, so it is currently unguaranteed on a re-provision).
- **Drops:** `indonesian.leaderboard` (view); `indonesian.learner_item_state`
  (table — Q-B closed safe; cut `upsertItemState` + grant first, §4); the orphaned
  analytics functions (memory/forecast/latency) once callerless.
- **Q-C CLOSED (data-architect):** derive the **mastery funnel and skill-mode gaps
  CLIENT-SIDE** over the evidence `getMasteryOverview` already fetches — that fetch
  is *already* the full per-user `learner_capability_state` (~6k rows at 15 lessons,
  below the 10⁴ ADR-0015 threshold), so the funnel/gaps are a `reduce` at **zero
  extra network cost**; a SQL mirror would duplicate `labelForCapability` to avoid a
  fetch the TS path already does — no net win. So **`get_mastery_funnel` and
  `get_skill_mode_gaps` are NOT built.** (Future breakpoint, i-1: at ~25+ lessons /
  15k+ caps, tilt the funnel to a server-side RPC.)
- **New RPCs — only two** (server-side aggregation, ADR 0015 — small results, on
  the request path):
  - `get_practice_time(user_id, tz)` → streak, minutes by day/week, time per
    session, active days (pure aggregation over `learning_sessions`; no predicate
    mirroring).
  - `get_weekly_movement(user_id, week_start, tz)` → counts of rung-ups / reached
    mastered / slipped, over `capability_review_events` in the window (ADR 0016).
    Mirrors `labelForCapability` over the `state_before/after_json` already on each
    row → **inherits ADR 0015's two-layer parity test** (the only new parity
    obligation; closing Q-C this way halves the mirror count).
- **RLS / grants:** both new RPCs are `security definer`, owner-scoped
  (`auth.uid() = user_id`), `authenticated` EXECUTE — mirrors existing learner
  analytics RPCs. No new table grants. **Remove** the `learner_item_state`
  INSERT/UPDATE grant (migration.sql:317) with the table drop.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (no new schema).
- [ ] Kong CORS — **N/A**.
- [ ] GoTrue — **N/A**.
- [ ] Storage — **N/A**.

### Health check additions
- `check-supabase.ts` — functional check that `get_practice_time` +
  `get_weekly_movement` return for the authenticated role.
- `check-supabase-deep.ts` — add the ADR-0015 semantic parity check for
  `get_weekly_movement` (TS `labelForCapability` rung-transition vs RPC output).
  **Flip the existing positive assertions** at `check-supabase-deep.ts:35` (table
  roster) and `:54` (grants) for `learner_item_state` to **"NOT present"** — leaving
  them positive turns the deep check red after the drop (data-architect m-2). Add a
  "`leaderboard` view gone" structural assertion.

## 6. Sequencing (vertical slices; each ships independently)

1. **Practice Time** — `analytics/engagement` + `get_practice_time` RPC +
   `ls_user_started_idx` + the Practice Time card; re-home off `learning_sessions`.
   (Unblocks the home weekly-pulse's time half.)
2. **Mastery funnel (vocab + grammar)** — `deriveMasteryFunnel` (client-side, over
   `getMasteryOverview` evidence — **no RPC**) + the two funnels on voortgang;
   per-lesson mini-funnel on tiles. Retire `MasteryFunnel`/`itemsByStage`.
3. **Weekly movement** — `deriveWeeklyMovement` (in `mastery/`) + `get_weekly_movement`
   RPC + promoted `cre_*` indexes + parity test + recap card + home pulse strip.
4. **Skill-mode gaps** — `deriveSkillModeGaps` (client-side, dimension-keyed) + surface.
5. **Teardown** — drop `leaderboard` view + page + nav + `EmptyState` JSDoc; drop
   `learner_item_state` (cut `upsertItemState` + grant + `dev-stage-force` first,
   grep-gated); flip the `check-supabase-deep` assertions; drop callerless analytics
   functions; delete cut components; reconcile target-architecture.md's LOCKED roster.
   (After 1-4 remove their last readers.)

## 7. Open questions — review outcomes

- **Q-A (OPEN, implementation-time):** confirm the **dimension**→skill-mode mapping
  against the `modality` field — esp. `meaning_recall` (receptive vs productive) and
  the `morphology` placement under Produce. Low-risk; resolved when `deriveSkillModeGaps`
  is written. *(Architect finding 4 already corrected the noun: map over
  `MasteryDimension`, not `CapabilityType`.)*
- **Q-B — CLOSED (data-architect): drop is SAFE.** No trigger/scheduler/pipeline
  writer; commit RPC writes only `learner_capability_state` + `learning_sessions`.
  Writers to cut: `upsertItemState` (browser, +grant) and `dev-stage-force.ts`;
  grep-gated DROP. See §4.
- **Q-C — CLOSED (data-architect):** funnel + skill-mode = **client-side** (piggyback
  on `getMasteryOverview` evidence, no RPC); weekly movement + practice time =
  **server-side RPC**. See §5.
- **Q-D — CLOSED (architect): stay deferred.** Three pure derivers don't trip the
  `model/rules/derive/aggregate/adapter` decomposition; add in place to
  `masteryModel.ts`, decompose later as its own fold.
