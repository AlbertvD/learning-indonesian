-- capabilityContentService — resolution-failure event log + aggregated view.
-- See docs/plans/2026-05-02-capability-content-service-spec.md §9.
--
-- Failures from runtime block resolution land here as append-only events
-- (one row per failure occurrence). The capability_resolution_issues view
-- aggregates events by (capability_id, reason_code) for the admin dashboard.
--
-- Reason codes are validated client-side via the TS ResolutionReasonCode union
-- (src/services/capabilityContentService.ts) — no SQL CHECK constraint, so
-- adding new codes requires only a TS change. Mirrors review_events.exercise_type.

begin;

create table if not exists indonesian.capability_resolution_failure_events (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null references indonesian.learning_capabilities(id) on delete cascade,
  capability_key text not null,
  reason_code text not null,
  exercise_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  block_id text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_crfe_capability_reason
  on indonesian.capability_resolution_failure_events (capability_id, reason_code);

create index if not exists idx_crfe_created_at
  on indonesian.capability_resolution_failure_events (created_at desc);

alter table indonesian.capability_resolution_failure_events enable row level security;

-- Authenticated users can insert their own failures (write-only on the user side).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'indonesian'
      and tablename = 'capability_resolution_failure_events'
      and policyname = 'crfe_insert_own'
  ) then
    create policy crfe_insert_own on indonesian.capability_resolution_failure_events
      for insert to authenticated with check (user_id = auth.uid());
  end if;
end $$;

-- Admin can read.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'indonesian'
      and tablename = 'capability_resolution_failure_events'
      and policyname = 'crfe_admin_read'
  ) then
    create policy crfe_admin_read on indonesian.capability_resolution_failure_events
      for select to authenticated using (
        exists (
          select 1 from indonesian.user_roles
          where user_id = auth.uid() and role = 'admin'
        )
      );
  end if;
end $$;

grant select, insert on indonesian.capability_resolution_failure_events to authenticated;
grant all on indonesian.capability_resolution_failure_events to service_role;

-- Aggregated view. WITH (security_invoker = true) is REQUIRED so the table's
-- RLS policy applies to the querying user. Without it the view runs in the
-- owner's RLS context and bypasses crfe_admin_read, exposing aggregated
-- diagnostics to all authenticated users.
create or replace view indonesian.capability_resolution_issues
with (security_invoker = true) as
select
  capability_id,
  capability_key,
  reason_code,
  exercise_type,
  count(*)            as occurrence_count,
  min(created_at)     as first_seen_at,
  max(created_at)     as last_seen_at,
  (array_agg(user_id    order by created_at desc))[1] as last_user_id,
  (array_agg(session_id order by created_at desc))[1] as last_session_id
from indonesian.capability_resolution_failure_events
group by capability_id, capability_key, reason_code, exercise_type;

grant select on indonesian.capability_resolution_issues to authenticated;

-- PostgREST schema reload so the new table + view become addressable.
notify pgrst, 'reload schema';

commit;
