# Known regressions

Pre-existing infrastructure issues flagged by `make check-supabase-deep` that
predate the retirement currently in flight. Captured here so subsequent
retirements / deploys don't re-surface them as new failures.

Each entry has: **what** the failure is, **when** it surfaced, **why** it
hasn't been fixed yet, and the **fix** that should land.

---

## 1. Capability tables — RLS enabled with zero policies

**Surfaced:** 2026-05-02 (per CLAUDE.md). Reconfirmed at every
`make check-supabase-deep` invocation since.

**What's broken.** Ten capability-related tables have row-level security
enabled but zero policies declared. Under PostgREST, every SELECT/INSERT
from `authenticated` is denied for these tables — only `service_role` calls
succeed. The runtime app currently routes capability reads through the
`indonesian` schema RPCs (`get_lessons_overview`,
`commit_capability_answer_report`) which run `SECURITY DEFINER` and bypass
RLS, so the user-facing failure mode is masked. Direct PostgREST queries
from the browser to any of these tables would 403.

**Affected tables:**

```
indonesian.capability_aliases
indonesian.capability_artifacts
indonesian.capability_content_units
indonesian.capability_resolution_failure_events
indonesian.capability_review_events
indonesian.content_units
indonesian.learner_capability_state
indonesian.learner_lesson_engagement
indonesian.learning_capabilities
indonesian.lesson_page_blocks
```

**Why unfixed.** A deploy on 2026-05-02 enabled RLS on these tables without
declaring the matching SELECT policies. The original migration that should
declare them lives at
`scripts/migrations/2026-05-02-lesson-content-rls-policies.sql` but has not
been re-applied since the regression. The `check-supabase-deep` rule was
hardened at the same time so the regression is *visible* on every health
run, but no follow-up landed.

**Fix.**

```bash
PGPASSWORD=$POSTGRES_PASSWORD ssh mrblond@master-docker \
  "sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
  < scripts/migrations/2026-05-02-lesson-content-rls-policies.sql
```

After applying, re-run `make check-supabase-deep` — the ten "RLS enabled
with ZERO policies" errors should clear. Until they do, a future deploy
that drops the SECURITY DEFINER bypass (e.g. switching an RPC to
SECURITY INVOKER) would expose every authenticated user to a 403 on the
affected table.

**Blocked on.** Nothing technical — the SQL is ready to apply. Holding for
a quiet window so any unintended policy drift is easy to attribute.

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
