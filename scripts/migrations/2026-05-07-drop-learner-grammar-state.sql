-- Retire learner_grammar_state subsystem (target-architecture.md §#5).
-- Paper-trail rollout. The master scripts/migration.sql carries the same
-- drop and is what `make migrate` actually applies. This file exists for
-- operator audit and as a self-contained psql -f rollout if ever needed.

begin;

drop policy if exists "learner_grammar_state_select" on indonesian.learner_grammar_state;
drop policy if exists "learner_grammar_state_insert" on indonesian.learner_grammar_state;
drop policy if exists "learner_grammar_state_update" on indonesian.learner_grammar_state;
revoke all on indonesian.learner_grammar_state from authenticated, service_role;
drop index if exists indonesian.idx_learner_grammar_state_due;
drop table if exists indonesian.learner_grammar_state cascade;

commit;
