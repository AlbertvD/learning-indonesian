-- Rollback for 2026-05-02-capability-resolution-failures.sql.

begin;

drop view if exists indonesian.capability_resolution_issues;

drop table if exists indonesian.capability_resolution_failure_events;

notify pgrst, 'reload schema';

commit;
