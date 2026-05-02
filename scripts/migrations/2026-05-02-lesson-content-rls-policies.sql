-- Idempotently re-assert SELECT policies on the three RLS-protected tables that
-- power the new `get_lessons_overview` RPC: lesson_page_blocks, content_units,
-- capability_content_units.
--
-- Background (2026-05-02): production deploy revealed all three tables had RLS
-- enabled but ZERO policies — every SELECT from the `authenticated` role
-- returned "permission denied for table ...". The original
-- `2026-04-25-content-units-lesson-blocks.sql` migration declares these
-- policies, but they were missing on the homelab DB (partial migration or
-- dropped at some point). The legacy code didn't hit these tables; the new
-- RPC introduced in commit a44e90f exposed the gap.
--
-- This migration re-asserts the policies so a future container/volume reset
-- can't reintroduce the gap.

begin;

drop policy if exists "lesson page blocks authenticated read" on indonesian.lesson_page_blocks;
create policy "lesson page blocks authenticated read"
  on indonesian.lesson_page_blocks for select
  to authenticated
  using (true);

drop policy if exists "content units authenticated read" on indonesian.content_units;
create policy "content units authenticated read"
  on indonesian.content_units for select
  to authenticated
  using (true);

drop policy if exists "capability content units authenticated read" on indonesian.capability_content_units;
create policy "capability content units authenticated read"
  on indonesian.capability_content_units for select
  to authenticated
  using (true);

notify pgrst, 'reload schema';

commit;
