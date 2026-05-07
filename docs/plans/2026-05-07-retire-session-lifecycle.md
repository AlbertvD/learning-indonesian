# Retirement #5 — Session lifecycle module

**Branch:** `retire/session-lifecycle`
**Spec date:** 2026-05-07
**Parent doc:** `docs/target-architecture.md` §1108 ("Code flagged for deletion") item #3 + §1371 (migration order step 4)
**Cumulative LOC across retirements 1-5:** ~265 + ~450 + ~341 + ~3400 + ~221 (this PR) ≈ ~4677 LOC delete + DB objects (full breakdown in §10).

---

## 1. Why

The target architecture (§377, §167, §1191) declares: *"There is no explicit session lifecycle. The `learning_sessions` row is a derived view of the answer log; the commit edge function upserts it (insert if absent, update `end_time = MAX(existing, NEW answer.created_at)` on every commit)."*

Today's implementation runs in the opposite direction:

- `src/lib/session.ts:15-67` — `startSession()` does PostgREST `INSERT INTO learning_sessions` from the browser, plus an N-row stale-session sweep (lines 19-56) that finalizes any in-flight rows older than 1 h.
- `src/lib/session.ts:69-79` — `endSession()` does PostgREST `UPDATE learning_sessions SET ended_at = now()`.
- `src/lib/session.ts:88-110` — `endSessionBeacon()` keepalive `PATCH` on `pagehide`.
- `src/lib/useSessionBeacon.ts:15-30` — wires `pagehide` + `visibilitychange` listeners that call `endSessionBeacon`.
- `scripts/migration.sql:1100-1140` — `indonesian.job_finalize_stale_sessions()` plus the `'finalize-stale-sessions'` `pg_cron` job (`'25 * * * *'`) is a server-side safety net for sessions whose tabs died before any beacon flushed.

The state-of-the-art under the target arch is dramatically simpler: each browser session mints a `sessionId` UUID client-side, no DB write happens at session start, and the commit RPC's first answer materialises the `learning_sessions` row. Subsequent answers update `ended_at` monotonically. No beacon, no stale-session sweep, no `endSession()` round-trip.

---

## 2. Doc-claim verification (independent grep, never trust the doc)

Per the playbook from retirements #1-#4 (every prior retirement found 1-7 disproven claims): full grep of every flagged symbol against the live tree.

### 2.1 Symbols flagged in target-architecture.md §1189-1213

| Doc symbol | Reality at HEAD `9bdc8e2` | Verdict |
|---|---|---|
| `src/lib/session.ts:startSession` | Defined at session.ts:15. Imported in 3 pages: Session.tsx:23, Lesson.tsx:21, Podcast.tsx:14. | ✅ Confirmed; doc undercounted callers (see 2.2) |
| `src/lib/session.ts:endSession` | Defined at session.ts:69. Imported in same 3 pages: Session.tsx:23, Lesson.tsx:21, Podcast.tsx:14. | ✅ Confirmed; same |
| `src/lib/session.ts:endSessionBeacon` | Defined at session.ts:88. Sole consumer is `useSessionBeacon.ts:2,18`. | ✅ Confirmed |
| `src/lib/useSessionBeacon.ts` | Defined at useSessionBeacon.ts:15. Imported in same 3 pages: Session.tsx:24, Lesson.tsx:22, Podcast.tsx:15. | ✅ Confirmed; **doc said "largely retires" — actually retires 100% under bundled scope** |
| `indonesian.job_finalize_stale_sessions` | Defined at migration.sql:1100. Cron-scheduled at migration.sql:1139 (`'25 * * * *'`). Zero non-cron callers. | ✅ Confirmed |

### 2.2 Disproven / under-specified doc claims

The target arch §1189-1213 framed retirement #5 entirely around the buildSession path. Independent grep proves five gaps:

**(a) Three caller pages, not one.** Doc framing assumes "Each call to `buildSession` represents a new session boundary; the *first answer* tagged with that boundary materialises a row." Reality: `startSession` is called by three top-level routes:

```
src/pages/Session.tsx:23,96,164    → session_type='learning' (capability path; the answer-log path the doc envisioned)
src/pages/Lesson.tsx:21,110,156    → session_type='lesson'   (no answer log; pure read time)
src/pages/Podcast.tsx:14,39,55     → session_type='podcast'  (no answer log; pure listen time)
```

Lesson and Podcast pages do not call `buildSession`, do not commit `capability_review_events`, and have no answer log. Under the target arch as written, *they cannot materialise session rows the new way*.

**(b) Edge function does not write the DB; the RPC does.** Doc §1039 says "the commit edge function… upserts `learning_sessions`". Reality: `supabase/functions/commit-capability-answer-report/index.ts:323` delegates the actual DB write to the Postgres RPC `indonesian.commit_capability_answer_report` (defined at `scripts/migrations/2026-04-25-capability-review-rpc.sql:3`). The RPC is the only writer of `capability_review_events`. The natural place for the new `learning_sessions` upsert is **inside the RPC**, not the TS edge function. This is also where the `service_role` JWT context lives (`raise exception 'commit_capability_answer_report requires a trusted service role caller'` at line 22), so RLS doesn't fight us.

**(c) `capability_review_events.session_id` is `text not null` with no FK.** Defined at `scripts/migrations/2026-04-25-capability-review-rpc.sql` referencing the table created at `2026-04-25-capability-core.sql:89`. There is no FK from `capability_review_events.session_id` to `learning_sessions.id`. Wire format is therefore unblocked: events can be written before any `learning_sessions` row exists, and the upsert can fire in the same RPC transaction without dependency ordering. Doc never mentioned this — useful invariant to record.

**(d) Test surgery: `src/__tests__/Lesson.test.tsx:36-44` mocks all four exports.** The mocks just stub the functions; they do not assert on calls. Mock-removal is mechanical alongside the import removal in `Lesson.tsx`. No `Session.test.tsx` or `Podcast.test.tsx` exists. The doc never enumerated test surgery.

**(e) Leaderboard view semantic shift.** `scripts/migration.sql:244-262` defines `indonesian.leaderboard` with two metrics that consume `learning_sessions`:

```sql
COALESCE(SUM(ls.duration_seconds) FILTER (WHERE ls.duration_seconds IS NOT NULL), 0) AS total_seconds_spent,
COUNT(DISTINCT DATE(ls.started_at)) FILTER (
  WHERE ls.duration_seconds IS NOT NULL OR ls.started_at > now() - interval '2 hours'
) AS days_active
```

Both are surfaced on `Leaderboard.tsx:118,121` (Tabs `total_seconds_spent` and `days_active`). Under retirement #5 (and the target arch), Lesson reading and Podcast listening no longer create `learning_sessions` rows. Their time stops counting toward `total_seconds_spent`; their dates stop counting toward `days_active`. **This is the explicit product intent of the streak-only motivation lock-in (target arch §1112-1116, retirement #4): only answer-emitting study counts.** Historical rows of `session_type IN ('lesson','podcast','practice')` stay in the DB, so backwards-looking values do not reset. Spec must call this out explicitly.

**(f) Additional duration-shift consequence: one-answer sessions now have `duration_seconds = 0`.** Under the new upsert (§3.5), the FIRST answer sets `started_at = ended_at = submittedAt`. Subsequent answers update only `ended_at`. Result: any session with exactly one answer has `duration_seconds = 0` (the generated column at `migration.sql:214`). Today, the same session has either the cron-finalised `started_at + 1h cap` or the `endSession()` round-trip duration. The leaderboard `total_seconds_spent` therefore shifts downward for every learner who has any one-answer sessions.

This is **acceptable under the target architecture's "answer log derives the session" model**: a single-answer session genuinely has zero meaningful duration if you measure "time spent answering" — the user clicked once and left. Multi-answer sessions still have correct durations (`MAX(answer.created_at) − MIN(answer.created_at)`). Document the tradeoff; do not try to approximate true session start with a separate "session start" event (would re-introduce explicit lifecycle, defeating the retirement).

**(g) `SessionType` type alias is orphaned by the retirement.** `src/types/learning.ts:285` defines `export type SessionType = 'lesson' | 'learning' | 'podcast' | 'practice'`. Sole consumer: `src/lib/session.ts:3,15`. After retirement, `SessionType` is dead exported code. Spec must include its deletion explicitly.

### 2.3 Things the doc got right (no correction needed)

- `learning_sessions` table itself stays. ✅
- The `(user_id, session_type, started_at, ended_at, duration_seconds GENERATED)` schema stays. ✅
- `confusion_group`, `grammar_patterns`, `error_logs`, `user_roles`, `profiles.preferred_session_size` — all out of scope, all stay. ✅
- `learnerProgressService.getCurrentStreakDays` reads `capability_review_events`, not `learning_sessions` (`scripts/migrations/2026-05-01-learner-progress-functions.sql:222-227`) — streak is unaffected. ✅
- `learner_progress` RPCs all read `capability_review_events` / `learner_capability_state` — unaffected. ✅

### 2.4 What the doc missed entirely

The `STALE_SESSION_THRESHOLD_MS` and `MAX_INFERRED_DURATION_MS` constants in `src/lib/session.ts:8,13` exist to repair the "tab left open overnight = 7-hour ghost session" pathology. **Under the answer-log model, this pathology disappears**: `ended_at` is the timestamp of the last answer, not the timestamp of the last beacon. A tab idle for hours between answer N and answer N+1 still records a clean span. A tab killed without answering anything materialises no row at all. Both are improvements over the legacy behavior (which would have either capped the tab-left-open session at +1 h or written ghost rows). Worth noting in the spec because it's a *gain*, not just a deletion.

---

## 3. Retirement scope (final, after grep verification)

### 3.1 Source files

```
src/lib/session.ts                        110 LOC — DELETE entire file
src/lib/useSessionBeacon.ts                30 LOC — DELETE entire file
src/types/learning.ts                       1 LOC — DELETE `SessionType` type alias at line 285
                                                     (orphaned: only consumer is src/lib/session.ts:3 which deletes)
```

### 3.2 Caller surgery (atomic — source and tests in the SAME commit per the source/test bundling rule from retirement #1-#4)

```
src/pages/Session.tsx
  Line 23  : remove `import { startSession, endSession } from '@/lib/session'`
  Line 24  : remove `import { useSessionBeacon } from '@/lib/useSessionBeacon'`
  Line 59  : remove `const [sessionId, setSessionId] = useState<string | null>(null)`
              (post-surgery there are no readers of this React state — `sid` is a local;
               capability loader takes `sid`; `event.sessionId` flows from ExperiencePlayer)
  Line 74-76: remove `const sessionIdRef = useRef<string | null>(null)` + the
              `useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])`
              block + the `useSessionBeacon(sessionIdRef)` call
  Line 94-99: replace the entire `let sid: string; try { sid = await startSession(...) } catch (e) { throw new Error(...) }` block (6 lines)
              with `const sid = crypto.randomUUID()` (1 line)
              Resolves R2 N3: the surface is the entire let/try/catch wrapper, not just the assignment.
  Line 104  : remove the `setSessionId(sid)` call inside the lesson-scope branch
  Line 120  : remove the `setSessionId(sid)` call after the capability loader resolves
  Line 161-170: simplify `handleCapabilityPlanComplete` to a direct `handleNavigateHome()`
                (no `if (sessionId)` branch, no `endSession(sessionId)` call, no try/catch)
  After surgery: verify zero remaining references to `sessionId` React state
                 with `rg -n "sessionId\b" src/pages/Session.tsx` — only `event.sessionId`
                 and `sid` should remain.

src/pages/Lesson.tsx
  Line 21  : remove `import { startSession, endSession } from '@/lib/session'`
  Line 22  : remove `import { useSessionBeacon } from '@/lib/useSessionBeacon'`
  Line 85  : remove `const sessionIdRef = useRef<string | null>(null)`
  Line 88  : remove `useSessionBeacon(sessionIdRef)`
  Line 108-114: collapse `Promise.all([lessonService.getLesson(lessonId), startSession(...)])`
                to a single `await lessonService.getLesson(lessonId)`; drop
                `sessionIdRef.current = sid` (and `sid` becomes unused, drop too)
  Line 153-161: drop the endSession cleanup branch from the unmount;
                cleanup retains `cancelled = true` (still load-bearing)
  Line 162  : drop `T.common.somethingWentWrong` from the deps array
              (string only appeared inside the deleted endSession branch)

src/pages/Podcast.tsx
  Line 14  : remove `import { startSession, endSession } from '@/lib/session'`
  Line 15  : remove `import { useSessionBeacon } from '@/lib/useSessionBeacon'`
  Line 30  : remove `const sessionIdRef = useRef<string | null>(null)`
  Line 31  : remove `useSessionBeacon(sessionIdRef)`
  Line 37-42: collapse `Promise.all([podcastService.getPodcast(podcastId), startSession(...)])`
                to a single `await podcastService.getPodcast(podcastId)`; drop
                `sessionIdRef.current = sid`
  Line 53-60: delete the entire `return () => { ... }` cleanup arrow
                (Podcast.tsx had nothing else in cleanup; do not leave `return () => {}`)
  Line 61  : drop `T.common.somethingWentWrong` from the deps array
              (string only appeared inside the deleted endSession branch)
```

### 3.3 Tests

```
src/__tests__/Lesson.test.tsx
  Line 36-44: remove the four `vi.mock('@/lib/session', ...)` and `vi.mock('@/lib/useSessionBeacon', ...)` blocks
```

No other test files reference any of the four retiring exports. Verified via:
```bash
rg -n "startSession|endSession|endSessionBeacon|useSessionBeacon" src/__tests__/ src/**/__tests__/
```

### 3.4 Postgres functions

```
scripts/migration.sql
  Line 1095-1140: REMOVE the entire stale-session sweep block:
    - `CREATE OR REPLACE FUNCTION indonesian.job_finalize_stale_sessions()`
    - `GRANT EXECUTE ON FUNCTION indonesian.job_finalize_stale_sessions() TO service_role`
    - the `cron.unschedule('finalize-stale-sessions')` + `cron.schedule(...)` block
```

### 3.5 RPC modification (the architectural shift)

**Source-of-truth decision (resolves R1 C1).** `scripts/migrate.ts` reads ONLY `scripts/migration.sql`. The timestamped `scripts/migrations/2026-04-25-capability-review-rpc.sql` is paper trail of the original 2026-04-25 deploy and **stays untouched** under this retirement (frozen historical record per retirement #2 lesson on tracked migrations). The retirement-#5 section appended at EOF of `scripts/migration.sql` — and ONLY that section — carries the FULL modified RPC body via `create or replace function`. The new paper-trail file `scripts/migrations/2026-05-07-retire-session-lifecycle.sql` mirrors this content for operator audit.

**Two surgical patches against the original RPC body.** The modified RPC is the original (`2026-04-25-capability-review-rpc.sql:3-316`) with these two literal line-replacements applied:

**Patch 1 — required-fields validation (resolves R1 C2 + R2 N2).** Replace this single line (line 41 of the original):

```sql
     or not (p_command ? 'fsrsAlgorithmVersion') then
```

With:

```sql
     or not (p_command ? 'fsrsAlgorithmVersion')
     or not (p_command ? 'submittedAt') then
```

**Patch 2 — empty-string validation.** Replace this single line (line 56 of the original):

```sql
     or nullif(p_command->>'attemptNumber', '') is null then
```

With:

```sql
     or nullif(p_command->>'attemptNumber', '') is null
     or nullif(p_command->>'submittedAt', '') is null then
```

These two patches make `submittedAt` load-bearing. If any caller drops or empties the field, the RPC returns `rejected_invalid_outcome` cleanly rather than NULL-violating `learning_sessions.started_at NOT NULL`.

**Patch 3 — new upsert block.** Insert the following block immediately after the `update indonesian.learner_capability_state … where id = v_state.id;` statement (which ends at line 306 of the original) and BEFORE the `return jsonb_build_object(...)` at line 308:

```sql
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
```

**Constraints + verifications (resolves R1 M2):**
- `submittedAt` is set by the edge function at `commit-capability-answer-report/index.ts:301` (`submittedAt: reviewedAt.toISOString()`, where `reviewedAt = new Date()` is server-side). The wire format already carries it through to the trusted plan; the RPC has not previously read it.
- `learning_sessions.id` is `uuid PRIMARY KEY` (`scripts/migration.sql:209`), so `on conflict (id)` is well-defined.
- The `(p_command->>'sessionId')::uuid` cast assumes the browser mints a UUID-format sessionId. This is enforced by `Session.tsx` using `crypto.randomUUID()` (no other commit path exists post-retirement). If the cast fails, the RPC errors out and the answer is rejected — visible failure mode, not silent corruption.
- The advisory xact lock at line 104 (`pg_advisory_xact_lock(hashtext(user_id || ':' || capability_id))`) does NOT cover (user_id, session_id), so concurrent commits across capabilities within the same session race on the new upsert. The race is benign: `INSERT … ON CONFLICT DO UPDATE SET ended_at = GREATEST(…)` is idempotent under reordering.

### 3.5.1 Full inlined RPC body (post-patch)

The complete modified body — to be reproduced verbatim in §3.6's `create or replace function` and in the timestamped paper-trail file `scripts/migrations/2026-05-07-retire-session-lifecycle.sql`:

```sql
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
```

This is the canonical body. §3.6 references it; §3.7's paper-trail file is a verbatim copy plus the cron + function drops; the test file in §5 Commit 1 asserts on key strings within it.

### 3.6 Master migration retirement-#5 section (idempotent, appended at EOF)

The master `scripts/migration.sql` retirement-#5 section is structured as four blocks in this order:

```sql
-- ============================================================================
-- Retirement #5 (session lifecycle module) — 2026-05-07
-- See docs/plans/2026-05-07-retire-session-lifecycle.md for context.
-- ============================================================================

-- Block A: drop the dead RLS policy (resolves R2 N10).
-- learning_sessions_write granted FOR ALL to authenticated. Under retirement #5
-- the GRANT narrows to SELECT only (see §3.8), making the INSERT/UPDATE/DELETE
-- branches dead. Drop the policy entirely; SELECT continues to work via the
-- more-permissive learning_sessions_read policy.
drop policy if exists "learning_sessions_write" on indonesian.learning_sessions;

-- Block B: drop the cron job + finalisation function.
do $$ begin
  perform cron.unschedule('finalize-stale-sessions');
exception when others then null;
end $$;

drop function if exists indonesian.job_finalize_stale_sessions() cascade;

-- Block C: replace the RPC with the modified body from §3.5.1.
-- (LITERAL inline of the entire ~270-line body from §3.5.1 of the spec —
--  the executor copies it verbatim. The body includes the two submittedAt
--  validation patches and the new learning_sessions upsert before the final
--  return. The standalone `revoke … from public/authenticated` and
--  `grant execute … to service_role` statements at the end of §3.5.1 are
--  also reproduced here, idempotent under re-application.)
<<<see §3.5.1 for the full body>>>
```

Lowercase `drop function if exists` and `drop policy if exists` forms per the destructive-op-check.sh case-sensitivity quirk surfaced in retirement #2 (the upper-case form trips the FAIL pattern at `evals/destructive-op-check.sh:32`).

**Implementer note.** When committing, the `<<<see §3.5.1 for the full body>>>` placeholder is replaced verbatim with the SQL from §3.5.1. The placeholder exists in this spec only to avoid duplicating ~270 lines twice (which would risk drift between §3.5.1 and §3.6). The test file (§5 Commit 1) asserts on key strings within the body, catching any drift.

### 3.7 Tracked timestamped migration files

Add **`scripts/migrations/2026-05-07-retire-session-lifecycle.sql`** (paper-trail, NOT auto-applied by `make migrate`). Content:
- Block A: `drop policy if exists "learning_sessions_write" on indonesian.learning_sessions;`
- Block B: the cron unschedule + `drop function if exists indonesian.job_finalize_stale_sessions() cascade;`
- Block C: the FULL ~270-line modified RPC body from §3.5.1 (verbatim copy, including the trailing `revoke` + `grant execute` statements)

Add **`scripts/migrations/2026-05-07-retire-session-lifecycle.rollback.sql`** (resolves R2 N9). This is real, runnable SQL that reverses the retirement #5 DB changes:

```sql
-- Rollback retirement #5 (2026-05-07).
--
-- Re-runnable. Restores:
-- - learning_sessions_write RLS policy (FOR ALL TO authenticated USING user_id = auth.uid())
-- - job_finalize_stale_sessions() function + finalize-stale-sessions hourly cron
-- - commit_capability_answer_report RPC pre-#5 body (no submittedAt validation, no upsert)
-- Cannot restore src/lib/session.ts or related TS files; revert the code commit instead.

-- Block 1: restore the dead RLS policy (was dropped in retirement #5 Block A).
drop policy if exists "learning_sessions_write" on indonesian.learning_sessions;
create policy "learning_sessions_write" on indonesian.learning_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Block 2: restore the GRANT (also reverted in retirement #5 §3.8).
revoke select on indonesian.learning_sessions from authenticated;
grant select, insert, update, delete on indonesian.learning_sessions to authenticated;

-- Block 3: restore job_finalize_stale_sessions function + cron.
-- (Functionally-equivalent reconstruction of the original 41-line body from
--  migration.sql:1100-1140. Lowercased to match the destructive-op-check.sh
--  case-sensitivity convention used elsewhere in retirement-#5 (Postgres
--  treats `CREATE OR REPLACE FUNCTION` and `create or replace function` as
--  identical). Includes SECURITY DEFINER, search_path, GRANT TO service_role,
--  and the cron.unschedule + cron.schedule wrapping.)
create or replace function indonesian.job_finalize_stale_sessions()
returns table(finalized_count integer)
language plpgsql
security definer
set search_path to 'indonesian'
as $$
declare
  v_count integer;
begin
  with stale as (
    select ls.id, ls.started_at,
           (select max(re.created_at) from indonesian.review_events re
            where re.session_id = ls.id) as last_review_at
    from indonesian.learning_sessions ls
    where ls.ended_at is null
      and ls.started_at < now() - interval '1 hour'
  ),
  upd as (
    update indonesian.learning_sessions ls
    set ended_at = coalesce(stale.last_review_at,
                            least(now(), stale.started_at + interval '1 hour'))
    from stale
    where ls.id = stale.id
    returning ls.id
  )
  select count(*) into v_count from upd;

  return query select v_count;
end;
$$;

grant execute on function indonesian.job_finalize_stale_sessions() to service_role;

do $$ begin
  perform cron.unschedule('finalize-stale-sessions');
exception when others then null;
end $$;

select cron.schedule('finalize-stale-sessions', '25 * * * *',
  'select indonesian.job_finalize_stale_sessions()');

-- Block 4: revert commit_capability_answer_report to pre-#5 body.
-- (Inline of the original RPC body from
--  scripts/migrations/2026-04-25-capability-review-rpc.sql:3-320 — copy verbatim
--  including the trailing revoke/grant statements at lines 318-320.
--  Range 3-320 deliberately STOPS BEFORE the trailing `commit;` on line 322;
--  this rollback file is its own standalone document, not the original
--  transaction wrapper. Including line 322 would yield an orphan `commit;`.
--  The original file remains unchanged on disk; this rollback section copies
--  its content for in-DB revert.)
<<<see scripts/migrations/2026-04-25-capability-review-rpc.sql:3-320 — copy verbatim>>>
```

The rollback scripts exist for operator audit / reversibility per retirement #2's documented pattern. The `<<<…copy verbatim>>>` placeholder is the only deferred section; the executor reads the literal file and inlines its content. This avoids drift between two copies of the same RPC body.

### 3.8 GRANT narrowing (resolves R1 I3 + R2 N8 + R2 N10)

Under retirement #5, browsers no longer INSERT/UPDATE/DELETE `learning_sessions` directly — the RPC writes via `service_role` (which bypasses RLS and grants). Defense-in-depth: narrow the `authenticated` grant to `SELECT` only.

**`scripts/migration.sql:288`:** change

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.learning_sessions TO authenticated;
```

to

```sql
GRANT SELECT ON indonesian.learning_sessions TO authenticated;
-- INSERT/UPDATE/DELETE retired in #5: only the commit_capability_answer_report
-- RPC writes (service_role bypass). Browsers never write directly.
```

**`scripts/check-supabase-deep.ts:57`:** update the expected-grants entry from

```typescript
learning_sessions: { authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
```

to

```typescript
learning_sessions: { authenticated: ['SELECT'] },
```

**SELECT preservation under multi-policy RLS** (resolves R2 N8). After narrowing the GRANT and dropping `learning_sessions_write` (per §3.6 Block A), the surviving policy `learning_sessions_read` (`migration.sql:379`) still applies: `for select to authenticated using (true)`. Authenticated users continue to read all rows (the leaderboard view depends on this). Permissive policies are OR'd in PostgreSQL — the dead policy's removal does not narrow the SELECT surface. Verified by reading `migration.sql:379-381` directly.

**`learning_sessions_write` policy is dropped, not left in place** (resolves R2 N10). §3.6 Block A drops it. Reasoning: dead surfaces are deleted per retirement #2/#4 precedent. Rollback re-creates it (§3.7 Block 1). This is one extra `drop policy if exists` line in master + four lines in rollback — small surface area, but keeps the schema clean.

---

## 4. Architectural shift — runtime semantics

### 4.1 Before (today)

```
Session.tsx mount
  → startSession() → PostgREST INSERT learning_sessions → returns id
                  → for each in-flight stale row owned by user, finalize ended_at
  → setSessionId(id), pass id into capability loader
  → user answers → commit-capability-answer-report → INSERT capability_review_events (session_id=id)
  → handleCapabilityPlanComplete → endSession() → PostgREST UPDATE learning_sessions SET ended_at=now()
  → pagehide/visibilitychange → endSessionBeacon → PATCH learning_sessions

Backstop: pg_cron 'finalize-stale-sessions' every hour, sweeps rows with ended_at IS NULL.
```

### 4.2 After (target arch)

```
Session.tsx mount
  → const sid = crypto.randomUUID()           // no DB write
  → setSessionId(sid), pass sid into capability loader
  → user answers → commit-capability-answer-report
                 → RPC commit_capability_answer_report
                   → INSERT capability_review_events (session_id=sid)
                   → UPSERT learning_sessions (id=sid, user_id, session_type='learning',
                                                started_at=submittedAt,
                                                ended_at=GREATEST(existing, submittedAt))
  → handleCapabilityPlanComplete → navigate (no DB write)

No beacon. No cron sweep. No stale rows possible — rows materialise only with answers,
and ended_at is always the last answer's timestamp.
```

### 4.3 Behavioral consequences (worth surfacing)

1. **Sessions with zero answers leave no row.** Today: `startSession()` writes a row, then if user navigates away with no answers, the cron eventually finalises it with `ended_at = started_at + 1 h` cap (a "ghost" row). Tomorrow: no row at all. Cleaner.
2. **Lesson reading and Podcast listening produce no `learning_sessions` rows.** Retirement #5 deletes the explicit lifecycle for these pages (no `startSession('lesson'|'podcast')`). Historical rows of `session_type IN ('lesson','podcast')` stay; new ones do not appear. Leaderboard `total_seconds_spent` and `days_active` shift to "answer-emitting study only". This is the locked-in semantics from target-arch §377: *"the `learning_sessions` row is a derived view of the answer log"*. Lessons and podcasts have no answer log. Therefore they have no session.
3. **Streak unaffected.** `get_current_streak_days` reads `capability_review_events`, not `learning_sessions` — verified at `scripts/migrations/2026-05-01-learner-progress-functions.sql:222-227`.
4. **Concurrency.** The advisory xact lock at `2026-04-25-capability-review-rpc.sql:104` (`pg_advisory_xact_lock(hashtext(user_id || ':' || capability_id))`) serialises commits per learner+capability but NOT per session. Cross-capability commits within the same session race on the new upsert. The race is benign: `INSERT … ON CONFLICT DO UPDATE SET ended_at = GREATEST(…)` is idempotent under reordering. Two concurrent commits at `T1` and `T2` (`T1 < T2`) both upsert; final state is `ended_at = T2` regardless of arrival order. No additional lock needed.
5. **Wire format unchanged.** Browser already sends `sessionId` in the commit plan (`Session.tsx:181`). RPC already validates it (`capability-review-rpc.sql:32, 54`). The new upsert just consumes a field that's already required. No client-side wire change. No edge-function deploy required for the RPC change to take effect on the next answer.
6. **`capability_review_events.session_id` is `text` (not uuid).** Existing rows have arbitrary text values. The new upsert in the RPC casts `(p_command->>'sessionId')::uuid` — for any browser that mints a non-UUID sessionId, the cast fails and the answer is rejected. Browser mints `crypto.randomUUID()` so no concrete risk; spec mandates this constraint explicitly.

---

## 5. Implementation plan — atomic commits

Following the source/test bundling rule from retirement #1 (every commit must build + lint + test green; tests for retiring code must collapse into the same commit as the source change to keep `git bisect` walks green).

### Commit 1 — RPC: upsert learning_sessions on each commit (DB-only change)

**Files:**
- `scripts/migrations/2026-05-07-retire-session-lifecycle.sql` (NEW, paper trail)
- `scripts/migrations/2026-05-07-retire-session-lifecycle.rollback.sql` (NEW, paper trail)
- `scripts/migration.sql` (append retirement-#5 section at EOF; the section contains the `create or replace function indonesian.commit_capability_answer_report` body with submittedAt validation + the new UPSERT step + the cron drop + `drop function indonesian.job_finalize_stale_sessions`. Note: the timestamped 2026-04-25 file is **NOT modified** — it's frozen as paper trail.)
- `scripts/__tests__/retire-session-lifecycle-migration.test.ts` (NEW) — asserts the master migration's retirement-#5 section contains:
  - `or not (p_command ? 'submittedAt')` (the new validation)
  - `or nullif(p_command->>'submittedAt', '') is null`
  - `insert into indonesian.learning_sessions` (the new upsert)
  - `on conflict (id) do update`
  - `set ended_at = greatest`
  - `drop function if exists indonesian.job_finalize_stale_sessions`
  - `cron.unschedule('finalize-stale-sessions')`

The existing `scripts/__tests__/capability-review-rpc-migration.test.ts` is **not touched** — it asserts against the timestamped 2026-04-25 file which represents the original deploy. Adding a new test file scoped to the retirement-#5 section in master keeps history clean.

This commit is **DB-only** and **forward-compatible** with old code. Old browser code's `startSession()` already inserts a row with `(id=sid, started_at=now())`. The RPC's new upsert on the SAME `sid` becomes an UPDATE that refreshes `ended_at` — slightly redundant with old code's behavior but harmless. A learner running old code mid-deploy gets correct behavior.

### Commit 2 — Source surgery + test surgery (atomic)

**Files (all in same commit):**
- `src/pages/Session.tsx` (drop imports, drop `sessionId` useState, drop `sessionIdRef` + `useSessionBeacon`, mint UUID client-side, drop `setSessionId(sid)` calls, simplify `handleCapabilityPlanComplete` to `handleNavigateHome()`)
- `src/pages/Lesson.tsx` (drop imports + sessionIdRef + beacon + start/end calls + `T.common.somethingWentWrong` from deps array)
- `src/pages/Podcast.tsx` (drop imports + sessionIdRef + beacon + start/end calls + the entire cleanup `return () => { ... }` arrow + `T.common.somethingWentWrong` from deps array)
- `src/__tests__/Lesson.test.tsx` (drop the four `vi.mock` blocks at lines 36-44)
- `src/lib/session.ts` (DELETE entire file)
- `src/lib/useSessionBeacon.ts` (DELETE entire file)
- `src/types/learning.ts` (DELETE the `SessionType` type alias at line 285 — orphaned by the deletion of `src/lib/session.ts`)

Atomic because: deleting `src/lib/session.ts` makes the imports in the three pages broken; the deletion and import-removal must collapse into one commit per the bundling rule. Same for the test mocks: deleting `@/lib/session` breaks `vi.mock('@/lib/session', …)`. Same for `SessionType` — its sole consumer (`src/lib/session.ts:3`) deletes in this commit, so the type's deletion must collapse here.

**Verification before commit:** `bun run lint && bun run test --run && bun run build` must all pass on this commit alone. Per the binding code-level gate from retirements #1-#4.

**Whole-tree post-surgery grep (per the retirement #2/#4 R2-catches-stale-comments lesson; resolves R2 N7):**

After Commit 2 (TS/TSX surgery only — SQL drops happen in Commit 3):

```bash
# Phase 2 grep — TS/TSX symbols only.
rg -n "startSession|endSession|endSessionBeacon|useSessionBeacon|SessionType\b" -g '!*.md'
```

Expected matches at this commit: zero in `src/`, `supabase/`. Survivors expected in HTML and historical reports:
- `docs/architecture-layers.html` (Plate IV layer-tag — out of cleanup scope)
- `prod_ready_report.md`, `ux_resilience_report.md` (historical UX reports — paper trail)
- `docs/plans/2026-03*` (historical PRDs — paper trail)
- `scripts/migration.sql:1095-1140` and the `job_finalize_stale_sessions` references — these clear in Commit 3.

After Commit 3 (master migration cleanup):

```bash
# Phase 3 grep — full retirement-#5 symbol set.
rg -n "startSession|endSession|endSessionBeacon|useSessionBeacon|SessionType\b|job_finalize_stale_sessions|finalize_stale_sessions" -g '!*.md'
```

Expected matches at this commit: only the HTML + historical-report survivors above. No matches in `src/`, `scripts/`, `supabase/`, `evals/`, `tests/`. If any match in those paths, surgery is incomplete; address before opening PR.

### Commit 3 — Drop cron + stale-session function (master migration cleanup)

**Files:**
- `scripts/migration.sql` (remove the lines 1095-1140 block defining + scheduling `job_finalize_stale_sessions`; the retirement-#5 section at EOF added in Commit 1 already contains the drop)

Why split from Commit 1: keeping the original CREATE block in the master file at the same time as the retirement-section drop would cause `make migrate` to recreate then drop on every run. Cleaner to remove the original definition entirely once the retirement section exists. Forward-compatible with old code: old code's `startSession()` doesn't depend on the cron — the cron is a server-side cleanup helper, not on any request path. Old code in production during this commit's window: no observable change.

### Commit 4 — Update target-architecture.md + data-model.md inline (per retirement #4 playbook)

**Files:**
- `docs/target-architecture.md`
  - §1108 §3 → mark `[RETIRED in retirement #5 (2026-05-07, branch `retire/session-lifecycle`). Spec: docs/plans/2026-05-07-retire-session-lifecycle.md.]` Note the corrections from §2.2 above:
    - Three caller pages (Session.tsx, Lesson.tsx, Podcast.tsx — not just `buildSession`)
    - Upsert lives in the RPC `commit_capability_answer_report`, not the edge function TS
    - `capability_review_events.session_id` is `text not null` with NO FK to learning_sessions (wire format is unblocked)
    - Lesson + Podcast lose explicit session tracking → leaderboard `total_seconds_spent` and `days_active` no longer count Lesson reading or Podcast listening
    - One-answer sessions now have `duration_seconds = 0` (the leaderboard semantic shift extends beyond the Lesson/Podcast loss)
  - §1199-1203 → strike "largely obsolete" / "May retain a tiny version" wording about useSessionBeacon — under bundled scope, useSessionBeacon retires 100%
  - §1323 §8 → strike "src/lib/session.ts (already retired in #3 above)" misstatement (#3 was Browser FSRS, not Session lifecycle); strike "useSessionBeacon largely retires with #3"
  - §1371 (migration order) → add "DONE (#5, 2026-05-07, branch `retire/session-lifecycle`)" annotation
  - §1366-1370 → keep cumulative LOC tally consistent with this PR (~180 LOC + 1 fn + 1 cron + RPC modification)
- `docs/architecture/data-model.md`
  - §260-271 (`learning_sessions` description, currently "One row per study session. `duration_seconds` is a generated column.") → REPLACE with (resolves R2 N6):

    > **Retirement #5 (2026-05-07)** — Rows are now materialised lazily by the `commit_capability_answer_report` RPC's upsert from the answer log. The first answer in a session inserts the row with `started_at = ended_at = submittedAt`; each subsequent answer advances `ended_at` via `GREATEST(existing, submittedAt)`. Sessions with zero answers leave no row. **Only the capability path produces sessions** — `session_type` is always `'learning'` for new rows. Lesson reading and Podcast listening no longer create rows; their time stops contributing to the leaderboard. One-answer sessions have `duration_seconds = 0` by construction. `duration_seconds` remains a generated column. Historical rows of `session_type IN ('lesson','podcast','practice')` persist; backwards-looking metrics are unaffected.

`docs/architecture-layers.html:1033` (the `job_finalize_stale_sessions` Plate IV tag) is left as paper trail of the pre-retirement architecture — the HTML doc is regenerated periodically; surgical edits to it are not in scope per retirement #4 precedent.

### Commit 5 — Spec doc itself

**Files:**
- `docs/plans/2026-05-07-retire-session-lifecycle.md` (THIS FILE)

Per retirement #2 destructive-op-check quirk: prose mentioning the uppercase form of "D-R-O-P" + "T-A-B-L-E" or similar literals can trip the case-sensitive FAIL pattern in `evals/destructive-op-check.sh:32`. The relevant SQL in this PR is `drop function` (lowercase, function not table) — the FAIL pattern is uppercase-only, so unaffected. Spec is safe to commit as-is. Note: this paragraph itself uses hyphenation to avoid tripping its own warning.

---

## 6. Deploy ordering

Following retirement #4's reverse-order pattern adapted for this PR's specific dependency direction:

1. **Push to main** → GitHub Actions builds image (`ghcr.io/albertvd/learning-indonesian:latest`).
2. **`make migrate`** — applies the new RPC behavior + drops the cron + drops `job_finalize_stale_sessions`. **Run BEFORE pulling the new image.**
   - **Why migrate-first here (opposite of retirement #4):** retirement #4 had OLD code that queried tables which `make migrate` would drop (window of ERROR notifications during the deploy). This retirement has the OPPOSITE shape: the migration is forward-compatible with old code (old code's startSession PostgREST insert + the new RPC upsert co-exist cleanly: same `id`, RPC's UPSERT becomes UPDATE on the row old code just inserted; idempotent). Verified: `learning_sessions.id` is `uuid PRIMARY KEY` (`scripts/migration.sql:209`), so `on conflict (id)` is well-defined. New code, by contrast, depends on the RPC's new behavior to materialise session rows at all (without it, capability commits during the gap would create `capability_review_events` with no corresponding `learning_sessions` row, leaving those sessions invisible to the leaderboard forever).
   - The cron drop is non-load-bearing: hourly sweep absent for ~5 minutes is harmless; old code in flight finishes naturally.
   - Old code's stale-session sweep continues to query `review_events` during the deploy window (`src/lib/session.ts:35-42`) — no schema change affects this query; safe.
   - Pre-retirement ghost rows (`learning_sessions WHERE ended_at IS NULL` from tabs that died before any beacon) persist forever after the cron is dropped. Spec accepts this (resolves R1 I6 option (b)): the legacy ghost rows mostly fall outside the leaderboard's `started_at > now() - interval '2 hours'` filter within ~2h, and `total_seconds_spent` filters out NULL `duration_seconds`. A one-time backfill SQL is not worth the migration complexity for a population that disappears from leaderboard relevance within hours.
3. **Pull the new image + recreate container** (per CLAUDE.md's `ssh mrblond@master-docker` recipe) — new browser code runs.
4. **Verify:** load `/session`, complete one capability answer, query `learning_sessions WHERE id = <sessionId>` and confirm row materialised with correct `started_at = ended_at`. Submit a second answer in the same session, confirm `ended_at` advances.

---

## 7. Tests + code-level gate

**Required before opening PR:**

```bash
bun run lint
bun run test --run
bun run build
```

This is the binding gate established by retirements #1-#4. **`make pre-deploy` is NOT required to pass** — the `check-supabase` portion may fail on environmental homelab issues unrelated to this PR (per the retirement #1 lesson; not a blocking signal for code-level changes).

**Whole-tree grep before R2** (catches at least one stale comment per retirement, per the #2/#3 lessons):

```bash
rg -n "startSession|endSession|endSessionBeacon|useSessionBeacon|job_finalize_stale_sessions|finalize_stale_sessions|SessionType\b" -g '!*.md'
```

**Expected matches** (these are paper trail and acceptable):
- `docs/architecture-layers.html:1033` — Plate IV layer-tag for `job_finalize_stale_sessions` (HTML, not markdown — the `!*.md` exclusion misses it).
- `docs/plans/2026-03-29-bidirectional-review-impl.md` (historical PRD reference)
- `docs/plans/2026-03-16-learning-indonesian-implementation.md` (historical PRD reference)
- `prod_ready_report.md`, `ux_resilience_report.md`, `scaling_check_report.md` (historical UX/scaling reports)

**Forbidden matches** (must be zero in code paths):
- Anything in `src/`, `scripts/`, `supabase/`, `evals/`, `tests/` should NOT appear. If matches are found in these paths, surgery is incomplete; address before opening PR.

---

## 8. Risk + invariants

### What the PR explicitly preserves
- `learning_sessions` table itself, its CHECK constraint values, its RLS policies, its grants. ✅
- Historical rows of every `session_type` value. ✅
- Leaderboard view definition (it just sees fewer fresh rows of certain types going forward). ✅
- The duration_seconds generated column (still computed correctly). ✅

### What changes
- New behavior: `learning_sessions` rows materialise lazily on first answer.
- New behavior: rows for sessions that ended without any answer cease to exist (pre-PR they would have been written-then-finalised by cron with capped duration).
- Leaderboard `total_seconds_spent` and `days_active` no longer count Lesson reading time or Podcast listening time. **This is the explicit product intent of the streak-only motivation lock-in.** Spec calls it out so the architect review can sanity-check it against §1112-1116.

### Invariants preserved
- The canonical-key contract is untouched. ✅
- `capability_review_events.session_id` semantics unchanged (still `text not null`, still `unique(session_id, session_item_id, attempt_number)`). ✅
- `make migrate` remains idempotent (all retirement-#5 statements are `if exists` / `or replace`). ✅
- Every commit is build + lint + test green (validated by source/test bundling in Commit 2). ✅

### Rollback
- Code: `git revert` Commit 2 + Commit 3.
- DB: apply `scripts/migrations/2026-05-07-retire-session-lifecycle.rollback.sql` (recreates `job_finalize_stale_sessions` + reschedules cron + reverts the RPC upsert step).

---

## 9. Architect-review iteration log

### 9.1 R1 v1 → revisions

The first architect review (R1 v1) returned NEEDS-REVISION with 4 CRITICAL + 6 IMPORTANT + 6 MINOR findings. All have been addressed in this revision:

**CRITICAL (resolved):**
- C1 (SQL source-of-truth ambiguity): §3.5 now explicitly states the master `migration.sql` retirement-#5 section is the only modified target; the timestamped 2026-04-25 file is frozen paper trail; a NEW test file `scripts/__tests__/retire-session-lifecycle-migration.test.ts` asserts against master.
- C2 (`submittedAt` not validated): §3.5 now mandates adding `submittedAt` to both validation blocks of the RPC.
- C3 (dead React state in Session.tsx): §3.2 now explicitly enumerates the `useState`, `setSessionId`, sessionIdRef removals and the post-surgery grep verification.
- C4 (one-answer-session duration shift): §2.2 (f) added; §4.3 #2 expanded to acknowledge the consequence.

**IMPORTANT (resolved):**
- I1 (`SessionType` orphaned): §3.1 now lists deletion; §3.2 verification grep includes `SessionType\b`.
- I2 (`T.common.somethingWentWrong` deps leftover): §3.2 now explicitly drops it from both Lesson.tsx:162 and Podcast.tsx:61 deps arrays.
- I3 (GRANT not narrowed): new §3.8 narrows the grant + updates `check-supabase-deep.ts` expectations.
- I4 (§7 grep too narrow): §7 now lists expected paper-trail matches and forbidden code-path matches separately.
- I5 (`docs/architecture/data-model.md` update): added to Commit 4 in §5.
- I6 (deploy-window ghost rows): §6.2 explicitly accepts the residue with rationale.

**MINOR (resolved):**
- M1 (UUID format constraint): §3.5 documents `crypto.randomUUID()` is the only commit path; cast failure produces visible RPC error.
- M2 (PRIMARY KEY citation): §3.5 cites `learning_sessions.id uuid PRIMARY KEY (migration.sql:209)`; §6.2 cites it again.
- M3 (Podcast.tsx vs Lesson.tsx cleanup): §3.2 splits the two cases — Lesson keeps cleanup arrow with `cancelled = true`, Podcast deletes the cleanup arrow entirely.
- M4 (LOC tally): §10 updated to ~180 LOC + 1 fn + 1 cron + RPC modification.
- M5 (target-arch §1199-1203 wording): Commit 4 in §5 now strikes "largely obsolete" / "May retain a tiny version".
- M6 (review_events query during deploy): §6.2 adds the sentence.
- M7 (count off in §10): R1 withdrew this finding; nothing to do.

### 9.2 R1 v2 (round 2 of v1) → revisions

R1 v2 returned NEEDS-REVISION with 4 new CRITICAL + 5 new IMPORTANT + 4 new MINOR findings. The dominant root cause was that §3.5/§3.6/§3.7 described the modified RPC body via fragmented references rather than inlining the full ~270 lines. All resolutions:

**CRITICAL (resolved):**
- N1 (placeholder in §3.6 instead of full body): §3.5.1 now contains the FULL inlined RPC body verbatim. §3.6 references it explicitly via the `<<<see §3.5.1 for the full body>>>` marker, with implementer note pinning the substitution.
- N2 (off-by-one on `then` keyword): §3.5 patches now phrase as line-replacements, quoting the literal `then`-bearing line each time.
- N4 (master-section content silently incomplete): subsumed by N1 — §3.5.1 is the canonical body; test asserts on key strings within it.
- N9 (rollback content was a comment): §3.7 now contains real, runnable rollback SQL with all four blocks (drop policy → restore policy, restore GRANT, restore function + cron, revert RPC).

**IMPORTANT (resolved):**
- N3 (Session.tsx try/catch surface area not pinned): §3.2 line 114 now explicitly says "replace the entire `let sid: string; try {…} catch (e) {…}` block (6 lines) with `const sid = crypto.randomUUID()` (1 line)".
- N5 (LOC arithmetic): §10 now contains an explicit per-surface table with delete + add columns and accurate totals.
- N7 (grep set inconsistency): §3.2 now splits into Phase-2 grep (TS/TSX only) and Phase-3 grep (full set after Commit 3); §7 likewise.
- N8 (multi-policy SELECT preservation): §3.8 documents the OR-composition rationale citing `migration.sql:379-381`.
- N10 (dead RLS policy left in place): §3.6 Block A now drops `learning_sessions_write`; §3.7 Block 1 of rollback restores it.

**MINOR (resolved):**
- N6 (data-model.md vague replacement): Commit 4 now pins the exact replacement paragraph.
- N11 (paper-trail file undefined): §3.7 explicitly enumerates Blocks A/B/C content, with Block C referencing §3.5.1.
- N12 (test file naming): confirmed unique by R2; no action needed.
- N13 (header line 6 placeholder): §1 now contains the real cumulative LOC `~4677 LOC delete + DB objects`.

### 9.3 What R2 (next round) should focus on

The retirement playbook expects R2-on-spec to clear quickly after the second revision (#1, #2, #3 all returned APPROVE-WITH-NOTES at R2 stage with at most 1 finding). Areas to look at:

1. Whether any new Postgres syntax error is introduced by the inline RPC body in §3.5.1 (e.g., trailing semicolons, missing `end;` after `do $$`, etc.). Read it line by line and lint mentally.
2. Whether the §3.7 rollback Block 4 placeholder `<<<see scripts/migrations/2026-04-25-capability-review-rpc.sql:3-322 — copy verbatim>>>` is acceptable, given that §3.5.1 inlined the modified body. Either the spec inlines BOTH (consistent), or the spec inlines NEITHER (consistent), or the spec inlines the modified one and references the original (current state — pragmatic but asymmetric). Architect to judge.
3. Whether any other test file under `src/__tests__/` or `scripts/__tests__/` has an indirect dependency on `learning_sessions` table grants or RLS policy that the spec hasn't enumerated.
4. Whether the cumulative tally at §10 is internally consistent with §1 header now that both are filled in.

---

## 10. Cumulative retirement tally after this PR

LOC breakdown for #5 (resolves R2 N5 + N13 — recalculated explicitly):

| Surface | LOC delete | LOC add |
|---|---:|---:|
| `src/lib/session.ts` (full delete) | 110 | 0 |
| `src/lib/useSessionBeacon.ts` (full delete) | 30 | 0 |
| `src/types/learning.ts:285` (`SessionType` alias) | 1 | 0 |
| `src/pages/Session.tsx` caller surgery | ~12 | ~3 |
| `src/pages/Lesson.tsx` caller surgery | ~10 | ~1 |
| `src/pages/Podcast.tsx` caller surgery | ~10 | ~1 |
| `src/__tests__/Lesson.test.tsx` mock removal | ~10 | 0 |
| `scripts/migration.sql:1095-1140` (cron + function) | ~46 | 0 |
| `scripts/migration.sql:288` GRANT narrowing | ~1 | ~2 |
| `scripts/migration.sql` retirement-#5 section (drops + RPC re-def) — executable on `make migrate` | 0 | ~280 |
| `scripts/__tests__/retire-session-lifecycle-migration.test.ts` (new) | 0 | ~25 |
| `scripts/check-supabase-deep.ts:57` grant expectation | ~1 | ~1 |
| `docs/target-architecture.md` annotations | ~5 | ~10 |
| `docs/architecture/data-model.md` annotation | ~1 | ~5 |
| **TOTAL — executable surface** | **~221 LOC delete** | **~321 LOC add** |
| `scripts/migrations/2026-05-07-retire-session-lifecycle.sql` (timestamped paper trail; NOT auto-applied by `make migrate`) | 0 | ~280 |
| `scripts/migrations/2026-05-07-retire-session-lifecycle.rollback.sql` (paper trail) | 0 | ~310 |
| `docs/plans/2026-05-07-retire-session-lifecycle.md` (this spec) | 0 | ~720 |
| **TOTAL — including paper-trail/spec files** | **~221** | **~1631** |

**Net (executable surface):** ~221 LOC delete, ~321 LOC add. The bulk of the +321 is the new master retirement-#5 section (~280 LOC for the modified RPC body — replacing zero LOC since the master previously did not contain the RPC at all).

The "executable surface" row excludes paper-trail SQL files (which `make migrate` does NOT apply per retirement #2's tracked-migration pattern) and the spec doc itself. Resolves R2 N5 + R2 F3.

```
#1 Audio multi-voice          -265 LOC                                (PR #34, merged)
#2 Grammar-state subsystem    -450 LOC + 1 table + indexes            (PR #35, merged)
#3 Browser FSRS               -341 LOC                                (PR #36, merged)
#4 Goal subsystem + event log -3400 LOC + 5 tables + 9 fns + 4 crons (branch retire/goal-subsystem, in-flight)
#5 Session lifecycle (this)   -~221 LOC + 1 fn + 1 cron + RPC modification + dead RLS policy + paper trail
                              -----
TOTAL retired                  ~4677 LOC + 6 tables + 10 fns + 5 crons + 1 dead RLS policy
```

**End of spec.**
