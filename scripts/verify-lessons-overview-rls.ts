// scripts/verify-lessons-overview-rls.ts
//
// Slice 3 live-execution gate (docs/plans/2026-07-08-vocab-mode-set-reduction-
// and-graduation.md §5, architect CRITICAL 2026-07-08), EXTENDED by PR-C
// (docs/plans/2026-07-09-vocab-four-card-ladder.md §2.5): the mastered-
// numerator SUBSUMPTION clauses added to get_lessons_overview (scripts/
// migration.sql) are correlated reads of a sibling capability's RLS-protected
// `learner_capability_state` row, executed inside a SECURITY INVOKER function.
// A silent RLS-deny (e.g. `auth.uid()` misresolving, or a policy regression)
// would make a sibling subquery return nothing — subsumption never fires —
// and `scripts/__tests__/lessons-overview-mastery-parity.test.ts` would stay
// green throughout, because it is a STATIC source-string check: it can prove
// the SQL text has the right shape, but not that Postgres actually evaluates it
// under real RLS the way PostgREST does for a real authenticated request.
//
// PR-C generalized the subsumption clause to BOTH scaffold→successor pairs —
// `#1 ← (#3′ ∨ #6)` and `#2 ← #6` — so this script now exercises THREE
// correlated sibling reads in one session (architect warning §2.5: "a re-run
// of the old scenario is not sufficient"):
//   Scenario A (pre-existing) — #1 ← #6 (the produce_form_from_meaning_cap leg)
//   Scenario B (NEW)          — #1 ← #3′ (the recognise_meaning_from_audio_cap
//                                leg — the disjunct PR-C actually added)
//   Scenario C (NEW)          — #2 ← #6 (recognise_form_from_meaning_cap,
//                                un-retired by PR-A)
//
// This script closes the static/live gap by running the RPC inside a real
// Postgres session with `SET LOCAL ROLE authenticated` + `request.jwt.claims`
// set to a real test user's `sub` — exactly the two GUCs PostgREST sets
// per-request — and asserting each graduated scaffold is actually counted.
// Everything happens inside ONE transaction that is ALWAYS ROLLED BACK (no
// seeded data persists), following the same SSH → `docker exec supabase-db
// psql` transport `scripts/migrate.ts` uses (there is no direct Postgres port
// exposed to this machine).
//
// Run with: make verify-lessons-overview-rls
// Requires (in .env.local): POSTGRES_PASSWORD
// Optional: HOMELAB_SSH (default mrblond@master-docker), SUPABASE_DB_CONTAINER
//   (default supabase-db), TEST_USER_EMAIL (default testuser@duin.home — must
//   be a real row in auth.users; see memory/reference_test_user.md).
//
// This is a MAIN-THREAD / owner-gated step, run AFTER `make migrate` applies
// this slice's migration.sql to the live DB — never run automatically as part
// of an agent build. See CLAUDE.md → "Learner data is PRECIOUS". Scenario C
// requires the un-retire script (scripts/unretire-vocab-mode.ts --apply, spec
// §2.2) to have already run — #2 rows are otherwise all retired_at-not-null
// and the resolver will report "could not resolve a live #2/#6 pair".

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
// role switch stay scoped to it, and nothing seeded ever persists. Each
// scenario follows the SAME five-step shape as the original Slice-3 script:
//   1. Resolve a REAL, live pair for the same word (source_ref + lesson_id)
//      via \gset — never fabricated ids. Scenario B/C resolvers additionally
//      exclude ids already used by an earlier scenario in this session (so no
//      DELETE-then-INSERT step below ever clobbers another scenario's seed),
//      and Scenario A/B each exclude candidates whose OTHER disjunct sibling
//      already has genuine mastery-strength state for this user (a real #3′
//      already at strength would make Scenario A's baseline already "true"
//      before seeding #6, and vice versa for Scenario B — the exact confound
//      the OR generalization introduces).
//   2. Clean slate for exactly the two ids this scenario seeds (still
//      superuser — bypasses RLS for the write, which authenticated users
//      can't do directly anyway; all real writes go through the commit RPC).
//   3. Switch to `authenticated` + set `request.jwt.claims` to the test user's
//      sub, and capture a BASELINE mastered_capability_count for that lesson.
//   4. Switch back to superuser, seed the scaffold BELOW its own strength
//      (review_count 1) and the successor sibling AT strength (recency-free
//      per §5 — reviewed 60 days ago, well past the OLD flat 30-day window).
//   5. Switch back to `authenticated`, re-read mastered_capability_count.
// Each scenario's assertion is AFTER >= BASELINE + 1 (>= rather than ==, to
// tolerate concurrent real-user activity changing OTHER capabilities' counts
// mid-check). One ROLLBACK at the very end — nothing seeded here ever commits.
const sql = `
\\set ON_ERROR_STOP on
BEGIN;

select id as test_user_id from auth.users where email = '${TEST_USER_EMAIL}' \\gset

-- ============================================================
-- Scenario A — #1 ← #6 (pre-existing, re-verified unchanged)
-- ============================================================
select c1.id as cap1_id, c1.canonical_key as cap1_key,
       c6.id as cap6_id, c6.canonical_key as cap6_key,
       c1.lesson_id as lesson_a_id
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
  -- PR-C confound guard: exclude a word whose #3′ sibling already carries
  -- genuine mastery-strength state — that would make #1 already "true" via
  -- the OTHER disjunct before this scenario seeds #6, breaking the +1 delta.
  and not exists (
    select 1 from indonesian.learning_capabilities c3x
    join indonesian.learner_capability_state s3x
      on s3x.capability_id = c3x.id and s3x.user_id = :'test_user_id'::uuid
    where c3x.lesson_id = c1.lesson_id
      and c3x.source_ref = c1.source_ref
      and c3x.source_kind = 'vocabulary_src'
      and c3x.capability_type = 'recognise_meaning_from_audio_cap'
      and c3x.retired_at is null
      and coalesce(s3x.review_count, 0) >= 4
      and coalesce(s3x.stability, 0) >= 14
      and coalesce(s3x.consecutive_failure_count, 0) = 0
  )
order by c1.canonical_key
limit 1
\\gset

\\echo RESOLVED_A test_user_id=:test_user_id cap1_id=:cap1_id cap6_id=:cap6_id lesson_id=:lesson_a_id

delete from indonesian.learner_capability_state
where user_id = :'test_user_id'::uuid and capability_id in (:'cap1_id'::uuid, :'cap6_id'::uuid);

select set_config('request.jwt.claims', json_build_object('sub', :'test_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
select coalesce(mastered_capability_count, 0) as baseline_a
from indonesian.get_lessons_overview(:'test_user_id'::uuid)
where lesson_id = :'lesson_a_id'::uuid
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

select set_config('request.jwt.claims', json_build_object('sub', :'test_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
select coalesce(mastered_capability_count, 0) as after_a
from indonesian.get_lessons_overview(:'test_user_id'::uuid)
where lesson_id = :'lesson_a_id'::uuid
\\gset
reset role;

\\echo RESULT_A baseline=:baseline_a after=:after_a

-- ============================================================
-- Scenario B (NEW, PR-C) — #1 ← #3′ (the disjunct PR-C actually added)
-- ============================================================
select c1.id as cap1b_id, c1.canonical_key as cap1b_key,
       c3.id as cap3_id, c3.canonical_key as cap3_key,
       c1.lesson_id as lesson_b_id
from indonesian.learning_capabilities c1
join indonesian.learning_capabilities c3
  on c3.lesson_id = c1.lesson_id
 and c3.source_ref = c1.source_ref
 and c3.source_kind = 'vocabulary_src'
 and c3.capability_type = 'recognise_meaning_from_audio_cap'
 and c3.retired_at is null
join indonesian.lessons l
  on l.id = c1.lesson_id
 and not l.is_hidden
where c1.source_kind = 'vocabulary_src'
  and c1.capability_type = 'recognise_meaning_from_text_cap'
  and c1.retired_at is null
  and c1.readiness_status = 'ready'
  and c1.publication_status = 'published'
  and c1.lesson_id is not null
  and c1.id != :'cap1_id'::uuid
  -- confound guard, mirrored from Scenario A: exclude a word whose #6 sibling
  -- already carries genuine mastery-strength state — that would make #1
  -- already "true" via the OTHER disjunct before this scenario seeds #3′.
  and not exists (
    select 1 from indonesian.learning_capabilities c6x
    join indonesian.learner_capability_state s6x
      on s6x.capability_id = c6x.id and s6x.user_id = :'test_user_id'::uuid
    where c6x.lesson_id = c1.lesson_id
      and c6x.source_ref = c1.source_ref
      and c6x.source_kind = 'vocabulary_src'
      and c6x.capability_type = 'produce_form_from_meaning_cap'
      and c6x.retired_at is null
      and coalesce(s6x.review_count, 0) >= 4
      and coalesce(s6x.stability, 0) >= 14
      and coalesce(s6x.consecutive_failure_count, 0) = 0
  )
order by c1.canonical_key
limit 1
\\gset

\\echo RESOLVED_B cap1b_id=:cap1b_id cap3_id=:cap3_id lesson_id=:lesson_b_id

delete from indonesian.learner_capability_state
where user_id = :'test_user_id'::uuid and capability_id in (:'cap1b_id'::uuid, :'cap3_id'::uuid);

select set_config('request.jwt.claims', json_build_object('sub', :'test_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
select coalesce(mastered_capability_count, 0) as baseline_b
from indonesian.get_lessons_overview(:'test_user_id'::uuid)
where lesson_id = :'lesson_b_id'::uuid
\\gset

-- #1 stays BELOW its own strength; #3′ is at mastery strength (recency-free),
-- last_reviewed_at 60 days ago — pins the same stability-scaled window fix.
reset role;
insert into indonesian.learner_capability_state
  (user_id, capability_id, canonical_key_snapshot, activation_state, activation_source,
   review_count, stability, consecutive_failure_count, last_reviewed_at, next_due_at)
values
  (:'test_user_id'::uuid, :'cap1b_id'::uuid, :'cap1b_key', 'active', 'admin_backfill',
   1, 2, 0, now() - interval '1 day', now() + interval '1 day'),
  (:'test_user_id'::uuid, :'cap3_id'::uuid, :'cap3_key', 'active', 'admin_backfill',
   5, 20, 0, now() - interval '60 days', now() + interval '30 days');

select set_config('request.jwt.claims', json_build_object('sub', :'test_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
select coalesce(mastered_capability_count, 0) as after_b
from indonesian.get_lessons_overview(:'test_user_id'::uuid)
where lesson_id = :'lesson_b_id'::uuid
\\gset
reset role;

\\echo RESULT_B baseline=:baseline_b after=:after_b

-- ============================================================
-- Scenario C (NEW, PR-C) — #2 ← #6 (recognise_form_from_meaning_cap,
-- un-retired by PR-A; no OR — #6 is #2's only successor)
-- ============================================================
select c2.id as cap2_id, c2.canonical_key as cap2_key,
       c6c.id as cap6c_id, c6c.canonical_key as cap6c_key,
       c2.lesson_id as lesson_c_id
from indonesian.learning_capabilities c2
join indonesian.learning_capabilities c6c
  on c6c.lesson_id = c2.lesson_id
 and c6c.source_ref = c2.source_ref
 and c6c.source_kind = 'vocabulary_src'
 and c6c.capability_type = 'produce_form_from_meaning_cap'
 and c6c.retired_at is null
join indonesian.lessons l
  on l.id = c2.lesson_id
 and not l.is_hidden
where c2.source_kind = 'vocabulary_src'
  and c2.capability_type = 'recognise_form_from_meaning_cap'
  and c2.retired_at is null
  and c2.readiness_status = 'ready'
  and c2.publication_status = 'published'
  and c2.lesson_id is not null
  -- avoid re-seeding the exact #6 capability row Scenario A already inserted
  -- (a DELETE-then-INSERT here would clobber it, though harmlessly for A's
  -- already-computed assertion — excluding it keeps all three scenarios
  -- fully independent).
  and c6c.id != :'cap6_id'::uuid
order by c2.canonical_key
limit 1
\\gset

\\echo RESOLVED_C cap2_id=:cap2_id cap6c_id=:cap6c_id lesson_id=:lesson_c_id

delete from indonesian.learner_capability_state
where user_id = :'test_user_id'::uuid and capability_id in (:'cap2_id'::uuid, :'cap6c_id'::uuid);

select set_config('request.jwt.claims', json_build_object('sub', :'test_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
select coalesce(mastered_capability_count, 0) as baseline_c
from indonesian.get_lessons_overview(:'test_user_id'::uuid)
where lesson_id = :'lesson_c_id'::uuid
\\gset

-- #2 stays BELOW its own strength; #6 is at mastery strength (recency-free),
-- last_reviewed_at 60 days ago — pins the same stability-scaled window fix.
reset role;
insert into indonesian.learner_capability_state
  (user_id, capability_id, canonical_key_snapshot, activation_state, activation_source,
   review_count, stability, consecutive_failure_count, last_reviewed_at, next_due_at)
values
  (:'test_user_id'::uuid, :'cap2_id'::uuid, :'cap2_key', 'active', 'admin_backfill',
   1, 2, 0, now() - interval '1 day', now() + interval '1 day'),
  (:'test_user_id'::uuid, :'cap6c_id'::uuid, :'cap6c_key', 'active', 'admin_backfill',
   5, 20, 0, now() - interval '60 days', now() + interval '30 days');

select set_config('request.jwt.claims', json_build_object('sub', :'test_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
select coalesce(mastered_capability_count, 0) as after_c
from indonesian.get_lessons_overview(:'test_user_id'::uuid)
where lesson_id = :'lesson_c_id'::uuid
\\gset
reset role;

\\echo RESULT_C baseline=:baseline_c after=:after_c

ROLLBACK;
`

console.log(`Verifying get_lessons_overview mastered-numerator subsumption under real RLS (3 scenarios: #1←#6, #1←#3′, #2←#6)`)
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
  console.error('   If Scenario C failed to resolve: #2 rows may still be retired_at-not-null —')
  console.error('   run scripts/unretire-vocab-mode.ts --apply first (spec §2.2).')
  process.exit(1)
}

interface ScenarioSpec {
  label: string
  resolvedPattern: RegExp
  resultPattern: RegExp
  resolveErrorHint: string
}

const scenarios: ScenarioSpec[] = [
  {
    label: '#1 ← #6',
    resolvedPattern: /RESOLVED_A test_user_id=(\S+) cap1_id=(\S+) cap6_id=(\S+) lesson_id=(\S+)/,
    resultPattern: /RESULT_A baseline=(\d+) after=(\d+)/,
    resolveErrorHint: 'Check TEST_USER_EMAIL exists in auth.users, and that at least one lesson has a '
      + 'published vocabulary_src #1 with a non-retired #6 sibling (post-Slice-1 baseline).',
  },
  {
    label: '#1 ← #3′ (NEW disjunct, PR-C)',
    resolvedPattern: /RESOLVED_B cap1b_id=(\S+) cap3_id=(\S+) lesson_id=(\S+)/,
    resultPattern: /RESULT_B baseline=(\d+) after=(\d+)/,
    resolveErrorHint: 'Check at least one OTHER lesson has a published vocabulary_src #1 with a '
      + 'non-retired #3′ (recognise_meaning_from_audio_cap) sibling and no confounding #6 mastery state.',
  },
  {
    label: '#2 ← #6 (NEW pair, PR-C)',
    resolvedPattern: /RESOLVED_C cap2_id=(\S+) cap6c_id=(\S+) lesson_id=(\S+)/,
    resultPattern: /RESULT_C baseline=(\d+) after=(\d+)/,
    resolveErrorHint: '#2 rows may still be retired_at-not-null — run scripts/unretire-vocab-mode.ts '
      + '--apply first (spec §2.2). Otherwise check for a non-retired #6 sibling.',
  },
]

let allPassed = true

for (const scenario of scenarios) {
  const resolvedMatch = scenario.resolvedPattern.exec(stdout)
  if (!resolvedMatch || Array.from(resolvedMatch).slice(1).some(g => !g)) {
    console.error(`\n❌ Scenario ${scenario.label}: could not resolve a live pair (or the test user) — nothing to verify.`)
    console.error(`   ${scenario.resolveErrorHint}`)
    allPassed = false
    continue
  }

  const resultMatch = scenario.resultPattern.exec(stdout)
  if (!resultMatch) {
    console.error(`\n❌ Scenario ${scenario.label}: could not parse the RESULT line from psql output — see full output above.`)
    allPassed = false
    continue
  }

  const baseline = Number(resultMatch[1])
  const after = Number(resultMatch[2])
  console.log(`Scenario ${scenario.label}: mastered_capability_count baseline=${baseline} → after=${after}`)

  if (after < baseline + 1) {
    console.error(
      `\n❌ Scenario ${scenario.label} FAILED — mastered_capability_count did not increase after seeding a `
      + 'graduated scaffold + strength-successor pair. This is exactly the silent-RLS-deny regression the '
      + 'subsumption clause is meant to guard against (the correlated sibling read may be getting denied, or '
      + 'the subsumption clause itself regressed).',
    )
    allPassed = false
  }
}

if (!allPassed) {
  console.error('\n❌ FAILED — do not ship this migration until ALL THREE scenarios pass.')
  process.exit(1)
}

console.log('\n✅ PASSED — all three subsumption pairs (#1←#6, #1←#3′, #2←#6) were counted under real authenticated-role RLS.')
process.exit(0)
