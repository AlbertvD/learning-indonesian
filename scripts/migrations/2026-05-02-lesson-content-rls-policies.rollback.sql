-- Rollback for 2026-05-02-lesson-content-rls-policies.sql.
-- Drops every SELECT policy this migration asserted.
-- Note: with RLS still enabled on these tables and no replacement policies,
-- all SELECT will fail for non-superusers — only run this rollback if you're
-- also disabling RLS or replacing the policies.

begin;

drop policy if exists "lesson page blocks authenticated read" on indonesian.lesson_page_blocks;
drop policy if exists "content units authenticated read" on indonesian.content_units;
drop policy if exists "capability content units authenticated read" on indonesian.capability_content_units;
drop policy if exists "capability catalog authenticated read" on indonesian.learning_capabilities;
drop policy if exists "capability aliases authenticated read" on indonesian.capability_aliases;
drop policy if exists "capability artifacts authenticated read" on indonesian.capability_artifacts;
drop policy if exists "learner capability state owner read" on indonesian.learner_capability_state;
drop policy if exists "capability review events owner read" on indonesian.capability_review_events;
drop policy if exists "source progress events owner read" on indonesian.learner_source_progress_events;
drop policy if exists "source progress state owner read" on indonesian.learner_source_progress_state;

notify pgrst, 'reload schema';

commit;
