# Learner Progress Service — Canonical Contract Spec (v6)

**Date:** 2026-05-01
**Status:** Implementation-ready after five rounds of architect review (v1→v2→v3→v4→v5→v6). v6 rewrites §11.5 fixture as explicit numbered tables (per architect v5 review: 5 SIG + 2 NIT, all in §11.5 fixture math). No structural/architectural changes.
**Source:** 2026-05-01 architecture-review conversation; v2/v3/v4 incorporate three rounds of architect review feedback.

## 1. Goal

Introduce **`learnerProgressService`** as the single canonical contract through which every UI surface reads "what's the user's progress / what should they do today?" data. Every legacy-table read in the surfacing layer (UI services + page-level hooks) is migrated through this service.

After this lands, every surfacing-layer surface (Dashboard, Progress page, lapsing card, weekly-goal evaluation, Voortgang) reads from the same source as the session engine. The dashboard count and the actual session content can no longer disagree, and the weekly-goal evaluator stops reading three different legacy tables.

### 1.1 Contract semantics — what counts mean

The architect review identified that even with predicate parity, the dashboard cannot return the *exact* output of the session because session output depends on inputs the dashboard doesn't know (selected lesson, posture, mode, load budgets, recent-failure fatigue, source-switch caps).

**Spec resolution:** the dashboard's counts represent the **eligibility ceiling** for today, not the session's actual output. The session output is always `≤` the ceiling.

| Count | Meaning |
|---|---|
| `dueReviewsToday` | Capabilities currently `next_due_at <= now` AND active+ready+published. The session may serve a subset bounded by `preferredSessionSize`. |
| `newIntroductionsToday` | Ready+published capabilities that are activatable (source-progress satisfied, not yet reviewed). Session serves a subset bounded by load budgets, prerequisites, and recent-failure fatigue. |
| `recallInteractionsTarget` | Goal-policy *target* for recall interactions today (derived from due target + new target + supply). Not a raw count. |
| `weakItemsToday` | Currently due capabilities with `lapse_count >= 3`, capped at 20% of due. |
| `estimatedMinutes` | `(due + new) × meanLatencyMs / 60000`. |

**UI consequence:** widget copy should say "X reviews ready" (a ceiling) rather than "X reviews you'll do today" (an output prediction). This is documented in §11.4 (UI copy changes).

### 1.2 Scope expansion in v4 (vs v3)

v3 was scoped to Dashboard + Voortgang reads only. v4 expands scope to cover **every surfacing-layer legacy-table read** that has a clean capability-system equivalent. See §3.3 for the full inventory. The remaining out-of-scope reads are write paths (`reviewHandler.ts`) and operational reads (session lifecycle in `lib/session.ts`), both deferred to the §12 q3 follow-up.

## 2. Non-Goals

- Decommissioning the `learner_skill_state`, `review_events`, or `learner_stage_events` tables from the schema. They stay as historical record. Read paths migrate; write paths from the legacy session path do not (they are the legacy session path).
- Changing the FSRS scheduler (`src/lib/fsrs.ts`) or the dueness predicate (`getDueCapabilitiesFromRows` in `src/lib/capabilities/capabilityScheduler.ts:55-77`). The new SQL functions mirror their rules.
- Migrating the session engine (`capabilitySessionDataService.ts`). Already capability-aware.
- Changing `learner_skill_state` / `review_events` / `learner_stage_events` write paths (`learnerStateService.applyReviewToSkillState`, `upsertItemState`, `logStageEvent`, `reviewEventService.logReviewEvent`). Those continue to receive writes from `lib/reviewHandler.ts` until the legacy session path is decommissioned (separate effort — see §12 q3).
- Migrating the **legacy session path** in `Session.tsx:181-187` and `lib/reviewHandler.ts:59-139`. Those still read `learner_skill_state` because they ARE the legacy session path. Whether to remove them is decided in §12 q3.
- Migrating `lib/session.ts:37` — the `review_events` read there is operational (last-activity-timestamp inference for stale-session cleanup), not analytical. Keep until the legacy session path is decommissioned.
- Migrating `sessionSummaryService.getSessionLocalFacts` — tied to the legacy session path's review/stage events. Migrates with the legacy session path in §12 q3.
- Changing `lessonService.getLessonCapabilityPracticeSummary` (already capability-aware).
- Rewriting `getMasteryOverview` (`src/lib/mastery/masteryModel.ts:524`). Already capability-native — see §4.2 SIG-4 resolution.
- The pedagogy planner's load-budget caps (`pedagogyPlanner.ts:275-294`). These are session-output caps, not eligibility predicates — they don't belong in the dashboard's ceiling counts.

## 3. Current State (Audit)

### 3.1 Where the capability tables live

The architect identified that `learner_capability_state`, `learning_capabilities`, `learner_source_progress_state`, `capability_review_events` are NOT in `scripts/migration.sql`. Verified — they were added by the capability-rollout migration at:

**File:** `scripts/migrations/2026-04-25-capability-core.sql`

Table definitions, with key column types confirmed:

- `learner_capability_state` (lines 56-77): `next_due_at timestamptz`, `stability double precision`, `lapse_count int`, `consecutive_failure_count int`, `activation_state text in ('dormant','active','suspended','retired')`. Existing indexes (lines 78-81): `learner_capability_state_due_idx` on `(user_id, activation_state, next_due_at)` (3-column composite, SARGable for our `WHERE user_id=? AND activation_state='active' AND next_due_at <= now`) and `learner_capability_state_capability_idx` on `(capability_id)`. Verified directly.
- `learning_capabilities` (lines 5-23): `metadata_json jsonb` (the projection metadata including `requiredSourceProgress`), `readiness_status text`, `publication_status text`, `source_kind text`, `source_ref text`, `capability_type text`. Indexes: `learning_capabilities_source_idx` on `(source_kind, source_ref)` line 24-25, and `learning_capabilities_readiness_publication_idx` on `(readiness_status, publication_status)` line 26-27.
- `learner_source_progress_state` (lines 116-127): `source_ref text`, `source_section_ref text default '__lesson__'`, `current_state text`, `completed_event_types text[]` (TEXT ARRAY — confirmed). Unique constraint on `(user_id, source_ref, source_section_ref)`. **No index on `(user_id, source_ref)` — this needs adding** (see §10 risks).
- `capability_review_events` (lines 83-101): `answer_report_json jsonb`, `created_at timestamptz`, `capability_id uuid`, `user_id uuid`. Has a unique constraint on `(session_id, session_item_id, attempt_number)` line 100, but no obvious analytics index on `(user_id, created_at desc)`. Adding one in this spec.

### 3.2 The legacy/new split — surfacing-layer read map

Compiled by exhaustive grep `from('learner_skill_state'|'review_events'|'learner_stage_events')` across `/src` (excluding tests). Every result is classified as in-scope-v4, out-of-scope-justified, or deferred-to-q3.

| Caller (file:line) | Legacy table | v4 disposition |
|---|---|---|
| `goalService.computeTodayPlan` (line 545) | `learner_skill_state` | **PR-1** — replaced by `getTodaysPlanRawCounts` |
| `goalService.getOverdueCount` (line 468) | `learner_skill_state` | **PR-2** — replaced by `getOverdueCount` |
| `goalService.getStudyDaysCount` (line 390) | `review_events` | **PR-2** — replaced by `getStudyDaysCount` |
| `goalService.getRecallAndRecognitionStats` (line 415) | `review_events` | **PR-2** — replaced by `getRecallStatsForWeek` |
| `goalService.getUsableVocabGain` (line 442) | `learner_stage_events` | **PR-2** — replaced by `getUsableVocabularyGain` (semantic shift documented in §10 risks) |
| `learnerStateService.getLapsingItems` (line 122) | `learner_skill_state` | **PR-1** — wraps `getLapsingCount` |
| `learnerStateService.getDueSkills` (line 51) | `learner_skill_state` | **PR-5** — DELETE (no production callers, verified by grep) |
| `learnerStateService.getSkillStates` (line 28) | `learner_skill_state` | **DEFERRED to q3** — only caller is `lib/reviewHandler.ts:93` (legacy session path) |
| `learnerStateService.getSkillStatesBatch` (line 39) | `learner_skill_state` | **PR-3 partial** — `useProgressData.ts:81` migrates to service; `Session.tsx:320` deferred to q3 |
| `progressService.getAccuracyBySkillType` (line 19) | `review_events` | **PR-3** — replaced by `getRecallAccuracyByDirection` |
| `progressService.getLapsePrevention` (line 45) | `learner_skill_state` | **PR-3** — replaced by `getLapsePrevention` |
| `progressService.getVulnerableItems` (line 68) | `learner_skill_state` | **PR-3** — replaced by `getVulnerableCapabilities` (+ shape adapter) |
| `progressService.getAvgLatencyMs` (line 107) | `review_events` | **PR-3** — replaced by `getReviewLatencyStats` |
| `progressService.getCapabilityMasteryOverview` (line 135) | n/a — pass-through | **PR-3** — DELETED; consumers import from `@/lib/mastery/masteryModel` directly (already capability-native) |
| `Dashboard.tsx:396` | `review_events` | **PR-1** — replaced by `getCurrentStreakDays` |
| `useProgressData.ts:81` | `learner_skill_state` (via `getSkillStatesBatch`) | **PR-3** — refactor hook to call `getMemoryHealth` + `getReviewForecast`; drop `skillStates` from `ProgressData` shape (Voortgang doesn't expose skillStates downstream — verified) |
| `lib/session.ts:37` | `review_events` | **OUT OF SCOPE** — operational (last-activity inference for stale-session sweep), not analytical |
| `sessionSummaryService.getSessionLocalFacts:92` | `review_events` | **DEFERRED to q3** — tied to legacy session path's session-summary message generation |
| `sessionSummaryService.getSessionLocalFacts:113` | `learner_stage_events` | **DEFERRED to q3** — same |
| `reviewEventService` (full file) | `review_events` (write) | **DEFERRED to q3** — legacy write path from `lib/reviewHandler.ts` |
| `learnerStateService.logStageEvent` (line 107) | `learner_stage_events` (write) | **DEFERRED to q3** — legacy write path |

**In production today:**
- Slug-based source_refs (verified via `SELECT DISTINCT substring(source_ref from 1 for 30) FROM indonesian.learning_capabilities WHERE source_kind = 'item' LIMIT 8` — all 8 results are `learning_items/<slug>` form, zero UUIDs). The dual-scheme concern from architect's C2 does not apply to current production data.

### 3.3 Deep-module interface inventory

This is the inventory the user asked for: every read/write seam between every deep module, classified by whether it goes through the canonical contract or bypasses it.

**Capability-system core (already canonical, no migration needed):**

| Module | Reads from | Writes to | Status |
|---|---|---|---|
| `capabilityScheduler.ts` | `learner_capability_state`, `learning_capabilities` | — | ✅ canonical |
| `capabilitySessionDataService.ts` | `learner_capability_state`, `learning_capabilities`, `capability_artifacts`, `learner_source_progress_state` | — | ✅ canonical |
| `capabilityCatalog.ts` | content tables (lessons, learning_items, etc.) | `learning_capabilities` (publish) | ✅ canonical |
| `reviewProcessor` (Edge Function) | `learner_capability_state`, `capability_review_events` | `learner_capability_state`, `capability_review_events` | ✅ canonical |
| `sourceProgressService.ts` | `learner_source_progress_state` | `learner_source_progress_state` | ✅ canonical |
| `sourceProgressGates.ts` | (pure function over passed-in data) | — | ✅ canonical (predicate co-located with capability data) |
| `masteryModel.ts:524` (`getMasteryOverview`) | `learner_capability_state`, `learning_capabilities`, `capability_artifacts` | — | ✅ canonical (consumers can import directly per SIG-4) |
| `pedagogyPlanner.ts` | (pure function over capabilities passed-in) | — | ✅ canonical |
| `lessonService.getLessonCapabilityPracticeSummary` | `learner_capability_state`, `learning_capabilities` | — | ✅ canonical |
| `goalService.evaluateGoalSet` (line 504+) | (calls `refreshGoalProgress` + writes `learner_weekly_goal_sets`) | `learner_weekly_goal_sets` | becomes canonical after PR-2 |

**Legacy write paths (out of scope until q3 resolution):**

| Module | Writes to | Triggered by |
|---|---|---|
| `learnerStateService.applyReviewToSkillState` | `learner_skill_state` | `lib/reviewHandler.ts:106` (legacy session) |
| `learnerStateService.upsertItemState` | `learner_item_state` | `lib/reviewHandler.ts:128` (legacy session) |
| `learnerStateService.logStageEvent` | `learner_stage_events` | `lib/reviewHandler.ts:135` (legacy session) |
| `reviewEventService.logReviewEvent` | `review_events` | `lib/reviewHandler.ts:73` (legacy session) |

**Operational reads (out of scope — not analytical):**

| Module | Reads from | Purpose |
|---|---|---|
| `lib/session.ts:37` | `review_events` (latest created_at) | Stale-session-cleanup last-activity inference |
| `Dashboard.tsx:396` (in v3) | `review_events` (streak compute) | Now in scope as PR-1 — moved to surfacing reads above |

**Dimension counts:**
- 21 surfacing-layer reads identified.
- 14 in scope across PR-1 through PR-3, PR-5.
- 1 deletion (`getDueSkills`).
- 5 deferred to q3 (legacy session path entanglement).
- 1 truly out of scope (operational session lifecycle).

## 4. Proposed Architecture

### 4.1 Deep module pattern

`learnerProgressService` is the deep module. UI surfaces never reach around it to raw tables. The interface is intentionally narrow (12 methods after v4 expansion). Inside, complexity is hidden: predicate parity with the session engine, transitive-closure source-progress satisfaction, slug-based item joins, week-bucketing in user timezones, capability_review_events aggregation.

This is not a thin pass-through — the SQL-side complexity (the source-progress predicate alone is ~70 lines of CASE logic) lives behind a typed TS contract, and consumers bind to the contract not the SQL. When the underlying tables shift again (capability v2, FSRS-6, whatever), the contract stays stable and only the SQL functions change.

### 4.2 Service interface (TypeScript)

```ts
// src/services/learnerProgressService.ts
import type { WeeklyGoal } from '@/types/learning'

export interface TodaysPlanRawCounts {
  dueRaw: number                    // ceiling: due capabilities, no goal-policy adjustment
  newRaw: number                    // ceiling: activatable capabilities, no load-budget adjustment
  weakRaw: number                   // due AND lapse_count >= 3, no 20% cap
  recallSupplyRaw: number           // due where capability_type = 'form_recall'
  meanLatencyMs: number             // average over last 14d, 20000 fallback
}

export interface LapsingCountResult {
  count: number                     // distinct learning_items where any capability has
                                    // lapse_count >= 3 AND stability < 2.0 (matches legacy semantics)
}

export interface LapsePreventionResult {
  atRisk: number                    // capabilities where consecutive_failure_count > 0
  rescued: number                   // lapse_count > 0 AND consecutive_failure_count = 0
                                    // AND last_reviewed_at >= 7d
}

export interface MemoryHealthResult {
  avgRecognitionStability: number   // averaged stability of capability_type = 'text_recognition'
  recognitionSampleSize: number
  avgRecallStability: number        // averaged stability of capability_type = 'form_recall'
  recallSampleSize: number
  avgOverallStability: number       // averaged stability across all active capabilities (used by useProgressData skillStats.avgStability)
  overallSampleSize: number
}

export interface ReviewLatencyStatsResult {
  currentWeekMs: number | null
  priorWeekMs: number | null
}

export interface RecallAccuracyResult {
  recognitionCorrect: number
  recognitionTotal: number
  recallCorrect: number
  recallTotal: number
}

export interface VulnerableCapability {
  capabilityId: string
  canonicalKey: string
  itemId: string                    // parent learning_items.id
  baseText: string                  // from learning_items.base_text
  meaning: string                   // best-NL translation; '' if none
  lapseCount: number
  consecutiveFailureCount: number
}

export interface ReviewForecastDay {
  date: string                      // YYYY-MM-DD in user's timezone
  count: number
}

// New in v4 — for goalService.refreshGoalProgress migration
export interface RecallStatsForWeekResult {
  recognitionCorrect: number
  recognitionTotal: number
  recallCorrect: number
  recallTotal: number
}

export interface LearnerProgressService {
  /** Raw eligibility counts. UI services apply goal-policy adjustments on top. */
  getTodaysPlanRawCounts(input: { userId: string; now: Date }): Promise<TodaysPlanRawCounts>
  /** Distinct items with any lapsing+unstable capability. */
  getLapsingCount(input: { userId: string }): Promise<LapsingCountResult>
  /** Per-direction lapse risk and recovery. */
  getLapsePrevention(input: { userId: string }): Promise<LapsePreventionResult>
  /** Stability averages by direction and overall. */
  getMemoryHealth(input: { userId: string }): Promise<MemoryHealthResult>
  /** Mean latency current week vs prior week. */
  getReviewLatencyStats(input: { userId: string }): Promise<ReviewLatencyStatsResult>
  /** All-time recall accuracy: recognition (text_recognition) vs recall (form_recall). See §10 risks. */
  getRecallAccuracyByDirection(input: { userId: string }): Promise<RecallAccuracyResult>
  /** Top N vulnerable items with item context. */
  getVulnerableCapabilities(input: { userId: string; limit?: number }): Promise<VulnerableCapability[]>
  /** Per-day count of upcoming due capabilities, in user's local timezone. */
  getReviewForecast(input: { userId: string; days?: number; timezone: string }): Promise<ReviewForecastDay[]>
  /** Distinct study-days within a week window, bucketed in user's timezone. (v4 — replaces goalService.getStudyDaysCount) */
  getStudyDaysCount(input: { userId: string; weekStartUtc: string; weekEndUtc: string; timezone: string }): Promise<number>
  /** Weekly accuracy stats for recall_quality goal. (v4 — replaces goalService.getRecallAndRecognitionStats) */
  getRecallStatsForWeek(input: { userId: string; weekStartUtc: string; weekEndUtc: string }): Promise<RecallStatsForWeekResult>
  /** Distinct learning_items whose first-ever form_recall review fell within the week. (v4 — replaces goalService.getUsableVocabGain; semantic shift documented in §10 risks) */
  getUsableVocabularyGain(input: { userId: string; weekStartUtc: string; weekEndUtc: string }): Promise<number>
  /** Capabilities due before start-of-today in user's timezone. (v4 — replaces goalService.getOverdueCount) */
  getOverdueCount(input: { userId: string; timezone: string }): Promise<number>
  /** Consecutive review-days streak ending today, bucketed in user's timezone. (v4 — replaces Dashboard.tsx:396 streak compute) */
  getCurrentStreakDays(input: { userId: string; timezone: string }): Promise<number>
}

export const learnerProgressService: LearnerProgressService = { /* impl in §4.6 */ }
```

13 methods total. (NIT-1 v3 fix carried forward: this number is reflected in §15 DoD and §5.)

**Note (v3 SIG-4 carried forward):** there is no `getMasteryOverview` pass-through. Consumers (`progressService.getCapabilityMasteryOverview` was the only caller — to be deleted in PR-3) import `getMasteryOverview` directly from `@/lib/mastery/masteryModel`. The CI gate (PR-4 follow-up per §12 q3) does not need to allowlist `masteryModel.ts` because it doesn't read `learner_skill_state`.

### 4.3 Helper SQL functions (foundations)

These two helpers are required by the main metric functions.

```sql
-- Helper 1a: immutable_unaccent — IMMUTABLE wrapper for unaccent.
--
-- (architect CRIT-D in v3): the standard `unaccent(text)` form is declared
-- STABLE in pg_extension's catalog (the dictionary file could in theory be
-- reloaded), so calling it from a function declared IMMUTABLE is unsafe and
-- breaks functional indexes on PG ≥15 in some paths. The documented PG
-- workaround is to use the two-arg form `unaccent('public.unaccent', text)`
-- inside an IMMUTABLE wrapper — naming the dictionary explicitly makes the
-- call deterministic from the planner's perspective.
-- See: https://www.postgresql.org/docs/15/unaccent.html
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION indonesian.immutable_unaccent(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT public.unaccent('public.unaccent', p_text);
$$;

-- Helper 1b: stable_slug — port of the TypeScript stableSlug() at
-- scripts/lib/content-pipeline-output.ts:97-104.
--
-- Calls immutable_unaccent (not raw unaccent) so the IMMUTABLE marker holds
-- and the functional index in §4.5 is index-usable.
CREATE OR REPLACE FUNCTION indonesian.stable_slug(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(
    regexp_replace(
      lower(indonesian.immutable_unaccent(p_text)),
      '[^a-z0-9]+', '-', 'g'
    ),
    '^-+|-+$', '', 'g'
  );
$$;

-- Helper 2: source-progress predicate
--
-- LANGUAGE sql STABLE — pure scalar function. Postgres can inline it into
-- the calling query plan, eliminating the per-row function-call overhead
-- that v2's plpgsql version had (architect SIG-3). Arguments take metadata
-- and source-kind/capability-type by value so the function never re-reads
-- learning_capabilities — the calling query already has those columns.
--
-- Mirrors src/lib/pedagogy/sourceProgressGates.ts:32-93 EXCLUDING evidence-bypass
-- (evidence bypass is session-shape-specific; eligibility ceiling does not need it).
--
-- v3 SIG-3 / v3 CRIT-2 fixes carried forward:
--   - lists verified verbatim against capabilitySessionDataService.ts:147-164.
--   - source_kinds for kind='none' rejection: ('item', 'pattern', 'dialogue_line').
--   - capability_types: 9 types, including 'pattern_contrast'; excluding
--     root_derived_recognition/root_derived_recall (not in production lessonSequencedCapabilityTypes).
--
-- v4 CRIT-C fix: removed the WHEN 'opened' arm. Per
-- capabilityTypes.ts:66-72, SourceProgressRequirement.requiredState only
-- admits 6 values (section_exposed, intro_completed, heard_once,
-- pattern_noticing_seen, guided_practice_completed, lesson_completed). The
-- 'opened' arm was dead code that lied about the contract.
CREATE OR REPLACE FUNCTION indonesian._capability_source_progress_met(
  p_user_id uuid,
  p_metadata jsonb,
  p_source_kind text,
  p_capability_type text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    -- Case 1: no requirement specified at all → trivially satisfied
    p_metadata->'requiredSourceProgress' IS NULL
    OR (
      -- Case 2: kind = 'none' AND lesson-sequenced item/pattern/dialogue_line capability → reject
      p_metadata->'requiredSourceProgress'->>'kind' = 'none'
      AND NOT (
        p_source_kind IN ('item', 'pattern', 'dialogue_line')
        AND p_capability_type IN (
          'text_recognition', 'meaning_recall', 'l1_to_id_choice', 'form_recall',
          'audio_recognition', 'dictation', 'pattern_recognition',
          'pattern_contrast', 'contextual_cloze'
        )
      )
    )
    OR (
      -- Case 3: kind = 'source_progress' → check transitive closure
      p_metadata->'requiredSourceProgress'->>'kind' = 'source_progress'
      AND EXISTS (
        SELECT 1
        FROM indonesian.learner_source_progress_state lsps
        WHERE lsps.user_id = p_user_id
          AND (
            -- source_ref alone OR source_ref || '/' || source_section_ref
            -- (per sourceProgressGates.ts:78-81)
            lsps.source_ref = p_metadata->'requiredSourceProgress'->>'sourceRef'
            OR (lsps.source_ref || '/' || lsps.source_section_ref)
                 = p_metadata->'requiredSourceProgress'->>'sourceRef'
          )
          AND (
            -- Transitive-closure satisfaction: current_state in satisfying set
            -- OR any completed event in satisfying set.
            -- Mirrors statesSatisfyingRequirement (sourceProgressGates.ts:34-40)
            -- — only the 6 valid requiredState arms.
            lsps.current_state = ANY(
              CASE p_metadata->'requiredSourceProgress'->>'requiredState'
                WHEN 'section_exposed' THEN ARRAY['section_exposed','intro_completed','guided_practice_completed','lesson_completed']
                WHEN 'intro_completed' THEN ARRAY['intro_completed','guided_practice_completed','lesson_completed']
                WHEN 'heard_once' THEN ARRAY['heard_once','lesson_completed']
                WHEN 'pattern_noticing_seen' THEN ARRAY['pattern_noticing_seen','guided_practice_completed','lesson_completed']
                WHEN 'guided_practice_completed' THEN ARRAY['guided_practice_completed','lesson_completed']
                WHEN 'lesson_completed' THEN ARRAY['lesson_completed']
                ELSE ARRAY[]::text[]
              END
            )
            OR lsps.completed_event_types && (
              CASE p_metadata->'requiredSourceProgress'->>'requiredState'
                WHEN 'section_exposed' THEN ARRAY['section_exposed','intro_completed','guided_practice_completed','lesson_completed']
                WHEN 'intro_completed' THEN ARRAY['intro_completed','guided_practice_completed','lesson_completed']
                WHEN 'heard_once' THEN ARRAY['heard_once','lesson_completed']
                WHEN 'pattern_noticing_seen' THEN ARRAY['pattern_noticing_seen','guided_practice_completed','lesson_completed']
                WHEN 'guided_practice_completed' THEN ARRAY['guided_practice_completed','lesson_completed']
                WHEN 'lesson_completed' THEN ARRAY['lesson_completed']
                ELSE ARRAY[]::text[]
              END
            )
          )
      )
    );
$$;
```

**Architect-flagged details addressed:**
- C1: `stable_slug` defined here using `unaccent` extension via the IMMUTABLE wrapper pattern (CRIT-1 v3 → CRIT-D v3 v4 fix).
- C3: transitive-closure table embedded; section_ref fallback present.
- C6: `kind = 'none'` rejection logic explicit, lists corrected per CRIT-2 in v3.
- SIG-3: function rewritten LANGUAGE sql STABLE with metadata+source_kind+capability_type passed by value, allowing PG to inline the predicate into the outer query plan and eliminating the per-row PK lookup overhead from v2's plpgsql variant.
- v4 CRIT-C: dead `'opened'` arms removed.
- Out of scope (deliberate): evidence-bypass. The dashboard ceiling does not need it; the session loader applies it before serving but that's downstream of "is the capability eligible at all."

### 4.4 Metric SQL functions

```sql
-- compute_todays_plan_raw — raw eligibility counts; goal policy lives in goalService.ts.
CREATE OR REPLACE FUNCTION indonesian.compute_todays_plan_raw(
  p_user_id uuid,
  p_now timestamptz
)
RETURNS TABLE (
  due_raw int,
  new_raw int,
  weak_raw int,
  recall_supply_raw int,
  mean_latency_ms int
) LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  v_due int := 0;
  v_new int := 0;
  v_weak int := 0;
  v_recall_supply int := 0;
  v_latency int := 20000;
BEGIN
  -- "Due" = exact match with getDueCapabilitiesFromRows (capabilityScheduler.ts:60-67)
  SELECT count(*) INTO v_due
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND s.next_due_at IS NOT NULL
    AND s.next_due_at <= p_now;

  -- "New" eligibility ceiling: ready+published, no learner state OR dormant,
  -- AND source progress satisfied. Set-based join with the inlined predicate
  -- helper (architect SIG-3 fix in v3 — passes metadata + source_kind +
  -- capability_type by value so the helper doesn't re-read learning_capabilities,
  -- and LANGUAGE sql allows PG to inline the predicate into this query plan).
  SELECT count(*) INTO v_new
  FROM indonesian.learning_capabilities c
  LEFT JOIN indonesian.learner_capability_state s
    ON s.capability_id = c.id AND s.user_id = p_user_id
  WHERE c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND (s.id IS NULL OR s.activation_state = 'dormant')
    AND indonesian._capability_source_progress_met(
      p_user_id, c.metadata_json, c.source_kind, c.capability_type
    );

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

  SELECT count(*) INTO v_recall_supply
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND c.capability_type = 'form_recall'
    AND s.next_due_at IS NOT NULL
    AND s.next_due_at <= p_now;

  -- Mean latency: 14-day window for stability. The dashboard latency ceiling
  -- is an estimate that benefits from a longer averaging window so daily
  -- variance doesn't make minute-estimates jump around. The voortgang stats
  -- (get_review_latency_stats) use 7-day windows because those are
  -- week-over-week comparison metrics, not stability estimates.
  -- (architect NIT-3 v3)
  SELECT COALESCE(AVG(latency_ms_safe)::int, 20000) INTO v_latency
  FROM (
    SELECT (answer_report_json->>'latencyMs')::int AS latency_ms_safe
    FROM indonesian.capability_review_events
    WHERE user_id = p_user_id
      AND created_at >= p_now - interval '14 days'
      AND answer_report_json->>'latencyMs' ~ '^\d+$'
  ) t;

  RETURN QUERY SELECT v_due, v_new, v_weak, v_recall_supply, v_latency;
END;
$$;

-- get_lapsing_count — distinct items (matches legacy semantics, not capabilities)
CREATE OR REPLACE FUNCTION indonesian.get_lapsing_count(p_user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT COALESCE(count(DISTINCT li.id), 0)::int
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  JOIN indonesian.learning_items li
    ON c.source_kind = 'item'
   AND c.source_ref = ('learning_items/' || indonesian.stable_slug(li.base_text))
  WHERE s.user_id = p_user_id
    AND s.lapse_count >= 3
    AND COALESCE(s.stability, 0) < 2.0;
$$;

-- get_lapse_prevention — at-risk and rescued counts
CREATE OR REPLACE FUNCTION indonesian.get_lapse_prevention(p_user_id uuid)
RETURNS TABLE (at_risk int, rescued int)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COALESCE(SUM(CASE WHEN s.consecutive_failure_count > 0 THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(
      CASE WHEN s.lapse_count > 0
            AND s.consecutive_failure_count = 0
            AND s.last_reviewed_at >= now() - interval '7 days'
      THEN 1 ELSE 0 END
    ), 0)::int
  FROM indonesian.learner_capability_state s
  WHERE s.user_id = p_user_id
    AND s.lapse_count > 0;
$$;

-- get_memory_health — average stability per capability direction with sample sizes
-- v4 expansion: also returns overall average stability (consumed by useProgressData skillStats.avgStability).
CREATE OR REPLACE FUNCTION indonesian.get_memory_health(p_user_id uuid)
RETURNS TABLE (
  avg_recognition_stability numeric,
  recognition_sample_size int,
  avg_recall_stability numeric,
  recall_sample_size int,
  avg_overall_stability numeric,
  overall_sample_size int
) LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COALESCE(AVG(s.stability) FILTER (WHERE c.capability_type = 'text_recognition'), 0)::numeric,
    COUNT(*) FILTER (WHERE c.capability_type = 'text_recognition' AND s.stability IS NOT NULL)::int,
    COALESCE(AVG(s.stability) FILTER (WHERE c.capability_type = 'form_recall'), 0)::numeric,
    COUNT(*) FILTER (WHERE c.capability_type = 'form_recall' AND s.stability IS NOT NULL)::int,
    COALESCE(AVG(s.stability), 0)::numeric,
    COUNT(*) FILTER (WHERE s.stability IS NOT NULL)::int
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND s.stability IS NOT NULL;
$$;

-- get_review_latency_stats — current vs prior week (uses capability_review_events not legacy)
-- 7-day windows here because this is a week-over-week comparison metric for
-- voortgang. compute_todays_plan_raw uses 14-day for stability of the dashboard
-- estimate (architect NIT-3 v3).
CREATE OR REPLACE FUNCTION indonesian.get_review_latency_stats(p_user_id uuid)
RETURNS TABLE (current_week_ms int, prior_week_ms int)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    (
      SELECT AVG((answer_report_json->>'latencyMs')::int)::int
      FROM indonesian.capability_review_events
      WHERE user_id = p_user_id
        AND created_at >= now() - interval '7 days'
        AND answer_report_json->>'latencyMs' ~ '^\d+$'
    ),
    (
      SELECT AVG((answer_report_json->>'latencyMs')::int)::int
      FROM indonesian.capability_review_events
      WHERE user_id = p_user_id
        AND created_at >= now() - interval '14 days'
        AND created_at <  now() - interval '7 days'
        AND answer_report_json->>'latencyMs' ~ '^\d+$'
    );
$$;

-- get_recall_accuracy_by_direction — separate counts per direction (all-time, voortgang)
CREATE OR REPLACE FUNCTION indonesian.get_recall_accuracy_by_direction(p_user_id uuid)
RETURNS TABLE (
  recognition_correct int,
  recognition_total int,
  recall_correct int,
  recall_total int
) LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE c.capability_type = 'text_recognition'
        AND (re.answer_report_json->>'wasCorrect')::boolean = true
    )::int,
    COUNT(*) FILTER (WHERE c.capability_type = 'text_recognition')::int,
    COUNT(*) FILTER (
      WHERE c.capability_type = 'form_recall'
        AND (re.answer_report_json->>'wasCorrect')::boolean = true
    )::int,
    COUNT(*) FILTER (WHERE c.capability_type = 'form_recall')::int
  FROM indonesian.capability_review_events re
  JOIN indonesian.learning_capabilities c ON c.id = re.capability_id
  WHERE re.user_id = p_user_id
    AND re.answer_report_json->>'wasCorrect' IN ('true', 'false');
$$;

-- get_recall_stats_for_week — weekly windowed accuracy (used by goalService recall_quality goal).
-- v4 NEW: replaces goalService.getRecallAndRecognitionStats which read review_events.
CREATE OR REPLACE FUNCTION indonesian.get_recall_stats_for_week(
  p_user_id uuid,
  p_week_start_utc timestamptz,
  p_week_end_utc timestamptz
)
RETURNS TABLE (
  recognition_correct int,
  recognition_total int,
  recall_correct int,
  recall_total int
) LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE c.capability_type = 'text_recognition'
        AND (re.answer_report_json->>'wasCorrect')::boolean = true
    )::int,
    COUNT(*) FILTER (WHERE c.capability_type = 'text_recognition')::int,
    COUNT(*) FILTER (
      WHERE c.capability_type = 'form_recall'
        AND (re.answer_report_json->>'wasCorrect')::boolean = true
    )::int,
    COUNT(*) FILTER (WHERE c.capability_type = 'form_recall')::int
  FROM indonesian.capability_review_events re
  JOIN indonesian.learning_capabilities c ON c.id = re.capability_id
  WHERE re.user_id = p_user_id
    AND re.created_at >= p_week_start_utc
    AND re.created_at <  p_week_end_utc
    AND re.answer_report_json->>'wasCorrect' IN ('true', 'false');
$$;

-- get_study_days_count — distinct days with at least one review, in user timezone.
-- v4 NEW: replaces goalService.getStudyDaysCount which read review_events.
CREATE OR REPLACE FUNCTION indonesian.get_study_days_count(
  p_user_id uuid,
  p_week_start_utc timestamptz,
  p_week_end_utc timestamptz,
  p_timezone text
)
RETURNS int LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT COUNT(DISTINCT (created_at AT TIME ZONE p_timezone)::date)::int
  FROM indonesian.capability_review_events
  WHERE user_id = p_user_id
    AND created_at >= p_week_start_utc
    AND created_at <  p_week_end_utc;
$$;

-- get_usable_vocabulary_gain — distinct learning_items whose first-ever
-- form_recall capability_review_events row fell within the week window.
--
-- v4 NEW: replaces goalService.getUsableVocabGain (legacy: count of distinct
-- learning_items moved to stage 'retrieving'/'productive'/'maintenance' that
-- week, via learner_stage_events).
--
-- Semantic shift documented in §10 risks: legacy used three stage thresholds;
-- capability equivalent uses "first form_recall review" as the stage-into-
-- retrieving proxy. For users on the legacy session path, this approximation
-- diverges; for users on the capability session path it's a direct mirror.
CREATE OR REPLACE FUNCTION indonesian.get_usable_vocabulary_gain(
  p_user_id uuid,
  p_week_start_utc timestamptz,
  p_week_end_utc timestamptz
)
RETURNS int LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT COALESCE(COUNT(DISTINCT li.id), 0)::int
  FROM indonesian.learning_items li
  WHERE EXISTS (
    SELECT 1
    FROM indonesian.capability_review_events re
    JOIN indonesian.learning_capabilities c ON c.id = re.capability_id
    WHERE re.user_id = p_user_id
      AND c.capability_type = 'form_recall'
      AND c.source_kind = 'item'
      AND c.source_ref = ('learning_items/' || indonesian.stable_slug(li.base_text))
      AND re.created_at >= p_week_start_utc
      AND re.created_at <  p_week_end_utc
      AND NOT EXISTS (
        -- No earlier form_recall review for this learning_item across any of its capabilities
        SELECT 1
        FROM indonesian.capability_review_events re_earlier
        JOIN indonesian.learning_capabilities c_earlier ON c_earlier.id = re_earlier.capability_id
        WHERE re_earlier.user_id = p_user_id
          AND c_earlier.capability_type = 'form_recall'
          AND c_earlier.source_kind = 'item'
          AND c_earlier.source_ref = ('learning_items/' || indonesian.stable_slug(li.base_text))
          AND re_earlier.created_at < p_week_start_utc
      )
  );
$$;

-- get_overdue_count — capabilities due before start-of-today in the user's timezone.
-- v4 NEW: replaces goalService.getOverdueCount which read learner_skill_state.
CREATE OR REPLACE FUNCTION indonesian.get_overdue_count(
  p_user_id uuid,
  p_timezone text
)
RETURNS int LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT count(*)::int
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND s.next_due_at IS NOT NULL
    AND s.next_due_at < (date_trunc('day', now() AT TIME ZONE p_timezone) AT TIME ZONE p_timezone);
$$;

-- get_current_streak_days — consecutive days ending today with at least one review,
-- in the user's timezone.
-- v4 NEW: replaces Dashboard.tsx:396 streak compute which read review_events.
CREATE OR REPLACE FUNCTION indonesian.get_current_streak_days(
  p_user_id uuid,
  p_timezone text
)
RETURNS int LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  v_today date := (now() AT TIME ZONE p_timezone)::date;
  v_check_date date := v_today;
  v_streak int := 0;
  v_has_review boolean;
BEGIN
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM indonesian.capability_review_events
      WHERE user_id = p_user_id
        AND (created_at AT TIME ZONE p_timezone)::date = v_check_date
    ) INTO v_has_review;
    IF NOT v_has_review THEN EXIT; END IF;
    v_streak := v_streak + 1;
    v_check_date := v_check_date - 1;
    -- Defensive cap to avoid runaway loops on bad data
    IF v_streak >= 365 THEN EXIT; END IF;
  END LOOP;
  RETURN v_streak;
END;
$$;

-- get_vulnerable_capabilities — top N by lapse_count, joined to item context
CREATE OR REPLACE FUNCTION indonesian.get_vulnerable_capabilities(
  p_user_id uuid,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  capability_id uuid,
  canonical_key text,
  item_id uuid,
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
    c.canonical_key,
    li.id,
    li.base_text,
    COALESCE(im.translation_text, '')::text,
    s.lapse_count,
    s.consecutive_failure_count
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  JOIN indonesian.learning_items li
    ON c.source_kind = 'item'
   AND c.source_ref = ('learning_items/' || indonesian.stable_slug(li.base_text))
  LEFT JOIN item_meanings_nl im ON im.learning_item_id = li.id
  WHERE s.user_id = p_user_id
    AND s.lapse_count > 0
  ORDER BY s.lapse_count DESC, s.consecutive_failure_count DESC
  LIMIT p_limit;
$$;

-- get_review_forecast — per-day count in user's local timezone (N1 fix)
CREATE OR REPLACE FUNCTION indonesian.get_review_forecast(
  p_user_id uuid,
  p_days int DEFAULT 14,
  p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE (forecast_date date, count int)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    (s.next_due_at AT TIME ZONE p_timezone)::date AS forecast_date,
    count(*)::int
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND s.next_due_at IS NOT NULL
    AND s.next_due_at <= now() + make_interval(days => p_days)
  GROUP BY 1
  ORDER BY 1;
$$;
```

### 4.5 Indexes added by this migration

```sql
-- Required for fast _capability_source_progress_met joins
CREATE INDEX IF NOT EXISTS lsps_user_source_ref_idx
  ON indonesian.learner_source_progress_state(user_id, source_ref);

-- Required for get_review_latency_stats time-window scans + get_recall_stats_for_week +
-- get_study_days_count + get_usable_vocabulary_gain + get_current_streak_days
CREATE INDEX IF NOT EXISTS cre_user_created_idx
  ON indonesian.capability_review_events(user_id, created_at DESC);

-- Functional index for the slug-match join in get_lapsing_count, get_vulnerable_capabilities,
-- and get_usable_vocabulary_gain. Without this index, the JOIN does a full scan over
-- learning_items on every call. immutable_unaccent + stable_slug are IMMUTABLE so the index
-- is index-usable.
CREATE INDEX IF NOT EXISTS learning_items_slug_idx
  ON indonesian.learning_items(indonesian.stable_slug(base_text));

-- For get_usable_vocabulary_gain's NOT EXISTS subquery — composite covering the
-- capability_review_events join key plus capability_id ordering.
CREATE INDEX IF NOT EXISTS cre_user_capability_created_idx
  ON indonesian.capability_review_events(user_id, capability_id, created_at);
```

### 4.6 Service implementation skeleton

```ts
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.schema('indonesian').rpc(name, args)
  if (error) throw new Error(`learnerProgressService.${name} failed: ${error.message}`)
  return data as T
}

export const learnerProgressService: LearnerProgressService = {
  async getTodaysPlanRawCounts({ userId, now }) {
    const rows = await rpc<{ due_raw: number; new_raw: number; weak_raw: number;
                            recall_supply_raw: number; mean_latency_ms: number }[]>(
      'compute_todays_plan_raw', { p_user_id: userId, p_now: now.toISOString() })
    const r = rows[0]
    return {
      dueRaw: r.due_raw,
      newRaw: r.new_raw,
      weakRaw: r.weak_raw,
      recallSupplyRaw: r.recall_supply_raw,
      meanLatencyMs: r.mean_latency_ms,
    }
  },
  // Scalar-returning methods (architect NIT-2 v4): for SQL functions that
  // return a single int (get_lapsing_count, get_overdue_count, get_study_days_count,
  // get_usable_vocabulary_gain, get_current_streak_days), supabase-js returns
  // the value directly (not as a row array). Wrap in the typed shape:
  async getLapsingCount({ userId }) {
    const data = await rpc<number>('get_lapsing_count', { p_user_id: userId })
    return { count: data ?? 0 }
  },
  async getOverdueCount({ userId, timezone }) {
    const data = await rpc<number>('get_overdue_count', { p_user_id: userId, p_timezone: timezone })
    return data ?? 0
  },
  // get_memory_health rounding (architect NIT-3 v4): service maps the raw
  // numeric AVG to 2-decimal numbers to preserve legacy useProgressData
  // display semantics (avg() in src/hooks/useProgressData.ts:65 rounded to
  // 2 decimals). Without this, MemoryHealthHero would show 2.7367890123 vs
  // legacy 2.74.
  async getMemoryHealth({ userId }) {
    const rows = await rpc<Array<{
      avg_recognition_stability: string; recognition_sample_size: number;
      avg_recall_stability: string; recall_sample_size: number;
      avg_overall_stability: string; overall_sample_size: number;
    }>>('get_memory_health', { p_user_id: userId })
    const r = rows[0]
    const round2 = (s: string) => Math.round(Number(s) * 100) / 100
    return {
      avgRecognitionStability: round2(r.avg_recognition_stability),
      recognitionSampleSize: r.recognition_sample_size,
      avgRecallStability: round2(r.avg_recall_stability),
      recallSampleSize: r.recall_sample_size,
      avgOverallStability: round2(r.avg_overall_stability),
      overallSampleSize: r.overall_sample_size,
    }
  },
  // ... other methods follow the same pattern (table-returning ones unwrap rows[0])
}
```

## 5. Algorithm

```text
1. Apply migration (one transaction):
   - CREATE EXTENSION IF NOT EXISTS unaccent
   - Create immutable_unaccent(), stable_slug(), _capability_source_progress_met() helpers
   - Create 13 metric SQL functions
   - Create 4 indexes
   - GRANT EXECUTE on all functions to authenticated
2. Add learnerProgressService.ts with the 13-method interface (§4.2)
3. Add learnerProgressService unit tests (mock supabase.rpc; verify shape mapping)
4. Migrate consumers in this order (one PR per group, each shippable):
   PR-1 (Dashboard slice):
     - goalService.computeTodayPlan → calls service + applies goal policy in TS
     - learnerStateService.getLapsingItems → wraps service.getLapsingCount
     - Dashboard.tsx:396 streak compute → service.getCurrentStreakDays
     - Browser smoke: Dashboard "due reviews" count = DB count = session count ceiling.
       Streak still renders for testuser with the seeded fixture data.
   PR-2 (Goal evaluation slice — full goalService migration):
     - goalService.getOverdueCount → service.getOverdueCount
     - goalService.getStudyDaysCount → service.getStudyDaysCount
     - goalService.getRecallAndRecognitionStats → service.getRecallStatsForWeek
       (note: shape change — service returns RAW counts {recognitionCorrect/Total, recallCorrect/Total};
        legacy returned RATIOS. Caller-side adapter required:
        recallAccuracy = recallTotal > 0 ? recallCorrect / recallTotal : 0,
        and likewise for recognition. Architect NIT-1 v4.)
     - goalService.getUsableVocabGain → service.getUsableVocabularyGain
     - All four reads in goalService now go through the service.
     - PR exit: zero from('learner_skill_state')|from('review_events')|from('learner_stage_events')
       remaining in goalService.ts (verified by grep).
   PR-3 (Voortgang slice — full progressService + useProgressData migration):
     - progressService.getLapsePrevention → service.getLapsePrevention
     - progressService.getVulnerableItems → service.getVulnerableCapabilities (+ shape adapter)
     - progressService.getAccuracyBySkillType → service.getRecallAccuracyByDirection
     - progressService.getAvgLatencyMs → service.getReviewLatencyStats
     - progressService.getCapabilityMasteryOverview → DELETED; consumers import getMasteryOverview
       from @/lib/mastery/masteryModel directly.
     - useProgressData.ts:81 (learnerStateService.getSkillStatesBatch call) → replaced with
       service.getMemoryHealth + service.getReviewForecast. The skillStates: LearnerSkillState[]
       field on ProgressData is dropped (verified: no consumer outside the hook uses it for the
       Voortgang page; Session.tsx:320 has its own getSkillStatesBatch call which is deferred to q3).
     - PR exit: zero from('learner_skill_state')|from('review_events') in progressService.ts and
       in useProgressData.ts (verified by grep).
   PR-5 (Cleanup that doesn't depend on q3):
     - Delete learnerStateService.getDueSkills (no callers verified).
     - The CI gate (PR-4 follow-up) is gated on q3 and tracked separately.
5. Update CLAUDE.md to mark learnerProgressService as the canonical contract.
6. Update docs/current-system/page-framework-status.md with the new state.
```

## 6. Idempotency

- All `CREATE OR REPLACE FUNCTION` and `CREATE INDEX IF NOT EXISTS` — re-runs safe.
- `CREATE EXTENSION IF NOT EXISTS unaccent` — re-runs safe.
- Service is read-only.
- Legacy `learner_skill_state` writes still happen via `lib/reviewHandler.ts` until the legacy session path is decommissioned (separate effort — §12 q3).

## 7. Verification

```bash
# 1. Migration applied
make migrate

# 2. Tests green
bun run test

# 3. Build clean
bun run build

# 4. SQL function smoke (run after seeding test fixture data)
psql ... <<'SQL'
SELECT * FROM indonesian.compute_todays_plan_raw('<test-user-id>'::uuid, now());
SELECT indonesian.get_lapsing_count('<test-user-id>'::uuid);
SELECT indonesian.get_overdue_count('<test-user-id>'::uuid, 'Europe/Amsterdam');
SELECT indonesian.get_current_streak_days('<test-user-id>'::uuid, 'Europe/Amsterdam');
SELECT indonesian.get_study_days_count('<test-user-id>'::uuid,
  date_trunc('week', now())::timestamptz,
  (date_trunc('week', now()) + interval '7 days')::timestamptz,
  'Europe/Amsterdam');
SELECT indonesian.get_usable_vocabulary_gain('<test-user-id>'::uuid,
  date_trunc('week', now())::timestamptz,
  (date_trunc('week', now()) + interval '7 days')::timestamptz);
SQL

# 5. Browser smoke (Playwright via MCP)
- Seed at least 3 due capabilities (manually update next_due_at to past)
  AND 2 capabilities with lapse_count >= 3 + stability < 2.0
  AND 2 unrelated reviewed capabilities with capability_review_events on consecutive days
  before running this check (avoids 0 == 0 trivial pass).
- Navigate / (Dashboard) → expect "3 reviews ready" widget AND streak showing the seeded streak.
- Navigate /session → expect ≤ 3 cards (capability planner output ≤ ceiling)
- Navigate /voortgang → metrics render without errors, sample sizes > 0
- Navigate /lessons → "ready to practice" counts unchanged from pre-migration baseline
```

## 8. Rollback

Each PR is independently `git revert`-able. The migration is additive (only new functions, indexes, and one extension); the rollback file drops them in dependency-correct order (architect NIT-2 v3: indexes first, then functions that index expressions depend on):

```sql
-- 2026-05-01-learner-progress-functions.rollback.sql

-- Step 1: drop indexes first (some are functional indexes on stable_slug — must drop
-- before stable_slug itself).
DROP INDEX IF EXISTS indonesian.lsps_user_source_ref_idx;
DROP INDEX IF EXISTS indonesian.cre_user_created_idx;
DROP INDEX IF EXISTS indonesian.cre_user_capability_created_idx;
DROP INDEX IF EXISTS indonesian.learning_items_slug_idx;

-- Step 2: drop top-level metric functions.
DROP FUNCTION IF EXISTS indonesian.compute_todays_plan_raw(uuid, timestamptz);
DROP FUNCTION IF EXISTS indonesian.get_lapsing_count(uuid);
DROP FUNCTION IF EXISTS indonesian.get_lapse_prevention(uuid);
DROP FUNCTION IF EXISTS indonesian.get_memory_health(uuid);
DROP FUNCTION IF EXISTS indonesian.get_review_latency_stats(uuid);
DROP FUNCTION IF EXISTS indonesian.get_recall_accuracy_by_direction(uuid);
DROP FUNCTION IF EXISTS indonesian.get_recall_stats_for_week(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS indonesian.get_study_days_count(uuid, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS indonesian.get_usable_vocabulary_gain(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS indonesian.get_overdue_count(uuid, text);
DROP FUNCTION IF EXISTS indonesian.get_current_streak_days(uuid, text);
DROP FUNCTION IF EXISTS indonesian.get_vulnerable_capabilities(uuid, int);
DROP FUNCTION IF EXISTS indonesian.get_review_forecast(uuid, int, text);

-- Step 3: drop helpers (architect CRIT-A v3: signature was wrong in v3 — fixed here to
-- match the create signature exactly).
DROP FUNCTION IF EXISTS indonesian._capability_source_progress_met(uuid, jsonb, text, text);
DROP FUNCTION IF EXISTS indonesian.stable_slug(text);
DROP FUNCTION IF EXISTS indonesian.immutable_unaccent(text);

-- Step 4: optionally drop the extension. Skipped by default — other features may
-- start using unaccent and dropping the extension would be disruptive. If a
-- pristine rollback is needed:
--   DROP EXTENSION IF EXISTS unaccent;
```

## 9. Supabase Requirements

### Deployment path (architect SIG-2 v4)

The new SQL ships in **two places** so both deployment paths converge:

1. **Standalone migration file:** `scripts/migrations/2026-05-01-learner-progress-functions.sql` (mirrors the precedent set by `2026-04-25-capability-core.sql`). Apply manually via SSH for the initial deploy:
   ```bash
   ssh mrblond@master-docker "sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
     < scripts/migrations/2026-05-01-learner-progress-functions.sql
   ```
2. **Folded into `scripts/migration.sql`** at the end of PR-1, so `make migrate` is canonical for any future re-apply (the rest of the schema is already monolithic; this keeps consistency). The `CREATE EXTENSION` and all `CREATE OR REPLACE FUNCTION` / `CREATE INDEX IF NOT EXISTS` statements are idempotent.

The matching `scripts/migrations/2026-05-01-learner-progress-functions.rollback.sql` ships alongside the forward file. Rollback is applied via the same SSH path. Re-running the rollback after rollback is also idempotent thanks to `DROP ... IF EXISTS`.

### Schema changes
- **No new tables.** Only functions, indexes, and one extension.
- **Extension:** `unaccent` (PG core extension; available on `supabase/postgres:15.8.1.085` per `homelab-configs/services/supabase/postgres/Dockerfile:1`). Migration runs `make migrate` via SSH → `docker exec` as the `postgres` superuser, so the `CREATE EXTENSION` is permitted. No CI environment changes required for the homelab.
- **Functions:** `immutable_unaccent`, `stable_slug`, `_capability_source_progress_met`, `compute_todays_plan_raw`, `get_lapsing_count`, `get_lapse_prevention`, `get_memory_health`, `get_review_latency_stats`, `get_recall_accuracy_by_direction`, `get_recall_stats_for_week`, `get_study_days_count`, `get_usable_vocabulary_gain`, `get_overdue_count`, `get_current_streak_days`, `get_vulnerable_capabilities`, `get_review_forecast`. All `SECURITY INVOKER`.
- **Indexes:** `lsps_user_source_ref_idx`, `cre_user_created_idx`, `cre_user_capability_created_idx`, `learning_items_slug_idx`.
- **Grants:** `GRANT EXECUTE ON FUNCTION ... TO authenticated` for every public function (helpers `_capability_source_progress_met`, `stable_slug`, `immutable_unaccent` also need GRANT since they're called from inside the metric functions).

### homelab-configs changes
- [ ] PostgREST: N/A — calling stored functions via supabase-js `.rpc()` works against existing `indonesian` schema exposure.
- [ ] Kong: N/A — no new routes.
- [ ] GoTrue: N/A.
- [ ] Storage: N/A.

### Health check additions
- [ ] Add the 13 new functions to `scripts/check-supabase-deep.ts` as expected functions.
- [ ] Add a TS↔PG slug-equivalence assertion (architect SIG-C v3): for a small set of representative learning_items, fetch `base_text` and assert `stableSlug(base_text)` (TS) === `indonesian.stable_slug(base_text)` (PG). Catches drift between the JS NFKD path and PG `unaccent` semantics on unusual character classes (ligatures, Æ, etc.). Implementation: scan the latest 50 learning_items, run both side, log any mismatches.
- [ ] Function-shape smoke (calls each function with the seeded fixture user; asserts result tuple shape).

### RLS — explicitly verified
All new functions are `SECURITY INVOKER`. Each table they read has authenticated SELECT permissions per the migration files:

All RLS enabled in the same block at `2026-04-25-capability-core.sql:129-135`.

| Table | Authenticated SELECT policy at |
|---|---|
| `learning_capabilities` | `2026-04-25-capability-core.sql:137-141` (read-all to authenticated) |
| `learner_capability_state` | `2026-04-25-capability-core.sql:155-159` (per-user via `auth.uid()`) |
| `capability_review_events` | `2026-04-25-capability-core.sql:161-165` (per-user) |
| `learner_source_progress_state` | `2026-04-25-capability-core.sql:173-177` (per-user) |
| `learning_items` | `scripts/migration.sql:423` (read-all to authenticated) |
| `item_meanings` | `scripts/migration.sql:428` (read-all to authenticated) |

Architect SIG-E v3 fix: cited explicitly. The `get_lapsing_count`, `get_vulnerable_capabilities`, and `get_usable_vocabulary_gain` joins to `learning_items` and `item_meanings` will return rows under SECURITY INVOKER because both tables have permissive read policies for authenticated users. If those policies ever tighten, `check-supabase-deep.ts` should fail loudly — added as an assertion.

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `_capability_source_progress_met` is slow at scale (large user × many capabilities) | New index `lsps_user_source_ref_idx` covers the EXISTS clause's join (§4.5). Functional index on `learning_items.stable_slug(base_text)` covers the slug-match join. Function declared STABLE so PG can cache call results within a query. Defer perf testing until production scale is real. |
| Capability source_ref scheme drifts in future (e.g., introduction of UUID-based refs) | Production today is uniformly slug-based (verified in §3.2). If the `capabilityCatalog.ts:51-52` runtime path is ever published to DB, a follow-up needs to update slug-match joins to handle both schemes. Out of scope for this spec. |
| `getLapsingCount` semantics change from items to capabilities | Spec explicitly counts distinct items (§4.4 `get_lapsing_count`). Matches legacy. UI label stays "items at risk." |
| Goal-policy adjustments split between SQL and TS (architect S1) | Spec resolution: SQL returns raw counts only. ALL goal-policy math stays in `goalService.ts`. The 20% weak cap (`Math.ceil(dueTarget * 0.2)` at `goalService.ts:615`) and the `dueTarget = preferredSize` ceiling (`goalService.ts:559-563`) stay in TS. SQL `weak_raw` is uncapped — TS applies the cap when shaping `weakItemsToday`. |
| Recognition aggregate is `text_recognition` only by design (architect S3) | Legacy `progressService.getAccuracyBySkillType` filtered by `skill_type = 'recognition'`, which mapped to today's `text_recognition` capability. Other recognition-flavored types (`audio_recognition`, `pattern_recognition`, `root_derived_recognition`, `l1_to_id_choice`) are EXCLUDED from this aggregate by design. |
| `(answer_report_json->>'latencyMs')::int` throws on dirty data | Added regex pre-filter `~ '^\d+$'` in WHERE clauses. AVG over zero rows returns NULL; service code COALESCEs to `null` for the typed result. |
| `(answer_report_json->>'wasCorrect')::boolean` throws on non-bool | Filtered to `IN ('true', 'false')` in `get_recall_accuracy_by_direction` and `get_recall_stats_for_week` (§4.4). |
| Browser smoke check passes for wrong reason on fresh user | Verification step explicitly seeds 3 due + 2 lapsing + 2 reviewed capabilities first. See §7 step 5. |
| `requiredSourceProgress.kind` in production data has values not seen in TS types | Six event types are enumerated in `2026-04-25-capability-core.sql:108`. The CASE statement covers all of them. Unknown `kind` returns false (conservative). |
| The legacy `lib/reviewHandler.ts` still writes to `learner_skill_state` while users use the new path | These writes do not affect production reads (which use the service). Acceptable until §12 q3 resolves. |
| **(architect SIG-A v3)** `requiredSourceProgress.kind === 'source_progress'` with a sourceRef that doesn't match the capability's `source_ref` is currently rejected by `capabilitySessionDataService.ts:175-177` but accepted by the SQL helper as long as ANY `learner_source_progress_state` row matches. | Currently a no-op: the catalog generator always uses the parent ref so `metadata.requiredSourceProgress.sourceRef` matches `c.source_ref` for every published capability. If this invariant ever breaks, the SQL helper would over-count "new" eligibility. Deliberately not replicated for predicate-inlining performance; if the invariant breaks, add `AND p_metadata->'requiredSourceProgress'->>'sourceRef' = (SELECT source_ref FROM learning_capabilities WHERE id = ?)` — but only do that if production data actually has divergent refs. |
| **(architect SIG-C v3)** TS `stableSlug` (NFKD + combining-mark-strip + regex) and PG `stable_slug` (`unaccent` + regex) may diverge on unusual character classes (ligatures, `Æ` → `AE` in unaccent vs left alone in JS, etc.). The slug-match join in `get_lapsing_count` / `get_vulnerable_capabilities` / `get_usable_vocabulary_gain` would silently miss items if `base_text` contains such characters. | (a) For the Indonesian word stock today, only ASCII + diacritics like `é → e` are present — unaccent and NFKD agree exactly. (b) `check-supabase-deep.ts` adds a TS↔PG slug-equivalence assertion across all `learning_items` rows. Any future drift fails loudly before it bites a user. |
| **(v4 NEW)** `getUsableVocabularyGain` uses "first-ever form_recall review during week" as the proxy for the legacy "moved to retrieving stage" event. | For users on the capability session path (the only path active going forward), this is a faithful mirror — every form_recall completion goes through `capability_review_events` and the first one is the introduction event. For users still on the legacy path (writing to `learner_stage_events`), this aggregate divergees but those users also won't have `capability_review_events` rows from the legacy path, so the aggregate would be zero — same effective semantics. Documented explicitly so the divergence is visible. If a richer "stage transitioned" aggregate is needed in future, add a `capability_stage_events` table and a new method. |
| **(v4 NEW)** `getCurrentStreakDays` uses a plpgsql LOOP that walks day by day. | Capped at 365 iterations defensively. With `cre_user_created_idx`, each iteration is an EXISTS on a covering index — sub-millisecond. Total cost for a 30-day streak is ~30 × <1ms = ~30ms. For pathological multi-year streaks, the 365 cap kicks in. |
| **(architect SIG-1 v4)** Streak day-bucketing semantics shift from UTC-day (legacy `Dashboard.tsx:402-414`, `toISOString().split('T')[0]`) to user-TZ day (new `(created_at AT TIME ZONE p_timezone)::date`). For users near UTC midnight (e.g. Europe/Amsterdam at 00:00–02:00 local in winter), a single review can fall on different "today" buckets between the two paths. On rollout, a user may see streak +1 or −1 versus the pre-PR display. | This is the architecturally correct fix (the user thinks of "today" as their local day, not UTC's), but it is a behavior change. Mitigations: (a) §11.4 UI copy adds a one-time tooltip "Streak now uses your local timezone." (b) §11.5 fixture seeds review events at known UTC instants (one near UTC midnight crossing) so both the legacy UTC-bucketed streak and the new userTZ-bucketed streak are explicitly asserted. The divergence is a tested expectation, not a silent change. (c) Browser-smoke step 5 in §7 explicitly checks the userTZ-bucketed value, with the seed pinned to Europe/Amsterdam. |
| **(v4 NEW)** Dropping `skillStates` from `ProgressData` is a breaking change for the hook contract | Verified: the only consumer of `ProgressData.skillStates` outside the hook is the Voortgang page itself, which exposes it for the forecast computation. PR-3 tests the new shape end-to-end. Other pages don't import the hook. |

## 11. Tests

### 11.1 New tests for learnerProgressService
Pure unit tests mocking `supabase.schema().rpc()`:
- Each method calls the right RPC name with the right argument shape (snake_case).
- Each method maps RPC response → typed result correctly.
- Empty data scenarios (zero-row user) return zero-counts cleanly.
- RPC errors propagate with method context (`"learnerProgressService.getTodaysPlanRawCounts failed: ..."`).
- Sample-size fields are integers, not floats.
- Timezone-bearing methods (`getStudyDaysCount`, `getOverdueCount`, `getCurrentStreakDays`, `getReviewForecast`) accept and forward the timezone correctly.

### 11.2 Updated tests for consumers
For each migrated service method, refactor existing tests to mock `learnerProgressService` directly. Removes per-table fixture rows. Example:

```ts
vi.mock('@/services/learnerProgressService', () => ({
  learnerProgressService: {
    getTodaysPlanRawCounts: vi.fn().mockResolvedValue({
      dueRaw: 5, newRaw: 3, weakRaw: 1, recallSupplyRaw: 2, meanLatencyMs: 18000,
    }),
    getLapsingCount: vi.fn().mockResolvedValue({ count: 4 }),
    getOverdueCount: vi.fn().mockResolvedValue(2),
    // ...
  },
}))
```

### 11.3 SQL function tests
Two layers:

**Shape smoke (always run):** mock `supabase.schema().rpc()` to return a fixture row; assert the service correctly extracts each field. This runs on every CI invocation without `SUPABASE_SERVICE_KEY`.

**Live SQL parity (gated):** for each metric function, `it.skipIf(!process.env.SUPABASE_SERVICE_KEY)` calls the function against the seeded fixture user (§11.5). Asserts: result tuple matches expected counts derived from the seed.

**(architect SIG-F v3) Live tests run inside a transaction with rollback.** The test setup opens a service-key transaction, applies fixture mutations, runs assertions, then ROLLBACK. This means live tests are non-destructive against the dev/staging DB and can run repeatedly without polluting the testuser's state.

```ts
// sketch
beforeEach(async () => {
  await sqlClient.query('BEGIN')
  await seedFixture(sqlClient)
})
afterEach(async () => {
  await sqlClient.query('ROLLBACK')
})
```

If running directly via supabase-js (which doesn't expose explicit transactions), wrap each test in a server-side function that BEGIN-...-ROLLBACKs internally. Implementation note documented in `scripts/seed-progress-test-fixtures.ts`.

### 11.4 UI copy changes
Per §1.1, dashboard widget copy should clarify ceiling vs output:
- "X reviews due" → "X reviews ready" (ceiling-style)
- Tooltip: "Today's session may be smaller depending on your settings and recent practice."
- Same treatment for `newIntroductionsToday`.
- Tested via dashboard-redesign.test.tsx string assertions.

**Streak migration tooltip (architect SIG-1 v4):** the streak widget on the dashboard
gets a one-time, dismissible info pill on rollout: "Streak now uses your local
timezone." Stored in localStorage so each user sees it once. Mitigates the
±1-day rollout drift documented in §10 risks. Tested by asserting the pill
renders on first mount and disappears after click.

### 11.5 Test fixture (architect SIG-6 v3 + SIG-B v3 + SIG-1..5/NIT-1..2 v5)

Pinned to `testuser@duin.home` (existing test user, see `~/.claude/.../reference_test_user.md`).

**The fixture script does not exist yet — it must be created in PR-1** (architect SIG-B v3). Path: `scripts/seed-progress-test-fixtures.ts`. Idempotent re-runs leave the DB in the same state. Wraps mutations in a transaction and exposes a runner that takes a sqlClient + transaction marker so live SQL parity tests can use the same fixture under their own BEGIN/ROLLBACK envelope.

(architect v4 review identified that v4's prose-style §11.5 had multiple internal inconsistencies that left the implementer guessing. v5 rewrites it as explicit numbered tables so every expected return value is mechanically derivable from the seed.)

#### 11.5.1 Constants

```text
seedNow            = 2026-05-01T10:00:00Z
weekStartUtc       = seedNow - 7 days  = 2026-04-24T10:00:00Z
weekEndUtc         = seedNow            = 2026-05-01T10:00:00Z
priorWeekStartUtc  = seedNow - 14 days = 2026-04-17T10:00:00Z
testuserId         = (resolved at seed time from auth.users where email='testuser@duin.home')
itemA, itemB, itemC = three pre-existing learning_items rows (created if absent; identified by stable_slug('item-a'), 'item-b', 'item-c')
```

**Timezone offset for Europe/Amsterdam in May 2026:** CEST = UTC+2. All Amsterdam-local-date computations below use this offset (architect NIT-1 v5).

#### 11.5.2 Learning capabilities (5 rows, all with `readiness_status='ready' AND publication_status='published'`, architect SIG-5 v5)

| Capability id | source_kind | source_ref | capability_type | metadata_json (`requiredSourceProgress`) |
|---|---|---|---|---|
| cap-1 | item | `learning_items/item-a` | text_recognition | `{ kind: 'none', reason: 'not_lesson_sequenced' }` |
| cap-2 | item | `learning_items/item-b` | text_recognition | `{ kind: 'none', reason: 'not_lesson_sequenced' }` |
| cap-3 | item | `learning_items/item-c` | text_recognition | `{ kind: 'none', reason: 'not_lesson_sequenced' }` |
| cap-4 | item | `learning_items/item-a` | form_recall | `{ kind: 'none', reason: 'not_lesson_sequenced' }` |
| cap-5 | item | `learning_items/item-b` | form_recall | `{ kind: 'none', reason: 'not_lesson_sequenced' }` |

(`kind:'none'` with these source_kinds + capability_types is rejected by `_capability_source_progress_met` per Case 2 — so they don't contribute to `new_raw`. The seed deliberately avoids any "new" eligibility; `new_raw` is therefore production-data-dependent and asserted as `>= 0` rather than as a fixed number.)

#### 11.5.3 Learner capability state (5 rows)

| capability_id | activation_state | next_due_at | stability | lapse_count | consecutive_failure_count | last_reviewed_at | review_count |
|---|---|---|---|---|---|---|---|
| cap-1 | active | seedNow - 1h (`2026-05-01T09:00:00Z`) | 10.0 | 0 | 0 | seedNow - 5d | 4 |
| cap-2 | active | seedNow - 1h | 10.0 | 0 | 0 | seedNow - 5d | 0 |
| cap-3 | active | seedNow - 1h | 10.0 | 0 | 0 | seedNow - 5d | 0 |
| cap-4 | active | seedNow - 1h | 1.5 | 4 | 2 | seedNow - 5d | 1 |
| cap-5 | active | seedNow - 1h | 1.5 | 4 | 1 | seedNow - 30d | 1 |

(cap-4 has consecutive_failure_count=2 vs cap-5's 1 to make `get_vulnerable_capabilities` ORDER BY deterministic.)

#### 11.5.4 Capability review events (6 rows, explicit) — architect SIG-1..4 v5

| # | created_at (UTC) | UTC date | Europe/Amsterdam date (CEST = UTC+2) | capability_id | answer_report_json | In 7d week? | In 7d–14d prior week? |
|---|---|---|---|---|---|---|---|
| e1 | 2026-05-01T08:00:00Z | 2026-05-01 | 2026-05-01 | cap-1 | `{wasCorrect: true,  latencyMs: 18000}` | yes | no |
| e2 | 2026-04-30T08:00:00Z | 2026-04-30 | 2026-04-30 | cap-1 | `{wasCorrect: true,  latencyMs: 18000}` | yes | no |
| e3 | 2026-04-29T08:00:00Z | 2026-04-29 | 2026-04-29 | cap-1 | `{wasCorrect: true,  latencyMs: 18000}` | yes | no |
| e4 | 2026-04-28T22:30:00Z | 2026-04-28 | 2026-04-29 | cap-1 | `{wasCorrect: false, latencyMs: 18000}` | yes (e4 ≥ weekStartUtc) | no |
| e5 | 2026-04-26T10:00:00Z | 2026-04-26 | 2026-04-26 | cap-4 | `{wasCorrect: false, latencyMs: null}`  | yes | no |
| e6 | 2026-04-01T10:00:00Z | 2026-04-01 | 2026-04-01 | cap-5 | `{wasCorrect: false, latencyMs: null}`  | no | no (outside both windows) |

**Why these specific events:**
- e1, e2, e3 establish the streak baseline on three consecutive days in BOTH UTC and Amsterdam buckets.
- e4 is the **UTC-midnight-crossing** event that exercises the SIG-1 v4 streak divergence:
  - In UTC, e4 falls on date `2026-04-28`, filling the streak-day gap; `streak(UTC) = 4`.
  - In Amsterdam, e4 falls on date `2026-04-29` (same as e3), so `2026-04-28` Amsterdam has no events; `streak(Amsterdam) = 3`.
- e4 also has `wasCorrect=false` so recognition all-time = 3 correct of 4 total (architect SIG-1 v5).
- e5 is the in-week first form_recall for item A; e6 is a prior-week first form_recall for item B (excludes item B from `get_usable_vocabulary_gain` — negative case).
- e5 and e6 have `latencyMs: null` so they're filtered out of latency averages by the regex pre-check (`~ '^\d+$'` fails for null).

#### 11.5.5 Source progress state (3 rows)

| user_id | source_ref | source_section_ref | current_state | completed_event_types |
|---|---|---|---|---|
| testuser | `lessons/lesson-4` | `__lesson__` | `lesson_completed` | `['lesson_completed']` |
| testuser | `lessons/lesson-5` | `sections/intro` | `intro_completed` | `['intro_completed']` |
| testuser | `lessons/lesson-6` | `__lesson__` | `not_started` | `[]` |

Used to exercise the source-progress predicate's transitive closure (lesson-4 satisfies any required state from `section_exposed` upward), section-ref fallback (lesson-5 / sections/intro), and the negative case (lesson-6).

#### 11.5.6 Expected return values — derived mechanically from the seed above

(architect SIG-3 v4 + SIG-1..4 v5: every function has a documented, derivable expected return; values are exported as constants from `scripts/seed-progress-test-fixtures.ts` and consumed verbatim by the live SQL parity tests.)

| Function | Args | Expected return | Derivation |
|---|---|---|---|
| `compute_todays_plan_raw` | `(testuser, seedNow)` | `due_raw=5, new_raw≥0, weak_raw=2, recall_supply_raw=2, mean_latency_ms=18000` | due: all 5 capabilities active+ready+published with `next_due_at <= seedNow`. weak: cap-4, cap-5 (lapse_count≥3 AND due). recall_supply: cap-4, cap-5 (form_recall AND due). mean_latency: AVG over events with latencyMs in 14d window = AVG(e1,e2,e3,e4) = 18000. new: dormant-ready-published count is production-dependent; asserted as `>= 0`. |
| `get_lapsing_count` | `(testuser)` | `2` | cap-4 (item-a) and cap-5 (item-b) both have lapse_count=4≥3 AND stability=1.5<2.0; 2 distinct items. |
| `get_lapse_prevention` | `(testuser)` | `at_risk=2, rescued=0` | cap-4 (cf=2>0) + cap-5 (cf=1>0) → at_risk. Neither has cf=0 AND last_reviewed_at recent enough so rescued=0. |
| `get_memory_health` | `(testuser)` | `avg_recognition_stability=10.00, recognition_sample_size=3, avg_recall_stability=1.50, recall_sample_size=2, avg_overall_stability=6.60, overall_sample_size=5` | recognition: cap-1, cap-2, cap-3 all stability=10. recall: cap-4, cap-5 both stability=1.5. overall: AVG(10,10,10,1.5,1.5)=6.6. After service-side rounding to 2 decimals (NIT-3 v4). |
| `get_review_latency_stats` | `(testuser)` | `current_week_ms=18000, prior_week_ms=null` | current week: AVG(latencyMs) over e1..e4 (all latencyMs=18000) = 18000. prior week (7d–14d): no events match. |
| `get_recall_accuracy_by_direction` | `(testuser)` | `recognition_correct=3, recognition_total=4, recall_correct=0, recall_total=2` | recognition: e1,e2,e3,e4 are all cap-1 (text_recognition); 3 correct (e1,e2,e3) + 1 incorrect (e4) = 3/4. recall: e5,e6 both form_recall, both wasCorrect=false = 0/2. |
| `get_recall_stats_for_week` | `(testuser, weekStartUtc, weekEndUtc)` | `recognition_correct=3, recognition_total=4, recall_correct=0, recall_total=1` | Same as above but windowed: e1..e4 in week (recognition: 3/4), e5 in week (recall: 0/1), e6 outside week. |
| `get_study_days_count` | `(testuser, weekStartUtc, weekEndUtc, 'Europe/Amsterdam')` | `4` | Distinct Amsterdam dates of in-week events: {2026-05-01 (e1), 2026-04-30 (e2), 2026-04-29 (e3, e4), 2026-04-26 (e5)} = 4 distinct dates. |
| `get_usable_vocabulary_gain` | `(testuser, weekStartUtc, weekEndUtc)` | `1` | Item-A: first-ever form_recall is e5 (in week), no earlier form_recall for item-a → counted. Item-B: first-ever form_recall is e6 (out of week), e6 is BEFORE weekStartUtc so item-b NOT counted (NOT EXISTS earlier prevents counting; in-week first must be the global first too). Result: 1. |
| `get_overdue_count` | `(testuser, 'Europe/Amsterdam')` | `0` | start-of-today Amsterdam = 2026-05-01T00:00:00+02:00 = 2026-04-30T22:00:00Z. All 5 capabilities have next_due_at = 2026-05-01T09:00:00Z, which is AFTER 2026-04-30T22:00:00Z, so none are < start-of-today. count=0. |
| `get_current_streak_days` | `(testuser, 'Europe/Amsterdam')` | `3` | Walking back from 2026-05-01 Amsterdam: 05-01 (e1) ✓, 04-30 (e2) ✓, 04-29 (e3,e4) ✓, 04-28 ✗. streak=3. |
| `get_current_streak_days` | `(testuser, 'UTC')` | `4` | Walking back from 2026-05-01 UTC: 05-01 (e1) ✓, 04-30 (e2) ✓, 04-29 (e3) ✓, 04-28 (e4) ✓, 04-27 ✗. streak=4. (Demonstrates SIG-1 v4 divergence; both values are tested expectations.) |
| `get_vulnerable_capabilities` | `(testuser, 10)` | 2 rows: row 1 = cap-4 (item-a), row 2 = cap-5 (item-b) | Both have lapse_count=4 (tied); ORDER BY lapse_count DESC, consecutive_failure_count DESC: cap-4.cf=2 > cap-5.cf=1 → cap-4 first. Each row carries item base_text and best NL meaning. |
| `get_review_forecast` | `(testuser, 14, 'Europe/Amsterdam')` | `[{forecast_date='2026-05-01', count=5}]` | All 5 capabilities have `next_due_at = 2026-05-01T09:00:00Z = 2026-05-01T11:00 Amsterdam`. SQL filter `next_due_at <= now() + 14d` admits past-due. All 5 fall in the same Amsterdam-local-date bucket. |

## 12. Open Questions

### q1. Mastery funnel — SQL or pass-through?
**Resolved (v3 SIG-4):** No pass-through. `getMasteryOverview` is already capability-native (`masteryModel.ts:524` reads `learner_capability_state` directly). Consumers import from `@/lib/mastery/masteryModel` directly. The service interface does not include a mastery method.

### q2. Batch method for the Voortgang page?
**Resolution:** Defer. Per-method round-trip is <50ms each based on the predicate sizes; Voortgang's 5 simultaneous calls finish in parallel under 250ms total. If perf testing later shows it matters, add a batch endpoint then.

### q3. Legacy session path: keep or delete?
**Deferred.** This spec scopes PR-1/2/3/5 (the surfacing-layer migration). The CI gate (formerly PR-4) is moved to a follow-up spec contingent on the q3 decision.

The legacy session path (`Session.tsx:181-187` + `lib/reviewHandler.ts:59-139` + `learnerStateService.applyReviewToSkillState/upsertItemState/logStageEvent/getSkillStates/getSkillStatesBatch` + `reviewEventService.logReviewEvent` + `sessionSummaryService.getSessionLocalFacts` reads + `lib/session.ts:37` operational read) reads and writes legacy tables. The decision is whether:
  - (a) Legacy path is intentional defense-in-depth → KEEP, allowlist its files in the future CI gate.
  - (b) Legacy path is dead-code-in-waiting (now that `experiencePlayerV1` is the canonical flow) → DELETE in a follow-up spec, no CI gate exemption needed.

**Effect on this spec:** none. v4 ships PR-1/2/3/5 regardless.

### q4. Acceptable dashboard-vs-session disagreement?
**Resolution:** Dashboard surfaces eligibility ceilings; session output is `≤` ceiling. Documented in §1.1. UI copy reflects this in §11.4.

### q5. CI gate scope
**Deferred to follow-up spec** (per q3 deferral above).

### q6. `processGoalEvaluation` referenced in v1 §3.1
**Resolution:** v1 had the wrong method name. Actual functions are `goalService.refreshGoalProgress` (line 320) and `goalService.finalizeWeek` (line 504).

### q7. Should `compute_todays_plan_raw` accept `weeklyGoals` so it can do all the policy server-side?
**Resolution:** No. SQL function returns raw counts; goalService applies all goal-policy adjustments. Architect concern S1.

### q8. `getUsableVocabularyGain` — exact stage-event parity vs first-form_recall proxy?
**Resolved:** First-form_recall proxy. Legacy stage events conflate three distinct mastery thresholds (retrieving / productive / maintenance) into one count, which is itself an approximation. The capability system has stability + review_count as cleaner signals; if a richer stage-event metric is needed later, define `capability_stage_events` and a dedicated method. Documented in §10 risks.

## 13. Performance

Expected per-method round-trip costs against current test data (testuser, 9 lessons, 2,357 ready capabilities):

- `compute_todays_plan_raw`: 1 RPC; 4 internal queries. With v3's set-based "new" branch (LANGUAGE sql STABLE helper inlined into the outer query plan) and the indexes in §4.5, expect <150ms for ~2,500 ready capabilities.
- `get_lapsing_count`, `get_lapse_prevention`, `get_overdue_count`: 1 RPC each; single COUNT/SUM; <30ms with new indexes.
- `get_memory_health`: 1 RPC; AVG with FILTER; <40ms.
- `get_review_latency_stats`: 1 RPC; 2 sub-queries; <50ms with `cre_user_created_idx`.
- `get_recall_accuracy_by_direction`, `get_recall_stats_for_week`: 1 RPC; aggregate with FILTER; <50ms.
- `get_study_days_count`: 1 RPC; DISTINCT date over time-bound rows; <30ms.
- `get_usable_vocabulary_gain`: 1 RPC; EXISTS + NOT EXISTS over `cre_user_capability_created_idx` + `learning_items_slug_idx`; <80ms.
- `get_current_streak_days`: 1 RPC; LOOP with EXISTS per day; ~30ms for 30-day streak (cap 365 days).
- `get_vulnerable_capabilities(limit=10)`: 1 RPC; ORDER BY + LIMIT; <60ms with `learning_items_slug_idx`.
- `get_review_forecast(days=14)`: 1 RPC; GROUP BY date; <50ms.

Voortgang page's 5 parallel calls finish in <250ms total. Dashboard's 3 sequential calls (plan + lapsing + streak) finish in <250ms total.

## 14. Why this architecture beats the alternative

(Same as v1 §14 — unchanged.)

## 15. Definition of Done

This spec scopes PR-1, PR-2, PR-3, PR-5 (per §5). The CI gate is deferred to a follow-up spec contingent on §12 q3.

- [ ] Migration `scripts/migrations/2026-05-01-learner-progress-functions.sql` and rollback `scripts/migrations/2026-05-01-learner-progress-functions.rollback.sql` exist in repo (architect SIG-2 v4).
- [ ] Forward migration deployed to homelab Supabase via SSH+`docker exec` (per §9 deployment path).
- [ ] Same SQL appended to `scripts/migration.sql` so `make migrate` is canonical for future re-applies.
- [ ] `unaccent` extension installed in the homelab Postgres image (verified via `\dx unaccent` after migration).
- [ ] `learnerProgressService.ts` exists with the **13-method interface** in §4.2. (NIT-1 v3 fix carried forward.)
- [ ] `scripts/seed-progress-test-fixtures.ts` created (idempotent, transaction-safe). (architect SIG-B v3)
- [ ] All consumers in §3.2 in-scope rows for PR-1/2/3/5 no longer touch `learner_skill_state`/`review_events`/`learner_stage_events`. (PR-4 + CI gate handle the remaining deferred-to-q3 rows in a follow-up.)
- [ ] All existing tests pass; PR description documents net change in test count after fixture rewrites.
- [ ] New `learnerProgressService.test.ts` exists; passes.
- [ ] SQL function shape smoke tests pass without `SUPABASE_SERVICE_KEY`.
- [ ] Live SQL parity tests pass with `SUPABASE_SERVICE_KEY` against `testuser@duin.home` with the §11.5 seeded fixture, with documented expected counts. Tests run inside transaction-with-rollback envelope. (architect SIG-F v3)
- [ ] Browser smoke per §7 step 5: Dashboard ceiling matches the seeded counts; session output ≤ ceiling; streak renders.
- [ ] Dashboard widget copy reflects ceiling semantics (§11.4).
- [ ] `scripts/check-supabase-deep.ts` updated to (a) verify all 13 RPCs respond, (b) assert TS↔PG slug equivalence across `learning_items`. (architect NIT-3 + SIG-C v3)
- [ ] CLAUDE.md mentions `learnerProgressService` as canonical.
- [ ] `docs/current-system/page-framework-status.md` updated.

## 16. Changelog

- **v1** (2026-05-01 morning): initial spec; failed architect review with 8 CRITICAL + 6 SIGNIFICANT issues.
- **v2** (2026-05-01 afternoon): addressed v1 issues; failed re-review with 3 CRITICAL + 6 SIGNIFICANT.
- **v3** (2026-05-01 evening): addressed v2 issues; failed re-review with 4 CRITICAL + 6 SIGNIFICANT + 3 NIT.
- **v6** (2026-05-02 early morning, current): addresses architect v5 review (0 CRITICAL + 5 SIGNIFICANT + 2 NIT, all in §11.5 fixture math). Pure §11.5 rewrite — no structural / API / SQL changes.
  - **(architect SIG-1 v5)** `get_recall_accuracy_by_direction` expected reconciled: e4 wasCorrect=false, giving recognition 3 correct of 4 total cleanly. Removed the contradictory "added recognition correct event."
  - **(architect SIG-2 v5)** Event count is now exactly 6 rows (was ambiguously "8" in v4). Each event has explicit capability_id, created_at, wasCorrect, latencyMs.
  - **(architect SIG-3 v5)** `get_study_days_count=4` now derived from {2026-05-01, 2026-04-30, 2026-04-29 (e3 ∪ e4), 2026-04-26 (e5)} — internally consistent with the streak reasoning.
  - **(architect SIG-4 v5)** Latency calculation now reproducible: e5 and e6 explicitly `latencyMs: null` so the regex pre-filter excludes them; only e1–e4 (all 18000) contribute.
  - **(architect SIG-5 v5)** `learning_capabilities` rows include `readiness_status='ready', publication_status='published'` explicitly per row.
  - **(architect NIT-1 v5)** Europe/Amsterdam offset for May 2026 (CEST = UTC+2) stated.
  - **(architect NIT-2 v5)** `get_review_forecast` derivation made explicit: all next_due_at fall in 2026-05-01 Amsterdam bucket.

- **v5** (2026-05-01 late evening): addresses architect v4 review (3 SIG + 4 NIT, no CRITICALs).
  - **(architect SIG-1 v4)** Streak day-bucketing semantic shift (UTC → user-TZ) documented in §10 risks; §11.5 fixture seeds a UTC-midnight-crossing review event so both legacy and new bucketed values are explicitly asserted; §11.4 adds a one-time UI rollout tooltip.
  - **(architect SIG-2 v4)** §9 explicit deployment-path subsection: forward migration shipped as `scripts/migrations/2026-05-01-learner-progress-functions.sql` (SSH+docker exec, mirroring 2026-04-25-capability-core.sql precedent) AND folded into `scripts/migration.sql` so `make migrate` is the canonical re-apply path. Matching rollback file. §15 DoD adds checkboxes for both.
  - **(architect SIG-3 v4)** §11.5 fixture extended to document expected returns for **all 13 functions** (was 7); seeded test data anchored to `seedNow` UTC; expectations are exported as constants from the seed script for use by live SQL parity tests.
  - **(architect NIT-1 v4)** §5 PR-2 documents the shape change in `getRecallStatsForWeek` (raw counts vs legacy ratios) and the caller-side adapter required.
  - **(architect NIT-2 v4)** §4.6 service skeleton extended with examples for scalar-returning methods (`getLapsingCount`, `getOverdueCount`).
  - **(architect NIT-3 v4)** `getMemoryHealth` mapper rounds raw numeric AVG to 2 decimals to preserve legacy `useProgressData.avg()` display semantics. Documented in §4.6 skeleton.
  - **(architect NIT-4 v4 — deferred)** EXPLAIN evidence for `cre_user_capability_created_idx` deferred to PR-1 implementation (live planner-trace requires fixture data; will be captured during the actual TDD cycle and posted to the PR description).

- **v4** (2026-05-01 evening): addresses v3 review **and** expands scope to cover all surfacing-layer interfaces between deep modules (per user request). Major changes:
  - **(scope expansion)** Added §3.3 deep-module interface inventory. Spec now covers all 14 in-scope legacy reads across goalService, progressService, learnerStateService, useProgressData, and Dashboard. Adds 5 new service methods + 5 new SQL functions: `getStudyDaysCount`, `getRecallStatsForWeek`, `getUsableVocabularyGain`, `getOverdueCount`, `getCurrentStreakDays`. Extends `getMemoryHealth` to also return `avgOverallStability` for `useProgressData` migration.
  - **(architect CRIT-A v3)** Rollback signature for `_capability_source_progress_met` corrected to match the create signature `(uuid, jsonb, text, text)`. §8.
  - **(architect CRIT-B v3)** `progressService.getCapabilityMasteryOverview` pass-through eliminated everywhere — v3 §5 PR-3 still referenced it; v4 deletes it and updates §5 PR-3 + §15 DoD count to 13 methods. Consumers import `getMasteryOverview` from `@/lib/mastery/masteryModel` directly.
  - **(architect CRIT-C v3)** Removed dead `WHEN 'opened'` arms from the source-progress predicate CASE statements. The TS `SourceProgressRequirement.requiredState` type only admits 6 values per `capabilityTypes.ts:66-72`; the 'opened' arm could never be hit.
  - **(architect CRIT-D v3)** Replaced direct `unaccent()` call inside the IMMUTABLE `stable_slug` wrapper with the documented `immutable_unaccent(text)` helper that calls the two-arg `unaccent('public.unaccent', text)` form. Functional index on `stable_slug(base_text)` now safe across PG versions.
  - **(architect SIG-A v3)** Risks table documents the `requiredSourceProgress.kind === 'source_progress'` ref-mismatch divergence: helper accepts any matching `lsps` row even if the rejection logic in `capabilitySessionDataService.ts:175-177` would reject for a sourceRef mismatch. Production data invariant makes this a no-op today.
  - **(architect SIG-B v3)** `scripts/seed-progress-test-fixtures.ts` explicitly marked as a new file to create in PR-1. Added to §15 DoD checklist.
  - **(architect SIG-C v3)** Added TS↔PG slug-equivalence assertion to `scripts/check-supabase-deep.ts`. Catches drift between JS NFKD path and PG unaccent on unusual character classes.
  - **(architect SIG-D v3)** §5 PR-2 enumerates each migrated read in `goalService.refreshGoalProgress` (`getOverdueCount`, `getStudyDaysCount`, `getRecallAndRecognitionStats`, `getUsableVocabGain`) and exits with grep-verified clean state.
  - **(architect SIG-E v3)** RLS section now cites `learning_items_read` and `item_meanings_read` policies at `scripts/migration.sql:423` and `:428` explicitly.
  - **(architect SIG-F v3)** Live SQL parity tests run inside transaction-with-rollback envelope. Non-destructive against shared dev/staging DB.
  - **(architect NIT-1 v3)** Method count consistent at 13 across §4.2, §5, §15.
  - **(architect NIT-2 v3)** Rollback drops indexes BEFORE functions (functional indexes on `stable_slug` would block `DROP FUNCTION stable_slug` otherwise).
  - **(architect NIT-3 v3)** Health-check addition documented in §15. Window difference (14d for compute_todays_plan_raw, 7d for get_review_latency_stats) justified inline.
