-- Idempotently re-assert SELECT policies on every RLS-protected table that
-- the new capability + lesson UI needs. All these policies were declared by
-- earlier migrations (`2026-04-25-content-units-lesson-blocks.sql` and
-- `2026-04-25-capability-core.sql`) but were missing on the homelab DB after
-- the 2026-05-02 deploy — partial migration application or post-create drop.
--
-- Symptoms observed in production after deploying the capabilityContentService
-- cycle (PRs #21/#25/#26/#27):
--
--   * /lessons page showed "Nog niet beschikbaar" for every lesson
--     → get_lessons_overview RPC failed: permission denied for
--       table lesson_page_blocks
--
--   * /lesson/* "Markeer sectie als gezien" appeared to do nothing
--     → SECURITY DEFINER record_source_progress_event WROTE successfully,
--       but the followup GET on learner_source_progress_state failed
--       silently (permission denied), so the UI didn't reflect the change
--
--   * /session for new users showed 0/0 cards even after reviewing lessons
--     → reads on learning_capabilities + learner_capability_state failed
--
-- This migration re-asserts every policy idempotently so a future container
-- or volume reset cannot reintroduce the gap.

begin;

-- ── lesson_page_blocks + sibling content tables ──────────────────────────
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

-- ── capability catalog (public read) ─────────────────────────────────────
drop policy if exists "capability catalog authenticated read" on indonesian.learning_capabilities;
create policy "capability catalog authenticated read"
  on indonesian.learning_capabilities for select
  to authenticated
  using (true);

drop policy if exists "capability aliases authenticated read" on indonesian.capability_aliases;
create policy "capability aliases authenticated read"
  on indonesian.capability_aliases for select
  to authenticated
  using (true);

drop policy if exists "capability artifacts authenticated read" on indonesian.capability_artifacts;
create policy "capability artifacts authenticated read"
  on indonesian.capability_artifacts for select
  to authenticated
  using (true);

-- ── learner state (owner-only read) ──────────────────────────────────────
drop policy if exists "learner capability state owner read" on indonesian.learner_capability_state;
create policy "learner capability state owner read"
  on indonesian.learner_capability_state for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "capability review events owner read" on indonesian.capability_review_events;
create policy "capability review events owner read"
  on indonesian.capability_review_events for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "source progress events owner read" on indonesian.learner_source_progress_events;
create policy "source progress events owner read"
  on indonesian.learner_source_progress_events for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "source progress state owner read" on indonesian.learner_source_progress_state;
create policy "source progress state owner read"
  on indonesian.learner_source_progress_state for select
  to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';

commit;
