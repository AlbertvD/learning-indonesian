-- 2026-05-07 — Retirement #6 cleanup migration (paper-trail; mirrored in master)
--
-- Applied via `make migrate` AFTER the new client deploys (master migration.sql
-- now contains the full retirement-#6 section; this file is paper-trail of the
-- cleanup-only portion). Drops source-progress tables/RPCs/column + rewrites
-- get_lessons_overview to its activation-aware shape.
--
-- Pre-conditions:
-- - forward.sql has already run (or master migration.sql has applied steps 1-5).
-- - The new client has fully deployed (no live caller of source-progress objects).
--
-- Idempotent. Safe to re-run.
--
-- See docs/plans/2026-05-07-retire-source-progress.md for the spec.

begin;

-- 6. REWRITE: get_lessons_overview — activation-aware shape; drops has_meaningful_exposure.
-- DROP FUNCTION first because Postgres CREATE OR REPLACE cannot change a
-- function's RETURNS TABLE shape (the return-column set narrows by one).
-- Idempotent via `if exists`. The grant below re-establishes the
-- authenticated execute permission on the recreated function.
drop function if exists indonesian.get_lessons_overview(uuid);
create or replace function indonesian.get_lessons_overview(p_user_id uuid)
returns table (
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
  has_page_blocks boolean,
  ready_capability_count int,
  practiced_eligible_capability_count int
)
language sql stable security invoker as $$
  with lesson_blocks as (
    select
      l.id as lesson_id,
      pb.block_key,
      pb.payload_json,
      coalesce(nullif(pb.source_refs, array[]::text[]), array[pb.source_ref]) as expanded_refs
    from indonesian.lessons l
    join indonesian.lesson_page_blocks pb
      on pb.source_ref = 'lesson-' || l.order_index
  ),
  lesson_capabilities as (
    select distinct on (lb.lesson_id, c.id)
      lb.lesson_id,
      c.id as capability_id,
      c.readiness_status,
      c.publication_status,
      s.activation_state,
      s.review_count
    from lesson_blocks lb
    cross join lateral unnest(lb.expanded_refs) as expanded_ref
    join indonesian.learning_capabilities c
      on c.source_ref = expanded_ref
    left join indonesian.learner_capability_state s
      on s.capability_id = c.id and s.user_id = p_user_id
  ),
  capability_counts as (
    select
      lesson_id,
      count(*) filter (
        where readiness_status = 'ready' and publication_status = 'published'
      )::int as ready_count,
      count(*) filter (
        where readiness_status = 'ready'
          and publication_status = 'published'
          and activation_state = 'active'
          and coalesce(review_count, 0) > 0
      )::int as practiced_count
    from lesson_capabilities
    group by lesson_id
  ),
  lesson_sections_json as (
    select
      ls.lesson_id,
      jsonb_agg(to_jsonb(ls) order by ls.order_index) as sections
    from indonesian.lesson_sections ls
    group by ls.lesson_id
  ),
  lesson_block_presence as (
    select lesson_id, true as has_blocks
    from lesson_blocks
    group by lesson_id
  )
  select
    l.id,
    l.order_index,
    l.title,
    l.description,
    l.audio_path,
    l.duration_seconds,
    l.primary_voice,
    'published'::text as publication_status,
    true as is_published,
    coalesce(lsj.sections, '[]'::jsonb) as lesson_sections,
    (
      exists (
        select 1 from indonesian.learner_lesson_activation lla
        where lla.user_id = p_user_id and lla.lesson_id = l.id
      )
      or exists (
        select 1 from indonesian.lesson_progress lp
        where lp.user_id = p_user_id and lp.lesson_id = l.id
      )
    ) as has_started_lesson,
    coalesce(lbp.has_blocks, false) as has_page_blocks,
    coalesce(cc.ready_count, 0) as ready_capability_count,
    coalesce(cc.practiced_count, 0) as practiced_eligible_capability_count
  from indonesian.lessons l
  left join capability_counts cc on cc.lesson_id = l.id
  left join lesson_sections_json lsj on lsj.lesson_id = l.id
  left join lesson_block_presence lbp on lbp.lesson_id = l.id
  order by l.order_index;
$$;

grant execute on function indonesian.get_lessons_overview(uuid) to authenticated;

-- 7. Drop column lesson_page_blocks.source_progress_event (and its check constraint).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'indonesian'
      and table_name = 'lesson_page_blocks'
      and column_name = 'source_progress_event'
  ) then
    alter table indonesian.lesson_page_blocks drop column source_progress_event;
  end if;
exception when others then null;
end $$;

-- 8. Drop dead SQL functions.
drop function if exists indonesian._capability_source_progress_met(uuid, jsonb, text, text) cascade;
drop function if exists indonesian.record_source_progress_event(jsonb) cascade;

-- 9. Drop source-progress RLS policies (defensive — harmless if already gone).
drop policy if exists "source progress events owner read" on indonesian.learner_source_progress_events;
drop policy if exists "source progress events owner insert" on indonesian.learner_source_progress_events;
drop policy if exists "source progress state owner read" on indonesian.learner_source_progress_state;
drop policy if exists "source progress state owner update" on indonesian.learner_source_progress_state;
drop policy if exists "source progress state owner insert" on indonesian.learner_source_progress_state;

-- 10. Drop source-progress tables (CASCADE picks up the index on user_id, source_ref).
drop table if exists indonesian.learner_source_progress_state cascade;
drop table if exists indonesian.learner_source_progress_events cascade;

commit;
