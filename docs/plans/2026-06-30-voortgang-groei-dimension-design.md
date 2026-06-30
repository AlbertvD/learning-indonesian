---
status: draft
reviewed_by: [staff-engineer, architect-r1, data-architect-r1]   # round-1 rigor pass done 2026-06-30 (see §9); both returned NEEDS REVISION → addressed. NOT yet approved — re-dispatch architect + data-architect for a clean round, then flip reviewed_by to [architect, data-architect] + status: approved.
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
- Weekly movement "lives IN `mastery`, not a separate `movement/` sub-module" (target-arch:688-689). The growth curve is the **time-series generalization of the existing `deriveWeeklyMovement` / `get_weekly_movement`** (`masteryModel.ts:745`, `:1003`), so it extends `mastery` — it does not add a parallel module. *(Architect confirmed this placement and rejected the `progress` sub-module alternative — splitting weekly-movement logic across two modules is the drift the architecture consolidated away.)*
- **`masteryModel.ts` is fold-slated** (target-arch:717-728 decomposes its ~524 LOC into `mastery/{model,rules,derive,aggregate,adapter}.ts`; the movement derivers land in `derive.ts`, the RPC wrappers in `adapter.ts`). The new `deriveMovementSeries` / `getMovementSeries` land **beside their single-week siblings** in the monolith and fold together as a unit — this composes (it is **not** the dialogue_line parallel-branch anti-pattern the rule warns against). Cited per CLAUDE.md's mandatory target-architecture grounding (2026-05-21).
- ADR 0015 (server-side RPC aggregation for small bounded results; mirrored predicate held in lockstep by a health check) is the precedent both new RPCs follow.

**No constraint conflict found:** both surfaces the design touches are reserved-but-empty in the target architecture; this design fills them at the intended seam. **Architect verdict (§9): all three placements confirmed** — durability→revive `memory`, growth→`mastery`, dedicated `Groei` tab.

## 3. Design

### 3.1 Data source (already recorded — this is the crux)

`capability_review_events` (migration.sql:1457) is **append-only, one row per review attempt**, never overwritten, indexed on `(user_id, created_at DESC)` (`:2352`). Each row carries `created_at`, `state_before_json`, `state_after_json` — the latter two include `stability`, `reviewCount`, `lapseCount`, `consecutiveFailureCount`, `lastReviewedAt`. The snapshot stats read the *overwritten* `learner_capability_state`; the trajectory stats read this *log*. **The history already exists; we add reads, not writes.** Trend depth is bounded by log age (currently short / test data — acceptable; real history accrues automatically from launch).

### 3.2 Growth curve — generalize weekly movement to a series

**New RPC `get_mastery_movement_series(p_user_id, p_timezone, p_weeks int default 12)`** → `RETURNS json` (a `json_agg` array, consistent with `get_daily_activity` migration.sql:2454; **not** `RETURNS TABLE`, which changes the supabase-js call shape — data-architect i1), one element per ISO week (most recent `p_weeks`, **zero-filled**):
`{ week_start: date, advanced_vocab: int, advanced_grammar: int, advanced_morphology: int, reached_mastered: int, slipped: int }`.

Body is `get_weekly_movement` (migration.sql:2382) generalized to a `p_weeks` series, keeping the same `funnelBucket` split, distinct-`source_ref` dedup, and `_mastery_label`, plus three corrections from the data-architect pass (§9):

- **Timezone-aware week boundaries (M1, blocking).** Bucket on `date_trunc('week', e.created_at AT TIME ZONE p_timezone)::date` and derive each week-end boundary the local-calendar way (`(date_trunc('week', now() AT TIME ZONE p_timezone) - n * interval '1 week') AT TIME ZONE p_timezone`), mirroring `get_daily_activity` / `get_practice_time` (migration.sql:2455-2466, 2306-2309). A raw `date_trunc('week', created_at)` truncates in **UTC** and misaligns the boundary with `get_weekly_movement` for any non-UTC learner (every learner here is `Europe/Amsterdam`).
- **`CASE WHEN` label clock (m1 — resolves Q1 *and* the lockstep parity in one stroke).** Pass `CASE WHEN e.created_at >= <current-week-boundary> THEN now() ELSE e.created_at END` as `_mastery_label`'s recency arg. For the **newest** week this is exactly `now()` → the newest bucket equals `get_weekly_movement` **exactly**, so the §6 lockstep HC holds as a hard equality; for **historical** weeks it is `e.created_at` → "was this mastered *at the time*?", the correct historical question (using `now()` would retroactively strip `mastered` off every cap reviewed >30d ago). The `at_risk` short-circuit is clock-independent (data-architect Q1 verdict).
- **Zero-fill (m3):** `generate_series(0, p_weeks-1)` + LEFT JOIN so every week appears, matching `get_daily_activity`.

**TS:** in `masteryModel.ts`, sibling to the single-week pair — a **pure `deriveMovementSeries(events, now?)`** (unit-tested, the TS mirror that backs the lockstep HC, exactly as `deriveWeeklyMovement` backs HC28) **plus** `getMovementSeries(userId, tz, weeks)` as the runtime-authoritative RPC wrapper. Define the row interface inline with **character-for-character** SQL column names before the snake→camel mapper (data-architect m2 — this is the `source_text`/`sentence` drift surface):
```ts
interface MovementWeekRow { week_start: string; advanced_vocab: number; /* …all 6, snake_case… */ }
export interface MovementWeek { weekStart: string; advancedVocab: number; /* …camelCase… */ }
```

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
A single un-LATERAL'd `DISTINCT ON` returns only **one** week — the LATERAL is load-bearing, not stylistic. Cumulative last-known state ⇒ a true trend, not "stability of words touched this week." The `(user_id, capability_id, created_at)` index (migration.sql:2353-2354) supports the per-week-end scan; bounded `p_weeks`, single-learner volume → cost fine (Q2 verdict). Since `commit_capability_answer_report` is the sole writer of **both** `learner_capability_state` and `capability_review_events`, the log is a complete projection of state history — the reconstruction matches the snapshot exactly. SECURITY INVOKER, `where user_id = p_user_id`.

**TS:** revive `src/lib/analytics/memory/index.ts` as a **single file** following the live `engagement` precedent (`createMemory(client)` + default instance — **no `adapter.ts` split**, scope is `stabilitySeries` ONLY, no speculative `retention/accuracy/health/latency` stubs — architect W4). Consume it by **direct import** (`@/lib/analytics/memory`), matching how the growth card's `mastery` sibling is imported (`@/lib/analytics/mastery/masteryModel`, Dashboard.tsx:25) — **do NOT route one card through the barrel while the other bypasses it** (architect W3). Define `StabilityWeekRow` (snake_case, char-for-char) + `StabilityWeek` (camelCase) inline like the growth interfaces (m2).

> **Self-contained — does NOT depend on `get_memory_health`** (staff-engineer pass, confirmed by data-architect i2). That function lives ONLY in the paper-trail `scripts/migrations/2026-05-01-learner-progress-functions.sql`, is absent from the canonical `scripts/migration.sql`, and is rendered nowhere — its live presence/shape is unverified, so the durability curve must not lean on it. `get_stability_series` reads `capability_review_events` directly and stands alone.

### 3.4 UI — one new tab

`Progress.tsx`: add `'groei'` to `Tab`/`TABS` and a `PillSegmented` entry (label `T.progress.tabGrowth`). Two cards under it:

- **`GrowthCurveCard`** — bar/line of per-week mastered units (stacked vocab/grammar/morphology, reusing the funnel's colour tokens), `slipped` shown honestly. **Carries a strategy nudge** (design read #2): e.g. "+12 woorden — houd je dagelijkse sessie vast om dit tempo te halen." Not a naked number.
  > **Headline = NET-DISTINCT, not a sum of weekly flows** (staff-engineer pass, §9). The per-week `reached_mastered` is a *flow* ("advanced a rung this week"); mastery is non-monotonic (advance→slip→re-advance), so **summing weeks double-counts** a word re-mastered twice — exactly the inflated vanity number the research warns against. The bars are honest *velocity*; the month headline must be **net-distinct words mastered now that weren't a month ago** (a snapshot diff, not a flow sum), or be labelled plainly as "rung-vooruitgang" (activity), never "X woorden geleerd."
- **`DurabilityCard`** — line of `avg_stability_days` over weeks. **Plain-language, calibrating headline** (design read #3): "Je geheugen houdt nu ~32 dagen vast (was 18 vorige maand)" — never raw "stability: 32.4". Pairs conceptually with the recognise/produce/listen skill card.

**Plateau handling** (design read #5): a flat/declining curve is framed as direction, not failure — a dip surfaces "X words to review" (the funnel already models `at_risk`/`slipped`), so a downturn reads as a recovery action, not a scolding. **Personal-trajectory only — no social comparison** (design read #4; the leaderboard stays retired).

## 4. Minimum-mechanism / omission test

| New piece | What breaks if omitted |
|---|---|
| `get_mastery_movement_series` | No growth trend — only Dashboard's single-week count exists; cannot show velocity/month-over-month. |
| `get_stability_series` | No durability trend — only a current snapshot (and that snapshot is itself unrendered today). |
| Revived `memory` sub-module | *Cohesion, not a functional break* (architect W4): keeping the function elsewhere still works, but puts retention/stability math inside `mastery` (whose job is the 6-state *label* hierarchy) — the conceptual muddle the roster's `memory`-vs-`mastery` split exists to prevent (target-arch:734-735). Scoped to `stabilitySeries` only; thinness of a correctly-placed module is not over-engineering (architect verdict). |
| `Groei` tab + 2 cards | The data has no surface; RPCs would be dead. |

**Explicitly NOT built** (would be mechanism beyond the goal): no new tables; no write-path instrumentation; no per-day granularity (week buckets match every existing time stat); no capability/coverage/reading-listening trajectory (those need the activity-tracking plumbing the user declined). `p_weeks` defaults to 12 — a bounded window, not unbounded history.

## 5. Supabase Requirements

### Schema changes
- **No new tables or columns.** Two new **SECURITY INVOKER** read RPCs in `scripts/migration.sql`: `get_mastery_movement_series`, `get_stability_series`. Both filter `where user_id = p_user_id` (the project's invoker-RPC safety idiom, migration.sql:571).
- **RLS:** none added. Both RPCs read `capability_review_events`, which already has owner-only read RLS (migration.sql:1514) + `grant select … to authenticated` (`:1535`).
- **Grants:** `grant execute on function … to authenticated` for both (mirrors `get_weekly_movement`, migration.sql:2476).
- Run `make migrate-idempotent-check` before merge (RPCs use `create or replace`).

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (`indonesian` already exposed; RPCs are reachable once defined).
- [ ] Kong CORS — **N/A** (no new headers/origins).
- [ ] GoTrue — **N/A.**
- [ ] Storage — **N/A.**

### Health check additions
- `scripts/check-supabase-deep.ts`: assert both functions exist + are `authenticated`-executable.
- **Series-level lockstep (ADR 0015 / HC28 precedent — architect W1):** the parity HC recomputes the **full series** from the SQL RPC and from the pure TS `deriveMovementSeries` over the *same* events and asserts they match — not just the newest bucket. (Newest-bucket-only would never exercise the historical `e.created_at` label clock, the genuinely novel logic.) The newest bucket additionally equals `get_weekly_movement` exactly (guaranteed by the `CASE WHEN` clock, §3.2), giving a second cheap anchor.

### Docs to update in the same PR (architect W5)
- `docs/target-architecture.md:684-692` — the roster-reconciliation note says `memory` "leaves the live barrel"; reviving it makes that stale.
- `docs/current-system/modules/analytics.md` — same-commit module-spec discipline (CLAUDE.md).

## 6. Testing

The growth side follows the live pattern exactly — **pure deriver (Vitest) + RPC + series-level lockstep HC** — which is why §3.2 specifies a pure `deriveMovementSeries` *and* the RPC wrapper (resolving the earlier §3.2-said-"no re-derivation" vs this section's deriver-test contradiction the architect flagged: the TS mirror exists **specifically** to back the lockstep, per ADR 0015).

- **TS pure derivers** (Vitest): `deriveMovementSeries` — empty log → zero-filled weeks; multi-week advancement dedups per `source_ref`; non-monotonic advance→slip→re-advance counted as flow per week (and the net-distinct headline NOT double-counting it); `slipped` counted. `deriveStabilitySeries` shape if any client-side helper exists (the RPC is authoritative for the cumulative reconstruction).
- **Component** (RTL): `Groei` tab renders the phase-1 card(s); deep-link `/progress?tab=groei`; durability shows plain-language days not raw stability; growth headline is net-distinct/velocity-labelled, plateau framing present.
- **Series-level lockstep parity** test backing the §5 health check (full SQL series == TS series over the same events; newest bucket == `get_weekly_movement`).

## 7. Phasing (staff-engineer pass, §9)

The event log is currently short and mostly disposable test data; a 12-week trajectory over it shows noise, not a learner. So **build in two phases — sequencing, not goal-shrinking; both curves remain the design:**

- **Phase 1 — durability curve** (`get_stability_series` + `memory` revival + `DurabilityCard`). The research's defensible-if-forced-to-one pick; self-contained; the calibration value lands even on a short log because it's about *strength*, not *count*.
- **Phase 2 — growth curve** (`get_mastery_movement_series` + `GrowthCurveCard`), landing once real post-launch history exists so the velocity bars and net-distinct headline are meaningful rather than test-noise.

Both phases ship behind the same `Groei` tab; Phase 1 may launch the tab with one card.

## 8. Resolved questions (all closed in the rigor pass)

- **Q1 — label clock — RESOLVED.** Data-architect verdict: `e.created_at` as the historical label clock is semantically correct; the `CASE WHEN e.created_at >= current-week-boundary THEN now() ELSE e.created_at END` refinement (§3.2) gives exact newest-bucket parity *and* correct history. `at_risk` short-circuit is clock-independent. No bug.
- **Q2 — cumulative stability — RESOLVED.** Data-architect verdict: `DISTINCT ON (capability_id) … <= week_end` is the correct reconstruction and matches `get_memory_health`'s snapshot semantics; must be a `LATERAL` over `generate_series` of week-ends (§3.3); cost acceptable at this volume.
- **Q3 — `memory` placement — RESOLVED.** Architect verdict: revive `memory` (correct, roster-faithful — retention/stability math belongs apart from `mastery`'s labeling job, target-arch:734-735); scoped to `stabilitySeries` only; do NOT fold into the skill card.

## 9. Review log

- **2026-06-30 — staff-engineer (soundness/simplicity):** verdict NEEDS WORK → addressed. Folded in: dropped the unverified `get_memory_health` dependency (§3.3); net-distinct growth headline to avoid the double-count vanity number (§3.4); committed to cumulative stability, rejected the in-week proxy (§8 Q2); phased the build durability-first (§7). Carried forward to rigor review: Q1 (label clock, confirmed real), Q3 (`memory` sub-module thinness).
- **2026-06-30 — architect (placement/seams/ADR), round 1:** verdict NEEDS REVISION; **all three placements confirmed correct** (durability→revive `memory`, growth→`mastery`, `Groei` tab). Warnings folded in: cite the `masteryModel.ts` fold (§2, W2); series-level lockstep HC + resolve the §3.2↔§6 re-derivation contradiction (§5/§6, W1); direct-import not barrel for the durability reader (§3.3, W3); restate `memory` omission as cohesion + scope to `stabilitySeries`/single-file, no `adapter.ts` (§3.3/§4, W4); update target-arch roster note + `analytics.md` same PR (§5, W5). Open UX note: 6 tabs at 390px. **Architect asked for one more round after these land — not a single-turnaround sign-off.**
- **2026-06-30 — data-architect (RPC contracts), round 1:** disposition NOT YET APPROVABLE; **Q1 + Q2 semantics confirmed correct**, `get_memory_health` drop confirmed clean (i2). Folded in: timezone-aware week boundaries (§3.2/§3.3, **M1 major**); `CASE WHEN` label clock for exact parity (§3.2, m1); inline TS row interfaces + char-for-char mappers (§3.2/§3.3, m2); zero-fill via `generate_series` (m3); `RETURNS json`/`json_agg` (i1); explicit `LATERAL`-over-`generate_series` shape for the stability reconstruction (§3.3, Q2 caveat).

## 10. Reviewers required

Per CLAUDE.md (data-model / reader-contract rule + `plan-review-gate`): this adds **reader RPC contracts**, so it needs **both `architect`** and **`data-architect`** in `reviewed_by:` before `status: approved`. Round 1 of both is logged in §9 (NEEDS REVISION → all findings addressed); both asked implicitly/explicitly for a clean re-review. **Next:** re-dispatch both → on clean sign-off, set `reviewed_by: [staff-engineer, architect, data-architect]` and `status: approved`.
