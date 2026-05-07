-- Rollback for 2026-05-07-drop-learner-grammar-state.sql.
-- Recreates the table verbatim from migration.sql:1046-1079 as it stood before retirement.
-- Schema only — does not restore historical row contents.

begin;

create table if not exists indonesian.learner_grammar_state (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  grammar_pattern_id    uuid not null references indonesian.grammar_patterns(id) on delete cascade,
  stage                 text not null default 'new'
                        check (stage in ('new', 'anchoring', 'retrieving', 'productive', 'maintenance')),
  stability             numeric,
  difficulty            numeric,
  due_at                timestamptz,
  last_reviewed_at      timestamptz,
  review_count          int not null default 0,
  lapse_count           int not null default 0,
  consecutive_failures  int not null default 0,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  unique (user_id, grammar_pattern_id)
);

create index if not exists idx_learner_grammar_state_due
  on indonesian.learner_grammar_state(user_id, due_at);

alter table indonesian.learner_grammar_state enable row level security;

create policy "learner_grammar_state_select" on indonesian.learner_grammar_state
  for select to authenticated using (user_id = auth.uid());

create policy "learner_grammar_state_insert" on indonesian.learner_grammar_state
  for insert to authenticated with check (user_id = auth.uid());

create policy "learner_grammar_state_update" on indonesian.learner_grammar_state
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on indonesian.learner_grammar_state to authenticated;
grant select, insert, update, delete on indonesian.learner_grammar_state to service_role;

commit;
