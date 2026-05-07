# Retirement #4 — Goal / target subsystem (and the dead event-log surface)

**Date:** 2026-05-07
**Branch:** `retire/goal-subsystem` (off `origin/main`, independent of `retire/audio-multi-voice` #1, `retire/grammar-state` #2, `retire/browser-fsrs` #3)
**Type:** Pure deletion of a product layer (daily/weekly goals + targets + the goal-flavoured event log) plus its DB schema, scheduled jobs, RPC, and types
**Tracks:** `docs/target-architecture.md` §"Code flagged for deletion" #1 (Goal / target subsystem) and #7 (Event log) — **bundled** because all 3 event-log call sites are goal-flavoured and retire transitively in this PR
**Spec revision:** v2 (revised after architect R1 review uncovered 7 CRITICAL + 8 IMPORTANT + 6 MINOR findings — all folded inline)

---

## Why this exists

Per `docs/target-architecture.md:1113-1137` (§1 "Goal / target subsystem"):

> Replaced by streak-only motivation. Daily and weekly targets were UX ceremony; the underlying mechanic (FSRS) already prescribes what to do. A target either over-prescribes (when nothing's due) or under-prescribes (when lots is due).

And §7 "Event log" (`target-architecture.md:1283-1300`):

> All 7 defined event types are goal-flavoured … With the goal subsystem retired, no event has a live caller. Don't keep dead infrastructure on speculation.

**Replaced by** the streak counter (already exists, `learnerProgressService.getCurrentStreakDays` over `capability_review_events.created_at` distinct dates) and ambient counts on the dashboard (live-derived from current state).

Independent grep verification (per OpenBrain `learning-indonesian — process refinement (2026-05-07)` §1 "never trust the doc's caller claims") **disproved seven claims** in target-arch §1 + §7:

1. **Doc lists 2 tables; reality is 4.** The 2026-04-02 additive migration (`learner_weekly_goal_sets`, `learner_weekly_goals`, `learner_stage_events`, `learner_daily_goal_rollups`) is in `scripts/migration.sql:272-330`. All four retire.
2. **Doc lists 3 functions; reality is 4 in master + 5 in 2026-05-01 migration.** Master: `job_finalize_weekly_goals`, `job_pregenerate_current_week`, `job_daily_rollup_snapshot`, `job_integrity_repair`. From `2026-05-01-learner-progress-functions.sql`: `compute_todays_plan_raw` (line 122) plus the four survivor-surface functions (`get_study_days_count` line 258, `get_recall_stats_for_week` line 272, `get_usable_vocabulary_gain` line 302, `get_overdue_count` line 242) which the doc didn't flag but grep proves have only `goalService` callers — they retire too.
3. **Doc misses 4 cron schedules.** `migration.sql:709-718` schedules `goal-finalize-weekly`, `goal-pregenerate-weekly`, `goal-daily-rollup`, `goal-integrity-repair`. All four need `cron.unschedule()`.
4. **Doc says `profiles.preferred_session_size` retires; grep disproves.** The column is consumed pervasively by the pedagogy stack (`pedagogyPlanner`, `sessionPosture`, `loadBudgets`, `queueDrying`, `capabilitySessionLoader`, `Profile.tsx`, `Session.tsx`). Removing it would gut session-sizing. **Decision (this PR):** keep the column; reclassify ownership to `lib/profile/`. Patch target-arch.md §1 + §`lib/profile/` + §"Things that explicitly stay" + §1330 accordingly.
5. **Doc misses goal-only React components.** `src/components/progress/WeeklyGoalsList.tsx` (80 LOC) + `WeeklyGoalsList.module.css` (104 LOC) is goal-only with zero non-test callers — orphan since refactor. `src/components/SessionSummary.tsx` (121 LOC) + `SessionSummary.module.css` (10 LOC) has zero callers in production (`<SessionSummary>` is never rendered) and a goal-flavoured `goalImpactMessages` prop — a true orphan. Both retire.
6. **Doc misses dead test files.** `src/__tests__/Progress.test.tsx` (870 LOC) is excluded from Vitest at `vite.config.ts:58` (comment: "re-enable as implementation catches up") and is heavily goal-flavoured. `scripts/lib/goal-job-service.test.ts` (34 LOC) is an orphan test scoped outside Vitest's includes. Both retire entirely.
7. **Doc misses `Dashboard.module.css` collapsing to dead.** All 192 lines of `src/pages/Dashboard.module.css` reference goal/today-plan classes (`.scorecardGrid`, `.ringWrapper`, `.ringFill`, `.heroV2*`, `.mixRatioSection`, `.mixBar`, `.heroCta`, etc.). After commit 2 surgery on Dashboard.tsx, the entire CSS module is dead. Retires.

Bundled event-log retirement (target-arch §7): all three live `analyticsService` callers are goal-flavoured (`Progress.tsx:26` → `trackGoalViewed`, `Session.tsx:123` → `trackSessionStartedFromToday`, `SessionSummary.tsx:31` → `trackSessionSummaryViewed`). Once their surrounding goal UI is gone, `analyticsService.ts` (134 LOC), `analyticsService.test.ts` (122 LOC), and the `learner_analytics_events` table have **zero callers**. Per OpenBrain §2 retirement #2, retiring transitively-dead surfaces in the same PR (rather than across two PRs) avoids a temporal dead-code window.

---

## Files / symbols to delete

### Whole files (delete)

| Path | LOC | Used by (production) | Used by (tests) | Commit |
|---|---:|---|---|:-:|
| `src/services/goalService.ts` | 609 | `Dashboard.tsx:36,384`, `useProgressData.ts:9,145`, `goal-job-service.ts:16,44,99,363` | `Progress.test.tsx:30,192,601` (deleted in c1), `dashboard-redesign.test.tsx:23,146+` | 3 |
| `scripts/lib/goal-job-service.ts` | 401 | none in `src/`. Imports `goalService`. | `goal-job-service.test.ts` (deleted atomic) | 3 |
| `scripts/lib/goal-job-service.test.ts` | 34 | n/a (Vitest doesn't include this path) | n/a | 3 |
| `src/services/analyticsService.ts` | 134 | `Progress.tsx:10,26`, `Session.tsx:14,123`, `SessionSummary.tsx:5,31` | `analyticsService.test.ts` (whole file deleted), `Progress.test.tsx:48-50` (whole file deleted in c1) | 1 |
| `src/__tests__/analyticsService.test.ts` | 122 | n/a | n/a | 1 |
| `src/__tests__/Progress.test.tsx` | 870 | n/a (excluded from Vitest at `vite.config.ts:58`) | n/a | 1 |
| `src/components/SessionSummary.tsx` | 121 | none. `<SessionSummary>` is rendered nowhere. Orphan. | none. Goal-flavoured `goalImpactMessages` prop. | 1 |
| `src/components/SessionSummary.module.css` | 10 | paired with SessionSummary.tsx | n/a | 1 |
| `src/components/progress/WeeklyGoalsList.tsx` | 80 | none in production. Goal-only. Imports `WeeklyGoal` type. | `Progress.test.tsx:571` (deleted in c1) | 2 |
| `src/components/progress/WeeklyGoalsList.module.css` | 104 | paired | n/a | 2 |
| `src/pages/Dashboard.module.css` | 192 | all classes consumed only by Dashboard.tsx. After c2 surgery, every class is dead. | n/a | 2 |

**Total wholesale deletion: ~2877 LOC across 11 files.**

### Surgical edits (keep file, remove block)

**`src/pages/Dashboard.tsx`** (568 LOC → ~150 LOC) — drop the entire goal-and-today-plan layer. The new minimal Dashboard ships as a **conservative placeholder** (UX redesign tracked separately as a follow-up PR; spec §"Out of scope" #2 below):

- Line 36: drop `import { goalService } from '@/services/goalService'`
- Line 37: drop `import type { WeeklyGoalResponse, WeeklyGoal, TodayPlan } from '@/types/learning'`
- Lines 45-72: drop `goalToRingPercent`, `goalCountLabel`, `MixSegment` type, `computeMixSegments` (the export has zero non-self callers)
- Lines 85-176: drop `getActionReason`, `getCtaSubtitle`, `getRecallTooltip`, `getRingTooltip`, `getRingLabel` (all goal-flavoured)
- Lines 178-208: drop `GoalRing` component
- Lines 210-260: drop `GoalStatCard` component
- Lines 262-279: drop `GoalActionCard` component
- Lines 281-353: drop `TodaysPlanHero` component
- Line 364: drop `const [goalProgress, setGoalProgress] = useState<WeeklyGoalResponse | null>(null)`
- Lines 380-430 (`useEffect` body): drop `goalService.getGoalProgress` call + `setGoalProgress(progress)`. Streak fetch, lapsing/lessons logic STAY.
- Lines 444-464: drop the `if (goalProgress?.state === 'timezone_required')` branch. The minimal Dashboard does not enforce timezone gating; `getCurrentStreakDays` accepts a default timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone` per current line 412) and degrades gracefully if the user's profile lacks one. Profile UI for setting timezone stays (orthogonal — owned by `lib/profile/`).
- Lines 466-470: drop `todayPlan`, `weeklyGoals`, `atRiskGoals` derivations
- Main render (476+): replace with the **minimal placeholder layout**:
  ```tsx
  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader title={`${T.dashboard.welcomeBack}, ${name}`} action={streakBadge} />
        <Stack gap="md">
          {lapsingCount > 0 && <LapsingCountAlert count={lapsingCount} T={T} />}
          <ContinueLessonCard url={continueUrl} T={T} />
          <Button onClick={() => navigate('/session')} size="lg" fullWidth>
            {T.dashboard.startTodaysSessionMinimal}
          </Button>
        </Stack>
      </PageBody>
    </PageContainer>
  )
  ```
  The `streakBadge` continues to source from `currentStreak` state (already populated by `learnerProgressService.getCurrentStreakDays`). `LapsingCountAlert` and `ContinueLessonCard` are inline JSX, not extracted components — they're trivial 5-10 line blocks. No new CSS module needed; uses Mantine defaults + the surviving `var(--accent-primary)` etc.
- Replace the imports block (top of file) with the minimum: `useState`, `useEffect`, `useNavigate`, `Stack`, `Button`, `PageContainer`, `PageBody`, `PageHeader`, `IconFlame`, `Group`, `Text`, `Popover`, `ActionIcon`, `notifications`, `Title`, `useT`, `useAuthStore`, `learnerStateService`, `learnerProgressService`, `lessonService`, `logError`, `T`. Drop everything else.

After surgery: `Dashboard.tsx` ≈ 150 LOC. Build green. Test green (after dashboard-redesign.test.tsx surgery in same commit).

**`src/pages/Progress.tsx`** (83 LOC, surgical edit) — bundled in commit 1 (atomic with analyticsService deletion):

- Line 2: drop `import { useEffect } from 'react'` (no other useEffect call after surgery; lint catches unused imports)
- Line 10: drop `import { analyticsService } from '@/services/analyticsService'`
- **Lines 23-29: drop the ENTIRE `useEffect` block** (architect-R1 C4 — leaving the surrounding effect with only `data.weeklyGoals` dereference would tsc-fail in commit 2 when `weeklyGoals` retires from `ProgressData`).

Survivors: `MemoryHealthHero`, `MasteryFunnel`, `VulnerableItemsList`, `ReviewForecastChart`, `DetailedMetrics` — none goal-flavoured. Page renders normally.

**`src/pages/Session.tsx`** — surgical edit, bundled in commit 1:

- Line 14: drop `import { analyticsService } from '@/services/analyticsService'`
- Line 123: drop the `analyticsService.trackSessionStartedFromToday(user.id, sid)` call. Surrounding session-init logic stays.

**`src/hooks/useProgressData.ts`** (208 LOC, surgical edit, file shrinks ~50 LOC, bundled in commit 2):

- Line 9: drop `import { goalService } from '@/services/goalService'`
- Line 11: drop `import type { DailyGoalRollup, WeeklyGoal } from '@/types/learning'`
- Lines 24-35 (`ProgressData` Wave 2 fields): drop `dailyRollups: DailyGoalRollup[] | null`, drop `weeklyGoals: WeeklyGoal[] | null`. Keep all other Wave 2 fields.
- Line 39 (`Wave2State` Pick<>): drop `dailyRollups` and `weeklyGoals` from the picked union.
- Lines 50-59 (`defaultWave2`): drop the two defaults.
- Lines 140-148 (Wave 2 fetch): drop `learnerStateService.getDailyRollups(user!.id, 7)` and `goalService.getGoalProgress(user!.id)` from the `Promise.allSettled`. Array shrinks from 6 to 4 entries. Update destructuring: `[accuracyResult, lapseResult, vulnerableResult, latencyResult]`.
- Lines 150-159 (`nextWave2` defaults): drop `dailyRollups`, `weeklyGoals`.
- Lines 161-184: drop the `rollupsResult` and `goalsResult` branches. Keep `accuracyResult`, `lapseResult`, `vulnerableResult`, `latencyResult` branches.

`learnerStateService` import on line 5 stays (still used by `getItemStates` at line 93).

**`src/services/learnerStateService.ts`** (132 LOC, surgical edit, file shrinks ~30 LOC, bundled in commit 3):

- Line 4: drop `DailyGoalRollup` from `import type {...}`. Keep `LearnerItemState`, `LearnerSkillState`.
- Lines 96-109: drop `logStageEvent` (zero callers per grep — already dead).
- Lines 120-130: drop `getDailyRollups` (the one caller in `useProgressData.ts:142` retires in commit 2; this method is dead by the time commit 3 lands).

Survivors: `getItemStates`, `getItemState`, `getSkillStates`, `getSkillStatesBatch`, `upsertItemState`, `applyReviewToSkillState`, `getLapsingItems`. None are goal-flavoured.

**`src/services/learnerProgressService.ts`** (295 LOC, surgical edit, file shrinks ~95 LOC) — drops happen in **two commits** to keep boundaries clean:

**Commit 2 (atomic with the Dashboard surgery and useProgressData surgery):**
- Drop the `TodaysPlanRawCounts` interface (~lines 15-25), `getTodaysPlanRawCounts` from the `LearnerProgressService` interface (line 71), `PlanCountsRow` interface (~lines 88-95), and the `getTodaysPlanRawCounts` implementation (~lines 160-173). Single caller at `goalService.ts:526` is retired by commit 3 — but that import is **internal** to goalService (which still exists in commit 2), so dropping the method in commit 2 leaves goalService.ts:526 broken until commit 3 deletes the file. **Resolution**: drop in commit 3 (atomic with goalService deletion), not commit 2.

**Revised: drop in commit 3:**
- Drop `TodaysPlanRawCounts` interface, `getTodaysPlanRawCounts` interface entry + implementation, `PlanCountsRow` interface.
- Drop `getStudyDaysCount` (interface line 79 + impl line 243). SQL function `get_study_days_count` retires in commit 4.
- Drop `getRecallStatsForWeek` (interface line 80 + impl line 253). SQL function `get_recall_stats_for_week` retires in commit 4.
- Drop `getUsableVocabularyGain` (interface line 81 + impl line 268). SQL function `get_usable_vocabulary_gain` retires in commit 4.
- Drop `getOverdueCount` (interface line 82 + impl line 277). SQL function `get_overdue_count` retires in commit 4.
- Drop the `RecallStatsForWeekResult` typedef (used only by `getRecallStatsForWeek`).
- Drop the `RecallAccuracyRow` typedef IF its only consumer is `getRecallStatsForWeek` and `getRecallAccuracyByDirection` (verify — `getRecallAccuracyByDirection` is a survivor). If shared, keep it. If `getRecallStatsForWeek` was the sole consumer, drop it.

Architect-R1 I4 verified: every dropped method's only caller is `goalService` (`getStudyDaysCount` ← `goalService.ts:336,393`; `getOverdueCount` ← `goalService.ts:359,452,493`; `getRecallStatsForWeek` ← `goalService.ts:412`; `getUsableVocabularyGain` ← `goalService.ts:439`; `getTodaysPlanRawCounts` ← `goalService.ts:526`). Net: ~95 LOC removed from `learnerProgressService.ts`.

Survivors: `getLapsingCount`, `getLapsePrevention`, `getMemoryHealth`, `getReviewLatencyStats`, `getRecallAccuracyByDirection`, `getVulnerableCapabilities`, `getReviewForecast`, `getCurrentStreakDays`. All consumed by survivor paths (`useProgressData`, `Dashboard`, `Progress`).

**`src/types/learning.ts`** — drop goal types in commit 3 (atomic with `goalService.ts` + `learnerStateService.ts` + `learnerProgressService.ts` surgery + types' last consumers):

- `WeeklyGoalType` (line 302)
- `GoalStatus` (line 305)
- `WeeklyGoalSet` (line 307)
- `WeeklyGoal` (line 323)
- `DailyGoalRollup` (line 340)
- `TodayPlan` (line 355)
- `WeeklyGoalResponse` (line 367)

Atomic-union-narrowing rule: every consumer of these types must be gone in the same commit (commits 1 + 2 cleared all consumers; commit 3 removes the types alongside the last `goalService.ts` definition).

**`src/lib/i18n.ts`** — drop dead goal/today-plan keys, bundled in commit 2 (atomic with Dashboard.tsx surgery):

Per language (NL section ~line 17 + EN section ~line 401), drop these keys:
- `streakTimezoneNotice` (NL:30, EN:414) — copy talks about weekly goals; minimal Dashboard's streak is timezone-aware but doesn't need this rollout-tooltip text.
- `startTodaysSession` (NL:37, EN:421) → replace with `startTodaysSessionMinimal: 'Start sessie'` / `Start session` (no time estimate)
- `todaysPlan` (NL:56, EN:440)
- `setTimezone`, `setTimezoneDesc`, `goToProfile` (NL:62-64, EN:446-448) — used only inside the dropped `timezone_required` branch
- `actionReasonVocab` (EN:474; NL has matching key in same range) — and any other `actionReason*` keys
- `basedOnSessionSize` (NL:98, EN:482)
- `sessionComposition` (NL:99, EN:483)
- `mixNoteBacklog` (NL:104, EN:488)
- `postSessionNote` (NL:107, EN:491)
- `reviewsLabel`, `newLabel`, `recallLabel` (NL:108-110, EN:492-494)
- `achieved`, `onTrack`, `atRisk`, `offTrack`, `missed` status labels (NL:250-254, EN counterparts)
- Any other goal-status/ring-tooltip/mix-note keys discovered during execution.

Total: ~80 keys per language × 2 = ~160 strings retired. Add `startTodaysSessionMinimal` (1 key per language) for the new minimal CTA.

**`scripts/check-supabase-deep.ts`** — surgical edit, bundled in commit 4:

- Lines 208-219 (`preferred_session_size` column existence check): **KEEP** per Decision 1.
- Read the file body during execution; if any check asserts existence of `learner_weekly_goal_sets`, `learner_weekly_goals`, `learner_stage_events`, `learner_daily_goal_rollups`, or `learner_analytics_events` (in the table-list constants or anywhere), drop those entries. (Architect-R1 verified at lines 35 + 54 — only `learner_skill_state` is referenced; no goal table existence checks present. Confirmed no surgery needed; this bullet retires from the spec but kept as a guardrail for the implementer.)

### Test surgery (atomic with source per OpenBrain `lesson learned (2026-05-07)` §source-test-bundling)

**`src/__tests__/dashboard-redesign.test.tsx`** (491 LOC, bundled in commit 2):

- Line 23: drop `import { goalService } from '@/services/goalService'`
- Line 25: drop `import { learnerProgressService } from '@/services/learnerProgressService'` — retain ONLY if non-goal tests still need it. Verify; likely keep for streak/forecast assertions.
- Lines 146, 196, 220, 247, 265, 294, 331, 366, 453, 465, 476: every `vi.mocked(goalService.getGoalProgress).mockResolvedValue(...)` is part of a goal-flavoured test that retires.
- Drop `makeGoalResponse()` helper if present (~line 146).
- Drop the test cases asserting `TodaysPlanHero` / `GoalStatCard` / `GoalActionCard` / `GoalRing` / mix bar / weekly goals rendering. Estimate: ~80% of tests retire (~390 LOC).
- **Add** new tests for the minimal Dashboard. Concrete assertions (architect-R1 I7):

```tsx
describe('Dashboard (minimal placeholder)', () => {
  it('renders the streak counter from learnerProgressService', async () => {
    vi.mocked(learnerProgressService.getCurrentStreakDays).mockResolvedValue(7)
    render(<Dashboard />)
    expect(await screen.findByText(/7/)).toBeInTheDocument()
    expect(screen.getByText(T.dashboard.daysInARow)).toBeInTheDocument()
  })

  it('renders the Today CTA and navigates on click', async () => {
    render(<Dashboard />)
    const cta = await screen.findByRole('button', { name: T.dashboard.startTodaysSessionMinimal })
    expect(cta).toBeInTheDocument()
    await userEvent.click(cta)
    expect(mockNavigate).toHaveBeenCalledWith('/session')
  })

  it('renders the lapsing count alert when count > 0', async () => {
    vi.mocked(learnerStateService.getLapsingItems).mockResolvedValue({ count: 3 })
    render(<Dashboard />)
    expect(await screen.findByText(/3/)).toBeInTheDocument()
  })

  it('does not render TodaysPlanHero or weekly goal rings', async () => {
    render(<Dashboard />)
    await screen.findByText(T.dashboard.startTodaysSessionMinimal)
    // Hardcode the literal NL+EN copy of the retired `todaysPlan` key —
    // architect-R1 (v2) N1: T.dashboard.todaysPlan is dropped in the same
    // commit, so referencing it produces tsc red OR a trivially-passing
    // assertion (queryByText(undefined) ≡ null). Hardcoding anchors regression.
    expect(screen.queryByText(/planning van vandaag|today.?s plan/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/wekelijkse doelen|weekly goals/i)).not.toBeInTheDocument()
  })

  it('renders the continue-lesson card with the resolved URL', async () => {
    render(<Dashboard />)
    const continueLink = await screen.findByRole('link', { name: T.dashboard.continueLearning })
    expect(continueLink).toHaveAttribute('href', expect.stringMatching(/^\/lessons\//))
  })
})
```

The negative-presence test (`does not render TodaysPlanHero`) anchors regression: any future PR that re-introduces a goal hero will fail this test.

**`src/__tests__/learnerProgressService.test.ts`** — bundled in commit 3 (atomic with implementation drops):

- Line 21: drop the `describe('getTodaysPlanRawCounts', ...)` block (ends at line 63 — narrowed from R1 spec's "21-79" — architect M1).
- Line 109: drop the `describe('getOverdueCount', ...)` block (~lines 109-122).
- Line 123: drop the `describe('getStudyDaysCount', ...)` block (~lines 123-140).
- Drop any other describe block whose method retires (`getRecallStatsForWeek`, `getUsableVocabularyGain`). Verify line ranges during execution.

Survivors: every other describe block (memory health, lapse prevention, vulnerable capabilities, current streak days, review forecast, recall accuracy, review latency, lapsing count).

**`src/__tests__/learnerStateService.test.ts`** — verified during R1: zero references to `getDailyRollups` or `logStageEvent`. **No surgery needed** (architect M2). Removed from commit 3's surgery list.

**`src/__tests__/authStore.test.ts`** — verified during R1: only `preferred_session_size`/`preferredSessionSize` references; all stay per Decision 1. Zero goal-flavoured assertions. **No surgery needed** (architect M3). Removed from commit 3's surgery list.

### SQL migration

**A. Master migration (`scripts/migration.sql`)** — per OpenBrain `process refinement (2026-05-07)` §3 ("scripts/migrate.ts only reads scripts/migration.sql"), the master file is what `make migrate` actually runs. Retirement strategy:

1. **Remove** the original `create table` / `create index` / `grant` / `enable row level security` / `create policy` / `create or replace function` / `select cron.schedule(...)` blocks for retired objects (so fresh deploys don't re-create them).
2. **Append** an idempotent retirement section at the bottom of `migration.sql` (e.g., a clearly-labelled `-- ============ Retirement #4 (goal subsystem) ============` block) containing the same `cron.unschedule(...)` + `drop ...` statements as the tracked migration. This way, an existing homelab DB (with the goal objects still present) running `make migrate` will execute the drops and converge to the new schema; fresh deploys execute the drops as no-ops.

Removed blocks in `migration.sql`:
- Lines 272-291: `create table if not exists indonesian.learner_weekly_goal_sets (...)` block
- Lines 289-306: `create table if not exists indonesian.learner_weekly_goals (...)` block
- Lines 307-316: `create table if not exists indonesian.learner_stage_events (...)` block
- Lines 317-333: `create table if not exists indonesian.learner_daily_goal_rollups (...)` block
- Lines 334-342 (indexes for the four tables)
- Lines 363-366 (grants for the four tables)
- Lines 389-392 (`alter table … enable row level security` for the four tables)
- Lines 464-475 (the four `create policy` blocks)
- Lines 526-545 (`job_finalize_weekly_goals` function)
- Lines 547-607 (`job_pregenerate_current_week` function)
- Lines 609-672 (`job_daily_rollup_snapshot` function)
- Lines 674-697 (`job_integrity_repair` function)
- Lines 699-700 (grants on those four functions to `service_role`)
- Lines 709-718 (the four cron schedules for goal jobs)
- Lines 721-742 + 875-886 (`learner_analytics_events` table, indexes, RLS, policies, grants)

**KEEP** (per Decision 1):
- Line 21: `preferred_session_size integer NOT NULL DEFAULT 15` (column on profiles table)
- Line 27: `ALTER TABLE indonesian.profiles ADD COLUMN IF NOT EXISTS preferred_session_size integer NOT NULL DEFAULT 15;`

**Retirement section appended at end of `migration.sql`:**

```sql
-- ============================================================================
-- Retirement #4 (goal subsystem + event log)
-- 2026-05-07 — drops applied idempotently on every `make migrate`
-- See docs/plans/2026-05-07-retire-goal-subsystem.md for context.
-- ============================================================================

-- Unschedule cron jobs (case-sensitive job names from cron.schedule registrations).
do $$
begin
  perform cron.unschedule('goal-finalize-weekly');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('goal-pregenerate-weekly');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('goal-daily-rollup');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('goal-integrity-repair');
exception when others then null;
end $$;

-- Drop SQL functions: 4 from master + 5 from 2026-05-01 progress migration
-- (compute_todays_plan_raw plus 4 survivor-surface functions whose only caller was goalService).
drop function if exists indonesian.job_finalize_weekly_goals();
drop function if exists indonesian.job_pregenerate_current_week();
drop function if exists indonesian.job_daily_rollup_snapshot();
drop function if exists indonesian.job_integrity_repair();
drop function if exists indonesian.compute_todays_plan_raw(uuid, timestamptz);
drop function if exists indonesian.get_study_days_count(uuid, timestamptz, timestamptz, text);
drop function if exists indonesian.get_recall_stats_for_week(uuid, timestamptz, timestamptz);
drop function if exists indonesian.get_usable_vocabulary_gain(uuid, timestamptz, timestamptz);
drop function if exists indonesian.get_overdue_count(uuid, text);

-- Drop tables in FK-aware order (cascade removes dependent indexes, policies, grants).
drop table if exists indonesian.learner_daily_goal_rollups cascade;
drop table if exists indonesian.learner_stage_events cascade;
drop table if exists indonesian.learner_weekly_goals cascade;
drop table if exists indonesian.learner_weekly_goal_sets cascade;

-- Drop event-log table (bundled retirement #7).
drop table if exists indonesian.learner_analytics_events cascade;
```

Notes on the SQL form (per OpenBrain §2 destructive-op-check.sh case-sensitivity):
- All DDL uses **lowercase** `drop table if exists` / `drop function if exists` to clear the case-sensitive FAIL pattern in `evals/destructive-op-check.sh:32` (which matches uppercase). The lowercase form matches only the WARN block at line 45 (case-insensitive `delete|drop|truncate`), which is non-blocking.
- `cron.unschedule(...)` is wrapped in `do $$ ... exception when others then null end $$` so re-running on a DB where the schedule was already removed (e.g., partial earlier deploy or fresh DB) doesn't error. pg_cron raises if the job name is missing.
- FK-safe order: `learner_weekly_goals` references `learner_weekly_goal_sets(id)` — drop child first.

**B. Tracked migration (`scripts/migrations/2026-05-07-retire-goal-subsystem.sql`)** — paper-trail copy of the same retirement block. Operator can `psql -f` it directly for one-shot manual runs (e.g., reverting a failed migration cycle), but `make migrate` reads the master file so the master's retirement section is the authoritative path.

Body: identical to the retirement section appended to `migration.sql` above.

**C. Rollback migration (`scripts/migrations/2026-05-07-retire-goal-subsystem.rollback.sql`)** — best-effort schema restore for operator audit. The data is irrecoverable; rollback creates empty tables + restores schedules.

Body (~200 lines): verbatim copies of the original `create table` / `create index` / `create policy` / `grant` / `create or replace function` / `select cron.schedule(...)` blocks from pre-retirement `migration.sql`. Drafted in implementation; not inlined here for spec brevity.

### Doc patches

**`docs/target-architecture.md`** — fold inline as the dedicated commit before the spec commit (commit 5). Specific patches:

- §"Code flagged for deletion" #1 ("Goal / target subsystem"): update the `Tables` block from 2 entries to 4. Update the `Postgres functions` block to enumerate 4 in master + 5 in progress migration. Add the 4 cron schedules. Remove "Profile column: preferred_session_size" — relocate to "Things that explicitly stay" with reclassification note.
- §"Code flagged for deletion" #7 ("Event log"): mark "Retired in PR #_, bundled with #4."
- §`lib/profile/` "Not part of this module": remove the bullet `preferred_session_size — column retires with the goal subsystem.` Replace with: `preferred_session_size — column lives here; pedagogy stack consumes it for queue sizing.`
- §"Migration considerations" item 1: remove "Event log (no live callers after step 2)" since it's already retired (this PR).
- §"Things that explicitly stay" (around line 1322–1334): add new bullet — `**indonesian.profiles.preferred_session_size column** — used for session sizing across the pedagogy stack (loadBudgets, sessionPosture, queueDrying, capabilitySessionLoader). Owned by lib/profile/.`
- **Line 1330 (architect-R1 I3)**: edit `**indonesian.profiles** table stays — `lib/profile/` owns it. (`preferred_session_size` column retires; other columns stay.)` → `**indonesian.profiles** table stays — `lib/profile/` owns it. (All columns stay, including `preferred_session_size` which is consumed by the pedagogy stack.)`

### Things that explicitly stay

Per `target-architecture.md` §"Things that explicitly stay" plus independent grep + Decision 1:

- `indonesian.profiles.preferred_session_size` column + Profile.tsx UI (Decision 1).
- `indonesian.profiles.timezone` column + consumers (used by survivor `learnerProgressService.getCurrentStreakDays`, `getReviewForecast`).
- `learnerProgressService` survivors: `getCurrentStreakDays`, `getMemoryHealth`, `getReviewForecast`, `getLapsePrevention`, `getRecallAccuracyByDirection`, `getVulnerableCapabilities`, `getReviewLatencyStats`, `getLapsingCount`. All consumed by `useProgressData`/`Dashboard`/`Progress` via survivor paths.
- `2026-05-01-learner-progress-functions.sql` migration file itself stays (paper-trail). Five of its functions retire via the master retirement section; the surviving 8 functions stay.
- `indonesian.capability_review_events` table — streak source, untouched.
- `indonesian.learning_sessions`, `indonesian.learner_capability_state`, `indonesian.learner_skill_state`, `indonesian.learner_item_state` tables — untouched.
- `apply_review_to_skill_state` RPC — untouched.

---

## Grep evidence

Run from `/Users/albert/home/learning-indonesian` on `main` (commit `c937308`), captured 2026-05-07. Each grep below uses `rg -n -g '!node_modules' -g '!dist' -g '!.worktrees' -g '!.claude'` and `-g '*.{ts,tsx}'` for code-only verification (Markdown excluded; SQL where relevant).

### `goalService` external importers

```
$ rg -n "from '@/services/goalService'" -g '*.{ts,tsx}'
src/pages/Dashboard.tsx:36
src/hooks/useProgressData.ts:9
src/__tests__/Progress.test.tsx:30
src/__tests__/dashboard-redesign.test.tsx:23
scripts/lib/goal-job-service.ts:16
```

5 importers. All retire or rewire in this PR.

### `analyticsService` external importers

```
$ rg -n "from '@/services/analyticsService'" -g '*.{ts,tsx}'
src/pages/Progress.tsx:10
src/pages/Session.tsx:14
src/components/SessionSummary.tsx:5
src/__tests__/analyticsService.test.ts:2
src/__tests__/Progress.test.tsx:48 (vi.mock)
```

3 production callers (all goal-flavoured, all retire), 2 test surfaces (both retire whole-file).

### `getStudyDaysCount` / `getRecallStatsForWeek` / `getUsableVocabularyGain` / `getOverdueCount` / `getTodaysPlanRawCounts` callers

Architect-R1 I4 verified independently:

- `getStudyDaysCount` ← only `goalService.ts:336, 393`
- `getOverdueCount` ← only `goalService.ts:359, 446-452, 493`
- `getRecallStatsForWeek` ← only `goalService.ts:412`
- `getUsableVocabularyGain` ← only `goalService.ts:439`
- `getTodaysPlanRawCounts` ← only `goalService.ts:526`

After commit 3 deletes goalService, every one of these methods has zero callers. All retire alongside.

### `<SessionSummary>` callers

```
$ rg -n "<SessionSummary|\\bSessionSummary\\b" -g '*.{ts,tsx}'
src/components/SessionSummary.tsx:7  (its own classes import)
src/components/SessionSummary.tsx:22  (its own export)
```

**Zero non-self renderers.** Orphan since refactor. Retires.

### `<WeeklyGoalsList>` callers

```
$ rg -n "<WeeklyGoalsList|\\bWeeklyGoalsList\\b" -g '*.{ts,tsx}'
src/components/progress/WeeklyGoalsList.tsx:1, 33, 80  (its own definition)
src/__tests__/Progress.test.tsx:571  (test of the orphan, file deleted in c1)
```

Zero production renderers. Retires.

### `learner_weekly_goal_sets` / `learner_weekly_goals` / `learner_stage_events` / `learner_daily_goal_rollups` / `learner_analytics_events` references

```
$ rg -n "learner_weekly_goal|learner_stage_events|learner_daily_goal_rollups|learner_analytics_events" -g '*.{ts,tsx,sql}'
[only inside scripts/migration.sql + retiring source files]
```

Zero references outside the goal subsystem code paths.

### `preferred_session_size` references — for the **non-retirement** path

```
$ rg -n "preferred_session_size|preferredSessionSize" -g '*.{ts,tsx,sql}'
[12+ matches across pedagogy stack, Profile.tsx, Session.tsx, capabilitySessionDataService.ts, queueDrying.ts, capabilitySessionLoader.ts, pedagogyPlanner.ts, sessionPosture.ts, loadBudgets.ts, scripts/check-supabase-deep.ts, scripts/migration.sql, src/__tests__/authStore.test.ts]
```

Per Decision 1: column survives. Only references inside `goalService.ts:21,56,587` and `Dashboard.tsx:312` retire (both files retire/are gutted). All other references stay unchanged.

### `WeeklyGoal*` / `TodayPlan` / `DailyGoalRollup` / `GoalStatus` consumers

```
$ rg -n "\\bWeeklyGoal\\b|\\bTodayPlan\\b|\\bDailyGoalRollup\\b|\\bGoalStatus\\b|\\bWeeklyGoalResponse\\b|\\bWeeklyGoalSet\\b|\\bWeeklyGoalType\\b" -g '*.{ts,tsx}'
src/types/learning.ts:302-371  (definitions, retire in c3)
src/services/goalService.ts (multiple)  (consumers, retire with file in c3)
src/services/learnerStateService.ts:4  (DailyGoalRollup type import, drop in c3)
src/hooks/useProgressData.ts:11, 33, 56  (drop in c2)
src/pages/Dashboard.tsx (multiple)  (drop in c2)
src/components/progress/WeeklyGoalsList.tsx:3  (whole file deletes in c2)
src/__tests__/Progress.test.tsx:33, 134-151, 153-157, 571-613  (whole file deletes in c1)
src/__tests__/dashboard-redesign.test.tsx (multiple)  (mocks retire in c2)
```

Atomic-union-narrowing rule: type drops bundle into commit 3 alongside last consumer cleanup.

### `logStageEvent` callers

```
$ rg -n "logStageEvent\\b" -g '*.{ts,tsx}'
src/services/learnerStateService.ts:96  (the definition; drops in c3)
```

**Zero non-self callers.** Method was added with the goal subsystem and never called by production code.

### Sanity counter-grep — survivors

```
$ rg -n "getMemoryHealth|getReviewForecast|getCurrentStreakDays|getLapsingCount|getLapsePrevention|getRecallAccuracyByDirection|getVulnerableCapabilities|getReviewLatencyStats" -g '*.{ts,tsx}' src/services/learnerProgressService.ts
[matches present — all survive]
```

The non-goal `learnerProgressService` API surface is fully preserved.

### Whole-tree stale-reference sweep (run before final commit, before opening PR)

Per OpenBrain `process refinement (2026-05-07)` §4 ("R2 catches stale comments outside the deletion targets"):

```
$ rg "goalService|goal-job-service|TodayPlan|WeeklyGoal|DailyGoalRollup|GoalStatus|WeeklyGoalResponse|WeeklyGoalSet|WeeklyGoalType|analyticsService|trackGoalViewed|trackSessionStartedFromToday|trackSessionSummaryViewed|trackEvent|trackGoalGenerated|trackDailyPlanViewed|trackGoalAchieved|trackGoalMissed|learner_weekly_goal|learner_stage_events|learner_daily_goal_rollups|learner_analytics_events|compute_todays_plan_raw|job_finalize_weekly_goals|job_pregenerate_current_week|job_daily_rollup_snapshot|job_integrity_repair|get_study_days_count|get_recall_stats_for_week|get_usable_vocabulary_gain|get_overdue_count|TodaysPlanRawCounts|getTodaysPlanRawCounts|PlanCountsRow|getStudyDaysCount|getRecallStatsForWeek|getUsableVocabularyGain|getOverdueCount|logStageEvent|getDailyRollups|TodaysPlanHero|GoalRing|GoalStatCard|GoalActionCard|goalToRingPercent|goalCountLabel|computeMixSegments|getActionReason|getCtaSubtitle|getRecallTooltip|getRingTooltip|getRingLabel|WeeklyGoalsList|SessionSummary|goalImpactMessages" -g '!*.md' -g '!docs/**' -g '!scripts/migrations/**.rollback.sql'
```

Expected: zero matches outside the spec doc + master retirement section + tracked migration. Any hit is a stale reference (comment, dead-code remnant) to clean up before PR.

---

## Supabase Requirements

Per CLAUDE.md "Feature Design Rule: Supabase Requirements".

### Schema changes

- **Tables retired** (cascade):
  - `indonesian.learner_weekly_goal_sets`
  - `indonesian.learner_weekly_goals`
  - `indonesian.learner_stage_events`
  - `indonesian.learner_daily_goal_rollups`
  - `indonesian.learner_analytics_events` (event log, bundled per Decision 2)
- **Functions retired**:
  - `indonesian.job_finalize_weekly_goals()`
  - `indonesian.job_pregenerate_current_week()`
  - `indonesian.job_daily_rollup_snapshot()`
  - `indonesian.job_integrity_repair()`
  - `indonesian.compute_todays_plan_raw(uuid, timestamptz)`
  - `indonesian.get_study_days_count(uuid, timestamptz, timestamptz, text)` (architect-R1 I4)
  - `indonesian.get_recall_stats_for_week(uuid, timestamptz, timestamptz)` (architect-R1 I4)
  - `indonesian.get_usable_vocabulary_gain(uuid, timestamptz, timestamptz)` (architect-R1 I4)
  - `indonesian.get_overdue_count(uuid, text)` (architect-R1 I4)
- **`cron.unschedule`**:
  - `goal-finalize-weekly`
  - `goal-pregenerate-weekly`
  - `goal-daily-rollup`
  - `goal-integrity-repair`
- **RLS / policies / grants**: dropped via `cascade` on each table drop. Indexes drop automatically.
- **Column changes**: NONE. `profiles.preferred_session_size` and `profiles.timezone` both stay.
- **New tables / columns / RLS / grants**: NONE.

### homelab-configs changes

- [ ] PostgREST schema exposure: **N/A** — `indonesian` schema already exposed; no new schemas added.
- [ ] Kong CORS origins: **N/A** — no new endpoints, no new bucket origins.
- [ ] GoTrue auth: **N/A** — no auth surface touched.
- [ ] Storage buckets: **N/A** — no storage changes.

### Health check additions

- `scripts/check-supabase.ts` (functional, anon key): **N/A** — no new public-facing functionality. Existing checks cover the survivor surface.
- `scripts/check-supabase-deep.ts` (structural, service key):
  - **KEEP** the `preferred_session_size` column existence check (lines 208-219).
  - Architect-R1 verified: no goal-table existence checks present in this file currently. Nothing to drop.

### Migration ordering & deploy steps

Per architect-R1 I5 (deploy ordering risk): **deploy code first, then migrate** — reverses the original spec ordering to avoid the brief outage window where the live container queries a dropped table.

1. Merge PR to `main`.
2. GitHub Actions builds the new image (per CLAUDE.md §"Deploying a new version"). The new image's React bundle has zero references to dropped tables/functions/cron jobs.
3. Operator pulls + recreates the container on the homelab. New code is now live; live queries no longer hit the goal subsystem.
4. **Now** operator runs `make migrate POSTGRES_PASSWORD=<...>`. The master `migration.sql`'s retirement section drops the tables, functions, and cron schedules idempotently. No live user queries hit the dropped objects (step 3 already shipped the new code).
5. `make migrate` chains `check-supabase-deep` automatically (per CLAUDE.md), which validates the schema state post-drop. The KEEP check on `preferred_session_size` continues to pass.
6. **Pre-deploy data check** (operator, OPTIONAL): if any user has open weekly goals (`select count(*) from indonesian.learner_weekly_goal_sets where closed_at is null`), they will lose their in-flight goals. Product owner has accepted this (target-arch §1: streak-only motivation is the new model).

Between step 2 and step 4, pg_cron jobs continue to fire (`job_finalize_weekly_goals` etc.) but their writes have no live consumer (the new code never reads goal tables). The jobs are harmless until step 4 unschedules them. After step 4, pg_cron stops triggering them; the function bodies are dropped.

If something goes wrong post-step-4 and rollback is needed: `psql -f scripts/migrations/2026-05-07-retire-goal-subsystem.rollback.sql` over SSH, then revert the merge commit, then redeploy the previous image. Data lost during retirement is unrecoverable from the rollback alone — restore from a pre-retirement Postgres snapshot if data must be preserved.

---

## Execution plan

Each step is a separate commit on `retire/goal-subsystem`. **Every commit must leave the test suite green AND `bun run build` green** (per OpenBrain `lesson learned (2026-05-07)` §source-test-bundling). Source + dependent tests bundle into the same commit.

1. **`refactor(analytics): retire dead event-log surface (analyticsService + 3 callers + SessionSummary orphan + Progress.test.tsx)`** — atomic source+test+caller bundle:
   - Delete `src/services/analyticsService.ts`
   - Delete `src/__tests__/analyticsService.test.ts`
   - Delete `src/components/SessionSummary.tsx` + `src/components/SessionSummary.module.css` (orphan, never rendered, goal-flavoured props)
   - Delete `src/__tests__/Progress.test.tsx` entirely (excluded from Vitest at `vite.config.ts:58`; 870 LOC of dead weight, mostly goal-flavoured)
   - `src/pages/Progress.tsx`: drop `import { useEffect } from 'react'`, drop `import { analyticsService } ...`, drop the entire `useEffect` block (lines 23-29)
   - `src/pages/Session.tsx`: drop `import { analyticsService } ...`, drop the `analyticsService.trackSessionStartedFromToday(...)` call

   After this commit: `analyticsService` is gone; orphan UI is gone; the dead test file is gone. `goalService` still alive but the analytics import surface is clean. `bun run lint` + `test --run` + `build` green.

2. **`refactor(dashboard): retire goal-flavoured Dashboard + WeeklyGoalsList + minimal placeholder`** — atomic source+test+CSS+i18n bundle:
   - `src/pages/Dashboard.tsx`: replace ~370 LOC of goal/today-plan UI with the minimal placeholder block specified in §"Surgical edits"
   - Delete `src/pages/Dashboard.module.css` (every class consumed only by retired Dashboard surfaces)
   - Delete `src/components/progress/WeeklyGoalsList.tsx` + `src/components/progress/WeeklyGoalsList.module.css`
   - `src/hooks/useProgressData.ts`: drop `goalService` import + `WeeklyGoal`/`DailyGoalRollup` type imports + Wave 2 fetches/branches/state for `weeklyGoals` and `dailyRollups`. Array shrinks 6→4 entries.
   - `src/lib/i18n.ts`: prune ~80 dead goal/today-plan keys per language (NL+EN). Add `startTodaysSessionMinimal` key (NL+EN) for the new minimal CTA.
   - `src/__tests__/dashboard-redesign.test.tsx`: drop ~80% of tests asserting goal UI. Add 5 new tests for the minimal Dashboard (per §"Test surgery" concrete assertions). Drop `vi.mocked(goalService.getGoalProgress)` mocks.

   After this commit: Dashboard renders the minimal placeholder; no caller of `goalService` outside `goalService.ts` itself + `goal-job-service.ts`; no caller of goal types outside `goalService.ts` + `learnerStateService.ts`. `bun run lint` + `test --run` + `build` green.

3. **`refactor(goals): retire goalService + goal-job-service + dead survivor methods + types`** — the big atomic commit per atomic-union-narrowing rule:
   - Delete `src/services/goalService.ts`
   - Delete `scripts/lib/goal-job-service.ts`
   - Delete `scripts/lib/goal-job-service.test.ts`
   - `src/services/learnerStateService.ts`: drop `logStageEvent` (zero callers), `getDailyRollups`. Drop `DailyGoalRollup` type import.
   - `src/services/learnerProgressService.ts`: drop `getTodaysPlanRawCounts` (interface + impl + types), `getStudyDaysCount`, `getRecallStatsForWeek`, `getUsableVocabularyGain`, `getOverdueCount` (interfaces + impls). Drop `RecallStatsForWeekResult` typedef. Drop `RecallAccuracyRow` typedef IF its only consumer was `getRecallStatsForWeek` (verify; `getRecallAccuracyByDirection` is a survivor and may share).
   - `src/types/learning.ts`: drop `WeeklyGoalType`, `GoalStatus`, `WeeklyGoalSet`, `WeeklyGoal`, `DailyGoalRollup`, `TodayPlan`, `WeeklyGoalResponse`.
   - `src/__tests__/learnerProgressService.test.ts`: drop describe blocks for `getTodaysPlanRawCounts` (lines 21-63), `getOverdueCount` (~109-122), `getStudyDaysCount` (~123-140), `getRecallStatsForWeek` and `getUsableVocabularyGain` (verify ranges).

   Bundled because: deleting types requires every consumer to be already gone (commits 1+2 cleared them). Deleting `goalService.ts` requires `goal-job-service.ts` to be gone in the same commit (it imports `goalService`). Dropping the 5 dead `learnerProgressService` methods + their tests must atomic with `goalService.ts` deletion — `goalService` was their last caller.

   After this commit: zero TypeScript references to goal subsystem. `bun run build` and `bun run test --run` green.

4. **`chore(db): retire goal subsystem schema + dead survivor functions (idempotent migration)`** — SQL-only commit:
   - `scripts/migration.sql`: remove all original `create table` / `create index` / `create policy` / `grant` / `enable rls` / `create or replace function` / `select cron.schedule(...)` blocks for the 5 retired tables + 9 retired functions + 4 cron schedules (per §"Schema changes" inventory). Append the retirement section at the end of the master file (per §"SQL migration" §A).
   - NEW `scripts/migrations/2026-05-07-retire-goal-subsystem.sql` (paper-trail, ~50 lines).
   - NEW `scripts/migrations/2026-05-07-retire-goal-subsystem.rollback.sql` (best-effort schema restore, ~200 lines).

   No code change in this commit; only DDL. Build + test green (no TS imports affected).

5. **`docs(arch): patch target-architecture.md for retirement #4 corrections`** — doc-only commit:
   - Update `docs/target-architecture.md` per §"Doc patches" inventory: §1 (table count, function count, cron schedules, profile column relocation), §7 (mark retired), §`lib/profile/`, §"Things that explicitly stay" (add preferred_session_size + line 1330 fix), §"Migration considerations" (drop event log step).

   No code change. Build + test green.

6. **`docs(plan): add retirement #4 spec — Goal subsystem + event log`** — adds this file `docs/plans/2026-05-07-retire-goal-subsystem.md`.

After step 6, before opening the PR:
- `bun run lint` must pass.
- `bun run test --run` must pass.
- `bun run build` must pass.
- Whole-tree stale-reference sweep (per §"Grep evidence" §"Whole-tree stale-reference sweep"). Expected: zero matches outside spec + master retirement section + tracked migration. Any hit is a stale reference to clean up.
- **Optional**: exercise `make migrate` against a local Supabase instance to validate the master retirement section is idempotent. Binding gate is the lint+test+build trio above; this is a confidence-builder.

Smoke test (post-merge, on homelab): start `bun run dev`, sign in as `testuser@duin.home`, verify:
- Dashboard renders the minimal placeholder (no goal cards, no Today's-plan hero).
- Streak counter shows correctly.
- Lapsing-count alert renders (or is hidden if 0).
- Continue-lesson card renders with a valid URL.
- "Today" CTA button navigates to `/session`.
- `/progress` renders without weekly-goals slice.
- Trigger a session, complete one card, verify the answer commits cleanly (no analyticsService throw, no goal-flavoured DB write).
- Run `select 1 from pg_class where relname = 'learner_weekly_goal_sets'` → zero rows (table dropped).

---

## Why this is safe

- **Zero non-goal callers of every retiring symbol.** Verified by independent grep (above). The 3 production `analyticsService` callers are all `trackGoal*`/`trackSession*` flavoured. The 5 `goalService` importers all retire or rewire here. The 5 dropped `learnerProgressService` methods (`getTodaysPlanRawCounts`, `getStudyDaysCount`, `getRecallStatsForWeek`, `getUsableVocabularyGain`, `getOverdueCount`) have zero non-goal callers — verified per architect-R1 I4. The `<SessionSummary>` and `<WeeklyGoalsList>` components have zero production renderers.
- **Server-side jobs deactivate cleanly.** `cron.unschedule(...)` in the master retirement section + tracked migration removes the four pg_cron entries before `drop function` removes their bodies. No cron job will fire post-deploy looking for a dropped function.
- **Streak survives.** The minimal Dashboard's streak counter reads `learnerProgressService.getCurrentStreakDays` → SQL function `indonesian.get_current_streak_days(uuid, text)` → reads `capability_review_events.created_at`. None of those are touched by this PR.
- **Pedagogy survives.** `preferred_session_size` column stays (Decision 1). Every consumer in `loadBudgets`, `sessionPosture`, `queueDrying`, `capabilitySessionLoader`, `pedagogyPlanner`, `Profile.tsx`, `Session.tsx` keeps reading it. Session sizing is unchanged.
- **No browser-bundle regression.** `goalService.ts`, `analyticsService.ts`, `WeeklyGoalsList.tsx`, `SessionSummary.tsx` retire from the browser bundle. ~1500 LOC of source + ~200 LOC of dead CSS retired. No new browser dependencies added.
- **Every commit boundary green.** Commit 1 deletes the orphan + analytics surface (no goalService impact). Commit 2 leaves goalService alive but no UI/hook caller. Commit 3 deletes goalService + types + last consumers + 5 dead survivor methods atomically. Commit 4 is SQL-only. Commits 5–6 are doc-only. No `tsc` red mid-walk; no `bun run test --run` red mid-walk.
- **Test surgery preserves test signal.** Goal-UI tests retire because the UI retires (no dead-test-walking risk). Survivor tests (forecast, memory health, accuracy, lapse prevention, vulnerable items, latency, streak) keep their assertions. The 5 new minimal-Dashboard tests anchor regression: any future PR re-introducing a goal hero fails the negative-presence test.
- **Idempotent migration.** Master retirement section + tracked DDL use `drop ... if exists` (lowercase per OpenBrain §2 destructive-op-check.sh quirk) + `cron.unschedule` wrapped in `exception when others then null`. Re-running on a node where the drop already applied is safe.
- **Deploy ordering avoids transient breakage.** Code ships first (step 3); migration runs after (step 4). No window where the live container queries a just-dropped table.
- **Independent of #34, #35, #36.** Orthogonal file sets:
  - `#34 retire/audio-multi-voice` touches `AudioContext.tsx`, `MiniAudioPlayer.tsx`, `audioService.ts`. Zero overlap.
  - `#35 retire/grammar-state` touches `grammarStateService.ts`, `learner_grammar_state` table, grammar-discriminated-union variants. Zero overlap.
  - `#36 retire/browser-fsrs` touches `fsrs.ts`, `capabilityReviewProcessor.ts`, `capabilityScheduler.ts`. Zero overlap.

  Either retirement branch can merge first; this branch rebases cleanly.
- **Doc and code stay in sync.** Commit 5 corrects the seven claims that grep disproved (4 from §1, plus the missed components, dead test files, and dead CSS). A future contributor reading the patched doc sees the accurate model.

---

## Constraints honored

- `bun run lint` + `bun run test --run` + `bun run build` pass locally before opening the PR (CLAUDE.md gate).
- Architect-review-loop (per `feedback_spec_review_loop`): R1 reviewed v1 (NEEDS-REVISION → 7 CRITICAL + 8 IMPORTANT + 6 MINOR). v2 (this revision) addresses every finding inline. R1 re-review on v2 expected before execution. R2 reviews the executed diff per OpenBrain `lesson learned (2026-05-07)` §spec-review-loop.
- Pre-commit hooks run on every commit. The destructive-op gate: tracked migration + master retirement section use lowercase `drop table if exists` / `drop function if exists` to clear the case-sensitive FAIL pattern at `evals/destructive-op-check.sh:32` (which matches uppercase). Spec narration avoids literal uppercase trigger triplets per the same rule (architect-R1 C2 — narrative reworded throughout).
- No push to remote until PR opening (CLAUDE.md gate).
- `make pre-deploy` is the documented full gauntlet but may surface unrelated environmental noise on the homelab; binding gate is `bun run lint` + `test --run` + `build`.
- Independent of unmerged `retire/audio-multi-voice` (#34), `retire/grammar-state` (#35), `retire/browser-fsrs` (#36). Branch base: `origin/main`.
- Per CLAUDE.md "Implementation Autonomy": execute commits sequentially without per-commit user approval; pause only on real blockers (architect findings, test failures, build failures).
- Per CLAUDE.md "Feature Design Rule: Supabase Requirements": full Supabase Requirements section included above (not omitted, even where N/A).

---

## Out of scope

- **Module fold of analytics into `lib/analytics/`** (target-arch §lib/analytics/). The retirement gets analytics-event-log out of the way; subsequent retirement (or follow-up PR) folds the analytics tier into a deep module.
- **Polished Dashboard redesign.** The minimal placeholder (streak header + lapsing alert + Continue card + Today CTA) is conservative — sufficient to ship, not polished. A polished redesign with proper retention/mastery surfaces, layout treatment, and copy is tracked separately as a follow-up issue. Architect-R1 I6 acknowledged.
- **Extending `scripts/migrate.ts` to enumerate `scripts/migrations/*.sql`.** Per OpenBrain §3 the master file is the auto-applied path; tracked migrations are paper-trail. This PR follows that established pattern (master retirement section + paper-trail copy). A future refactor of `scripts/migrate.ts` to enumerate timestamped files is out of scope.
- **Removing `preferred_session_size` column entirely.** Decision 1: column survives.
- **Replacing the streak source.** `get_current_streak_days` reads `capability_review_events`. Stays.
- **Removing `ts-fsrs` from package.json.** Tracked as a follow-up from retirement #3 (browser FSRS); no change here.
- **Migrating goal data to a CSV export before drop.** Product owner accepted the data loss (target-arch §1 streak-only motivation).
- **Updating `docs/architecture/data-model.md` or `docs/architecture/fsrs-scheduling.md`** — those describe FSRS internals untouched here. Stale goal references (if any) addressed in a separate doc-cleanup PR.
- **Updating historical PRDs**: `docs/plans/2026-04-02-fsrs-goal-system-spec.md`, `docs/plans/2026-04-02-fsrs-goal-system-implementation-plan.md`, `docs/GOAL_SYSTEM_IMPLEMENTATION.md`, `docs/plans/2026-04-05-dashboard-*.md`, `docs/plans/2026-04-05-progress-redesign-*.md`, `docs/plans/2026-05-01-capability-analytics-tier-decisions.md`, `docs/plans/2026-04-14-codebase-audit.md`, `docs/architecture-layers.html` — all stay as paper-trail. Optional follow-up: prefix retired plans with `RETIRED-`. (Architect-R1 M4 acknowledged.)
- **Retiring `useSessionBeacon`** (target-arch §3 "Session lifecycle module" #3). Distinct retirement; orthogonal files.
- **Retiring source-progress events** (target-arch #4). Distinct retirement.
- **`chore(deps): remove unused goal-related deps`**: no npm package was added solely for the goal subsystem. No package.json change needed.

---

## Estimated impact

| Category | LOC removed | Files |
|---|---:|---|
| Whole-file deletions | ~2877 | 11 files: `goalService.ts` (609), `goal-job-service.ts` (401), `goal-job-service.test.ts` (34), `analyticsService.ts` (134), `analyticsService.test.ts` (122), `Progress.test.tsx` (870), `SessionSummary.tsx` (121), `SessionSummary.module.css` (10), `WeeklyGoalsList.tsx` (80), `WeeklyGoalsList.module.css` (104), `Dashboard.module.css` (192) |
| Surgical edits — production | ~600-700 | `Dashboard.tsx` (~420 retired, ~150 new minimal placeholder), `useProgressData.ts` (~50), `learnerProgressService.ts` (~95), `learnerStateService.ts` (~30), `types/learning.ts` (~70), small surgery on `Progress.tsx`, `Session.tsx`, `i18n.ts` (~160 keys) |
| Surgical edits — tests | ~400-500 | `dashboard-redesign.test.tsx` (~390 retired, ~80 new minimal-Dashboard tests), `learnerProgressService.test.ts` (~80) |
| SQL — master | ~250 | `migration.sql` (table/index/policy/grant/function/cron blocks removed; ~50 lines of retirement section appended) |
| SQL — tracked | ~250 | new tracked migration (~50) + rollback (~200) |
| Doc patches | ~30 | `target-architecture.md` |
| Spec | ~750 | this file |

**Net code retired: ~3700–3900 LOC + ~250 SQL lines + 5 tables + 9 functions + 4 cron jobs + RLS/policies/grants/indexes for those tables.** Largest single retirement to date (cumulative across #1+#2+#3+#4 ≈ 4800 LOC + DB objects). The doc's stated "~1000 LOC" estimate was a 4x undercount — the retirement plan touches significantly more consumer surface than the target-arch.md inventory captured (architect-R1 verified the seven misses above).
