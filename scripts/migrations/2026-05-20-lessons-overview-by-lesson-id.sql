-- 2026-05-20 — get_lessons_overview reads capability counts from
-- learning_capabilities.lesson_id (ADR 0006) instead of unnesting
-- lesson_page_blocks.source_refs[]. Phase 1 of retiring page blocks.
-- (Snapshot of the canonical change in scripts/migration.sql; safe to re-apply.)

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
  with lesson_capabilities as (
    select c.lesson_id, c.id as capability_id,
           c.readiness_status, c.publication_status,
           s.activation_state, s.review_count
    from indonesian.learning_capabilities c
    left join indonesian.learner_capability_state s
      on s.capability_id = c.id and s.user_id = p_user_id
    where c.lesson_id is not null
  ),
  capability_counts as (
    select lesson_id,
           count(*) filter (
             where readiness_status = 'ready' and publication_status = 'published'
           )::int as ready_count,
           count(*) filter (
             where readiness_status = 'ready' and publication_status = 'published'
               and activation_state = 'active' and coalesce(review_count, 0) > 0
           )::int as practiced_count
    from lesson_capabilities group by lesson_id
  ),
  lesson_sections_json as (
    select ls.lesson_id, jsonb_agg(to_jsonb(ls) order by ls.order_index) as sections
    from indonesian.lesson_sections ls group by ls.lesson_id
  ),
  lesson_block_presence as (
    select l.id as lesson_id, true as has_blocks
    from indonesian.lessons l
    where exists (
      select 1 from indonesian.lesson_page_blocks pb
      where pb.source_ref = 'lesson-' || l.order_index
    )
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
