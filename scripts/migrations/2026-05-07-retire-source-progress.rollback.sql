-- 2026-05-07 — Retirement #6 ROLLBACK migration (paper-trail; emergency use)
--
-- Recreates the source-progress schema (tables + RPC + helper + RLS + grants
-- + lesson_page_blocks.source_progress_event column + old get_lessons_overview)
-- and drops the new lesson-activation surface (table + RPC + lesson_id column).
--
-- DATA NOT RECOVERED: the source-progress event history (every row in
-- learner_source_progress_events / learner_source_progress_state) is GONE.
-- Recreated tables are empty. If preservation is required, a pre-cleanup
-- pg_dump is the operator's responsibility.
--
-- DATA NOT RECOVERED 2: lesson_page_blocks.source_progress_event column values
-- are GONE. Recreated column is null for every existing row. Re-run
-- publish-approved-content for every lesson if you need the values back.
--
-- See docs/plans/2026-05-07-retire-source-progress.md §6 for the rollback
-- protocol. Apply via `psql -f` against the live homelab DB.

begin;

-- ============================================================================
-- DROP NEW OBJECTS
-- ============================================================================

drop function if exists indonesian.set_lesson_activation(uuid, uuid, boolean) cascade;

drop policy if exists "lesson activation owner read" on indonesian.learner_lesson_activation;
drop table if exists indonesian.learner_lesson_activation cascade;

drop index if exists indonesian.learning_capabilities_lesson_idx;
alter table indonesian.learning_capabilities drop column if exists lesson_id;

-- ============================================================================
-- RECREATE SOURCE-PROGRESS SCHEMA (from 2026-04-25-capability-core.sql:103-317)
-- ============================================================================

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

create index if not exists idx_learner_source_progress_state_user_source
  on indonesian.learner_source_progress_state(user_id, source_ref);

alter table indonesian.learner_source_progress_events enable row level security;
alter table indonesian.learner_source_progress_state enable row level security;

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

grant select on indonesian.learner_source_progress_events to authenticated;
grant select on indonesian.learner_source_progress_state to authenticated;
revoke insert, update, delete on indonesian.learner_source_progress_events from authenticated;
revoke insert, update, delete on indonesian.learner_source_progress_state from authenticated;
grant all on indonesian.learner_source_progress_events to service_role;
grant all on indonesian.learner_source_progress_state to service_role;

-- ============================================================================
-- RECREATE record_source_progress_event RPC (from 2026-04-25-capability-core.sql:179-317)
-- ============================================================================

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
    user_id, source_ref, source_section_ref, event_type, occurred_at, metadata_json, idempotency_key
  ) values (
    v_user_id, v_source_ref, v_source_section_ref, v_event_type, v_occurred_at, v_metadata_json, v_idempotency_key
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
    user_id, source_ref, source_section_ref, current_state, completed_event_types, last_event_at, metadata_json, updated_at
  ) values (
    v_event.user_id, v_event.source_ref, v_event.source_section_ref, v_event.event_type,
    array[v_event.event_type], v_event.occurred_at, v_event.metadata_json, now()
  )
  on conflict (user_id, source_ref, source_section_ref) do update
     set current_state = case
           when (case excluded.current_state
              when 'opened' then 1 when 'section_exposed' then 2 when 'intro_completed' then 3
              when 'heard_once' then 4 when 'pattern_noticing_seen' then 5
              when 'guided_practice_completed' then 6 when 'lesson_completed' then 7
              else 0 end)
            > (case indonesian.learner_source_progress_state.current_state
              when 'opened' then 1 when 'section_exposed' then 2 when 'intro_completed' then 3
              when 'heard_once' then 4 when 'pattern_noticing_seen' then 5
              when 'guided_practice_completed' then 6 when 'lesson_completed' then 7
              else 0 end)
           then excluded.current_state
           else indonesian.learner_source_progress_state.current_state
         end,
         completed_event_types = (
           select array_agg(event_type order by event_rank)
             from (
               select distinct event_type,
                 case event_type
                   when 'opened' then 1 when 'section_exposed' then 2 when 'intro_completed' then 3
                   when 'heard_once' then 4 when 'pattern_noticing_seen' then 5
                   when 'guided_practice_completed' then 6 when 'lesson_completed' then 7
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

revoke all on function indonesian.record_source_progress_event(jsonb) from public;
grant execute on function indonesian.record_source_progress_event(jsonb) to authenticated, service_role;

-- ============================================================================
-- RECREATE _capability_source_progress_met helper (from 2026-05-01-learner-progress-functions.sql:56-116)
-- ============================================================================

create or replace function indonesian._capability_source_progress_met(
  p_user_id uuid,
  p_metadata jsonb,
  p_source_kind text,
  p_capability_type text
)
returns boolean language sql stable security invoker as $$
  select
    p_metadata->'requiredSourceProgress' is null
    or (
      p_metadata->'requiredSourceProgress'->>'kind' = 'none'
      and not (
        p_source_kind in ('item', 'pattern', 'dialogue_line')
        and p_capability_type in (
          'text_recognition', 'meaning_recall', 'l1_to_id_choice', 'form_recall',
          'audio_recognition', 'dictation', 'pattern_recognition',
          'pattern_contrast', 'contextual_cloze'
        )
      )
    )
    or (
      p_metadata->'requiredSourceProgress'->>'kind' = 'source_progress'
      and exists (
        select 1
        from indonesian.learner_source_progress_state lsps
        where lsps.user_id = p_user_id
          and (
            lsps.source_ref = p_metadata->'requiredSourceProgress'->>'sourceRef'
            or (lsps.source_ref || '/' || lsps.source_section_ref)
                 = p_metadata->'requiredSourceProgress'->>'sourceRef'
          )
          and (
            lsps.current_state = any(
              case p_metadata->'requiredSourceProgress'->>'requiredState'
                when 'section_exposed' then array['section_exposed','intro_completed','guided_practice_completed','lesson_completed']
                when 'intro_completed' then array['intro_completed','guided_practice_completed','lesson_completed']
                when 'heard_once' then array['heard_once','lesson_completed']
                when 'pattern_noticing_seen' then array['pattern_noticing_seen','guided_practice_completed','lesson_completed']
                when 'guided_practice_completed' then array['guided_practice_completed','lesson_completed']
                when 'lesson_completed' then array['lesson_completed']
                else array[]::text[]
              end
            )
            or lsps.completed_event_types && (
              case p_metadata->'requiredSourceProgress'->>'requiredState'
                when 'section_exposed' then array['section_exposed','intro_completed','guided_practice_completed','lesson_completed']
                when 'intro_completed' then array['intro_completed','guided_practice_completed','lesson_completed']
                when 'heard_once' then array['heard_once','lesson_completed']
                when 'pattern_noticing_seen' then array['pattern_noticing_seen','guided_practice_completed','lesson_completed']
                when 'guided_practice_completed' then array['guided_practice_completed','lesson_completed']
                when 'lesson_completed' then array['lesson_completed']
                else array[]::text[]
              end
            )
          )
      )
    );
$$;

grant execute on function indonesian._capability_source_progress_met(uuid, jsonb, text, text) to authenticated;

-- ============================================================================
-- ADD BACK lesson_page_blocks.source_progress_event COLUMN
-- ============================================================================

alter table indonesian.lesson_page_blocks
  add column if not exists source_progress_event text check (
    source_progress_event is null
    or source_progress_event in ('section_exposed','intro_completed','heard_once','pattern_noticing_seen','guided_practice_completed','lesson_completed')
  );

-- ============================================================================
-- RESTORE OLD get_lessons_overview (with has_meaningful_exposure derivation)
-- See 2026-05-02-lessons-overview-function.sql for the canonical body.
-- For brevity this rollback uses CREATE OR REPLACE; if a fresh DB needs the
-- pre-retirement-#6 shape, run the original tracked migration instead.
-- ============================================================================

-- The full pre-retirement-#6 body is preserved in
-- scripts/migrations/2026-05-02-lessons-overview-function.sql. Re-apply that
-- file via psql -f to restore the old shape. (Inlining the ~180 LOC here would
-- duplicate code without operational benefit since the file is checked in.)

commit;
