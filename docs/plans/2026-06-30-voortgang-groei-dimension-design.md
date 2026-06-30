---
status: draft
reviewed_by: [staff-engineer, architect-r2, data-architect-r2]   # was approved at round 2; the 2026-06-30 round-3 growth reshape (mastered-only flow → funnel-over-time, 4 selectable state lines, §9) changed the growth contract → back to draft. Durability (§3.3) is unaffected & still approved. Re-dispatch architect + data-architect for the growth change (Q4) before re-approving.
supersedes: []
---

# Voortgang "Groei" Dimension — Progress as Motion, Not Position

**Date:** 2026-06-30
**Author:** brainstorm + research session (see `docs/research/2026-06-30-progress-metrics-evidence.md`)
**One-line:** Add a sixth Voortgang tab, **Groei** (Growth), holding two *trajectory* statistics — a **growth curve** (units mastered per week) and a **durability curve** (average memory strength over time) — both derived **read-only** from the existing append-only `capability_review_events` log. No new tables, no new writes.

## 1. Problem & motivation

Every current Voortgang statistic is a **snapshot**: the mastery funnel (`Woordenschat`/`Grammatica`/`Morfologie`) shows where the learner's units sit *today*; Vaardigheden shows *today's* skill counts; Tijd is mostly *this week's* minutes. The page answers "where am I" and never "where am I heading." For a learner, change-over-time *is* the most literal meaning of progress, and it is the page's one genuine gap.

Two trajectory lenses, both requested ("both"), both recoverable from data already recorded:

- **Growth / velocity** — "how fast is my knowledge growing?" (`+40 words mastered this month, vs 25 last`).
- **Durability** — "how solid is what I know?" (`my memory now holds ~32 days on average, up from 18`).

**Evidence base** (`docs/research/2026-06-30-progress-metrics-evidence.md`): the literature's warning targets *activity-vanity* metrics (streaks/minutes — the existing Tijd tab), not outcome metrics; both Groei metrics are outcome metrics that dodge that critique. **Durability is the more defensible** — it is metacognitive *calibration feedback* (PMC6390881) aimed at the documented illusion-of-competence failure of apps in this category. The research doc's six design reads are folded into §4 below.

## 2. Architectural grounding (per `docs/target-architecture.md:642-771`)

- `lib/analytics/` is **read-only** — "no writes, no mutations" (target-arch:644). This design adds only readers. ✅
- The target roster **reserved a `memory` sub-module** (`retention/accuracy/health/latency`, target-arch:655-659, 702-704). The 2026-06-11 redesign **shelved it as "FSRS decoration with no learner-facing home"** (target-arch:684-692). **The durability curve is that missing home** — this design revives `memory` minimally, with a learner-facing purpose, rather than inventing a new surface.
- The funnel "lives IN `mastery`" (target-arch:688-689). The growth curve is the **time-series generalization of the existing client-derived funnel `deriveMasteryFunnel` / `getMasteryFunnels`** (`masteryModel.ts:423`, `:918`), so it extends `mastery` — it does not add a parallel module. *(Architect confirmed `mastery` placement at round 2; the **reshape** from a mastered-only flow to a funnel-over-time snapshot — user direction 2026-06-30, §9 round 3 — keeps the same `mastery` home but changes which primitive it generalizes: the funnel, not weekly-movement.)*
- **`masteryModel.ts` is fold-slated** (target-arch:717-728 decomposes its ~524 LOC into `mastery/{model,rules,derive,aggregate,adapter}.ts`; the funnel + movement derivers land in `derive.ts`, wrappers in `adapter.ts`). The new `deriveFunnelSeries` / `getFunnelSeries` land **beside their single-snapshot siblings** (`deriveMasteryFunnel`, `getMasteryFunnels`) and fold together as a unit — composing, not the dialogue_line parallel-branch anti-pattern. Cited per CLAUDE.md's mandatory target-architecture grounding (2026-05-21).
- ADR 0015 (server-side RPC aggregation for small bounded results; mirrored predicate held in lockstep by a health check) is the precedent both new RPCs follow.

**No constraint conflict found:** both surfaces the design touches are reserved-but-empty in the target architecture; this design fills them at the intended seam. **Architect verdict (§9): all three placements confirmed** — durability→revive `memory`, growth→`mastery`, dedicated `Groei` tab.

## 3. Design

### 3.1 Data source (already recorded — this is the crux)

`capability_review_events` (migration.sql:1457) is **append-only, one row per review attempt**, never overwritten, indexed on `(user_id, created_at DESC)` (`:2352`). Each row carries `created_at`, `state_before_json`, `state_after_json` — the latter two include `stability`, `reviewCount`, `lapseCount`, `consecutiveFailureCount`, `lastReviewedAt`. The snapshot stats read the *overwritten* `learner_capability_state`; the trajectory stats read this *log*. **The history already exists; we add reads, not writes.** Trend depth is bounded by log age (currently short / test data — acceptable; real history accrues automatically from launch).

### 3.2 Growth curve — the funnel, over time (4 selectable state lines)

**Reshaped per user direction (2026-06-30, §9 round 3): NOT mastered-only.** The growth curve tracks **all four funnel rungs over time** — `introduced`, `learning`, `strengthening`, `mastered` (the exact set `MasteryJourney.tsx:18` renders; `at_risk` carried as the slip overlay, `not_assessed` excluded as never-seen). It is a **multi-line chart, one line per rung, with a selector to choose which line(s) to show** — i.e. the existing mastery funnel *animated across weeks*.

Why this is strictly better than the old mastered-only flow: mastery is a high bar, so a learner with 150 words climbing through `learning`/`strengthening` read as nearly-flat under the old design — the undersell exactly where early motivation matters. And being a per-week-end **snapshot** (not a flow), it **structurally cannot double-count** — the staff-engineer's net-distinct concern (old §3.4) is dissolved, not mitigated; the `mastered` line's height *is* net-distinct mastered.

**Mechanism — generalize the client-derived funnel to a series (the `get_weekly_movement` framing is RETIRED).** The live funnel is **client-derived**: `getMasteryFunnels` (masteryModel.ts:918) fetches evidence and runs the pure `deriveMasteryFunnel` (`:423`) in TS — there is **no funnel RPC**. The series extends that exact pattern to time:

- **`deriveFunnelSeries(events, weekEnds, caps, now?)`** — pure, in `masteryModel.ts`, sibling to `deriveMasteryFunnel`. For each week-end: reconstruct each capability's **last-known state as of that week-end** (`distinct on capability_id` over events with `created_at <= week_end`), build `CapabilityMasteryEvidence` with the label clock = **the week-end moment** (newest week-end = `now()`), then call the existing `deriveMasteryFunnel` **verbatim** → one `MasteryFunnels` per week. Weakest-wins per `source_ref` and the vocab/grammar/morphology split come for free — they live *inside* `deriveMasteryFunnel`. The label-clock-as-of-week-end is the clean generalization of the old `CASE WHEN` clock (the as-of moment simply *is* each week-end); `at_risk` short-circuit stays clock-independent (data-architect Q1).
- **`getFunnelSeries(userId, tz, weeks)`** wrapper: fetches the owner-scoped event log + caps, computes week-end boundaries timezone-locally (M1 formula, identical to §3.3), derives client-side.

**Returns `FunnelWeek[]`**, zero-filled for empty weeks:
```ts
export interface FunnelWeek { weekStart: string; vocabulary: MasteryFunnel; grammar: MasteryFunnel; morphology: MasteryFunnel }
// MasteryFunnel = the existing Record<MasteryLabel, number> — reused, no new shape.
```

> **Open decision for re-review — Path A (client-derive, above) vs Path B (server RPC).** Path A reuses `deriveMasteryFunnel` verbatim (no new SQL, no new SQL-vs-TS lockstep surface) and matches how the funnel is computed *today*, but ships the owner's event log to the client — ADR 0015 prefers server-side aggregation for small results. Path B = a `get_mastery_funnel_series` RPC replicating `_mastery_label` + weakest-wins-per-`source_ref` per week-end (server-aggregated, ADR-0015-faithful, but new SQL + a new lockstep). **Recommendation: Path A** — the funnel's snapshot counterpart is *already* client-derived, so growth and durability legitimately differ in mechanism (durability's counterpart `get_memory_health` is a server aggregate; the funnel's is client TS). Architect owns the ADR-0015 seam call; data-architect owns the event-log-fetch shape. This is the one substantive question the reshape reopens.

**Validator:** the newest week-end's funnel must equal the live `getMasteryFunnels().all` for the same user (exact — same deriver, same evidence) — a regression guard that **replaces** the retired `get_weekly_movement` parity.

### 3.3 Durability curve — revive `analytics.memory`

**New RPC `get_stability_series(p_user_id, p_timezone, p_weeks int default 12)`** → `RETURNS json` (`json_agg`, per i1), per week-end the **average last-known stability across the learner's reviewed capabilities as of that week-end** (zero-/null-filled per m3):
`{ week_start: date, avg_stability_days: numeric, sample_size: int }`.

This reconstructs `get_memory_health`'s *current* average (which reads `learner_capability_state`) at each historical week-end. **Shape (data-architect Q2 — must be a `LATERAL` over a `generate_series` of week-end timestamps, one `DISTINCT ON` per week-end):**
```sql
from generate_series(0, p_weeks - 1) as n
cross join lateral (
  select avg(s.stability) as avg_stability_days, count(*) as sample_size
  from (
    select distinct on (e.capability_id)
           nullif(e.state_after_json->>'stability','')::double precision as stability
    from indonesian.capability_review_events e
    where e.user_id = p_user_id
      and e.created_at <= <week_end(n) in user tz>      -- UTC-stamped local boundary, M1
    order by e.capability_id, e.created_at desc
  ) s
) agg
```
A single un-LATERAL'd `DISTINCT ON` returns only **one** week — the LATERAL is load-bearing, not stylistic. Cumulative last-known state ⇒ a true trend, not "stability of words touched this week."

> **Implementer notes (data-architect round 2):** (a) **n=0 boundary edge case** — for the *current* (in-progress) week the `<= week_end` bound must be `now()`, not the week-*start* the general formula yields at n=0; use `LEAST(now(), <week-start(n-1)>)` or special-case n=0, else today's reviews are dropped from the newest point. (b) `avg(stability)` over `double precision` returns **`double precision`**, not `numeric` — annotate the column accordingly (no contract impact; TS reads `number` either way). (c) The newest-bucket==`get_weekly_movement` anchor compares two separate RPC calls, so it is robust-in-practice but not strictly transactional; the **series-level TS-vs-SQL lockstep is the deterministic guarantee** (single-learner dev env makes the anchor reliable regardless). The `(user_id, capability_id, created_at)` index (migration.sql:2353-2354) supports the per-week-end scan; bounded `p_weeks`, single-learner volume → cost fine (Q2 verdict). Since `commit_capability_answer_report` is the sole writer of **both** `learner_capability_state` and `capability_review_events`, the log is a complete projection of state history — the reconstruction matches the snapshot exactly. SECURITY INVOKER, `where user_id = p_user_id`.

**TS:** revive `src/lib/analytics/memory/index.ts` as a **single file** following the live `engagement` precedent (`createMemory(client)` + default instance — **no `adapter.ts` split**, scope is `stabilitySeries` ONLY, no speculative `retention/accuracy/health/latency` stubs — architect W4). Consume it by **direct import** (`@/lib/analytics/memory`), matching how the growth card's `mastery` sibling is imported (`@/lib/analytics/mastery/masteryModel`, Dashboard.tsx:25) — **do NOT route one card through the barrel while the other bypasses it** (architect W3). Define `StabilityWeekRow` (snake_case, char-for-char) + `StabilityWeek` (camelCase) inline like the growth interfaces (m2).

> **Self-contained — does NOT depend on `get_memory_health`** (staff-engineer pass, confirmed by data-architect i2). That function lives ONLY in the paper-trail `scripts/migrations/2026-05-01-learner-progress-functions.sql`, is absent from the canonical `scripts/migration.sql`, and is rendered nowhere — its live presence/shape is unverified, so the durability curve must not lean on it. `get_stability_series` reads `capability_review_events` directly and stands alone.

### 3.4 UI — one new tab

`Progress.tsx`: add `'groei'` to `Tab`/`TABS` and a `PillSegmented` entry (label `T.progress.tabGrowth`). The two cards live in `src/components/progress/` alongside the existing Voortgang cards (`GrowthCurveCard.tsx`, `DurabilityCard.tsx`). **Build-time UX check (architect note):** confirm the `PillSegmented` row still fits at 390px with 6 tabs (the header comment's original "minimal scroll on mobile" rationale) — if it crowds, consider an icon+short-label treatment; not an architecture blocker. Two cards under it:

- **`GrowthCurveCard`** — a **multi-line chart over weeks, one line per rung** (`introduced` / `learning` / `strengthening` / `mastered`, the funnel's colour tokens), with a **rung selector** (a `PillSegmented` or legend toggle) so the learner shows one line at a time or all four. Default view = all four (or `mastered` highlighted); a second toggle picks the bucket (vocab / grammar / morphology), mirroring the funnel tabs. Because each point is a snapshot count, the headline is the honest *net* delta of the selected rung ("+12 woorden beheerst sinds vorige maand" — a snapshot diff, never a flow sum, so no double-count). **Carries a strategy nudge** (design read #2): e.g. "houd je dagelijkse sessie vast om dit tempo te halen." Not a naked number.
- **`DurabilityCard`** — line of `avg_stability_days` over weeks. **Plain-language, calibrating headline** (design read #3): "Je geheugen houdt nu ~32 dagen vast (was 18 vorige maand)" — never raw "stability: 32.4". Pairs conceptually with the recognise/produce/listen skill card.

**Plateau handling** (design read #5): a flat/declining curve is framed as direction, not failure — a dip surfaces "X words to review" (the funnel already models `at_risk`/`slipped`), so a downturn reads as a recovery action, not a scolding. **Personal-trajectory only — no social comparison** (design read #4; the leaderboard stays retired).

## 4. Minimum-mechanism / omission test

| New piece | What breaks if omitted |
|---|---|
| `deriveFunnelSeries` / `getFunnelSeries` (Path A) — or `get_mastery_funnel_series` RPC (Path B) | No growth trend — only the *current* funnel snapshot exists; cannot show the 4 rungs climbing over time. |
| `get_stability_series` | No durability trend — only a current snapshot (and that snapshot is itself unrendered today). |
| Revived `memory` sub-module | *Cohesion, not a functional break* (architect W4): keeping the function elsewhere still works, but puts retention/stability math inside `mastery` (whose job is the 6-state *label* hierarchy) — the conceptual muddle the roster's `memory`-vs-`mastery` split exists to prevent (target-arch:734-735). Scoped to `stabilitySeries` only; thinness of a correctly-placed module is not over-engineering (architect verdict). |
| `Groei` tab + 2 cards | The data has no surface; RPCs would be dead. |

**Explicitly NOT built** (would be mechanism beyond the goal): no new tables; no write-path instrumentation; no per-day granularity (week buckets match every existing time stat); no capability/coverage/reading-listening trajectory (those need the activity-tracking plumbing the user declined). `p_weeks` defaults to 12 — a bounded window, not unbounded history.

## 5. Supabase Requirements

### Schema changes
- **No new tables or columns.** Durability always adds one **SECURITY INVOKER** RPC `get_stability_series`. Growth adds an RPC **only if Path B** (`get_mastery_funnel_series`) — under the recommended **Path A it is pure client-side TS** (`deriveFunnelSeries` + a `getFunnelSeries` that reads the event log via the existing client) and adds **no** RPC. All RPCs filter `where user_id = p_user_id` (invoker-RPC safety idiom, migration.sql:571).
- **RLS:** none added. The reads hit `capability_review_events`, which already has owner-only read RLS (migration.sql:1514) + `grant select … to authenticated` (`:1535`) — covering both the Path-A client fetch and any Path-B RPC.
- **Grants:** `grant execute on function … to authenticated` for each RPC built (mirrors `get_weekly_movement`, migration.sql:2476).
- Run `make migrate-idempotent-check` before merge (any RPC uses `create or replace`).

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (`indonesian` already exposed; RPCs are reachable once defined).
- [ ] Kong CORS — **N/A** (no new headers/origins).
- [ ] GoTrue — **N/A.**
- [ ] Storage — **N/A.**

### Health check additions
- `scripts/check-supabase-deep.ts`: assert each RPC built (`get_stability_series`, + `get_mastery_funnel_series` under Path B) exists + is `authenticated`-executable.
- **Growth validator = funnel parity.** The newest week-end of the funnel series must equal the live `getMasteryFunnels().all` for the same user (§3.2). Under **Path A** this is a unit test (`deriveFunnelSeries`' newest column == `deriveMasteryFunnel` over current evidence — same deriver, so it is a structural regression guard). Under **Path B** it is the SQL-vs-TS lockstep (ADR 0015 / HC28 precedent: `get_mastery_funnel_series` newest week == client `deriveMasteryFunnel`). The retired `get_weekly_movement` parity no longer applies.
- **Durability** keeps its existing checks (function exists; cumulative reconstruction is RPC-authoritative, §3.3).

### Docs to update in the same PR (architect W5)
- `docs/target-architecture.md:684-692` — the roster-reconciliation note says `memory` "leaves the live barrel"; reviving it makes that stale.
- `docs/current-system/modules/analytics.md` — same-commit module-spec discipline (CLAUDE.md).

## 6. Testing

- **TS pure derivers** (Vitest): `deriveFunnelSeries` — empty log → zero-filled weeks; per-week-end snapshot reconstructs the last-known state per cap (an advance→slip→re-advance word sits in exactly one rung per week-end, **no double-count**); the four rung counts per week per bucket; newest week-end == `deriveMasteryFunnel` over current evidence (the funnel-parity guard).
- **Component** (RTL): `Groei` tab renders the phase-1 card(s); deep-link `/progress?tab=groei`; the growth card's **rung selector** shows/hides each of the 4 lines and the bucket toggle switches vocab/grammar/morphology; durability shows plain-language days not raw stability; plateau framing present.
- **Funnel-parity** test backing the §5 health check (newest week-end == live funnel; Path B additionally: SQL series == TS series over the same events).

## 7. Phasing (staff-engineer pass, §9)

The event log is currently short and mostly disposable test data; a 12-week trajectory over it shows noise, not a learner. So **build in two phases — sequencing, not goal-shrinking; both curves remain the design:**

- **Phase 1 — durability curve** (`get_stability_series` + `memory` revival + `DurabilityCard`). The research's defensible-if-forced-to-one pick; self-contained; the calibration value lands even on a short log because it's about *strength*, not *count*.
- **Phase 2 — growth curve** (`deriveFunnelSeries` / `getFunnelSeries` + `GrowthCurveCard`), landing once real post-launch history exists so the 4 rung lines show a real climb rather than test-noise. *(The reshape makes Phase 2 a touch cheaper under Path A — it reuses `deriveMasteryFunnel` with no new SQL.)*

Both phases ship behind the same `Groei` tab; Phase 1 may launch the tab with one card.

## 8. Questions

**Reopened by the 2026-06-30 growth reshape (needs re-review):**
- **Q4 — growth Path A (client-derive) vs Path B (server RPC)** for the funnel series (§3.2). Architect owns the ADR-0015 seam call (is shipping the owner's bounded event log to the client acceptable, given the funnel is *already* client-derived?); data-architect owns the event-log-fetch shape + (if Path B) the SQL replication of `_mastery_label`/weakest-wins. Recommendation in-spec: **Path A**.

**Still resolved (durability unchanged + carried mastery findings):**
- **Q1 — label clock — RESOLVED.** As-of-week-end clock (newest = `now()`); generalizes the old `CASE WHEN`. `at_risk` short-circuit clock-independent (data-architect Q1).
- **Q2 — cumulative stability — RESOLVED.** `DISTINCT ON (capability_id) … <= week_end` via `LATERAL`/`generate_series` matches `get_memory_health` semantics (§3.3); cost fine.
- **Q3 — `memory` placement — RESOLVED.** Revive `memory`, scoped to `stabilitySeries` (architect).

## 9. Review log

- **2026-06-30 — staff-engineer (soundness/simplicity):** verdict NEEDS WORK → addressed. Folded in: dropped the unverified `get_memory_health` dependency (§3.3); net-distinct growth headline to avoid the double-count vanity number (§3.4); committed to cumulative stability, rejected the in-week proxy (§8 Q2); phased the build durability-first (§7). Carried forward to rigor review: Q1 (label clock, confirmed real), Q3 (`memory` sub-module thinness).
- **2026-06-30 — architect (placement/seams/ADR), round 1:** verdict NEEDS REVISION; **all three placements confirmed correct** (durability→revive `memory`, growth→`mastery`, `Groei` tab). Warnings folded in: cite the `masteryModel.ts` fold (§2, W2); series-level lockstep HC + resolve the §3.2↔§6 re-derivation contradiction (§5/§6, W1); direct-import not barrel for the durability reader (§3.3, W3); restate `memory` omission as cohesion + scope to `stabilitySeries`/single-file, no `adapter.ts` (§3.3/§4, W4); update target-arch roster note + `analytics.md` same PR (§5, W5). Open UX note: 6 tabs at 390px. **Architect asked for one more round after these land — not a single-turnaround sign-off.**
- **2026-06-30 — data-architect (RPC contracts), round 1:** disposition NOT YET APPROVABLE; **Q1 + Q2 semantics confirmed correct**, `get_memory_health` drop confirmed clean (i2). Folded in: timezone-aware week boundaries (§3.2/§3.3, **M1 major**); `CASE WHEN` label clock for exact parity (§3.2, m1); inline TS row interfaces + char-for-char mappers (§3.2/§3.3, m2); zero-fill via `generate_series` (m3); `RETURNS json`/`json_agg` (i1); explicit `LATERAL`-over-`generate_series` shape for the stability reconstruction (§3.3, Q2 caveat).
- **2026-06-30 — architect (placement/seams), round 2: APPROVED.** Re-verified W1–W5 all correctly + completely addressed against live code; no new placement/seam drift; read-only boundary + ADR 0015 intact. Non-blocking notes carried: 6-tab 390px UX check + component directory (§3.4).
- **2026-06-30 — data-architect (RPC contracts), round 2: APPROVED.** All six round-1 findings verified resolved; both writer-reader-validator triangles close (growth = TS deriver + series lockstep HC; stability = inline typed interface, the correct minimum guard for a non-client-derivable cumulative read). Two MINOR implementer notes folded into §3.3: n=0 current-week boundary must use `now()`; `avg_stability_days` is `double precision`. → `status: approved`.
- **2026-06-30 — user direction (round 3): growth reshaped — "should not only be mastered; track all 4 states; a line per state, selectable."** The growth curve changed from a mastered-only **flow** (generalizing `get_weekly_movement`) to the **funnel over time** — a per-week-end snapshot of all 4 rungs (`introduced`/`learning`/`strengthening`/`mastered`), rendered as 4 selectable lines (§3.2, §3.4). This **dissolves** the staff-engineer double-count concern (snapshots can't double-count) and **retires** the `get_weekly_movement` generalization + its lockstep parity (replaced by funnel parity). Durability (§3.3) is unchanged. Reopens **Q4** (Path A client-derive vs Path B server RPC) → back to `draft`, re-dispatch architect + data-architect for the growth change only.

## 10. Review status — DRAFT (durability approved; growth reshape pending re-review)

Reached `approved` at round 2, then the 2026-06-30 growth reshape (§9 round 3) changed the **growth** contract — so back to `draft`. **Durability (§3.3) is unaffected and stays approved**; Phase 1 (durability) could even proceed independently. **Growth (§3.2/§3.4) needs one re-review round** on **Q4** (Path A client-derive vs Path B server RPC) — architect for the ADR-0015 seam, data-architect for the event-log-fetch shape / SQL replication. On sign-off: `reviewed_by: [staff-engineer, architect, data-architect]`, `status: approved`. Build surfaces unchanged except growth moves from a new RPC to `masteryModel.ts` `deriveFunnelSeries`/`getFunnelSeries` (Path A) or a `get_mastery_funnel_series` RPC (Path B).
