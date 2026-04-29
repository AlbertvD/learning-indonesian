begin;

create schema if not exists indonesian;

create table if not exists indonesian.learning_capabilities (
  id uuid primary key default gen_random_uuid(),
  canonical_key text unique not null,
  source_kind text not null check (source_kind in ('item','pattern','dialogue_line','podcast_segment','podcast_phrase','affixed_form_pair')),
  source_ref text not null,
  capability_type text not null,
  direction text not null,
  modality text not null,
  learner_language text not null,
  projection_version text not null,
  readiness_status text not null check (readiness_status in ('ready','blocked','exposure_only','deprecated','unknown')),
  publication_status text not null check (publication_status in ('draft','published','retired')),
  source_fingerprint text,
  artifact_fingerprint text,
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learning_capabilities_source_idx
  on indonesian.learning_capabilities(source_kind, source_ref);
create index if not exists learning_capabilities_readiness_publication_idx
  on indonesian.learning_capabilities(readiness_status, publication_status);

create table if not exists indonesian.capability_aliases (
  id uuid primary key default gen_random_uuid(),
  old_canonical_key text not null,
  new_canonical_key text not null,
  new_capability_id uuid references indonesian.learning_capabilities(id),
  alias_reason text not null,
  mapping_kind text not null check (mapping_kind in ('rename','split','merge','grammar_inference','manual')),
  migration_confidence text not null check (migration_confidence in ('exact','high','medium','low','inferred','manual_required')),
  split_group_id text,
  weight numeric,
  created_at timestamptz not null default now(),
  unique(old_canonical_key, new_canonical_key, mapping_kind)
);

create table if not exists indonesian.capability_artifacts (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null references indonesian.learning_capabilities(id),
  artifact_kind text not null,
  quality_status text not null check (quality_status in ('draft','approved','blocked','deprecated')),
  artifact_ref text,
  artifact_json jsonb not null default '{}',
  artifact_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(capability_id, artifact_kind, artifact_fingerprint)
);

create table if not exists indonesian.learner_capability_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability_id uuid not null references indonesian.learning_capabilities(id),
  canonical_key_snapshot text not null,
  activation_state text not null check (activation_state in ('dormant','active','suspended','retired')),
  activation_source text check (activation_source in ('review_processor','admin_backfill','legacy_migration')),
  activation_event_id uuid,
  fsrs_state_json jsonb,
  stability double precision,
  difficulty double precision,
  next_due_at timestamptz,
  last_reviewed_at timestamptz,
  review_count integer not null default 0,
  lapse_count integer not null default 0,
  consecutive_failure_count integer not null default 0,
  state_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, capability_id)
);

create index if not exists learner_capability_state_due_idx
  on indonesian.learner_capability_state(user_id, activation_state, next_due_at);
create index if not exists learner_capability_state_capability_idx
  on indonesian.learner_capability_state(capability_id);

create table if not exists indonesian.capability_review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability_id uuid not null references indonesian.learning_capabilities(id),
  learner_capability_state_id uuid not null references indonesian.learner_capability_state(id),
  idempotency_key text not null,
  session_id text not null,
  session_item_id text not null,
  attempt_number integer not null,
  rating integer not null check (rating between 1 and 4),
  answer_report_json jsonb not null,
  scheduler_snapshot_json jsonb not null,
  state_before_json jsonb not null,
  state_after_json jsonb not null,
  artifact_version_snapshot_json jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key),
  unique(session_id, session_item_id, attempt_number)
);

create table if not exists indonesian.learner_source_progress_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_ref text not null,
  source_section_ref text not null default '__lesson__',
  event_type text not null check (event_type in ('opened','section_exposed','intro_completed','heard_once','pattern_noticing_seen','guided_practice_completed','lesson_completed')),
  occurred_at timestamptz not null,
  metadata_json jsonb not null default '{}',
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);

create table if not exists indonesian.learner_source_progress_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_ref text not null,
  source_section_ref text not null default '__lesson__',
  current_state text not null check (current_state in ('not_started','opened','section_exposed','intro_completed','heard_once','pattern_noticing_seen','guided_practice_completed','lesson_completed')),
  completed_event_types text[] not null default '{}',
  last_event_at timestamptz not null,
  metadata_json jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique(user_id, source_ref, source_section_ref)
);

alter table indonesian.learning_capabilities enable row level security;
alter table indonesian.capability_aliases enable row level security;
alter table indonesian.capability_artifacts enable row level security;
alter table indonesian.learner_capability_state enable row level security;
alter table indonesian.capability_review_events enable row level security;
alter table indonesian.learner_source_progress_events enable row level security;
alter table indonesian.learner_source_progress_state enable row level security;

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

create or replace function indonesian.record_source_progress_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = indonesian, public
as $$
declare
  v_user_id uuid;
  v_source_ref text;
  v_source_section_ref text;
  v_event_type text;
  v_occurred_at timestamptz;
  v_metadata_json jsonb;
  v_idempotency_key text;
  v_event record;
  v_state record;
begin
  if p_event is null
     or jsonb_typeof(p_event) is distinct from 'object'
     or nullif(p_event->>'userId', '') is null
     or nullif(p_event->>'sourceRef', '') is null
     or nullif(p_event->>'sourceSectionRef', '') is null
     or nullif(p_event->>'eventType', '') is null
     or nullif(p_event->>'occurredAt', '') is null
     or nullif(p_event->>'idempotencyKey', '') is null then
    raise exception 'record_source_progress_event requires userId, sourceRef, sourceSectionRef, eventType, occurredAt, and idempotencyKey';
  end if;

  v_user_id := (p_event->>'userId')::uuid;
  v_source_ref := p_event->>'sourceRef';
  v_source_section_ref := p_event->>'sourceSectionRef';
  v_event_type := p_event->>'eventType';
  v_occurred_at := (p_event->>'occurredAt')::timestamptz;
  v_metadata_json := coalesce(p_event->'metadataJson', '{}'::jsonb);
  v_idempotency_key := p_event->>'idempotencyKey';

  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from v_user_id then
    raise exception 'record_source_progress_event user mismatch';
  end if;

  if v_event_type not in ('opened','section_exposed','intro_completed','heard_once','pattern_noticing_seen','guided_practice_completed','lesson_completed') then
    raise exception 'invalid source progress event type: %', v_event_type;
  end if;

  insert into indonesian.learner_source_progress_events (
    user_id,
    source_ref,
    source_section_ref,
    event_type,
    occurred_at,
    metadata_json,
    idempotency_key
  ) values (
    v_user_id,
    v_source_ref,
    v_source_section_ref,
    v_event_type,
    v_occurred_at,
    v_metadata_json,
    v_idempotency_key
  )
  on conflict (user_id, idempotency_key) do nothing
  returning * into v_event;

  if not found then
    select *
      into v_event
      from indonesian.learner_source_progress_events
     where user_id = v_user_id
       and idempotency_key = v_idempotency_key;
  end if;

  insert into indonesian.learner_source_progress_state (
    user_id,
    source_ref,
    source_section_ref,
    current_state,
    completed_event_types,
    last_event_at,
    metadata_json,
    updated_at
  ) values (
    v_event.user_id,
    v_event.source_ref,
    v_event.source_section_ref,
    v_event.event_type,
    array[v_event.event_type],
    v_event.occurred_at,
    v_event.metadata_json,
    now()
  )
  on conflict (user_id, source_ref, source_section_ref) do update
     set current_state = case
           when (case excluded.current_state
              when 'opened' then 1
              when 'section_exposed' then 2
              when 'intro_completed' then 3
              when 'heard_once' then 4
              when 'pattern_noticing_seen' then 5
              when 'guided_practice_completed' then 6
              when 'lesson_completed' then 7
              else 0 end)
            > (case indonesian.learner_source_progress_state.current_state
              when 'opened' then 1
              when 'section_exposed' then 2
              when 'intro_completed' then 3
              when 'heard_once' then 4
              when 'pattern_noticing_seen' then 5
              when 'guided_practice_completed' then 6
              when 'lesson_completed' then 7
              else 0 end)
           then excluded.current_state
           else indonesian.learner_source_progress_state.current_state
         end,
         completed_event_types = (
           select array_agg(event_type order by event_rank)
             from (
               select distinct event_type,
                 case event_type
                   when 'opened' then 1
                   when 'section_exposed' then 2
                   when 'intro_completed' then 3
                   when 'heard_once' then 4
                   when 'pattern_noticing_seen' then 5
                   when 'guided_practice_completed' then 6
                   when 'lesson_completed' then 7
                   else 0
                 end as event_rank
               from unnest(indonesian.learner_source_progress_state.completed_event_types || excluded.completed_event_types) as event_type
             ) unioned
         ),
         last_event_at = greatest(indonesian.learner_source_progress_state.last_event_at, excluded.last_event_at),
         metadata_json = indonesian.learner_source_progress_state.metadata_json || excluded.metadata_json,
         updated_at = now()
  returning * into v_state;

  return to_jsonb(v_state);
end;
$$;

grant usage on schema indonesian to authenticated, service_role;
grant select on indonesian.learning_capabilities to authenticated;
grant select on indonesian.capability_aliases to authenticated;
grant select on indonesian.capability_artifacts to authenticated;
grant select on indonesian.learner_capability_state to authenticated;
grant select on indonesian.capability_review_events to authenticated;
grant select on indonesian.learner_source_progress_events to authenticated;
grant select on indonesian.learner_source_progress_state to authenticated;
revoke all on function indonesian.record_source_progress_event(jsonb) from public;
grant execute on function indonesian.record_source_progress_event(jsonb) to authenticated, service_role;

revoke insert, update, delete on indonesian.learner_capability_state from authenticated;
revoke insert, update, delete on indonesian.capability_review_events from authenticated;
revoke insert, update, delete on indonesian.learner_source_progress_events from authenticated;
revoke insert, update, delete on indonesian.learner_source_progress_state from authenticated;

grant all on indonesian.learning_capabilities to service_role;
grant all on indonesian.capability_aliases to service_role;
grant all on indonesian.capability_artifacts to service_role;
grant all on indonesian.learner_capability_state to service_role;
grant all on indonesian.capability_review_events to service_role;
grant all on indonesian.learner_source_progress_events to service_role;
grant all on indonesian.learner_source_progress_state to service_role;

commit;
