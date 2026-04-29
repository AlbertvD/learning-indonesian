begin;

do $$
begin
  if to_regprocedure('indonesian.record_source_progress_event(jsonb)') is not null then
    revoke all on function indonesian.record_source_progress_event(jsonb) from authenticated, service_role;
  end if;

  if to_regclass('indonesian.learner_source_progress_state') is not null then
    revoke all on indonesian.learner_source_progress_state from authenticated, service_role;
    drop policy if exists "source progress state owner update" on indonesian.learner_source_progress_state;
    drop policy if exists "source progress state owner insert" on indonesian.learner_source_progress_state;
    drop policy if exists "source progress state owner read" on indonesian.learner_source_progress_state;
  end if;

  if to_regclass('indonesian.learner_source_progress_events') is not null then
    revoke all on indonesian.learner_source_progress_events from authenticated, service_role;
    drop policy if exists "source progress events owner insert" on indonesian.learner_source_progress_events;
    drop policy if exists "source progress events owner read" on indonesian.learner_source_progress_events;
  end if;

  if to_regclass('indonesian.capability_review_events') is not null then
    revoke all on indonesian.capability_review_events from authenticated, service_role;
    drop policy if exists "capability review events owner read" on indonesian.capability_review_events;
  end if;

  if to_regclass('indonesian.learner_capability_state') is not null then
    revoke all on indonesian.learner_capability_state from authenticated, service_role;
    drop policy if exists "learner capability state owner read" on indonesian.learner_capability_state;
  end if;

  if to_regclass('indonesian.capability_artifacts') is not null then
    revoke all on indonesian.capability_artifacts from authenticated, service_role;
    drop policy if exists "capability artifacts authenticated read" on indonesian.capability_artifacts;
  end if;

  if to_regclass('indonesian.capability_aliases') is not null then
    revoke all on indonesian.capability_aliases from authenticated, service_role;
    drop policy if exists "capability aliases authenticated read" on indonesian.capability_aliases;
  end if;

  if to_regclass('indonesian.learning_capabilities') is not null then
    revoke all on indonesian.learning_capabilities from authenticated, service_role;
    drop policy if exists "capability catalog authenticated read" on indonesian.learning_capabilities;
  end if;
end $$;

drop function if exists indonesian.record_source_progress_event(jsonb);

drop table if exists indonesian.learner_source_progress_state;
drop table if exists indonesian.learner_source_progress_events;
drop table if exists indonesian.capability_review_events;
drop table if exists indonesian.learner_capability_state;
drop table if exists indonesian.capability_artifacts;
drop table if exists indonesian.capability_aliases;
drop table if exists indonesian.learning_capabilities;

commit;
