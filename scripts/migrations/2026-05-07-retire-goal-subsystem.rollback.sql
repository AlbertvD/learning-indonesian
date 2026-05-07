-- 2026-05-07 — Retirement #4 ROLLBACK (best-effort schema restore)
--
-- Restores tables, indexes, RLS, policies, grants, functions, and cron
-- schedules to the pre-retirement state. Data is unrecoverable from this
-- script alone — restore from a Postgres snapshot if user goal data must
-- be preserved.
--
-- Spec: docs/plans/2026-05-07-retire-goal-subsystem.md
-- Forward migration: scripts/migrations/2026-05-07-retire-goal-subsystem.sql
--                  + scripts/migration.sql (retirement section at EOF)

-- 1. Recreate tables (idempotent via if not exists).

create table if not exists indonesian.learner_weekly_goal_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_timezone text not null,
  week_start_date_local date not null,
  week_end_date_local date not null,
  week_starts_at_utc timestamptz not null,
  week_ends_at_utc timestamptz not null,
  generation_strategy_version text default 'v1',
  generated_at timestamptz default now(),
  closing_overdue_count integer,
  closed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, week_starts_at_utc)
);

create table if not exists indonesian.learner_weekly_goals (
  id uuid primary key default gen_random_uuid(),
  goal_set_id uuid not null references indonesian.learner_weekly_goal_sets(id) on delete cascade,
  goal_type text not null check (goal_type in ('consistency', 'recall_quality', 'usable_vocabulary', 'review_health')),
  goal_direction text not null check (goal_direction in ('at_least', 'at_most')),
  goal_unit text not null check (goal_unit in ('count', 'percent')),
  target_value_numeric numeric not null,
  current_value_numeric numeric default 0,
  status text not null default 'on_track' check (status in ('on_track', 'at_risk', 'achieved', 'missed')),
  is_provisional boolean default false,
  provisional_reason text,
  sample_size integer default 0,
  goal_config_jsonb jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(goal_set_id, goal_type)
);

create table if not exists indonesian.learner_stage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  learning_item_id uuid not null references indonesian.learning_items(id) on delete cascade,
  from_stage text not null check (from_stage in ('new', 'anchoring', 'retrieving', 'productive', 'maintenance')),
  to_stage text not null check (to_stage in ('new', 'anchoring', 'retrieving', 'productive', 'maintenance')),
  source_review_event_id uuid unique,
  created_at timestamptz default now()
);

create table if not exists indonesian.learner_daily_goal_rollups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_timezone text not null,
  local_date date not null,
  study_day_completed boolean default false,
  recall_accuracy numeric,
  recall_sample_size integer default 0,
  usable_items_gained_today integer default 0,
  usable_items_total integer default 0,
  overdue_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, local_date)
);

create table if not exists indonesian.learner_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'goal_generated', 'goal_viewed', 'daily_plan_viewed',
    'session_started_from_today', 'goal_achieved', 'goal_missed',
    'session_summary_viewed'
  )),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid,
  goal_type text check (goal_type in ('consistency', 'recall_quality', 'usable_vocabulary', 'review_health')),
  session_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- 2. Indexes.
create index if not exists idx_weekly_goal_sets_user_week on indonesian.learner_weekly_goal_sets(user_id, week_starts_at_utc);
create index if not exists idx_weekly_goal_sets_finalization on indonesian.learner_weekly_goal_sets(user_id, closed_at, week_ends_at_utc);
create index if not exists idx_stage_events_user_time on indonesian.learner_stage_events(user_id, created_at);
create index if not exists idx_stage_events_to_stage on indonesian.learner_stage_events(user_id, to_stage, created_at);
create index if not exists idx_daily_rollups_user_date on indonesian.learner_daily_goal_rollups(user_id, local_date);
create index if not exists learner_analytics_events_user_id_idx on indonesian.learner_analytics_events(user_id);
create index if not exists learner_analytics_events_event_type_idx on indonesian.learner_analytics_events(event_type);
create index if not exists learner_analytics_events_created_at_idx on indonesian.learner_analytics_events(created_at);

-- 3. RLS + policies.
alter table indonesian.learner_weekly_goal_sets enable row level security;
alter table indonesian.learner_weekly_goals enable row level security;
alter table indonesian.learner_stage_events enable row level security;
alter table indonesian.learner_daily_goal_rollups enable row level security;
alter table indonesian.learner_analytics_events enable row level security;

create policy "learner_weekly_goal_sets_owner" on indonesian.learner_weekly_goal_sets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "learner_weekly_goals_via_goal_set" on indonesian.learner_weekly_goals for all to authenticated
  using (exists (select 1 from indonesian.learner_weekly_goal_sets where id = goal_set_id and user_id = auth.uid()))
  with check (exists (select 1 from indonesian.learner_weekly_goal_sets where id = goal_set_id and user_id = auth.uid()));
create policy "learner_stage_events_owner" on indonesian.learner_stage_events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "learner_daily_goal_rollups_owner" on indonesian.learner_daily_goal_rollups for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy learner_analytics_events_own on indonesian.learner_analytics_events for select to authenticated
  using (auth.uid() = user_id or exists (select 1 from indonesian.user_roles where user_id = auth.uid() and role = 'admin'));
create policy learner_analytics_events_insert on indonesian.learner_analytics_events for insert to authenticated
  with check (user_id = auth.uid());

-- 4. Grants.
grant select, insert, update on indonesian.learner_weekly_goal_sets to authenticated;
grant select, insert, update on indonesian.learner_weekly_goals to authenticated;
grant select, insert on indonesian.learner_stage_events to authenticated;
grant select, insert, update on indonesian.learner_daily_goal_rollups to authenticated;
grant select, insert on indonesian.learner_analytics_events to authenticated;

-- 5. Functions and cron schedules.
-- NOTE: function bodies are restored from the original migration.sql at the
-- pre-retirement HEAD. Operators rolling back can copy them from git history:
--   git show <pre-retirement-sha>:scripts/migration.sql | sed -n '526,718p'
-- For safety, this rollback intentionally STOPS at table/RLS/grant restoration.
-- Cron jobs and function bodies are restored manually via the snapshot path.
-- This avoids embedding ~200 lines of plpgsql here that may diverge from the
-- repo over time.
