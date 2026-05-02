-- 2026-05-02 — get_lessons_overview consolidated read for the Lessons list page
--
-- The Lessons overview page previously fanned out into ~20 round trips
-- (1 + N for page_blocks per lesson + 1 for source_progress + N for capability
-- summaries). This single function returns everything the page needs in one
-- round trip:
--
--   - Lesson basic info + lesson_sections (for grammar topic extraction)
--   - lesson_progress for the user (folded into has_started_lesson)
--   - For each lesson: ready_capability_count, practiced_capability_count,
--     has_started_lesson (any progress signal), has_meaningful_exposure
--     (grammar/dialogue source_progress with the meaningful event set)
--
-- Per-lesson source_refs come from lesson_page_blocks; per-block payload_json
-- drives the kind classification (grammar/dialogue/culture/pronunciation/lesson).
-- The link from learner_source_progress_state.source_section_ref to the block
-- is via block_key (matches blockByProgressKey() in Lessons.tsx).
--
-- Idempotent. SECURITY INVOKER — RLS on the joined tables filters per-user
-- via auth.uid().

CREATE OR REPLACE FUNCTION indonesian.get_lessons_overview(p_user_id uuid)
RETURNS TABLE (
  lesson_id uuid,
  order_index int,
  title text,
  description text,
  audio_path text,
  duration_seconds int,
  primary_voice text,
  publication_status text,
  is_published boolean,
  lesson_sections jsonb,
  has_started_lesson boolean,
  has_meaningful_exposure boolean,
  has_page_blocks boolean,
  ready_capability_count int,
  practiced_eligible_capability_count int
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH lesson_blocks AS (
    SELECT
      l.id AS lesson_id,
      pb.block_key,
      pb.payload_json,
      pb.source_progress_event,
      COALESCE(NULLIF(pb.source_refs, ARRAY[]::text[]), ARRAY[pb.source_ref]) AS expanded_refs
    FROM indonesian.lessons l
    JOIN indonesian.lesson_page_blocks pb
      ON pb.source_ref = 'lesson-' || l.order_index
  ),
  lesson_capabilities AS (
    SELECT DISTINCT ON (lb.lesson_id, c.id)
      lb.lesson_id,
      c.id AS capability_id,
      c.readiness_status,
      c.publication_status,
      s.activation_state,
      s.review_count
    FROM lesson_blocks lb
    CROSS JOIN LATERAL unnest(lb.expanded_refs) AS expanded_ref
    JOIN indonesian.learning_capabilities c
      ON c.source_ref = expanded_ref
    LEFT JOIN indonesian.learner_capability_state s
      ON s.capability_id = c.id AND s.user_id = p_user_id
  ),
  capability_counts AS (
    SELECT
      lesson_id,
      COUNT(*) FILTER (
        WHERE readiness_status = 'ready' AND publication_status = 'published'
      )::int AS ready_count,
      COUNT(*) FILTER (
        WHERE readiness_status = 'ready'
          AND publication_status = 'published'
          AND activation_state = 'active'
          AND COALESCE(review_count, 0) > 0
      )::int AS practiced_count
    FROM lesson_capabilities
    GROUP BY lesson_id
  ),
  block_kind_classified AS (
    SELECT
      lb.lesson_id,
      lb.block_key,
      lb.expanded_refs,
      CASE
        WHEN LOWER(lb.block_key) LIKE '%hero%' THEN 'lesson'
        WHEN LOWER(COALESCE(lb.payload_json->>'type', '')) = 'dialogue'
          OR LOWER(lb.block_key) LIKE '%dialogue%' THEN 'dialogue'
        WHEN LOWER(COALESCE(lb.payload_json->>'type', '')) = 'culture'
          OR LOWER(lb.block_key) LIKE '%culture%' THEN 'culture'
        WHEN LOWER(COALESCE(lb.payload_json->>'type', '')) = 'pronunciation'
          OR LOWER(lb.block_key) LIKE '%pronunciation%' THEN 'pronunciation'
        WHEN LOWER(COALESCE(lb.payload_json->>'type', '')) IN ('grammar', 'reference_table')
          OR lb.source_progress_event = 'pattern_noticing_seen'
          OR LOWER(lb.block_key) LIKE '%grammar%'
          OR LOWER(lb.block_key) LIKE '%pattern%' THEN 'grammar'
        ELSE 'lesson'
      END AS kind
    FROM lesson_blocks lb
  ),
  source_progress_events_lookup AS (
    -- Per-block events for this user. Link is on block_key matching
    -- learner_source_progress_state.source_section_ref, scoped to the block's
    -- expanded source_refs.
    SELECT
      bkc.lesson_id,
      bkc.kind,
      sps.current_state,
      sps.completed_event_types
    FROM block_kind_classified bkc
    CROSS JOIN LATERAL unnest(bkc.expanded_refs) AS expanded_ref
    JOIN indonesian.learner_source_progress_state sps
      ON sps.source_ref = expanded_ref
     AND sps.source_section_ref = bkc.block_key
     AND sps.user_id = p_user_id
  ),
  exposures AS (
    SELECT
      lesson_id,
      bool_or(true) AS any_source_progress,
      bool_or(
        kind = 'grammar'
        AND (
          current_state = ANY(ARRAY['heard_once','intro_completed','pattern_noticing_seen','guided_practice_completed','lesson_completed'])
          OR completed_event_types && ARRAY['heard_once','intro_completed','pattern_noticing_seen','guided_practice_completed','lesson_completed']
        )
      ) OR bool_or(
        kind = 'dialogue'
        AND (
          current_state = ANY(ARRAY['heard_once','section_exposed','guided_practice_completed','lesson_completed'])
          OR completed_event_types && ARRAY['heard_once','section_exposed','guided_practice_completed','lesson_completed']
        )
      ) AS has_meaningful_exposure
    FROM source_progress_events_lookup
    GROUP BY lesson_id
  ),
  lesson_progress_summary AS (
    SELECT lesson_id, true AS lesson_started
    FROM indonesian.lesson_progress
    WHERE user_id = p_user_id
    GROUP BY lesson_id
  ),
  lesson_sections_json AS (
    SELECT
      ls.lesson_id,
      jsonb_agg(to_jsonb(ls) ORDER BY ls.order_index) AS sections
    FROM indonesian.lesson_sections ls
    GROUP BY ls.lesson_id
  ),
  lesson_block_presence AS (
    -- A lesson is "prepared" iff lesson_page_blocks has rows for it. Drives
    -- the coming_later vs openable status decision client-side.
    SELECT lesson_id, true AS has_blocks
    FROM lesson_blocks
    GROUP BY lesson_id
  )
  SELECT
    l.id,
    l.order_index,
    l.title,
    l.description,
    l.audio_path,
    l.duration_seconds,
    l.primary_voice,
    'published'::text AS publication_status,
    true AS is_published,
    COALESCE(lsj.sections, '[]'::jsonb) AS lesson_sections,
    COALESCE(lps.lesson_started, false)
      OR COALESCE((SELECT bool_or(any_source_progress) FROM exposures e WHERE e.lesson_id = l.id), false) AS has_started_lesson,
    COALESCE((SELECT has_meaningful_exposure FROM exposures e WHERE e.lesson_id = l.id), false) AS has_meaningful_exposure,
    COALESCE(lbp.has_blocks, false) AS has_page_blocks,
    COALESCE(cc.ready_count, 0) AS ready_capability_count,
    COALESCE(cc.practiced_count, 0) AS practiced_eligible_capability_count
  FROM indonesian.lessons l
  LEFT JOIN capability_counts cc ON cc.lesson_id = l.id
  LEFT JOIN lesson_progress_summary lps ON lps.lesson_id = l.id
  LEFT JOIN lesson_sections_json lsj ON lsj.lesson_id = l.id
  LEFT JOIN lesson_block_presence lbp ON lbp.lesson_id = l.id
  ORDER BY l.order_index;
$$;

GRANT EXECUTE ON FUNCTION indonesian.get_lessons_overview(uuid) TO authenticated;
