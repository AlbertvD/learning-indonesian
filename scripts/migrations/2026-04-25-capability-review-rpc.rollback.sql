begin;

revoke all on function indonesian.commit_capability_answer_report(jsonb) from public;
revoke all on function indonesian.commit_capability_answer_report(jsonb) from authenticated;
revoke all on function indonesian.commit_capability_answer_report(jsonb) from service_role;
drop function if exists indonesian.commit_capability_answer_report(jsonb);

commit;
