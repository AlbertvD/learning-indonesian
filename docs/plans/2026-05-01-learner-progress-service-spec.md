# Learner Progress Service — Canonical Contract Spec (v2)

**Date:** 2026-05-01
**Status:** Revised after first architect review (architect verdict on v1: NEEDS REVISION — 8 CRITICAL, 6 SIGNIFICANT). v2 addresses every flagged issue with code citations.
**Source:** Synthesized from the 2026-05-01 architecture-review conversation; v2 incorporates architect review feedback.

## 1. Goal

Introduce **`learnerProgressService`** as the single canonical contract through which every UI surface reads "what's the user's progress / what should they do today?" data. All such reads currently bypass the capability system and pull from the legacy `learner_skill_state` table, producing inconsistencies (e.g., dashboard reports "30 reviews due" while the session planner finds 0–2 schedulable capabilities).

After this lands, every surfacing-layer surface (Dashboard, Progress page, lapsing card, weekly-goal evaluation) reads from the same source as the session engine. The dashboard count and the actual session content can no longer disagree.

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

## 2. Non-Goals

- Decommissioning the `learner_skill_state` table from the schema. The table stays as historical record.
- Changing the FSRS scheduler (`src/lib/fsrs.ts`) or the dueness predicate (`getDueCapabilitiesFromRows` in `src/lib/capabilities/capabilityScheduler.ts:55-77`). The new SQL functions mirror their rules.
- Migrating the session engine (`capabilitySessionDataService.ts`). Already capability-aware.
- Changing `learner_skill_state` write paths (`learnerStateService.applyReviewToSkillState`, `upsertItemState`, `logStageEvent`). Those continue to receive writes from `lib/reviewHandler.ts` until the legacy session path is decommissioned (separate effort — see §12 q3).
- Migrating the **legacy session path** in `Session.tsx:181-187` and `lib/reviewHandler.ts:59-139`. Those still read `learner_skill_state` because they ARE the legacy session path. Whether to remove them is decided in §12 q3.
- Changing `lessonService.getLessonCapabilityPracticeSummary` (already capability-aware).
- Rewriting `getMasteryOverview` (`src/lib/mastery/masteryModel.ts:524`). Keep the staging logic in TS; the new service exposes it via a thin pass-through method.
- The pedagogy planner's load-budget caps (`pedagogyPlanner.ts:275-294`). These are session-output caps, not eligibility predicates — they don't belong in the dashboard's ceiling counts.

## 3. Current State (Audit)

### 3.1 Where the capability tables live

The architect identified that `learner_capability_state`, `learning_capabilities`, `learner_source_progress_state`, `capability_review_events` are NOT in `scripts/migration.sql`. Verified — they were added by the capability-rollout migration at:

**File:** `scripts/migrations/2026-04-25-capability-core.sql`

Table definitions, with key column types confirmed:

- `learner_capability_state` (`learner_capability_state` lines 56-77): `next_due_at timestamptz`, `stability double precision`, `lapse_count int`, `consecutive_failure_count int`, `activation_state text in ('dormant','active','suspended','retired')`. Indexes on `(user_id, next_due_at)` (line 78) and `(user_id, capability_id)` (line 80) — verified, suitable for the predicates we need.
- `learning_capabilities` (lines 5-23): `metadata_json jsonb` (the projection metadata including `requiredSourceProgress`), `readiness_status text`, `publication_status text`, `source_kind text`, `source_ref text`, `capability_type text`. Indexes: `learning_capabilities_source_idx` on `(source_kind, source_ref)` line 24-25, and `learning_capabilities_readiness_publication_idx` on `(readiness_status, publication_status)` line 26-27.
- `learner_source_progress_state` (lines 116-127): `source_ref text`, `source_section_ref text default '__lesson__'`, `current_state text`, `completed_event_types text[]` (TEXT ARRAY — confirmed). Unique constraint on `(user_id, source_ref, source_section_ref)`. **No index on `(user_id, source_ref)` — this needs adding** (see §10 risks).
- `capability_review_events` (lines 83-101): `answer_report_json jsonb`, `created_at timestamptz`. Has a unique constraint on `(session_id, session_item_id, attempt_number)` line 100, but no obvious analytics index on `(user_id, created_at desc)`. Adding one in this spec.

### 3.2 The legacy/new split

| Reads from `learner_skill_state` (legacy) | Used by | Migration status |
|---|---|---|
| `goalService.computeTodayPlan` (line 545) | Dashboard hero card | **In scope** — replaced by service |
| `goalService.refreshGoalProgress` (line 468) | Weekly-goal recalculation | **In scope** — replaced by service |
| `learnerStateService.getDueSkills` (line 51-61) | NO PRODUCTION CALLERS (verified by grep) | **Delete** |
| `learnerStateService.getSkillStates` (line 28-37) | `lib/reviewHandler.ts:93` (legacy review path) | **Out of scope** — see §12 q3 |
| `learnerStateService.getSkillStatesBatch` (line 39-49) | `useProgressData.ts:81`, `Session.tsx:181-187` | Mixed — see §12 q3 |
| `learnerStateService.getLapsingItems` (line 122-137) | Dashboard rescue card | **In scope** — replaced by service |
| `progressService.getLapsePrevention` (line 45-66) | Voortgang page | **In scope** — replaced by service |
| `progressService.getVulnerableItems` (line 68-105) | Voortgang page | **In scope** — replaced by service |
| `progressService.getAccuracyBySkillType` (line 19-43) | Voortgang page (uses `review_events` not `_skill_state`) | **In scope** — service reads `capability_review_events` instead |
| `progressService.getAvgLatencyMs` (line 107-133) | Voortgang page (uses `review_events`) | **In scope** — service reads `capability_review_events` |

**In production today:**
- Slug-based source_refs (verified via `SELECT DISTINCT substring(source_ref from 1 for 30) FROM indonesian.learning_capabilities WHERE source_kind = 'item' LIMIT 8` — all 8 results are `learning_items/<slug>` form, zero UUIDs). The dual-scheme concern from architect's C2 does not apply to current production data.

## 4. Proposed Architecture

### 4.1 Deep module pattern

Same as v1 — `learnerProgressService` is the deep module; UI surfaces never reach around it to raw tables. Diagram unchanged from v1, omitted for brevity.

### 4.2 Service interface (TypeScript)

```ts
// src/services/learnerProgressService.ts
import type { WeeklyGoal } from '@/types/learning'

export interface TodaysPlanRawCounts {
  dueRaw: number                    // ceiling: due capabilities, no goal-policy adjustment
  newRaw: number                    // ceiling: activatable capabilities, no load-budget adjustment
  weakRaw: number                   // due AND lapse_count >= 3, no 20% cap
  recallSupplyRaw: number           // due where capability_type = 'form_recall'
  meanLatencyMs: number             // average over last 200 reviews, 20000 fallback
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
  recognitionSampleSize: number     // number of capabilities contributing to the average
  avgRecallStability: number        // averaged stability of capability_type = 'form_recall'
  recallSampleSize: number
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

import type { MasteryOverview } from '@/lib/mastery/masteryModel'

export interface LearnerProgressService {
  /** Raw eligibility counts. UI services apply goal-policy adjustments on top. */
  getTodaysPlanRawCounts(input: { userId: string; now: Date }): Promise<TodaysPlanRawCounts>
  /** Distinct items with any lapsing+unstable capability. */
  getLapsingCount(input: { userId: string }): Promise<LapsingCountResult>
  /** Per-direction lapse risk and recovery. */
  getLapsePrevention(input: { userId: string }): Promise<LapsePreventionResult>
  /** Stability averages by direction. */
  getMemoryHealth(input: { userId: string }): Promise<MemoryHealthResult>
  /** Mean latency current week vs prior week. */
  getReviewLatencyStats(input: { userId: string }): Promise<ReviewLatencyStatsResult>
  /** Recall accuracy split by recognition vs form_recall. */
  getRecallAccuracyByDirection(input: { userId: string }): Promise<RecallAccuracyResult>
  /** Top N vulnerable items with item context. */
  getVulnerableCapabilities(input: { userId: string; limit?: number }): Promise<VulnerableCapability[]>
  /** Per-day count of upcoming due capabilities, in user's local timezone. */
  getReviewForecast(input: { userId: string; days?: number; timezone: string }): Promise<ReviewForecastDay[]>
  /** Pass-through to existing TS implementation; surfaced here so consumers don't bypass. */
  getMasteryOverview(input: { userId: string }): Promise<MasteryOverview>
}

export const learnerProgressService: LearnerProgressService = { /* impl in §4.5 */ }
```

**Key changes from v1:**
- (S1) `getTodaysPlanRawCounts` returns raw counts only. Zero policy adjustments. Goal-policy math stays in `goalService`.
- (S2) `recallSupplyRaw` is the supply (not the target). The target derivation stays in `goalService`.
- (C7) `getLapsePrevention` is now defined explicitly.
- (S3) `RecallAccuracyResult` separates recognition / recall counts cleanly — no skill-type vs capability-type implicit mapping.
- (N1, N7) `getReviewForecast` accepts a `timezone` parameter — bucketing must use the user's local date, not UTC.
- (C5) `LapsingCountResult` documents that distinct *items* are counted (matching legacy item-level semantics).
- (Pass-through) `getMasteryOverview` exposes the existing TS implementation so consumers go through the service.

### 4.3 Helper SQL functions (foundations)

These two helpers are required by the main metric functions.

```sql
-- Helper 1: stable_slug — port of the TypeScript stableSlug()
-- in scripts/lib/content-pipeline-output.ts:97-104. Pure, deterministic.
-- IMMUTABLE so it can be used in indexed expressions.
CREATE OR REPLACE FUNCTION indonesian.stable_slug(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    regexp_replace(
      lower(translate(p_text, 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝŸàáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿ',
                              'aaaaaaaaceeeeiiiindooooooouuuuyy aaaaaaaaceeeeiiiidnoooooouuuuyy')),
      '[^a-z0-9]+', '-', 'g'
    ),
    '^-+|-+$', '', 'g'
  );
$$;

-- Helper 2: source-progress predicate
-- Mirrors src/lib/pedagogy/sourceProgressGates.ts:32-93 EXCLUDING evidence-bypass
-- (evidence bypass is session-shape-specific; eligibility ceiling does not need it).
-- Returns true if the capability's required source progress is satisfied for the user.
-- Returns false (rejecting) when:
--   - kind = 'source_progress' but no progress row matches AND no transitive-state satisfies
--   - kind = 'none' AND requiresConcreteSourceProgress() would reject the capability
-- Returns true (trivially satisfied) when:
--   - requiredSourceProgress is missing entirely (legacy projection metadata)
--   - kind = 'none' AND the capability's source_kind+capability_type combo permits it
CREATE OR REPLACE FUNCTION indonesian._capability_source_progress_met(
  p_capability_id uuid,
  p_user_id uuid
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  v_metadata jsonb;
  v_kind text;
  v_required_state text;
  v_required_source_ref text;
  v_source_kind text;
  v_capability_type text;
  v_satisfying_states text[];
BEGIN
  SELECT metadata_json, source_kind, capability_type
    INTO v_metadata, v_source_kind, v_capability_type
  FROM indonesian.learning_capabilities
  WHERE id = p_capability_id;

  v_kind := v_metadata->'requiredSourceProgress'->>'kind';

  -- Case 1: no requiredSourceProgress at all → trivially satisfied
  IF v_metadata->'requiredSourceProgress' IS NULL THEN
    RETURN true;
  END IF;

  -- Case 2: kind = 'none' AND capability is item/pattern/dialogue + lesson-sequenced type
  -- → reject (mirrors requiresConcreteSourceProgress in capabilitySessionDataService.ts:159-176)
  IF v_kind = 'none' THEN
    IF v_source_kind IN ('item', 'pattern', 'dialogue_chunk', 'affixed_form_pair')
       AND v_capability_type IN (
         'text_recognition', 'meaning_recall', 'form_recall', 'l1_to_id_choice',
         'audio_recognition', 'dictation', 'pattern_recognition',
         'root_derived_recognition', 'root_derived_recall', 'contextual_cloze'
       )
    THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  -- Case 3: kind = 'source_progress' → check transitive closure
  IF v_kind = 'source_progress' THEN
    v_required_state := v_metadata->'requiredSourceProgress'->>'requiredState';
    v_required_source_ref := v_metadata->'requiredSourceProgress'->>'sourceRef';

    -- Build the satisfying-states list for the requiredState
    -- Mirrors statesSatisfyingRequirement in sourceProgressGates.ts:32-40
    v_satisfying_states := CASE v_required_state
      WHEN 'opened' THEN ARRAY['opened','section_exposed','intro_completed','heard_once','pattern_noticing_seen','guided_practice_completed','lesson_completed']
      WHEN 'section_exposed' THEN ARRAY['section_exposed','intro_completed','guided_practice_completed','lesson_completed']
      WHEN 'intro_completed' THEN ARRAY['intro_completed','guided_practice_completed','lesson_completed']
      WHEN 'heard_once' THEN ARRAY['heard_once','lesson_completed']
      WHEN 'pattern_noticing_seen' THEN ARRAY['pattern_noticing_seen','guided_practice_completed','lesson_completed']
      WHEN 'guided_practice_completed' THEN ARRAY['guided_practice_completed','lesson_completed']
      WHEN 'lesson_completed' THEN ARRAY['lesson_completed']
      ELSE ARRAY[]::text[]
    END;

    -- Match on either source_ref alone OR source_ref || '/' || source_section_ref
    -- (source_section_ref fallback per sourceProgressGates.ts:78-81)
    RETURN EXISTS (
      SELECT 1
      FROM indonesian.learner_source_progress_state lsps
      WHERE lsps.user_id = p_user_id
        AND (
          lsps.source_ref = v_required_source_ref
          OR (lsps.source_ref || '/' || lsps.source_section_ref) = v_required_source_ref
        )
        AND (
          lsps.current_state = ANY(v_satisfying_states)
          OR lsps.completed_event_types && v_satisfying_states  -- array overlap
        )
    );
  END IF;

  -- Unknown kind → reject conservatively
  RETURN false;
END;
$$;
```

**Architect-flagged details addressed:**
- C1: `stable_slug` defined here, ported from TS line-by-line.
- C3: transitive-closure table embedded; section_ref fallback; `requiresConcreteSourceProgress` rejection.
- C6: `kind = 'none'` rejects for item/pattern/dialogue + lesson-sequenced types.
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
  -- activation_state='active' AND readiness='ready' AND publication='published'
  -- AND next_due_at IS NOT NULL AND next_due_at <= now
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
  -- AND source progress satisfied per _capability_source_progress_met.
  -- Does NOT apply pedagogy load budgets or recent-failure fatigue —
  -- those are session-output caps, not eligibility (per §1.1 contract semantics).
  SELECT count(*) INTO v_new
  FROM indonesian.learning_capabilities c
  LEFT JOIN indonesian.learner_capability_state s
    ON s.capability_id = c.id AND s.user_id = p_user_id
  WHERE c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND (s.id IS NULL OR s.activation_state = 'dormant')
    AND indonesian._capability_source_progress_met(c.id, p_user_id);

  -- "Weak" raw count = due AND lapse_count >= 3 (no 20% cap in SQL — applied in TS)
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

  -- "Recall supply" = subset of due where capability_type = 'form_recall'
  -- (legacy used skill_type='form_recall'; capability equivalent is one capability_type)
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

  -- Mean latency from capability_review_events, last 14 days (S4: avoid LIMIT-fragile aggregation)
  -- Defensive cast: validate numeric pattern before ::int to avoid throws on dirty data
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
-- Architect C5: legacy counted distinct learning_item_id; we match.
CREATE OR REPLACE FUNCTION indonesian.get_lapsing_count(p_user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT COALESCE(count(DISTINCT li.id), 0)::int
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  -- Join to learning_items via slug match (verified in §3.2 that production
  -- source_refs are slug-based)
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
CREATE OR REPLACE FUNCTION indonesian.get_memory_health(p_user_id uuid)
RETURNS TABLE (
  avg_recognition_stability numeric,
  recognition_sample_size int,
  avg_recall_stability numeric,
  recall_sample_size int
) LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    COALESCE(AVG(s.stability) FILTER (WHERE c.capability_type = 'text_recognition'), 0)::numeric,
    COUNT(*) FILTER (WHERE c.capability_type = 'text_recognition' AND s.stability IS NOT NULL)::int,
    COALESCE(AVG(s.stability) FILTER (WHERE c.capability_type = 'form_recall'), 0)::numeric,
    COUNT(*) FILTER (WHERE c.capability_type = 'form_recall' AND s.stability IS NOT NULL)::int
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND s.stability IS NOT NULL;
$$;

-- get_review_latency_stats — current vs prior week (uses capability_review_events not legacy)
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

-- get_recall_accuracy_by_direction — separate counts per direction
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
    AND re.answer_report_json->>'wasCorrect' IN ('true', 'false');  -- defensive
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
    AND s.next_due_at <= now() + (p_days || ' days')::interval
  GROUP BY 1
  ORDER BY 1;
$$;
```

### 4.5 Indexes added by this migration

```sql
-- Required for fast _capability_source_progress_met joins
CREATE INDEX IF NOT EXISTS lsps_user_source_ref_idx
  ON indonesian.learner_source_progress_state(user_id, source_ref);

-- Required for get_review_latency_stats time-window scans
CREATE INDEX IF NOT EXISTS cre_user_created_idx
  ON indonesian.capability_review_events(user_id, created_at DESC);

-- Functional index for the slug-match join in get_lapsing_count + get_vulnerable_capabilities.
-- Without this index, the JOIN does a full scan over learning_items on every call.
-- IMMUTABLE stable_slug allows this index to be used.
CREATE INDEX IF NOT EXISTS learning_items_slug_idx
  ON indonesian.learning_items(indonesian.stable_slug(base_text));
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
  // ... other methods follow the same pattern
}
```

## 5. Algorithm

```text
1. Apply migration (one transaction):
   - Create stable_slug() and _capability_source_progress_met() helpers
   - Create 8 metric SQL functions
   - Create 3 indexes
   - GRANT EXECUTE on all functions to authenticated
2. Add learnerProgressService.ts with the 9-method interface (incl. mastery pass-through)
3. Add learnerProgressService unit tests (mock supabase.rpc; verify shape mapping)
4. Migrate consumers in this order (one PR per group, each shippable):
   PR-1 (Dashboard slice):
     - goalService.computeTodayPlan → calls service + applies goal policy in TS
     - learnerStateService.getLapsingItems → wraps service.getLapsingCount
     - Browser smoke: Dashboard "due reviews" count = DB count = session count ceiling
   PR-2 (Goal evaluation slice):
     - goalService.refreshGoalProgress → reads service for review_health source-of-truth
   PR-3 (Voortgang slice):
     - progressService.getLapsePrevention → service
     - progressService.getVulnerableItems → service.getVulnerableCapabilities (+ UI shape)
     - progressService.getAccuracyBySkillType → service.getRecallAccuracyByDirection
     - progressService.getAvgLatencyMs → service.getReviewLatencyStats
     - progressService.getCapabilityMasteryOverview → service.getMasteryOverview pass-through
   PR-4 (Cleanup):
     - Delete learnerStateService.getDueSkills (no callers)
     - Add CI gate: scripts/check-no-legacy-state.sh — fails if any production file (excluding 
       reviewHandler.ts and Session.tsx legacy session path) reads from learner_skill_state
5. Update CLAUDE.md to mark learnerProgressService as the canonical contract.
6. Update docs/current-system/page-framework-status.md with the new state.
```

## 6. Idempotency

- All `CREATE OR REPLACE FUNCTION` and `CREATE INDEX IF NOT EXISTS` — re-runs safe.
- Service is read-only.
- Legacy `learner_skill_state` writes still happen via `lib/reviewHandler.ts` until the legacy session path is decommissioned (separate effort).

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
SELECT * FROM indonesian.compute_todays_plan_raw(
  '<test-user-id>'::uuid, now()
);
SELECT * FROM indonesian.get_lapsing_count('<test-user-id>'::uuid);
SQL

# 5. Browser smoke (Playwright via MCP)
- Seed at least 3 due capabilities (manually update next_due_at to past)
  AND 2 capabilities with lapse_count >= 3 + stability < 2.0
  AND 2 unrelated reviewed capabilities
  before running this check (S5 fix — avoids 0 == 0 trivial pass).
- Navigate / (Dashboard) → expect "3 reviews ready" widget (matches the seeded count)
- Navigate /session → expect ≤ 3 cards (capability planner output ≤ ceiling)
- Navigate /voortgang → metrics render without errors, sample sizes > 0
- Navigate /lessons → "ready to practice" counts unchanged from pre-migration baseline
```

## 8. Rollback

Each PR is independently `git revert`-able. The migration is additive (only new functions and indexes); the rollback file drops them:

```sql
-- 2026-05-01-learner-progress-functions.rollback.sql
DROP FUNCTION IF EXISTS indonesian.compute_todays_plan_raw(uuid, timestamptz);
DROP FUNCTION IF EXISTS indonesian.get_lapsing_count(uuid);
DROP FUNCTION IF EXISTS indonesian.get_lapse_prevention(uuid);
DROP FUNCTION IF EXISTS indonesian.get_memory_health(uuid);
DROP FUNCTION IF EXISTS indonesian.get_review_latency_stats(uuid);
DROP FUNCTION IF EXISTS indonesian.get_recall_accuracy_by_direction(uuid);
DROP FUNCTION IF EXISTS indonesian.get_vulnerable_capabilities(uuid, int);
DROP FUNCTION IF EXISTS indonesian.get_review_forecast(uuid, int, text);
DROP FUNCTION IF EXISTS indonesian._capability_source_progress_met(uuid, uuid);
DROP FUNCTION IF EXISTS indonesian.stable_slug(text);
DROP INDEX IF EXISTS indonesian.lsps_user_source_ref_idx;
DROP INDEX IF EXISTS indonesian.cre_user_created_idx;
DROP INDEX IF EXISTS indonesian.learning_items_slug_idx;
```

## 9. Supabase Requirements

### Schema changes
- **No new tables.** Only functions + indexes.
- **Functions:** `stable_slug`, `_capability_source_progress_met`, `compute_todays_plan_raw`, `get_lapsing_count`, `get_lapse_prevention`, `get_memory_health`, `get_review_latency_stats`, `get_recall_accuracy_by_direction`, `get_vulnerable_capabilities`, `get_review_forecast`. All `SECURITY INVOKER`.
- **Indexes:** `lsps_user_source_ref_idx`, `cre_user_created_idx`, `learning_items_slug_idx`.
- **Grants:** `GRANT EXECUTE ON FUNCTION ... TO authenticated` for every public function (helpers `_capability_source_progress_met` and `stable_slug` also need GRANT since they're called from inside the metric functions).

### homelab-configs changes
- [ ] PostgREST: N/A — calling stored functions via supabase-js `.rpc()` works against existing `indonesian` schema exposure.
- [ ] Kong: N/A — no new routes.
- [ ] GoTrue: N/A.
- [ ] Storage: N/A.

### Health check additions
- [ ] Add the 9 new functions to `scripts/check-supabase-deep.ts` as expected functions.
- [ ] Optional: add an end-to-end function-shape smoke (calls each function with a known fixture user; asserts result tuple shape).

### RLS
- All new functions are `SECURITY INVOKER`. Existing RLS policies on `learner_capability_state`, `learning_capabilities`, `capability_review_events`, `learner_source_progress_state`, `learning_items`, `item_meanings` (defined in `scripts/migrations/2026-04-25-capability-core.sql:129-176`) apply unchanged. Verified all four tables have `enable row level security` and per-user policies.

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `_capability_source_progress_met` is slow at scale (large user × many capabilities) | New index `lsps_user_source_ref_idx` covers the EXISTS clause's join (§4.5). Functional index on `learning_items.stable_slug(base_text)` covers the slug-match join. Function declared STABLE so PG can cache call results within a query. Defer perf testing until production scale is real. |
| Capability source_ref scheme drifts in future (e.g., introduction of UUID-based refs) | Production today is uniformly slug-based (verified in §3.2). If the `capabilityCatalog.ts:51-52` runtime path is ever published to DB, a follow-up needs to update slug-match joins to handle both schemes. Out of scope for this spec. |
| `getLapsingCount` semantics change from items to capabilities | Spec explicitly counts distinct items (§4.4 `get_lapsing_count`). Matches legacy. UI label stays "items at risk." |
| Goal-policy adjustments split between SQL and TS | Spec resolution: SQL returns raw counts only. ALL goal-policy math stays in `goalService.ts`. Including the 20% weak cap and the `dueTarget = preferredSize` ceiling. |
| `(answer_report_json->>'latencyMs')::int` throws on dirty data | Added regex pre-filter `~ '^\d+$'` in WHERE clauses. AVG over zero rows returns NULL; service code COALESCEs to `null` for the typed result. |
| `(answer_report_json->>'wasCorrect')::boolean` throws on non-bool | Filtered to `IN ('true', 'false')` in `get_recall_accuracy_by_direction` (§4.4). |
| Mastery funnel gets out of sync if `getMasteryOverview` changes shape | Service exposes it as a pass-through; consumers import the type from `@/lib/mastery/masteryModel`. Single point of typing. |
| Browser smoke check (S5) passes for wrong reason on fresh user | Verification step explicitly seeds 3 due + 2 lapsing + 2 reviewed capabilities first. See §7 step 5. |
| `requiredSourceProgress.kind` in production data has values not seen in TS types | Seven event types are enumerated in `2026-04-25-capability-core.sql:108`. The CASE statement covers all of them. Unknown `kind` returns false (conservative). |
| The legacy `lib/reviewHandler.ts` still writes to `learner_skill_state` while users use the new path | These writes do not affect production reads (which use the service). They keep historical data flowing for users still on the legacy session path. Acceptable until §12 q3 resolves. |

## 11. Tests

### 11.1 New tests for learnerProgressService
Pure unit tests mocking `supabase.schema().rpc()`:
- Each method calls the right RPC name with the right argument shape (snake_case).
- Each method maps RPC response → typed result correctly.
- Empty data scenarios (zero-row user) return zero-counts cleanly.
- RPC errors propagate with method context (`"learnerProgressService.getTodaysPlanRawCounts failed: ..."`).
- Sample-size fields are integers, not floats.

### 11.2 Updated tests for consumers
For each migrated service method, refactor existing tests to mock `learnerProgressService` directly. Removes per-table fixture rows. Example:

```ts
vi.mock('@/services/learnerProgressService', () => ({
  learnerProgressService: {
    getTodaysPlanRawCounts: vi.fn().mockResolvedValue({
      dueRaw: 5, newRaw: 3, weakRaw: 1, recallSupplyRaw: 2, meanLatencyMs: 18000,
    }),
    getLapsingCount: vi.fn().mockResolvedValue({ count: 4 }),
    // ...
  },
}))
```

### 11.3 SQL function tests
Two layers:

**Shape smoke (always run):** mock `supabase.schema().rpc()` to return a fixture row; assert the service correctly extracts each field. This runs on every CI invocation without `SUPABASE_SERVICE_KEY`.

**Live SQL parity (gated):** for each metric function, `it.skipIf(!process.env.SUPABASE_SERVICE_KEY)` calls the function against a SEEDED test fixture user. Asserts: result tuple matches expected counts derived from the seed. This catches predicate-parity regressions but only runs locally / on dev-tagged CI.

### 11.4 UI copy changes (S5 secondary fix)
Per §1.1, dashboard widget copy should clarify ceiling vs output:
- "X reviews due" → "X reviews ready" (ceiling-style)
- Tooltip: "Today's session may be smaller depending on your settings and recent practice."
- Same treatment for `newIntroductionsToday`.
- Tested via dashboard-redesign.test.tsx string assertions.

## 12. Open Questions

### q1. Mastery funnel — SQL or pass-through?
**Resolution:** TS pass-through. `getMasteryOverview` is 524 LOC of mature staging logic; lifting into SQL is high-risk, low-value, and the function is already capability-aware. Service exposes a thin pass-through. (Architect concern §12 q1 resolved this way.)

### q2. Batch method for the Voortgang page?
**Resolution:** Defer. Per-method round-trip is <50ms each based on the predicate sizes; Voortgang's 5 simultaneous calls finish in parallel under 200ms total. If perf testing later shows it matters, add a batch endpoint then.

### q3. Legacy session path: keep or delete?
**Open.** The legacy session path (`Session.tsx:181-187` + `lib/reviewHandler.ts:59-139` + `learnerStateService.applyReviewToSkillState/upsertItemState/logStageEvent/getSkillStates/getSkillStatesBatch`) reads and writes `learner_skill_state` and is the fallback when `experiencePlayerV1` is OFF. Two questions for the spec author:
  - (a) Is the legacy path still needed? `experiencePlayerV1` defaults to ON in `featureFlags.ts:71`; the legacy path is a fallback rather than a primary flow.
  - (b) If yes: spec stops short — keeps these methods. CI gate excludes them.
  - (c) If no: separate spec to delete the legacy path entirely (estimated 4-6 hr of work; risk: removes tested-and-shipped code that protects against capability-system bugs).
**Recommendation:** answer in v3. Default assumption for now: keep, exclude from CI gate.

### q4. Acceptable dashboard-vs-session disagreement?
**Resolution:** Dashboard surfaces eligibility ceilings; session output is `≤` ceiling. Documented in §1.1. UI copy reflects this in §11.4.

### q5. CI gate scope
**Open until q3 resolves.** The gate `! grep "from('learner_skill_state')"` should pass after PR-4 except for explicitly-allowlisted files (legacy reviewHandler / legacy session path). Allowlist is the spec author's decision per q3.

### q6. `processGoalEvaluation` referenced in v1 §3.1
**Resolution:** v1 had the wrong method name. Actual functions are `goalService.refreshGoalProgress` (line 320) and `goalService.finalizeWeek` (line 504). v2 §3.2 / §5 use the correct names.

### q7. Should `compute_todays_plan_raw` accept `weeklyGoals` so it can do all the policy server-side?
**Resolution:** No. SQL function returns raw counts; goalService applies all goal-policy adjustments. Architect concern S1. Cleaner contract — the service answers "what is the user's situation" without needing weekly-goal context.

## 13. Performance

Expected per-method round-trip costs against current test data (testuser, 9 lessons, 2,357 ready capabilities):

- `compute_todays_plan_raw`: 1 RPC; 4 internal queries; <100ms with new indexes. Without `lsps_user_source_ref_idx` it would be 200-500ms.
- `get_lapsing_count`, `get_lapse_prevention`: 1 RPC each; single COUNT/SUM; <30ms with new indexes.
- `get_memory_health`: 1 RPC; AVG with FILTER; <40ms.
- `get_review_latency_stats`: 1 RPC; 2 sub-queries; <50ms with `cre_user_created_idx`.
- `get_recall_accuracy_by_direction`: 1 RPC; aggregate with FILTER; <50ms.
- `get_vulnerable_capabilities(limit=10)`: 1 RPC; ORDER BY + LIMIT; <60ms with `learning_items_slug_idx`.
- `get_review_forecast(days=14)`: 1 RPC; GROUP BY date; <50ms.
- `getMasteryOverview` (pass-through): unchanged from current TS impl.

Voortgang page's 5 parallel calls finish in <250ms total in practice (slowest single call is `getVulnerableCapabilities` due to the slug-match join).

## 14. Why this architecture beats the alternative

(Same as v1 §14 — unchanged.)

## 15. Definition of Done

- [ ] Migration `2026-05-01-learner-progress-functions.sql` deployed to homelab Supabase.
- [ ] `learnerProgressService.ts` exists with the 9-method interface in §4.2.
- [ ] All consumers in §3.2 column "In scope" no longer `from('learner_skill_state')`.
- [ ] CI gate added per q5 resolution; passes against `main`.
- [ ] All 1013+ existing tests pass (post-fixture-rewrite count may be lower due to consolidation).
- [ ] New `learnerProgressService.test.ts` exists; passes.
- [ ] SQL function shape smoke tests pass without `SUPABASE_SERVICE_KEY`.
- [ ] Live SQL parity tests pass with `SUPABASE_SERVICE_KEY` against seeded fixtures.
- [ ] Browser smoke per §7 step 5: Dashboard ceiling = DB count = session ceiling.
- [ ] Dashboard widget copy reflects ceiling semantics (§11.4).
- [ ] CLAUDE.md mentions `learnerProgressService` as canonical.
- [ ] `docs/current-system/page-framework-status.md` updated.

## 16. Changelog

- **v1** (2026-05-01 morning): initial spec; failed architect review.
- **v2** (2026-05-01 afternoon, this revision): addresses 8 CRITICAL + 6 SIGNIFICANT issues from architect review.
  - C1: `stable_slug` SQL function defined (§4.3 Helper 1).
  - C2: production source_ref scheme verified slug-only (§3.2).
  - C3: source-progress predicate now mirrors `sourceProgressGates.ts:32-93` including transitive closure, section_ref fallback, and `requiresConcreteSourceProgress` rejection (§4.3 Helper 2).
  - C4: "new" semantics reframed as eligibility ceiling, not session output (§1.1, §11.4).
  - C5: `getLapsingCount` counts distinct items (§4.2, §4.4).
  - C6: `kind = 'none'` rejection logic explicit (§4.3 Case 2).
  - C7: `getLapsePrevention` defined fully (§4.2, §4.4).
  - C8: capability tables located in `scripts/migrations/2026-04-25-capability-core.sql`; missing indexes added explicitly (§4.5).
  - S1: ALL goal-policy math stays in TS; SQL returns raw counts only.
  - S2: `recallSupplyRaw` is supply not target.
  - S3: capability_type → recognition/recall mapping explicit, no implicit 1:1.
  - S4: defensive regex pre-filters before JSONB casts.
  - S5: browser smoke seeds test data first.
  - S6: shape smoke runs always; live SQL parity gated on key but documented.
  - N1: `get_review_forecast` accepts user timezone parameter.
  - N5: `processGoalEvaluation` corrected to `refreshGoalProgress` / `finalizeWeek`.
  - N6: `getDueSkills`/`getSkillStates`/`getSkillStatesBatch` triaged in §3.2 + §12 q3.
  - N7: Supabase Requirements section added (§9).
