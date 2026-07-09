// scripts/verify-lessons-overview-rls.ts
//
// Slice 3 live-execution gate (docs/plans/2026-07-08-vocab-mode-set-reduction-
// and-graduation.md §5, architect CRITICAL 2026-07-08): the mastered-numerator
// SUBSUMPTION clause added to get_lessons_overview (scripts/migration.sql) is a
// correlated read of a sibling capability's RLS-protected
// `learner_capability_state` row, executed inside a SECURITY INVOKER function.
// A silent RLS-deny (e.g. `auth.uid()` misresolving, or a policy regression)
// would make the sibling subquery return nothing — subsumption never fires —
// and `scripts/__tests__/lessons-overview-mastery-parity.test.ts` would stay
// green throughout, because it is a STATIC source-string check: it can prove
// the SQL text has the right shape, but not that Postgres actually evaluates it
// under real RLS the way PostgREST does for a real authenticated request.
//
// This script closes that gap by running the RPC inside a real Postgres session
// with `SET LOCAL ROLE authenticated` + `request.jwt.claims` set to a real test
// user's `sub` — exactly the two GUCs PostgREST sets per-request — and asserting
// the graduated #1 is actually counted. Everything happens inside ONE
// transaction that is ALWAYS ROLLED BACK (no seeded data persists), following
// the same SSH → `docker exec supabase-db psql` transport `scripts/migrate.ts`
// uses (there is no direct Postgres port exposed to this machine).
//
// Run with: make verify-lessons-overview-rls
// Requires (in .env.local): POSTGRES_PASSWORD
// Optional: HOMELAB_SSH (default mrblond@master-docker), SUPABASE_DB_CONTAINER
//   (default supabase-db), TEST_USER_EMAIL (default testuser@duin.home — must
//   be a real row in auth.users; see memory/reference_test_user.md).
//
// This is a MAIN-THREAD / owner-gated step, run AFTER `make migrate` applies
// this slice's migration.sql to the live DB — never run automatically as part
// of an agent build. See CLAUDE.md → "Learner data is PRECIOUS".

const DB_PASSWORD = process.env.POSTGRES_PASSWORD ?? process.env.SUPABASE_DB_PASSWORD

if (!DB_PASSWORD) {
  console.error('Error: POSTGRES_PASSWORD (or SUPABASE_DB_PASSWORD) must be set — see .env.local.')
  console.error('Run: make verify-lessons-overview-rls')
  process.exit(1)
}

const HOMELAB_SSH = process.env.HOMELAB_SSH ?? 'mrblond@master-docker'
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase-db'
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? 'testuser@duin.home'

// The whole check is one psql session (BEGIN…ROLLBACK) so `SET LOCAL` and the
// role switch stay scoped to it. Structure:
//   1. Resolve the test user + a REAL, live #1/#6 pair for the same word
//      (source_ref + lesson_id) via \gset — never fabricated ids.
//   2. Clear any pre-existing state for exactly those two capability ids (still
//      superuser — bypasses RLS for the write, which authenticated users can't
//      do directly anyway; all real writes go through the commit RPC).
//   3. Switch to `authenticated` + set `request.jwt.claims` to the test user's
//      sub, and capture a BASELINE mastered_capability_count for that lesson —
//      this isolates the assertion from whatever the test user has already
//      practiced in that lesson (avoids a false-positive "count > 0").
//   4. Switch back to superuser, seed #1 (below its OWN strength — review_count
//      1) and #6 (at strength, recency-free per §5 — reviewed 60 days ago, well
//      past the OLD flat 30-day window, to also pin the stability-scaled fix).
//   5. Switch back to `authenticated`, re-read mastered_capability_count.
//   6. Assert AFTER >= BASELINE + 1 (>= rather than == to tolerate concurrent
//      real-user activity changing OTHER capabilities' counts mid-check).
//   7. ROLLBACK — nothing seeded here is ever committed.
const sql = `
\\set ON_ERROR_STOP on
BEGIN;

select id as test_user_id from auth.users where email = '${TEST_USER_EMAIL}' \\gset

select c1.id as cap1_id, c1.canonical_key as cap1_key,
       c6.id as cap6_id, c6.canonical_key as cap6_key,
       c1.lesson_id as lesson_id
from indonesian.learning_capabilities c1
join indonesian.learning_capabilities c6
  on c6.lesson_id = c1.lesson_id
 and c6.source_ref = c1.source_ref
 and c6.source_kind = 'vocabulary_src'
 and c6.capability_type = 'produce_form_from_meaning_cap'
 and c6.retired_at is null
-- get_lessons_overview excludes hidden lessons (where not l.is_hidden) — a cap
-- homed on the hidden "Common Words" gap-word lesson would make the baseline
-- read return zero rows and fail the \\gset (observed on the first live run).
join indonesian.lessons l
  on l.id = c1.lesson_id
 and not l.is_hidden
where c1.source_kind = 'vocabulary_src'
  and c1.capability_type = 'recognise_meaning_from_text_cap'
  and c1.retired_at is null
  and c1.readiness_status = 'ready'
  and c1.publication_status = 'published'
  and c1.lesson_id is not null
order by c1.canonical_key
limit 1
\\gset

\\echo RESOLVED test_user_id=:test_user_id cap1_id=:cap1_id cap6_id=:cap6_id lesson_id=:lesson_id

-- Clean slate for exactly these two (user, capability) pairs.
delete from indonesian.learner_capability_state
where user_id = :'test_user_id'::uuid and capability_id in (:'cap1_id'::uuid, :'cap6_id'::uuid);

-- Baseline, read AS the test user under real RLS (before seeding).
select set_config('request.jwt.claims', json_build_object('sub', :'test_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
select coalesce(mastered_capability_count, 0) as baseline_count
from indonesian.get_lessons_overview(:'test_user_id'::uuid)
where lesson_id = :'lesson_id'::uuid
\\gset

-- Seed as superuser (authenticated users never write learner_capability_state
-- directly — only the commit RPC does). #1 stays BELOW its own strength
-- (review_count 1) so it can ONLY be counted via subsumption; #6 is at
-- mastery strength (recency-free) with last_reviewed_at 60 days ago — past the
-- OLD flat 30-day window, pinning both the subsumption fix AND (on its own
-- strength check) the stability-scaled window fix.
reset role;
insert into indonesian.learner_capability_state
  (user_id, capability_id, canonical_key_snapshot, activation_state, activation_source,
   review_count, stability, consecutive_failure_count, last_reviewed_at, next_due_at)
values
  (:'test_user_id'::uuid, :'cap1_id'::uuid, :'cap1_key', 'active', 'admin_backfill',
   1, 2, 0, now() - interval '1 day', now() + interval '1 day'),
  (:'test_user_id'::uuid, :'cap6_id'::uuid, :'cap6_key', 'active', 'admin_backfill',
   5, 20, 0, now() - interval '60 days', now() + interval '30 days');

-- Re-read AS the test user under real RLS (after seeding).
select set_config('request.jwt.claims', json_build_object('sub', :'test_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
select coalesce(mastered_capability_count, 0) as after_count
from indonesian.get_lessons_overview(:'test_user_id'::uuid)
where lesson_id = :'lesson_id'::uuid
\\gset

\\echo RESULT baseline=:baseline_count after=:after_count

ROLLBACK;
`

console.log(`Verifying get_lessons_overview mastered-numerator subsumption under real RLS`)
console.log(`  via ${HOMELAB_SSH} → docker exec ${DB_CONTAINER} psql, test user ${TEST_USER_EMAIL}...\n`)

const proc = Bun.spawn(
  [
    'ssh', '-i', `${process.env.HOME}/.ssh/id_ed25519`, '-o', 'StrictHostKeyChecking=no',
    HOMELAB_SSH,
    `PGPASSWORD=${DB_PASSWORD} sudo docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1`,
  ],
  { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
)

proc.stdin.write(sql)
proc.stdin.end()

const [exitCode, stdout, stderr] = await Promise.all([
  proc.exited,
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
])

console.log(stdout)
if (stderr.trim()) console.error(stderr)

if (exitCode !== 0) {
  console.error('\n❌ psql session failed (see stderr above) — cannot verify RLS behaviour.')
  process.exit(1)
}

const resolvedMatch = /RESOLVED test_user_id=(\S+) cap1_id=(\S+) cap6_id=(\S+) lesson_id=(\S+)/.exec(stdout)
if (!resolvedMatch || !resolvedMatch[1] || resolvedMatch[2] === '' || resolvedMatch[3] === '') {
  console.error('\n❌ Could not resolve a live #1/#6 pair (or the test user) — nothing to verify.')
  console.error('   Check TEST_USER_EMAIL exists in auth.users, and that at least one lesson has a')
  console.error('   published vocabulary_src #1 with a non-retired #6 sibling (post-Slice-1 baseline).')
  process.exit(1)
}

const resultMatch = /RESULT baseline=(\d+) after=(\d+)/.exec(stdout)
if (!resultMatch) {
  console.error('\n❌ Could not parse the RESULT line from psql output — see full output above.')
  process.exit(1)
}

const baseline = Number(resultMatch[1])
const after = Number(resultMatch[2])

console.log(`Lesson ${resolvedMatch[4]}: mastered_capability_count baseline=${baseline} → after=${after}`)

if (after < baseline + 1) {
  console.error(
    '\n❌ FAILED — mastered_capability_count did not increase after seeding a graduated #1 + ' +
    'strength-#6 pair. This is exactly the silent-RLS-deny regression the subsumption clause is ' +
    'meant to guard against (the correlated sibling read may be getting denied, or the subsumption ' +
    'clause itself regressed). Do not ship this migration until this passes.',
  )
  process.exit(1)
}

console.log('\n✅ PASSED — the graduated #1 was counted via subsumption under real authenticated-role RLS.')
process.exit(0)
