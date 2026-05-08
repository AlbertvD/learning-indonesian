# Known regressions

Pre-existing infrastructure issues flagged by `make check-supabase-deep` that
predate the retirement currently in flight. Captured here so subsequent
retirements / deploys don't re-surface them as new failures.

Each entry has: **what** the failure is, **when** it surfaced, **why** it
hasn't been fixed yet, and the **fix** that should land.

---

## 1. Two capability tables — RLS enabled with zero policies

**Surfaced:** 2026-05-02 originally; partially fixed on 2026-05-08 (the
ten-table version) when the regression turned out to be actively breaking
the lesson reader at deploy time, not just a latent risk. The hard-fix
(re-applying `scripts/migrations/2026-05-02-lesson-content-rls-policies.sql`)
landed for 8 of the 10 tables; two stragglers remain.

**What's broken.** Two capability-related tables still have row-level
security enabled with zero policies declared. Under PostgREST, every
SELECT/INSERT from `authenticated` is denied for these tables — only
`service_role` calls succeed. Runtime impact is currently nil because no
production code path reads from these two tables under the authenticated
role.

**Affected tables:**

```
indonesian.capability_resolution_failure_events
indonesian.learner_lesson_engagement
```

**Why unfixed.** The 2026-05-02 migration didn't declare policies for
either table. They're write-only-from-RPCs surfaces today, so they don't
trip the runtime. Adding owner-read policies (`user_id = auth.uid()`) is
trivial but hasn't been spec'd yet.

**Fix.** Author + apply a small migration declaring two policies:

```sql
alter table indonesian.capability_resolution_failure_events enable row level security;
drop policy if exists "capability resolution failure events owner read"
  on indonesian.capability_resolution_failure_events;
create policy "capability resolution failure events owner read"
  on indonesian.capability_resolution_failure_events for select
  to authenticated using (user_id = auth.uid());

alter table indonesian.learner_lesson_engagement enable row level security;
drop policy if exists "learner lesson engagement owner read"
  on indonesian.learner_lesson_engagement;
create policy "learner lesson engagement owner read"
  on indonesian.learner_lesson_engagement for select
  to authenticated using (user_id = auth.uid());
```

**Blocked on.** Decision on whether `learner_lesson_engagement` should be
retired entirely (its retirement-candidacy was flagged in
`docs/target-architecture.md` but no PR has landed).

---

## 2. Five lessons missing `audio_path`

**Surfaced:** Retirement #4 (2026-05-07, per CLAUDE.md note: "the
lesson-audio_path seed gap from retirement #4 still exists on main").

**What's broken.** Five lesson rows in `indonesian.lessons` have a NULL
`audio_path` column, even though their podcast/lesson audio files exist
in the `indonesian-lessons` storage bucket. The lesson reader gracefully
hides the audio panel when `audio_path` is NULL, so the user-facing
impact is "no audio for these five lessons" — not a crash, but a
content-quality regression.

**Affected lessons:**

```
Les 6 - Jakarta
Les - Ke Puskesmas / Dukun en Jamu
Les 5 - Belajar
Les 7 - Libur Sekolah
Les - Batik
```

**Why unfixed.** Retirement #4 (goal subsystem retirement) inadvertently
truncated the seed-lessons run halfway. The next `make seed-lessons` will
re-populate the missing rows.

**Fix.**

```bash
SUPABASE_SERVICE_KEY=<service-role-key> make seed-lessons
```

Service-role key lives in the homelab Supabase Studio dashboard. Safe to
re-run — the seed script is idempotent (`upsert on conflict (id)`).

**Blocked on.** Operator running the seed once with the service key. No
code or schema changes required.

---

## Update protocol

When a regression listed here is fixed, **delete the entry** rather than
marking it resolved. This file should always reflect the *currently
broken* state — historical regressions live in git history.

When a new regression is found, add it here with the same shape (what /
when / why / fix / blocked on) so the next operator deploying anything
sees it before they hit it as a `check-supabase-deep` failure.
