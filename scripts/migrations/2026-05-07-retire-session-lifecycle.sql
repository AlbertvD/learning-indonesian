-- Retirement #5 (session lifecycle module) — 2026-05-07
-- Paper-trail of the in-DB changes for retirement #5.
-- See docs/plans/2026-05-07-retire-session-lifecycle.md for context.
--
-- This file is NOT auto-applied by `make migrate` (which reads only
-- scripts/migration.sql). It exists for operator audit + reversibility.
-- The matching rollback script is 2026-05-07-retire-session-lifecycle.rollback.sql.
--
-- Re-runnable: drops are wrapped in exception handlers; the RPC re-definition
-- uses CREATE OR REPLACE; the dropped policy uses `if exists`.

-- Block A: drop the dead RLS policy.
-- learning_sessions_write granted FOR ALL to authenticated; under retirement #5
-- the GRANT narrows to SELECT only (master migration.sql:288), making the
-- INSERT/UPDATE/DELETE branches dead. SELECT continues to work via the
-- more-permissive learning_sessions_read policy (FOR SELECT TO authenticated
-- USING (true)).
drop policy if exists "learning_sessions_write" on indonesian.learning_sessions;

-- Block B: drop the cron job + finalisation function.
do $$ begin
  perform cron.unschedule('finalize-stale-sessions');
exception when others then null;
end $$;

drop function if exists indonesian.job_finalize_stale_sessions() cascade;

-- Block C: replace the commit_capability_answer_report RPC with the modified
-- body. The modification adds (1) submittedAt to both validation blocks and
-- (2) a learning_sessions UPSERT immediately before the final return. The
-- upsert materialises a session row on first answer (started_at = ended_at =
-- submittedAt) and advances ended_at = GREATEST(existing, submittedAt) on each
-- subsequent commit. session_type is hardcoded 'learning' because only the
-- capability path commits through this RPC.
create or replace function indonesian.commit_capability_answer_report(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = indonesian, public
as $$
declare
  v_user_id uuid;
  v_capability_id uuid;
  v_existing_event record;
  v_capability record;
  v_state record;
  v_state_before jsonb;
  v_state_after jsonb;
  v_review_event_id uuid;
  v_requested_state_version integer;
  v_rating integer;
  v_created_state boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'commit_capability_answer_report requires a trusted service role caller';
  end if;

  if p_command is null
     or jsonb_typeof(p_command) is distinct from 'object'
     or not (p_command ? 'userId')
     or not (p_command ? 'capabilityId')
     or not (p_command ? 'canonicalKeySnapshot')
     or not (p_command ? 'idempotencyKey')
     or not (p_command ? 'sessionId')
     or not (p_command ? 'sessionItemId')
     or not (p_command ? 'attemptNumber')
     or not (p_command ? 'rating')
     or not (p_command ? 'answerReport')
     or not (p_command ? 'schedulerSnapshot')
     or not (p_command ? 'stateBefore')
     or not (p_command ? 'stateAfter')
     or not (p_command ? 'artifactVersionSnapshot')
     or not (p_command ? 'fsrsAlgorithmVersion')
     or not (p_command ? 'submittedAt') then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  if nullif(p_command->>'userId', '') is null
     or nullif(p_command->>'capabilityId', '') is null
     or nullif(p_command->>'canonicalKeySnapshot', '') is null
     or nullif(p_command->>'idempotencyKey', '') is null
     or nullif(p_command->>'sessionId', '') is null
     or nullif(p_command->>'sessionItemId', '') is null
     or nullif(p_command->>'attemptNumber', '') is null
     or nullif(p_command->>'submittedAt', '') is null then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  if p_command->>'fsrsAlgorithmVersion' is distinct from 'ts-fsrs:language-learning-v1' then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  if p_command->>'rating' is null or (p_command->>'rating') !~ '^[1-4]$' then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  if jsonb_typeof(p_command->'answerReport') is distinct from 'object'
     or jsonb_typeof(p_command->'schedulerSnapshot') is distinct from 'object'
     or jsonb_typeof(p_command->'artifactVersionSnapshot') is distinct from 'object' then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  v_user_id := (p_command->>'userId')::uuid;
  v_capability_id := (p_command->>'capabilityId')::uuid;
  v_state_before := p_command->'stateBefore';
  v_state_after := p_command->'stateAfter';
  v_requested_state_version := nullif(p_command->>'currentStateVersion', '')::integer;
  v_rating := (p_command->>'rating')::integer;

  -- Serialize commits for the same learner/capability before idempotency
  -- lookup so concurrent first-review activation returns the committed event
  -- instead of leaking as a unique-constraint error or stale rejection.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || v_capability_id::text));

  if jsonb_typeof(v_state_before) is distinct from 'object'
     or jsonb_typeof(v_state_after) is distinct from 'object'
     or not (v_state_before ? 'stateVersion')
     or not (v_state_before ? 'activationState')
     or not (v_state_before ? 'reviewCount')
     or not (v_state_before ? 'lapseCount')
     or not (v_state_before ? 'consecutiveFailureCount')
     or not (v_state_after ? 'stateVersion')
     or not (v_state_after ? 'activationState')
     or not (v_state_after ? 'reviewCount')
     or not (v_state_after ? 'lapseCount')
     or not (v_state_after ? 'consecutiveFailureCount')
     or not (v_state_after ? 'stability')
     or not (v_state_after ? 'difficulty')
     or not (v_state_after ? 'nextDueAt')
     or not (v_state_after ? 'lastReviewedAt') then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  select id, state_after_json
    into v_existing_event
    from indonesian.capability_review_events
   where user_id = v_user_id
     and idempotency_key = p_command->>'idempotencyKey'
   limit 1;

  if found then
    return jsonb_build_object(
      'idempotencyStatus', 'duplicate_returned',
      'reviewEventId', v_existing_event.id,
      'schedule', v_existing_event.state_after_json,
      'masteryRefreshQueued', false
    );
  end if;

  select *
    into v_capability
    from indonesian.learning_capabilities
   where id = v_capability_id;

  if not found
     or v_capability.canonical_key is distinct from p_command->>'canonicalKeySnapshot'
     or v_capability.readiness_status is distinct from 'ready'
     or v_capability.publication_status is distinct from 'published' then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  select *
    into v_state
    from indonesian.learner_capability_state
   where user_id = v_user_id
     and capability_id = v_capability_id
   for update;

  if not found then
    if not (p_command ? 'activationRequest')
       or v_requested_state_version is distinct from 0
       or (v_state_before->>'stateVersion')::integer is distinct from 0
       or v_state_before->>'activationState' is distinct from 'dormant'
       or (v_state_before->>'reviewCount')::integer is distinct from 0
       or (v_state_before->>'lapseCount')::integer is distinct from 0
       or (v_state_before->>'consecutiveFailureCount')::integer is distinct from 0
       or nullif(v_state_before->>'stability', '') is not null
       or nullif(v_state_before->>'difficulty', '') is not null then
      return jsonb_build_object(
        'idempotencyStatus', 'rejected_stale',
        'reviewEventId', null,
        'schedule', p_command->'schedulerSnapshot',
        'masteryRefreshQueued', false
      );
    end if;
    v_created_state := true;
  end if;

  if not v_created_state then
    if v_state.activation_state in ('suspended', 'retired') then
      return jsonb_build_object(
        'idempotencyStatus', 'rejected_invalid_outcome',
        'reviewEventId', null,
        'schedule', p_command->'schedulerSnapshot',
        'masteryRefreshQueued', false
      );
    end if;

    if v_requested_state_version is distinct from v_state.state_version
       or (v_state_before->>'stateVersion')::integer is distinct from v_state.state_version
       or v_state_before->>'activationState' is distinct from v_state.activation_state
       or (v_state_before->>'reviewCount')::integer is distinct from v_state.review_count
       or (v_state_before->>'lapseCount')::integer is distinct from v_state.lapse_count
       or (v_state_before->>'consecutiveFailureCount')::integer is distinct from v_state.consecutive_failure_count
       or nullif(v_state_before->>'stability', '')::double precision is distinct from v_state.stability
       or nullif(v_state_before->>'difficulty', '')::double precision is distinct from v_state.difficulty then
      return jsonb_build_object(
        'idempotencyStatus', 'rejected_stale',
        'reviewEventId', null,
        'schedule', p_command->'schedulerSnapshot',
        'masteryRefreshQueued', false
      );
    end if;
  end if;

  if (v_state_after->>'stateVersion')::integer is distinct from coalesce(v_state.state_version, 0) + 1
     or v_state_after->>'activationState' is distinct from 'active'
     or coalesce(v_state_after->>'activationSource', 'review_processor') not in ('review_processor', 'admin_backfill', 'legacy_migration')
     or (v_state_after->>'reviewCount')::integer is distinct from coalesce(v_state.review_count, 0) + 1
     or (v_state_after->>'lapseCount')::integer is distinct from coalesce(v_state.lapse_count, 0) + (case when v_rating = 1 and coalesce(v_state.review_count, 0) > 0 then 1 else 0 end)
     or (v_state_after->>'consecutiveFailureCount')::integer is distinct from (case when v_rating = 1 then coalesce(v_state.consecutive_failure_count, 0) + 1 else 0 end)
     or nullif(v_state_after->>'stability', '') is null
     or nullif(v_state_after->>'difficulty', '') is null
     or nullif(v_state_after->>'nextDueAt', '') is null
     or nullif(v_state_after->>'lastReviewedAt', '') is null then
    return jsonb_build_object(
      'idempotencyStatus', 'rejected_invalid_outcome',
      'reviewEventId', null,
      'schedule', p_command->'schedulerSnapshot',
      'masteryRefreshQueued', false
    );
  end if;

  if v_created_state then
    insert into indonesian.learner_capability_state (
      user_id,
      capability_id,
      canonical_key_snapshot,
      activation_state,
      activation_source,
      fsrs_state_json,
      review_count,
      lapse_count,
      consecutive_failure_count,
      state_version
    ) values (
      v_user_id,
      v_capability_id,
      p_command->>'canonicalKeySnapshot',
      'active',
      'review_processor',
      '{}',
      0,
      0,
      0,
      0
    )
    returning * into v_state;
  end if;

  insert into indonesian.capability_review_events (
    user_id,
    capability_id,
    learner_capability_state_id,
    idempotency_key,
    session_id,
    session_item_id,
    attempt_number,
    rating,
    answer_report_json,
    scheduler_snapshot_json,
    state_before_json,
    state_after_json,
    artifact_version_snapshot_json
  ) values (
    v_user_id,
    v_capability_id,
    v_state.id,
    p_command->>'idempotencyKey',
    p_command->>'sessionId',
    p_command->>'sessionItemId',
    (p_command->>'attemptNumber')::integer,
    v_rating,
    p_command->'answerReport',
    p_command->'schedulerSnapshot',
    v_state_before,
    v_state_after,
    p_command->'artifactVersionSnapshot'
  )
  returning id into v_review_event_id;

  update indonesian.learner_capability_state
     set activation_state = v_state_after->>'activationState',
         activation_source = coalesce(activation_source, v_state_after->>'activationSource', 'review_processor'),
         fsrs_state_json = v_state_after,
         stability = nullif(v_state_after->>'stability', '')::double precision,
         difficulty = nullif(v_state_after->>'difficulty', '')::double precision,
         next_due_at = nullif(v_state_after->>'nextDueAt', '')::timestamptz,
         last_reviewed_at = nullif(v_state_after->>'lastReviewedAt', '')::timestamptz,
         review_count = (v_state_after->>'reviewCount')::integer,
         lapse_count = (v_state_after->>'lapseCount')::integer,
         consecutive_failure_count = (v_state_after->>'consecutiveFailureCount')::integer,
         state_version = (v_state_after->>'stateVersion')::integer,
         updated_at = now()
   where id = v_state.id;

  -- Retirement #5 (2026-05-07): derive learning_sessions row from the answer log.
  -- First answer materialises the row; subsequent answers advance ended_at.
  -- session_type hardcoded 'learning' because only the capability path commits
  -- through this RPC (Lesson + Podcast paths produce no answers, no session).
  insert into indonesian.learning_sessions (id, user_id, session_type, started_at, ended_at)
  values (
    (p_command->>'sessionId')::uuid,
    v_user_id,
    'learning',
    (p_command->>'submittedAt')::timestamptz,
    (p_command->>'submittedAt')::timestamptz
  )
  on conflict (id) do update
     set ended_at = greatest(
       indonesian.learning_sessions.ended_at,
       excluded.ended_at
     );

  return jsonb_build_object(
    'idempotencyStatus', 'committed',
    'reviewEventId', v_review_event_id,
    'activatedCapabilityStateId', v_state.id,
    'schedule', v_state_after,
    'masteryRefreshQueued', true
  );
end;
$$;

revoke all on function indonesian.commit_capability_answer_report(jsonb) from public;
revoke all on function indonesian.commit_capability_answer_report(jsonb) from authenticated;
grant execute on function indonesian.commit_capability_answer_report(jsonb) to service_role;

-- Note: the GRANT narrowing on indonesian.learning_sessions
-- (from SELECT/INSERT/UPDATE/DELETE to SELECT only) lives in the master
-- migration.sql:288 and is applied automatically on the next `make migrate`.
-- It is not duplicated here because the GRANT statement is idempotent and
-- self-contained in the master file.
