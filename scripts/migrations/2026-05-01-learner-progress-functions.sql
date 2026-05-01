-- 2026-05-01 — learnerProgressService SQL contract
--
-- Implements the single canonical contract for surfacing-layer reads of user
-- progress data (Dashboard, Voortgang, weekly-goal evaluation, lapsing card).
-- See docs/plans/2026-05-01-learner-progress-service-spec.md for full design.
--
-- All functions are SECURITY INVOKER. RLS on the underlying tables (declared in
-- 2026-04-25-capability-core.sql:129-177 and migration.sql:423/428) gates each
-- query through the calling user's auth.uid().
--
-- Idempotent: CREATE OR REPLACE FUNCTION + CREATE INDEX IF NOT EXISTS +
-- CREATE EXTENSION IF NOT EXISTS. Safe to re-run.

-- ============================================================================
-- HELPERS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

-- IMMUTABLE wrapper for unaccent. The default unaccent() is STABLE in
-- pg_extension's catalog (the dictionary file could in theory be reloaded), so
-- calling it inside an IMMUTABLE function and using it in functional indexes
-- is unsafe across PG versions. The two-arg form unaccent('public.unaccent', t)
-- names the dictionary explicitly and is safe to wrap as IMMUTABLE.
-- See https://www.postgresql.org/docs/15/unaccent.html
-- Note: on the homelab Supabase image, the unaccent extension is installed
-- in the `storage` schema (not `public`). The two-arg form's first arg is
-- a regdictionary, which resolves through search_path; the function call
-- itself must be schema-qualified.
CREATE OR REPLACE FUNCTION indonesian.immutable_unaccent(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = storage, public, pg_catalog
AS $$
  SELECT storage.unaccent('unaccent'::regdictionary, p_text);
$$;

-- Port of TS stableSlug() at scripts/lib/content-pipeline-output.ts:97-104.
-- Matches NFKD+combining-mark-strip semantics for the Indonesian word stock.
-- IMMUTABLE so the functional index in §4.5 is index-usable.
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

-- Source-progress predicate. Mirrors src/lib/pedagogy/sourceProgressGates.ts:32-93
-- excluding evidence-bypass (session-shape-specific; eligibility ceiling does
-- not need it). LANGUAGE sql STABLE so PG can inline into the calling query
-- plan; takes metadata + source_kind + capability_type by value so the function
-- never re-reads learning_capabilities.
CREATE OR REPLACE FUNCTION indonesian._capability_source_progress_met(
  p_user_id uuid,
  p_metadata jsonb,
  p_source_kind text,
  p_capability_type text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    -- Case 1: no requirement specified → trivially satisfied
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
            lsps.source_ref = p_metadata->'requiredSourceProgress'->>'sourceRef'
            OR (lsps.source_ref || '/' || lsps.source_section_ref)
                 = p_metadata->'requiredSourceProgress'->>'sourceRef'
          )
          AND (
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

-- ============================================================================
-- METRIC FUNCTIONS — DASHBOARD SLICE (PR-1)
-- ============================================================================

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
  SELECT count(*) INTO v_due
  FROM indonesian.learner_capability_state s
  JOIN indonesian.learning_capabilities c ON c.id = s.capability_id
  WHERE s.user_id = p_user_id
    AND s.activation_state = 'active'
    AND c.readiness_status = 'ready'
    AND c.publication_status = 'published'
    AND s.next_due_at IS NOT NULL
    AND s.next_due_at <= p_now;

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

  -- 14-day window for stability of the dashboard estimate (vs. 7-day windows
  -- in get_review_latency_stats which is a week-over-week comparison metric).
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

CREATE OR REPLACE FUNCTION indonesian.get_current_streak_days(
  p_user_id uuid,
  p_timezone text
)
RETURNS int LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  v_check_date date := (now() AT TIME ZONE p_timezone)::date;
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

-- ============================================================================
-- METRIC FUNCTIONS — GOAL EVALUATION SLICE (PR-2)
-- ============================================================================

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

-- ============================================================================
-- METRIC FUNCTIONS — VOORTGANG SLICE (PR-3)
-- ============================================================================

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

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS lsps_user_source_ref_idx
  ON indonesian.learner_source_progress_state(user_id, source_ref);

CREATE INDEX IF NOT EXISTS cre_user_created_idx
  ON indonesian.capability_review_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cre_user_capability_created_idx
  ON indonesian.capability_review_events(user_id, capability_id, created_at);

CREATE INDEX IF NOT EXISTS learning_items_slug_idx
  ON indonesian.learning_items(indonesian.stable_slug(base_text));

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION indonesian.immutable_unaccent(text) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.stable_slug(text) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian._capability_source_progress_met(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.compute_todays_plan_raw(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_lapsing_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_current_streak_days(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_overdue_count(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_study_days_count(uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_recall_stats_for_week(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_usable_vocabulary_gain(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_lapse_prevention(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_memory_health(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_review_latency_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_recall_accuracy_by_direction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_vulnerable_capabilities(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION indonesian.get_review_forecast(uuid, int, text) TO authenticated;
