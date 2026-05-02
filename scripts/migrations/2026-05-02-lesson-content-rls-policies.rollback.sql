-- Rollback for 2026-05-02-lesson-content-rls-policies.sql.
-- Drops the three SELECT policies. Note: with RLS still enabled and no
-- policies, all SELECT on these tables will fail — only run this rollback
-- if you're also disabling RLS or replacing with different policies.

begin;

drop policy if exists "lesson page blocks authenticated read" on indonesian.lesson_page_blocks;
drop policy if exists "content units authenticated read" on indonesian.content_units;
drop policy if exists "capability content units authenticated read" on indonesian.capability_content_units;

notify pgrst, 'reload schema';

commit;
