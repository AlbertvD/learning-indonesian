-- 2026-05-07 — Retirement #6 forward migration (paper-trail)
--
-- Applied via `psql -f` against the live homelab DB BEFORE the new client
-- deploys. Adds new objects + backfills + the lesson_id column. Does NOT drop
-- any source-progress objects — old client continues to read learner_source_progress_*
-- tables and call record_source_progress_event RPC throughout this stage.
--
-- After the new client deploys, run cleanup.sql (or `make migrate` which mirrors
-- the same content via the master retirement-#6 section).
--
-- Idempotent. Safe to re-run (every CREATE uses IF NOT EXISTS or OR REPLACE;
-- both INSERTs use ON CONFLICT DO NOTHING; the UPDATE has a WHERE … IS NULL guard).
--
-- See docs/plans/2026-05-07-retire-source-progress.md for the spec.

begin;

-- 1. NEW TABLE: learner_lesson_activation
create table if not exists indonesian.learner_lesson_activation (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  lesson_id    uuid        not null references indonesian.lessons(id) on delete cascade,
  activated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists learner_lesson_activation_user_idx
  on indonesian.learner_lesson_activation(user_id);

alter table indonesian.learner_lesson_activation enable row level security;

drop policy if exists "lesson activation owner read" on indonesian.learner_lesson_activation;
create policy "lesson activation owner read"
  on indonesian.learner_lesson_activation for select
  to authenticated
  using (user_id = auth.uid());

grant select on indonesian.learner_lesson_activation to authenticated;
revoke insert, update, delete on indonesian.learner_lesson_activation from authenticated;
grant all on indonesian.learner_lesson_activation to service_role;

-- 2. NEW RPC: set_lesson_activation
create or replace function indonesian.set_lesson_activation(
  p_user_id   uuid,
  p_lesson_id uuid,
  p_activated boolean
)
returns void
language plpgsql
security definer
set search_path = indonesian, public
as $$
begin
  if p_user_id is null or p_lesson_id is null or p_activated is null then
    raise exception 'set_lesson_activation requires p_user_id, p_lesson_id, p_activated';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'set_lesson_activation user mismatch';
  end if;

  if not exists (select 1 from indonesian.lessons where id = p_lesson_id) then
    raise exception 'set_lesson_activation lesson not found: %', p_lesson_id;
  end if;

  if p_activated then
    insert into indonesian.learner_lesson_activation (user_id, lesson_id)
    values (p_user_id, p_lesson_id)
    on conflict (user_id, lesson_id) do nothing;
  else
    delete from indonesian.learner_lesson_activation
    where user_id = p_user_id and lesson_id = p_lesson_id;
  end if;
end;
$$;

revoke all on function indonesian.set_lesson_activation(uuid, uuid, boolean) from public;
grant execute on function indonesian.set_lesson_activation(uuid, uuid, boolean) to authenticated, service_role;

-- 3. NEW COLUMN: learning_capabilities.lesson_id (with backfill)
alter table indonesian.learning_capabilities
  add column if not exists lesson_id uuid references indonesian.lessons(id) on delete set null;

create index if not exists learning_capabilities_lesson_idx
  on indonesian.learning_capabilities(lesson_id) where lesson_id is not null;

-- Backfill from page-block adjacency.
update indonesian.learning_capabilities c
set lesson_id = sub.lesson_id
from (
  select distinct on (cap_key)
    unnest(pb.capability_key_refs) as cap_key,
    l.id as lesson_id
  from indonesian.lesson_page_blocks pb
  join indonesian.lessons l on pb.source_ref = 'lesson-' || l.order_index
  where array_length(pb.capability_key_refs, 1) > 0
  order by cap_key, l.order_index
) sub
where c.canonical_key = sub.cap_key
  and c.lesson_id is null;

-- 4. BACKFILL Step 1: auto-activate legacy lessons (1, 2, 3) for every existing user.
insert into indonesian.learner_lesson_activation (user_id, lesson_id, activated_at)
select u.id, l.id, now()
from auth.users u
cross join indonesian.lessons l
where l.order_index in (1, 2, 3)
on conflict (user_id, lesson_id) do nothing;

-- 5. BACKFILL Step 2: promote legacy lesson_progress rows to activation.
insert into indonesian.learner_lesson_activation (user_id, lesson_id, activated_at)
select lp.user_id, lp.lesson_id, coalesce(lp.completed_at, now())
from indonesian.lesson_progress lp
on conflict (user_id, lesson_id) do nothing;

commit;
