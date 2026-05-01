# Learner Progress Service — Canonical Contract Spec

**Date:** 2026-05-01
**Status:** Draft for fresh-context architect review
**Source:** Synthesized from the architecture-review conversation on 2026-05-01

## 1. Goal

Introduce **`learnerProgressService`** as the single canonical contract through which every UI surface reads "what's the user's progress / what should they do today?" data. All such reads currently bypass the capability system and pull from the legacy `learner_skill_state` table, producing inconsistencies (e.g., dashboard reports "30 reviews due" while the session planner finds 0–2 schedulable capabilities).

After this lands, every surface (Dashboard, Progress page, lapsing card, weekly-goal evaluation, Lessons-list summaries) reads from the same source as the session engine. The dashboard count and the actual session content can no longer disagree.

## 2. Non-Goals

- Decommissioning the `learner_skill_state` table from the schema. The table stays as historical record; only application reads stop.
- Changing the FSRS scheduler (`src/lib/fsrs.ts`) or the dueness predicate (`getDueCapabilitiesFromRows` in `src/lib/capabilities/capabilityScheduler.ts`). Those remain authoritative; the new service mirrors their rules.
- Migrating the session engine (`capabilitySessionDataService`). It already reads from the capability system. The new service is for *surfacing* layer consumers.
- Changing `learner_skill_state` write paths (`learnerStateService.applyReviewToSkillState`, `learnerStateService.upsertItemState`, `learnerStateService.logStageEvent`). Those remain to keep historical events flowing while we transition. They become no-ops after migration but stay in the schema during this spec's scope.
- Changing the source-progress event flow (`sourceProgressService`). The progress service consumes it; it doesn't produce it.
- Lesson-list "ready to practice" counts (`lessonService.getLessonCapabilityPracticeSummary`). Already capability-aware. Out of scope.
- Mastery overview (`getMasteryOverview` in `src/lib/mastery/masteryModel.ts`). Already capability-aware via `learner_capability_state`. Out of scope; surface it through the new service interface but don't rewrite.

## 3. Current State (Audit)

### 3.1 Two coexisting SR data stores

| Layer | Reads | Authoritative for |
|---|---|---|
| `learner_skill_state` (legacy) | `goalService.computeTodayPlan` (×2), `goalService.processGoalEvaluation`, `learnerStateService.getDueSkills`, `learnerStateService.getSkillStates`, `learnerStateService.getSkillStatesBatch`, `learnerStateService.getLapsingItems`, `progressService.getLapsePrevention`, `progressService.getVulnerableItems` | NOTHING — pure historical record post-cutover |
| `learner_capability_state` (new) | `capabilitySessionDataService` (session loader), `lessonService.getLessonCapabilityPracticeSummary`, `masteryModel.ts` (capability-aware mastery) | The session engine (what users actually practice) |
| `review_events` (legacy) | `progressService.getAccuracyBySkillType`, `progressService.getAvgLatencyMs` | Nothing post-cutover; replaced by `capability_review_events` |
| `capability_review_events` (new) | Session-commit RPC (`commit_capability_answer_report`) | Reviews of capability practice |

### 3.2 Symptom

Dashboard's "today's plan" widget reports counts from `learner_skill_state`. Session uses `learner_capability_state`. They disagree because:

- The legacy table was populated when content was seeded via `make seed-vocabulary` (lessons 1-3 era). 30+ rows have `next_due_at < now()` — but those skills are no longer the basis for scheduling.
- Capability schedulability is gated on activation state + readiness + publication + source-progress prerequisites. Most capabilities are dormant for a fresh user.

### 3.3 Why the current shape resists fixes

Each consumer holds its own SQL queries directly against tables. Any "fix the dashboard" approach has to find every query, swap the table, re-author the predicate, and update all the test fixtures. The next surface added falls into the same trap because there is no abstraction to use instead of raw `supabase.from(...)` calls.

## 4. Proposed Architecture

### 4.1 Deep module pattern

`learnerProgressService` is a **deep module** in Ousterhout's terms: a small typed interface (~6-8 methods) hides significant complexity (capability filters, source-progress gating, FSRS dueness predicates, table joins, count semantics).

```
                   ┌─────────────────────────────────────┐
                   │           UI surfaces                │
                   │                                      │
                   │ Dashboard (goalService)            ──┼─┐
                   │ Progress page (useProgressData)    ──┼─┤
                   │ Lapsing card (learnerStateService)  ─┼─┤
                   │ Weekly goal evaluation              ──┼─┤
                   │ Future surfaces                     ──┼─┤
                   └─────────────────────────────────────┘ │
                                                           │ (one path only)
                                                           ▼
                                       ┌────────────────────────────────────┐
                                       │  learnerProgressService            │
                                       │                                    │
                                       │  - getTodaysPlan(...)              │
                                       │  - getLapsingCount(...)            │
                                       │  - getMasteryFunnel(...)           │
                                       │  - getMemoryHealth(...)            │
                                       │  - getReviewLatencyStats(...)      │
                                       │  - getReviewForecast(...)          │
                                       │  - getRecallAccuracyByDirection()  │
                                       │  - getVulnerableCapabilities(...)  │
                                       └────────────────────────────────────┘
                                                           │
                                                           ▼
                                       ┌────────────────────────────────────┐
                                       │  Capability tables (read-only)     │
                                       │  + learner_capability_state        │
                                       │  + capability_review_events        │
                                       │  + learning_capabilities           │
                                       │  + learner_source_progress_state   │
                                       │                                    │
                                       │  via SQL functions                 │
                                       └────────────────────────────────────┘
```

### 4.2 Service interface (TypeScript)

```ts
// src/services/learnerProgressService.ts

export interface TodaysPlanInput {
  userId: string
  preferredSessionSize: number
  weeklyGoals: WeeklyGoal[]
  now: Date
}

export interface TodaysPlanResult {
  dueReviewsToday: number          // capabilities currently due
  newIntroductionsToday: number    // ready capabilities not yet introduced
  recallInteractionsToday: number  // typed-recall capabilities included today
  weakItemsToday: number           // capabilities with lapse_count >= 3 and due
  estimatedMinutes: number         // mean(latency) × (due + new)
  preferredSessionSize: number     // echo
}

export interface LapsingCountResult {
  count: number                    // capabilities with lapse_count >= 3 AND stability < 2.0
}

export interface MasteryFunnelStage {
  stage: 'not_started' | 'introduced' | 'learning' | 'strengthening' | 'mastered' | 'at_risk'
  count: number
}
export type MasteryFunnel = MasteryFunnelStage[]

export interface MemoryHealthResult {
  avgRecognitionStabilityDays: number  // average stability of recognition capabilities
  avgRecallStabilityDays: number       // average stability of recall capabilities
}

export interface ReviewLatencyStatsResult {
  currentWeekMs: number | null
  priorWeekMs: number | null
}

export interface RecallAccuracyResult {
  recognitionAccuracy: number
  recognitionSampleSize: number
  recallAccuracy: number
  recallSampleSize: number
}

export interface VulnerableCapability {
  capabilityId: string
  canonicalKey: string
  baseText: string                 // from the parent learning_item
  meaning: string                  // best NL meaning available
  lapseCount: number
  consecutiveFailureCount: number
}

export interface ReviewForecastDay {
  date: string                     // ISO local-date
  count: number
}
export type ReviewForecast = ReviewForecastDay[]

export const learnerProgressService = {
  getTodaysPlan(input: TodaysPlanInput): Promise<TodaysPlanResult>
  getLapsingCount(userId: string): Promise<LapsingCountResult>
  getMasteryFunnel(userId: string): Promise<MasteryFunnel>
  getMemoryHealth(userId: string): Promise<MemoryHealthResult>
  getReviewLatencyStats(userId: string): Promise<ReviewLatencyStatsResult>
  getRecallAccuracyByDirection(userId: string): Promise<RecallAccuracyResult>
  getVulnerableCapabilities(userId: string, limit?: number): Promise<VulnerableCapability[]>
  getReviewForecast(userId: string, days?: number): Promise<ReviewForecast>
}
```

### 4.3 SQL functions

Each service method backed by one function in the `indonesian` schema. Functions are `LANGUAGE sql STABLE` (read-only), `SECURITY INVOKER` (use caller's RLS), no side effects.

```sql
-- Exact predicate parity with src/lib/capabilities/capabilityScheduler.ts:55-77
CREATE OR REPLACE FUNCTION indonesian.compute_todays_plan(
  p_user_id uuid,
  p_preferred_size int,
  p_now timestamptz
)
RETURNS TABLE (
  due_reviews_today int,
  new_introductions_today int,
  recall_interactions_today int,
  weak_items_today int,
  estimated_minutes int
) LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  v_due int;
  v_new int;
  v_recall int;
  v_weak int;
  v_mean_latency int;
BEGIN
  -- "Due" = active + ready + published + next_due_at <= now
  -- (mirrors getDueCapabilitiesFromRows verbatim)
  SELECT count(*) INTO v_due
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND s.next_due_at IS NOT NULL
    AND s.next_due_at <= p_now;

  -- "New" = ready + published + activatable (source progress satisfied)
  -- but no learner state row yet OR activation_state = 'dormant'.
  -- Mirrors session-loader logic.
  SELECT count(*) INTO v_new
  FROM indonesian.learning_capabilities c
  LEFT JOIN indonesian.learner_capability_state s
    ON s.capability_id = c.id AND s.user_id = p_user_id
  WHERE c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND (s.id IS NULL OR s.activation_state = 'dormant')
    AND indonesian._capability_source_progress_met(c.id, p_user_id);

  -- "Recall" = subset of due where capability is form_recall direction
  SELECT count(*) INTO v_recall
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND c.capability_type = 'form_recall'
    AND s.next_due_at IS NOT NULL
    AND s.next_due_at <= p_now;

  -- "Weak" = due AND lapse_count >= 3, capped at 20% of due
  SELECT count(*) INTO v_weak
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND s.next_due_at IS NOT NULL
    AND s.next_due_at <= p_now
    AND s.lapse_count >= 3;
  v_weak := LEAST(v_weak, CEIL(v_due * 0.2)::int);

  -- Mean latency from capability_review_events (last 200 reviews)
  SELECT COALESCE(
    AVG((answer_report_json->>'latencyMs')::int)::int,
    20000
  ) INTO v_mean_latency
  FROM (
    SELECT answer_report_json
    FROM indonesian.capability_review_events
    WHERE user_id = p_user_id
      AND (answer_report_json->>'latencyMs') IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 200
  ) t;

  -- Cap due target at preferred size (per goalService.computeTodayPlan logic)
  v_due := LEAST(v_due, p_preferred_size);

  RETURN QUERY SELECT
    v_due,
    v_new,
    v_recall,
    v_weak,
    GREATEST(1, CEIL((v_due + v_new) * v_mean_latency / 60000.0)::int);
END $$;

-- Helper: source-progress predicate (extracts requiredSourceProgress from
-- metadata_json, joins to learner_source_progress_state)
CREATE OR REPLACE FUNCTION indonesian._capability_source_progress_met(
  p_capability_id uuid,
  p_user_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    CASE
      WHEN c.metadata_json->'requiredSourceProgress' IS NULL THEN true
      WHEN c.metadata_json->'requiredSourceProgress'->>'kind' != 'source_progress' THEN true
      ELSE EXISTS (
        SELECT 1
        FROM indonesian.learner_source_progress_state lsps
        WHERE lsps.user_id = p_user_id
          AND lsps.source_ref = c.metadata_json->'requiredSourceProgress'->>'sourceRef'
          AND (c.metadata_json->'requiredSourceProgress'->>'requiredState')::text = ANY(lsps.completed_event_types)
      )
    END
  FROM indonesian.learning_capabilities c
  WHERE c.id = p_capability_id;
$$;

-- Other functions: get_lapsing_capability_count, get_mastery_funnel,
-- get_memory_health, get_review_latency_stats, get_recall_accuracy_by_direction,
-- get_vulnerable_capabilities, get_review_forecast
-- (full definitions in §4.4 below)
```

### 4.4 Remaining SQL functions

```sql
-- get_lapsing_capability_count
-- Mirrors learnerStateService.getLapsingItems but on capability state.
CREATE OR REPLACE FUNCTION indonesian.get_lapsing_capability_count(p_user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT COALESCE(count(DISTINCT c.id), 0)::int
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.lapse_count >= 3
    AND COALESCE(s.stability, 0) < 2.0;
$$;

-- get_mastery_funnel — counts per stage (depends on stage definitions in
-- src/lib/mastery/masteryModel.ts; spec leaves the staging logic in TS for now
-- and only counts state via SQL)
-- Implementation: lift the stage-classification SQL from masteryModel if
-- already in SQL, or compute in TS by reading raw learner_capability_state rows.
-- DECISION: do this in the SQL function for parity with other counts.

-- get_memory_health — average stability per direction
CREATE OR REPLACE FUNCTION indonesian.get_memory_health(p_user_id uuid)
RETURNS TABLE (
  avg_recognition_stability_days numeric,
  avg_recall_stability_days numeric
) LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COALESCE(AVG(CASE WHEN c.capability_type = 'text_recognition' THEN s.stability END), 0)::numeric,
    COALESCE(AVG(CASE WHEN c.capability_type = 'form_recall' THEN s.stability END), 0)::numeric
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND s.stability IS NOT NULL;
$$;

-- get_review_latency_stats — current week vs prior week
CREATE OR REPLACE FUNCTION indonesian.get_review_latency_stats(p_user_id uuid)
RETURNS TABLE (
  current_week_ms int,
  prior_week_ms int
) LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    (
      SELECT AVG((answer_report_json->>'latencyMs')::int)::int
      FROM indonesian.capability_review_events
      WHERE user_id = p_user_id
        AND created_at >= now() - interval '7 days'
        AND (answer_report_json->>'latencyMs') IS NOT NULL
    ),
    (
      SELECT AVG((answer_report_json->>'latencyMs')::int)::int
      FROM indonesian.capability_review_events
      WHERE user_id = p_user_id
        AND created_at >= now() - interval '14 days'
        AND created_at < now() - interval '7 days'
        AND (answer_report_json->>'latencyMs') IS NOT NULL
    );
$$;

-- get_recall_accuracy_by_direction
CREATE OR REPLACE FUNCTION indonesian.get_recall_accuracy_by_direction(p_user_id uuid)
RETURNS TABLE (
  recognition_correct int,
  recognition_total int,
  recall_correct int,
  recall_total int
) LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COALESCE(SUM(CASE WHEN c.capability_type = 'text_recognition' AND (re.answer_report_json->>'wasCorrect')::boolean THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN c.capability_type = 'text_recognition' THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN c.capability_type = 'form_recall' AND (re.answer_report_json->>'wasCorrect')::boolean THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN c.capability_type = 'form_recall' THEN 1 ELSE 0 END), 0)::int
  FROM indonesian.capability_review_events re
  JOIN indonesian.learning_capabilities c ON c.id = re.capability_id
  WHERE re.user_id = p_user_id;
$$;

-- get_vulnerable_capabilities — top N capabilities by lapse_count with item context
CREATE OR REPLACE FUNCTION indonesian.get_vulnerable_capabilities(
  p_user_id uuid,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  capability_id uuid,
  canonical_key text,
  base_text text,
  meaning text,
  lapse_count int,
  consecutive_failure_count int
) LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH item_meanings_nl AS (
    SELECT DISTINCT ON (im.learning_item_id)
      im.learning_item_id, im.translation_text
    FROM indonesian.item_meanings im
    WHERE im.translation_language = 'nl'
    ORDER BY im.learning_item_id, im.is_primary DESC, im.id
  )
  SELECT
    c.id,
    c.canonical_key::text,
    li.base_text,
    COALESCE(im.translation_text, '')::text,
    s.lapse_count,
    s.consecutive_failure_count
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  -- Join the parent learning_item by stableSlug match
  -- (capability source_ref is "learning_items/<slug>")
  JOIN indonesian.learning_items li
    ON c.source_ref = ('learning_items/' || indonesian.stable_slug(li.base_text))
  LEFT JOIN item_meanings_nl im ON im.learning_item_id = li.id
  WHERE s.user_id = p_user_id
    AND c.source_kind = 'item'
    AND s.lapse_count > 0
  ORDER BY s.lapse_count DESC
  LIMIT p_limit;
$$;

-- Note: requires indonesian.stable_slug() function exists (migration 158-178 in scripts/migration.sql);
-- spec assumes yes — to be verified during implementation.

-- get_review_forecast — count of upcoming reviews per day for next N days
CREATE OR REPLACE FUNCTION indonesian.get_review_forecast(
  p_user_id uuid,
  p_days int DEFAULT 14
)
RETURNS TABLE (forecast_date date, count int)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    (s.next_due_at AT TIME ZONE 'UTC')::date AS forecast_date,
    count(*)::int
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND s.next_due_at IS NOT NULL
    AND s.next_due_at <= now() + (p_days || ' days')::interval
  GROUP BY 1
  ORDER BY 1;
$$;
```

## 5. Algorithm

```text
1. Apply migration: install all SQL functions (one transaction).
2. Add `learnerProgressService.ts` with method stubs that call the RPCs.
3. Migrate consumers in this exact order:
   a. goalService.computeTodayPlan → calls learnerProgressService.getTodaysPlan
   b. learnerStateService.getLapsingItems → calls learnerProgressService.getLapsingCount
   c. progressService.getLapsePrevention → calls learnerProgressService (new method needed: getLapsePrevention)
   d. progressService.getVulnerableItems → calls learnerProgressService.getVulnerableCapabilities
   e. progressService.getAccuracyBySkillType → calls learnerProgressService.getRecallAccuracyByDirection
   f. progressService.getAvgLatencyMs → calls learnerProgressService.getReviewLatencyStats
   g. goalService.processGoalEvaluation → calls learnerProgressService (review_health metric)
4. Update tests:
   - Existing tests that mock raw `supabase.from('learner_skill_state')` get rewritten to mock learnerProgressService directly.
   - New tests for learnerProgressService itself (mock the RPC layer; verify TypeScript shape conformance).
5. Browser smoke: dashboard count matches session content.
6. Update CLAUDE.md to mark learnerProgressService as the canonical contract.
```

## 6. Idempotency

- Re-running the migration is safe: all `CREATE OR REPLACE FUNCTION` statements.
- The service contract is read-only; calling methods has no side effects.
- The legacy `learner_skill_state` write paths are untouched, so any background jobs that still write to it continue working.

## 7. Verification

```bash
# 1. Migration applied
make migrate

# 2. Tests green
bun run test

# 3. Build clean
bun run build

# 4. SQL function smoke
psql ... <<'SQL'
SELECT * FROM indonesian.compute_todays_plan(
  '<test-user-id>'::uuid,
  25,
  now()
);
SELECT * FROM indonesian.get_lapsing_capability_count('<test-user-id>'::uuid);
SQL

# 5. Browser smoke (Playwright via MCP)
- Navigate /  (Dashboard)
- Confirm "X reviews today" matches /session result count
- Navigate /voortgang
- Confirm metrics render without errors
- Navigate /lessons
- Confirm "ready to practice" counts unchanged
```

## 8. Rollback

Each PR is independently revertable.

For the SQL migration: `DROP FUNCTION` statements in a rollback file.

For the consumer migrations: `git revert` the specific PR. The legacy reads come back; nothing else changes (the new SQL functions can stay deployed without harm — they're read-only).

For the entire effort: revert the spec's PR sequence; the schema is unchanged (only new functions added, no tables touched).

## 9. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `_capability_source_progress_met` slow at scale (large user base × many capabilities) | Index on `learner_source_progress_state(user_id, source_ref)` already exists per `migration.sql`. Add `idx_learning_capabilities_metadata_source_ref` if EXPLAIN shows seq scan on `metadata_json->'requiredSourceProgress'->>'sourceRef'`. Defer to perf testing post-implementation. |
| `learning_items.base_text` vs capability `source_ref` slug-match brittle (today's `dibawa` collision) | Use the same `stable_slug()` function the projection uses. Where ambiguity exists, the dashboard counts are not the place to "guess" — count the capability not the item. The session loader has the same ambiguity by design. |
| Mastery funnel SQL function depends on stage-classification logic currently in TS | Either lift the stage definitions into SQL (preferred — single source of truth) or call existing TS `getMasteryOverview` from the service and skip the SQL function. SPEC DECISION: lift into SQL — see §12 open question 1. |
| Per-row PostgREST cap of 1000 hits if a user has >1000 vulnerable items | `get_vulnerable_capabilities` accepts a `p_limit` parameter. Default 10. Caller controls. |
| `capability_review_events.answer_report_json->>'latencyMs'` may be absent on older events | The `compute_todays_plan` function uses COALESCE to fall back to 20000ms. The `get_review_latency_stats` function returns NULL for the period if no events have latency. Test fixtures should cover both shapes. |
| The `getRecallAccuracyByDirection` semantics differ slightly from legacy: legacy used `skill_type` enum, new uses `capability_type` enum | The mapping is approximately 1:1 (`recognition` ↔ `text_recognition`, `form_recall` ↔ `form_recall`). Document the mapping in the service docstring. |
| Tests that mock `supabase.from('learner_skill_state')` need rewriting | One pass through each test file, swap to `vi.mock('@/services/learnerProgressService')`. Estimated 30-60 lines of test changes per consumer. |

## 10. Files

```text
NEW:
  src/services/learnerProgressService.ts                     (~250 LOC)
  src/__tests__/learnerProgressService.test.tsx              (~150 LOC)
  scripts/migrations/2026-05-01-learner-progress-functions.sql (~400 LOC SQL)

MODIFIED:
  scripts/migrate.ts                                         (chain new migration)
  src/services/goalService.ts                                (-50 LOC; reads RPC instead of raw table)
  src/services/learnerStateService.ts                        (-25 LOC; getLapsingItems wraps service)
  src/services/progressService.ts                            (-90 LOC; 4 methods now wrap service)
  src/__tests__/goalService.test.ts                          (refactor mocks)
  src/__tests__/learnerStateService.test.ts                  (refactor mocks)
  src/__tests__/Progress.test.tsx                            (refactor mocks)
  CLAUDE.md                                                  (mark learnerProgressService as canonical)
  docs/current-system/page-framework-status.md               (record what changed)
```

## 11. Tests

### 11.1 New tests for learnerProgressService

Pure unit tests — mock the supabase client, verify each method:
- Calls the right RPC with the right parameters.
- Maps the RPC response into the typed result shape.
- Handles empty results / null fields gracefully.
- Passes through errors with context (which RPC failed).

### 11.2 Updated tests for consumers

For each migrated consumer, the existing tests get rewritten to mock `learnerProgressService` instead of `supabase.from(...)`. This is strictly simpler — fewer rows of fixture data, more semantic mocks.

Example pattern for goalService:

```ts
vi.mock('@/services/learnerProgressService', () => ({
  learnerProgressService: {
    getTodaysPlan: vi.fn().mockResolvedValue({
      dueReviewsToday: 5,
      newIntroductionsToday: 3,
      recallInteractionsToday: 4,
      weakItemsToday: 1,
      estimatedMinutes: 8,
      preferredSessionSize: 25,
    }),
  },
}))
```

The mock describes the contract. Mocked-table fixtures go away.

### 11.3 SQL function tests

Add a smoke test that calls each function against a known fixture user and asserts the shape of the result. This is integration territory — runs only when `SUPABASE_SERVICE_KEY` is in env. Mark as opt-in:

```ts
it.skipIf(!process.env.SUPABASE_SERVICE_KEY)('compute_todays_plan returns valid shape', async () => {
  // ...
})
```

## 12. Open Questions

1. **Mastery funnel SQL function — lift staging into SQL or keep in TS?**
   The current `getMasteryOverview` in `masteryModel.ts` does stage classification in TypeScript by reading raw rows. SPEC DECISION: lift into SQL for parity. If the staging logic is complex enough that it would degrade SQL readability, keep it in TS and have `learnerProgressService.getMasteryFunnel` call `getMasteryOverview` directly.

2. **Should the service expose batch / streaming methods for analytics screens?**
   The Progress page loads 5+ metrics on mount via `useProgressData`. We could batch them into one RPC (`getProgressOverview`) returning all five. Cleaner from a round-trip perspective.
   SPEC DECISION: defer to implementation. Start with one method per metric (clearest contract), add a batch method only if perf testing shows it matters.

3. **Should `getTodaysPlan` accept the WeeklyGoals input the legacy `computeTodayPlan` used?**
   Today's logic uses goals to adjust `newTarget` (e.g., reduce by 1 if vocab goal achieved). Could move this to the SQL function or keep it in goalService.ts and have the service return raw counts only.
   SPEC DECISION: SQL function returns raw counts. goalService.ts still owns the goal-adjustment math. This keeps the service's contract clean — "what is the user's situation right now" — and goalService does the policy-flavored adjustment on top.

4. **Migration timing: can we run this without downtime?**
   Yes. The new SQL functions are additive (no existing schema changes). Consumers migrate one by one; each commit is shippable. Old reads continue working until the consumer is migrated.

5. **Authoritative cutover marker?**
   Once all consumers migrate, add an integration assertion: `learner_skill_state` should not be referenced by any production code path. A simple grep in CI:
   ```bash
   ! grep -rn "from('learner_skill_state')" src/ --include='*.ts' --include='*.tsx'
   ```
   Add this check to `scripts/check-viewport-math.sh` style CI gate or a new `scripts/check-no-legacy-state.sh`.
   SPEC DECISION: add the CI gate after consumer migration completes.

6. **Are the type imports stable?**
   `WeeklyGoal` (input to `getTodaysPlan`) is in `src/types/learning.ts`. The service imports it. No new types added beyond the result shapes.

7. **Should the service be a class, an object literal, or per-method exports?**
   Project convention is object literal (matches `goalService`, `learnerStateService`, `lessonService`, etc.). Use that for consistency.

## 13. Performance Notes

Expected per-method round-trip cost:

- `getTodaysPlan`: 1 SQL function call. The function itself runs ~5-10 queries internally but they're all over indexed columns. Production: <50ms expected.
- `getLapsingCount`: 1 SQL function call, single COUNT on `learner_capability_state` × `learning_capabilities`. <20ms.
- `getMasteryFunnel`: 1 SQL function call, GROUP BY stage. <30ms.
- `getMemoryHealth`: 1 SQL function call, AVG over filtered rows. <30ms.
- `getReviewLatencyStats`: 1 SQL function call, 2 sub-queries on `capability_review_events`. <40ms.
- `getRecallAccuracyByDirection`: 1 SQL function call. <30ms.
- `getVulnerableCapabilities(limit=10)`: 1 SQL function call. <40ms.
- `getReviewForecast(days=14)`: 1 SQL function call. <30ms.

All run server-side; no Kong URI buffer issues. Compare to the current Progress page which makes 5 separate `supabase.from(...)` calls on mount — the new design is the same number of round-trips OR fewer if we add a batch method (#12 q2).

## 14. Why this architecture beats the alternative

**Alternative considered:** swap each consumer's queries to read `learner_capability_state` directly. No service module.

**Why rejected:**
- Treats the symptom (legacy reads) without addressing the cause (no abstraction). The next consumer added falls into the same trap.
- Test fixtures stay table-shaped — brittle to schema changes.
- Each consumer reimplements the same dueness predicate. They drift over time.
- The "single source of truth" property is implicit (every consumer must use the right filter) instead of structural (every consumer goes through the service).

The deep-module pattern enforces correctness structurally. Once `learnerProgressService` is the only path, the dueness predicate exists in exactly one place (the SQL function), the count semantics are enforced server-side, and adding a new surface is "call the service" not "write another query."

## 15. Definition of Done

When this is true, the spec is implemented:

- [ ] All SQL functions in §4.3 + §4.4 deployed via migration.
- [ ] `learnerProgressService.ts` exists with all methods in §4.2.
- [ ] All consumers in §3.1 column "Reads" no longer `from('learner_skill_state')`.
- [ ] CI gate added: `! grep "from('learner_skill_state')" src/` passes.
- [ ] All 1013+ existing tests pass.
- [ ] New tests for `learnerProgressService` exist and pass.
- [ ] Browser smoke: dashboard "due reviews" count matches session result count for `testuser@duin.home`.
- [ ] CLAUDE.md updated.
- [ ] `docs/current-system/page-framework-status.md` references this work.
