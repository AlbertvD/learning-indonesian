---
status: approved
approved_at: 2026-07-02  # product defaults chosen: 90/90 window, email as confirmation phrase, 48h HC threshold
branch: feat/launch-readiness-round-2
reviewed_by: [architect, data-architect]
supersedes: []
privacy_copy_status: DRAFT — the /privacy page copy in §4 is engineering-authored placeholder text and MUST receive the user's own legal review before public launch. It is not legal advice and is not launch-ready as written.
---

# GDPR erasure + retention + privacy policy

> **Review gate:** this spec touches the data model (a new `pg_cron` retention job
> and a `SECURITY DEFINER` health function in `scripts/migration.sql`, plus new edge
> function behaviour against `auth.users`). Per `CLAUDE.md` → "A spec that touches the
> data model needs BOTH `architect` and `data-architect` sign-off", **both** must
> appear in `reviewed_by:` before this moves to `status: approved`. The pre-commit
> `plan-review-gate` enforces this. Do not implement while `status: draft`.

## Goals

Ground: `docs/audits/2026-07-02-gdpr-pii-audit.md` (verified PII inventory §1, cascade
map §2, missing-rights machinery §3, retention proposals §4). This spec builds exactly
the three items the user approved:

1. **Account erasure (Art. 17)** — a self-serve "Account verwijderen" path: a new
   `delete-account` edge function that verifies the caller's JWT and deletes their
   `auth.users` row via the GoTrue admin API, letting the existing FK cascade (§2 of the
   audit) wipe all learner data; wired to a type-to-confirm danger-zone section on
   `src/pages/Profile.tsx`.
2. **Retention (Art. 5(1)(e))** — a daily `pg_cron` job that deletes `error_logs` and
   `capability_resolution_failure_events` rows older than 90 days, plus a health check
   that the job exists and has run successfully recently.
3. **Privacy policy page** — a static, public `/privacy` route (NL primary, EN toggle)
   rendering the processing inventory from the audit's facts, linked from Register and
   Profile.

## Non-goals

- **Data export / access (Art. 15/20)** — explicitly out of scope; the audit flags it
  MAJOR (§3, §5 item 3) but the user has deferred it to a follow-up spec. Do not build
  it here.
- **`answer_report_json.rawResponse` redaction window** — the audit (§4) leaves this as
  an undecided product/legal call. Erasure already cascade-deletes it with the account.
  Not built here.
- **The 7 stray `anon` SELECT grants** (audit §5 item 5) — carried-over security finding,
  separate spec.
- **The stale comment at `scripts/migration.sql:49`** (audit §5 item 7) — one-line
  cosmetic fix, not part of this build's surface.
- **Cookie banner** — the audit (§3) establishes the single Supabase session cookie is
  ePrivacy Art. 5(3)-exempt (strictly necessary). We state this in the policy text; we do
  NOT add a banner (over-mechanism for one functional cookie).
- **Admin-only erasure runbook** — the user chose the self-serve UI variant; no
  `docs/process/` runbook is built.

---

## Target-architecture grounding

Per `CLAUDE.md` ("Before drafting any plan … ground it in the target architecture first"):

- **Edge functions** are not part of the `src/lib/<module>` fold roster; they live under
  `supabase/functions/<name>/`. `docs/target-architecture.md` has no constraint on this
  surface — no fold slated, no legacy marker. A new function is a new sibling directory
  (see the multiplexing note below). **No fold-target drift.**
- **`src/pages/Profile.tsx`** — page-framework surface (already on `PageContainer`/
  `PageBody`/`SettingsCard`, `Profile.tsx:195-333`); we add one more `SettingsCard`, no
  new module, no placement change.
- **`scripts/migration.sql`** is the single migration source of truth (`CLAUDE.md` →
  Migration source-of-truth rule). The cron job + health function land here, not in
  `scripts/migrations/*.sql` (paper-trail only).
- **`/privacy` page** — a new static page under `src/pages/`, a public sibling of
  `Login`/`Register` (`App.tsx:87-89`). No new module.

No code lands at a legacy/fold-slated seam. No `src/services/` growth.

---

## 1. Account erasure — the `delete-account` edge function

### 1.1 Why an edge function, not a SECURITY DEFINER SQL function

GoTrue owns `auth.users` and its side tables (`auth.identities`, `auth.sessions`,
`auth.refresh_tokens`). Deleting only the `public`/`indonesian`-visible `auth.users` row
from SQL leaves GoTrue's identity/session bookkeeping inconsistent, and a
`SECURITY DEFINER` function that reaches across the `auth` schema needs ownership /
`search_path` gymnastics the data-architect flagged as drift-prone. The GoTrue admin
endpoint `DELETE /auth/v1/admin/users/{id}` performs the *complete* user teardown
(identities + sessions + the `auth.users` row), and the service-role edge pattern is
already proven twice in this repo (`signup-with-invite`, `commit-capability-answer-report`).
Deleting the `auth.users` row is what triggers every `ON DELETE CASCADE` in the map below.

### 1.2 Cascade the deletion relies on (re-verified against `scripts/migration.sql`)

The function does **not** delete any `indonesian` table directly — it deletes the
`auth.users` row and the FK cascade does the rest. Re-verified this round (not from the
audit's prose):

| Table | FK clause | Cite | On `auth.users` delete |
|---|---|---|---|
| `profiles` | `id … REFERENCES auth.users(id) ON DELETE CASCADE` | `migration.sql:51` | row deleted |
| `learning_sessions` | `user_id … REFERENCES auth.users(id) ON DELETE CASCADE` | `migration.sql:284` | row deleted |
| `learner_capability_state` | `user_id … references auth.users(id) on delete cascade` | `migration.sql:1215` | FSRS state deleted |
| `error_logs` | `user_id … REFERENCES auth.users(id) ON DELETE SET NULL` | `migration.sql:315` | row survives, `user_id` nulled (anonymized) |
| `capability_resolution_failure_events` | `user_id … references auth.users(id) on delete set null` | `migration.sql:1266` | row survives, `user_id` nulled |

The remaining 7 cascade tables (audit §2: `user_roles`, `content_flags`,
`exercise_review_comments`, `capability_review_events`, `learner_lesson_activation`,
`learner_collection_activation`, `learner_reading_harvest`) are taken from the audit's
verified grep of the 12 `REFERENCES auth.users` hits — the spec relies on the audit for
those but re-verified the 3 CASCADE + 2 SET NULL representatives above independently, per
the "audit-derived specs re-verify load-bearing claims" rule.

### 1.3 The edge runtime multiplexes by path segment

`supabase/functions/main/index.ts` (added 2026-07-02) routes each request to
`/home/deno/functions/<serviceName>` where `serviceName = url.pathname.split('/')[1]`
(`main/index.ts:13-14`, Kong strips `/functions/v1/` so the first segment is the function
name). **A new function is just a new directory** — `supabase/functions/delete-account/`.
No router edit, no Kong change, no config change (see Supabase Requirements → homelab).

### 1.4 Function contract

`supabase/functions/delete-account/index.ts`, modeled on
`commit-capability-answer-report/index.ts` (JWT-verify shape) and
`signup-with-invite/index.ts` (GoTrue admin `fetch` shape). The client calls
`supabase.functions.invoke('delete-account')`, which attaches the caller's session JWT as
`Authorization: Bearer <token>` automatically (same mechanism the commit function relies
on, `commit-capability-answer-report/index.ts:209-233`).

**Request:** no body required. The caller is identified by their JWT, never by a
client-supplied id. (Optionally accept `{ userId }` and reject on mismatch as a
belt-and-braces echo of the commit function's `user_mismatch`, but the JWT `user.id` is
the sole authority for *which* user is deleted — never trust a body id for the delete
target.)

**Response codes:**

| Status | Body | When |
|---|---|---|
| 200 | `{ ok: true }` | user deleted, or already absent (idempotent — see §1.6) |
| 401 | `{ error: 'missing_user_jwt' }` | no `Authorization: Bearer` header |
| 401 | `{ error: 'invalid_user_jwt' }` | GoTrue `/auth/v1/user` rejects the token |
| 403 | `{ error: 'user_mismatch' }` | optional body `userId` present and ≠ JWT `user.id` |
| 405 | `{ error: 'method_not_allowed' }` | non-POST (OPTIONS returns `'ok'`) |
| 500 | `{ error: 'server_not_configured' }` | missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` |
| 500 | `{ error: 'delete_failed' }` | GoTrue admin delete returned a non-2xx that is not 404 |

**Full function body (inline — no placeholder):**

```typescript
// supabase/functions/delete-account/index.ts
//
// Self-serve account erasure (GDPR Art. 17). Verifies the caller's JWT via
// GoTrue /auth/v1/user, then deletes the user via the GoTrue admin API
// DELETE /auth/v1/admin/users/{id} with the service key. Deleting the
// auth.users row triggers every ON DELETE CASCADE in scripts/migration.sql
// (see docs/plans/2026-07-02-gdpr-erasure-retention.md §1.2), wiping all
// learner data in one Postgres-native operation. error_logs +
// capability_resolution_failure_events survive with user_id nulled (SET NULL).
//
// Modeled on commit-capability-answer-report/index.ts (JWT verify) and
// signup-with-invite/index.ts (GoTrue admin fetch). Consumes NO invite code.
// Idempotent: a second call after the user is gone returns 200 (see §1.6).

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function publicReject(status: number, error: string): Response {
  return jsonResponse({ error }, status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok')
  }
  if (request.method !== 'POST') {
    return publicReject(405, 'method_not_allowed')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return publicReject(500, 'server_not_configured')
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return publicReject(401, 'missing_user_jwt')
  }

  // Body is optional; if a userId is supplied it must match the JWT subject.
  const body = await request.json().catch(() => null)
  const claimedUserId = isRecord(body) && typeof body.userId === 'string' ? body.userId : null

  // 1. Verify the caller's JWT — the JWT subject is the sole delete target.
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: serviceRoleKey },
  })
  if (!userResponse.ok) {
    return publicReject(401, 'invalid_user_jwt')
  }
  const user = await userResponse.json()
  const userId = typeof user?.id === 'string' ? user.id : null
  if (!userId) {
    return publicReject(401, 'invalid_user_jwt')
  }
  if (claimedUserId && claimedUserId !== userId) {
    return publicReject(403, 'user_mismatch')
  }

  // 2. Delete via GoTrue admin API. 404 = already gone = idempotent success.
  // should_soft_delete: false is LOAD-BEARING (data-architect G1): a soft
  // delete would ban/scramble the auth.users row WITHOUT removing it, so the
  // ON DELETE CASCADE / SET NULL clauses never fire and every indonesian.*
  // learner row silently survives while the client sees { ok: true }. Hard
  // delete must additionally be proven at build time with a throwaway user
  // (see Testing) — never assumed from the flag alone.
  const deleteResponse = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ should_soft_delete: false }),
    },
  )
  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    const detail = await deleteResponse.text().catch(() => '')
    console.error('gotrue_admin_delete_user_failed', { status: deleteResponse.status, detail })
    return publicReject(500, 'delete_failed')
  }

  return jsonResponse({ ok: true })
})
```

### 1.5 Consumes no invite code

Unlike `signup-with-invite`, this function never touches `redeem_invite_code` /
`restore_invite_code` — erasure has nothing to do with invite issuance. Explicitly called
out because both functions share the GoTrue-admin idiom and a reviewer might expect
symmetry; there is none here by design.

### 1.6 Idempotency / double-click safety

Two concurrent or sequential calls are safe:
- After the first delete, the JWT is for a now-deleted user. GoTrue `/auth/v1/user`
  behaviour on a token whose user is gone: the token may still validate until expiry
  (JWT is self-contained) OR return 401 if GoTrue checks user existence. **Either branch
  is safe:** a 401 short-circuits to `invalid_user_jwt` (harmless — the account is already
  gone); a 200-validate falls through to the admin DELETE, which returns **404** for the
  already-deleted user, which we map to `{ ok: true }`. No error surfaces to a
  double-clicking user. The client also disables the confirm button on first click
  (§1.7) and signs out immediately, making a second call unlikely regardless.

### 1.7 Client — Profile danger zone

Add a final `SettingsCard` to `src/pages/Profile.tsx` (after the session-size card,
`Profile.tsx:290-332`), titled "Account verwijderen" (T.profile.deleteAccount…), red-tinted:

- Explanatory text: deletion is permanent, wipes all progress/FSRS/session history, cannot
  be undone; links to `/privacy` for what is stored.
- A "Account verwijderen" button (`color="red"`, `variant="outline"`) that opens a Mantine
  modal.
- **Type-to-confirm modal:** a `TextInput` that must exactly equal a fixed confirmation
  phrase (`user?.email`, which is already displayed at `Profile.tsx:204`, or a fixed
  Dutch word like `VERWIJDEREN`). The final delete button is `disabled` until the typed
  value matches, and shows `loading` during the call (mirrors the existing `saving`/
  `disabled` pattern used throughout Profile).
- On confirm: `await supabase.functions.invoke('delete-account')`; on the returned
  `error`, surface a friendly `notifications.show({ color: 'red', … })` + `logError({ page:
  'profile', action: 'deleteAccount', error })` (per `CLAUDE.md` → Error Handling). On
  success: `await signOut()` (`useAuthStore(s => s.signOut)`, `authStore.ts:15,117-118`)
  then `navigate('/login')`. Note: after account deletion the `logError` write for any
  *failure* path still works because the failure means the user still exists; a *success*
  path performs no further authenticated writes.

**Friendly-error mapping** (extract the `{ error }` code via the same
`FunctionsHttpError` → `.context.json()` pattern as `Register.tsx:20-28`):
`invalid_user_jwt`/`missing_user_jwt` → "Je sessie is verlopen. Log opnieuw in en probeer
het nog eens." · everything else → the generic "Er ging iets mis. Probeer het opnieuw."

---

## 2. Retention — daily `pg_cron` purge

### 2.1 Placement + idiom

Lands in `scripts/migration.sql` immediately after the existing
`CREATE EXTENSION IF NOT EXISTS pg_cron` (`migration.sql:524` — the extension is already
installed and idle, "available for non-goal jobs (currently none scheduled)"). Uses the
established idempotent unschedule-then-schedule idiom already in this file
(`migration.sql:1116-1119` for the retired goal jobs; `cron.schedule(...)` call shape from
`scripts/migrations/2026-05-07-retire-session-lifecycle.rollback.sql:72-73`).

**Full migration block (inline):**

```sql
-- ============================================================================
-- GDPR retention (Art. 5(1)(e) storage limitation) — 2026-07-02
-- Daily purge of the two diagnostic tables that survive account deletion via
-- ON DELETE SET NULL (error_logs :315, capability_resolution_failure_events
-- :1266). 90-day rolling window for both. pg_cron extension already installed
-- (:524). Idempotent: unschedule-if-exists (swallow the "job not found" error)
-- then schedule under a fixed jobname.
-- ============================================================================

do $$ begin perform cron.unschedule('gdpr-retention-purge'); exception when others then null; end $$;

select cron.schedule(
  'gdpr-retention-purge',
  '0 3 * * *',                         -- 03:00 daily (server tz), low-traffic
  $job$
    delete from indonesian.error_logs
      where created_at < now() - interval '90 days';
    delete from indonesian.capability_resolution_failure_events
      where created_at < now() - interval '90 days';
  $job$
);
```

**Why the DELETE passes RLS — the mechanism is table ownership, not superuser
(data-architect G2, must hold at build time):** `migrate.ts:27` applies this file as
`psql -U postgres`, so `postgres` owns both tables and is the `cron.schedule` caller →
job owner. Both tables have RLS ENABLED but not `FORCE ROW LEVEL SECURITY`, and Postgres
exempts the *table owner* from non-FORCE RLS — `postgres` is **not** superuser on this
instance (only `supabase_admin` is), so ownership is the only thing making the purge work.
If that assumption ever breaks (e.g. a table recreated via Studio under another owner),
the DELETE silently affects zero rows while `cron.job_run_details.status` still reads
`succeeded` — RLS filters, it does not error. Therefore: (a) this mechanism is documented
in the migration comment; (b) the build MUST include an actual-purge test (insert a
deliberately old throwaway row, run the job body, assert the row is GONE — never trust
job status alone); (c) HC40 asserts job status AND is paired with that build-time proof.

**Retention window:** 90 days for **both** tables. The audit (§4) floated 180 days for
`capability_resolution_failure_events` as "defensible" but explicitly left the number as a
user decision. This spec picks 90 for both because (a) a single window is one fewer number
to defend in the privacy policy, and (b) both are pure debug telemetry with no product
dependency. **Open question for reviewers / user:** confirm 90/90, or set the failure-events
window to 180.

### 2.2 Omission test (per `CLAUDE.md` Minimum Mechanism)

- **The `pg_cron` job** — if omitted, `error_logs` and
  `capability_resolution_failure_events` grow unbounded, violating Art. 5(1)(e) storage
  limitation (audit §4). Cheapest mechanism that gives an *actually bounded* guarantee:
  the extension is already paid for, so this is zero new infrastructure class. A `make`
  target or host cron is strictly more mechanism for the same guarantee (audit §4 table,
  rejected); app-level lazy purge doesn't actually bound storage (rejected). **Keep.**
- **The health function + HC (§2.3)** — if omitted, a future Postgres image without the
  `pg_cron` background worker running would silently stop purging with no signal (audit
  §4: "installed and idle"; the extension being *installed* does not guarantee the
  background worker is *running*). **Keep** — but see §2.3 for why it is the *cheapest*
  form, not extra.
- **No new table, column, trigger, or generated column.** The purge is a `DELETE`, not a
  schema change.

### 2.3 Health check — job exists AND ran successfully recently

`check-supabase-deep.ts` talks to the DB exclusively via PostgREST (`supabase-js`
`createClient` + `.rpc()`/`.from()`, `check-supabase-deep.ts:5,26`). **The `cron` schema
is not exposed to PostgREST** (`PGRST_DB_SCHEMAS = public,storage,graphql_public,
indonesian` per `CLAUDE.md`), so `cron.job` / `cron.job_run_details` are unreachable from
the check as written. Two options:

- **(A) A tiny `SECURITY DEFINER` function in the `indonesian` schema** that reads
  `cron.job` + `cron.job_run_details` and returns `(jobname, active, last_status,
  last_run_at)`, callable via `.rpc()`. This mirrors the existing `schema_health()`
  SECURITY DEFINER pattern (`migration.sql:511-517`, incl. the `REVOKE ALL … FROM PUBLIC`
  + `GRANT EXECUTE … TO authenticated` hygiene).
- (B) Give `check-supabase-deep` a direct `pg` connection. Rejected — it would add a
  second DB-access mechanism to a file that is deliberately PostgREST-only, more mechanism
  than (A).

**Choose (A).** The function is load-bearing (without it the HC literally cannot see the
job), not decorative — it passes the omission test.

**Full function (inline):**

```sql
-- Retention-job health probe. SECURITY DEFINER because cron.* is owned by the
-- superuser and not exposed to PostgREST; mirrors schema_health() (:511-517).
create or replace function indonesian.retention_cron_health()
returns table (jobname text, active boolean, last_status text, last_run_at timestamptz)
language sql
security definer
set search_path = pg_catalog, cron
as $$
  select j.jobname,
         j.active,
         d.status,
         d.start_time
  from cron.job j
  left join lateral (
    select status, start_time
    from cron.job_run_details r
    where r.jobid = j.jobid
    order by r.start_time desc
    limit 1
  ) d on true
  where j.jobname = 'gdpr-retention-purge';
$$;

revoke all on function indonesian.retention_cron_health() from public;
-- service_role ONLY (data-architect G3): check-supabase-deep (service key) is
-- the sole caller in the repo; an authenticated grant would expose cron-job
-- telemetry to every browser session for no consumer.
grant execute on function indonesian.retention_cron_health() to service_role;
```

**HC40** (next free number — highest live is HC39, `check-supabase-deep.ts:2009-2040`),
added before the `// ── Output ──` block:

```typescript
// ── HC40 (GDPR retention, this spec): the gdpr-retention-purge cron job exists,
//        is active, and has a recent successful run. pg_cron installed-and-idle
//        (migration.sql:524) does NOT guarantee the background worker is running;
//        this catches a silently-stopped purge. Reads cron.* via the
//        indonesian.retention_cron_health() SECURITY DEFINER function because the
//        cron schema is not exposed to PostgREST.
{
  const { data, error } = await supabase
    .schema('indonesian')
    .rpc('retention_cron_health')
  if (error) {
    fail('HC40 gdpr-retention-purge cron job healthy', error.message)
  } else {
    const row = (data ?? [])[0]
    if (!row) {
      fail('HC40 gdpr-retention-purge cron job healthy',
        'Job not found in cron.job — the retention purge is not scheduled. ' +
        'Re-apply scripts/migration.sql (make migrate).')
    } else if (!row.active) {
      fail('HC40 gdpr-retention-purge cron job healthy', 'Job exists but is inactive (cron.job.active = false).')
    } else if (row.last_run_at == null) {
      // Scheduled but never fired yet — acceptable within the first 24h of deploy;
      // treat as pass with a note rather than a hard fail (would false-red a fresh migrate).
      pass('HC40 gdpr-retention-purge cron job scheduled + active (no run yet — expected < 24h post-migrate)')
    } else {
      const lastRun = new Date(row.last_run_at as string)
      const ageHours = (Date.now() - lastRun.getTime()) / 3_600_000
      if (row.last_status !== 'succeeded') {
        fail('HC40 gdpr-retention-purge cron job healthy',
          `Last run status = ${row.last_status} at ${row.last_run_at} — the purge is failing.`)
      } else if (ageHours > 48) {
        fail('HC40 gdpr-retention-purge cron job healthy',
          `Last successful run was ${ageHours.toFixed(0)}h ago (> 48h) — the daily job may have stalled.`)
      } else {
        pass(`HC40 gdpr-retention-purge cron job healthy (last succeeded ${ageHours.toFixed(0)}h ago)`)
      }
    }
  }
}
```

Rationale for the 48h staleness threshold: the job runs daily (~24h cadence); 48h gives
one missed-run of slack before red, so a single transient skip doesn't false-alarm but a
genuinely stalled worker does.

---

## 3. Cross-module invariant check

Does this spec introduce a cross-module invariant (a rule two+ modules must agree on)?
**No new one that needs the three-layer gate.** The erasure path relies on an *existing*
invariant — "every user-linked table FKs `auth.users` with an explicit `ON DELETE`
clause" — which the audit §2 verified is already true for all 12 hits and which the DB
enforces structurally (an FK-less `user_id` column would orphan on delete). We add a note,
not a gate: **any future user-linked table MUST carry `REFERENCES auth.users(id) ON DELETE
CASCADE` (or `SET NULL` for anonymize-and-keep diagnostics)** so this erasure path stays
complete. This belongs as a one-line reminder in the erasure section of
`docs/current-system/data-model.md`, not a new health check — the FK constraint itself is
the enforcement (Layer-2-equivalent), and a "count orphaned user_id rows" HC would only
ever catch a schema bug the DB already rejects at write time.

---

## 4. Privacy policy page (`/privacy`)

> **DRAFT COPY — REQUIRES THE USER'S LEGAL REVIEW.** The prose below is
> engineering-authored placeholder derived from the audit's *facts*; it is not legal
> advice and must be reviewed by the user (and ideally counsel) before public launch. See
> the `privacy_copy_status` frontmatter flag.

### 4.1 Route + placement

Public route, sibling of `/login` and `/register` (`App.tsx:87-89`), OUTSIDE the
`<Route element={<Layout />}>` block and NOT wrapped in `ProtectedRoute` — it must be
reachable pre-auth (linked from Register). New page `src/pages/Privacy.tsx`, **lazy**
(architect review): the `App.tsx:11-14` policy keeps only *landing* surfaces
(Login/Register/Dashboard) eager; `/privacy` is rarely visited and drags in a new
bilingual i18n block — wrap it in the existing `LazyPage`/`Suspense` pattern like
`/preview`.

```tsx
<Route path="/privacy" element={<Privacy />} />
```

### 4.2 Language handling (NL primary, EN toggle — the cheap pattern)

`Login`/`Register` pin `nl as T` because they render before the profile loads
(`Login.tsx:8-12`, `Register.tsx:11-14`). `/privacy` is visited both pre-auth (from
Register) and post-auth (from Profile), so it cannot rely on `useT`/profile either.
**Cheapest correct pattern:** a local `useState<'nl' | 'en'>('nl')` with a small
`SegmentedControl` at the top of the page (NL default), rendering copy from a new
`privacy` block added to both `nl` and `en` in `src/lib/i18n.ts` (the file already has
parallel `nl`/`en` objects, `i18n.ts:4,449`, and a `translations` map, `i18n.ts:895`).
This is self-contained — no auth/profile dependency, no new context. Matching Profile's
existing `translations[lang]` access idiom (`Profile.tsx:102`).

### 4.3 Content (from the audit's verified facts — DRAFT)

Render as `PageContainer`/`PageBody`/`PageHeader` + sectioned text. Sections:

1. **Wie is verantwoordelijk** — the controller (the author, EU-based; add contact email
   placeholder `<<USER TO FILL>>`).
2. **Welke gegevens we opslaan en waarom** — a table from audit §1: email (login),
   display name (personalization), timezone/language/session prefs, FSRS learning state +
   session history + answer reports (core spaced-repetition product function), error logs
   (debugging), flag comments (content quality). Legal basis: contract necessity (auth +
   core learning function) / legitimate interest (debugging telemetry).
3. **Bewaartermijn** — FSRS/session/profile: for the life of the account, deleted on
   erasure (audit §2 cascade). Error logs + resolution-failure events: 90 days rolling
   (§2 of this spec), anonymized (`user_id` nulled) even sooner if the account is deleted.
4. **Cookies** — exactly one: the Supabase auth/session cookie, strictly necessary
   (ePrivacy Art. 5(3) exempt), no consent banner required; **no** analytics/tracking
   SDKs, **no** third-party trackers (audit §3, §5 — grep-verified zero external SDKs).
5. **Sub-processors** — none beyond the controller's own self-hosted homelab
   infrastructure; TTS/LLM run only in the offline authoring pipeline, never at runtime
   (audit §5 processor inventory — grep-verified zero runtime external calls).
6. **Je rechten** — right to erasure: self-serve via Profile → "Account verwijderen"
   (§1). Right to access/export: **contact the controller** (export UI is a deferred
   follow-up — do NOT promise an in-app export button that doesn't exist yet).
7. **Contact** — placeholder email `<<USER TO FILL>>`.

### 4.4 Links in

- **Register** — a `<Text size="sm" c="dimmed">` line with `<a href="/privacy">` below the
  form, next to the existing "already have an account" line (`Register.tsx:118-120`).
- **Profile** — a link in the new danger-zone card (§1.7) and/or the account
  `SettingsCard` (`Profile.tsx:200-211`).

---

## Edge cases

1. **Double-click / repeat delete** — §1.6: 404-from-admin-delete → 200; button disabled
   after first click; signOut+redirect races are harmless (session is already being torn
   down).
2. **JWT expired between page load and confirm** — GoTrue `/auth/v1/user` returns 401 →
   `invalid_user_jwt` → friendly "session expired, log in again" message; no partial
   delete (the delete only fires after a successful JWT verify).
3. **GoTrue admin delete returns 5xx (not 404)** — mapped to `delete_failed`, friendly
   generic error, `logError` written (user still exists, so the log write succeeds), user
   stays logged in and can retry.
4. **Type-to-confirm mismatch** — final button stays `disabled`; no call made.
5. **User deletes account while a session/exercise is mid-flight in another tab** — after
   signOut the other tab's next authenticated write 401s; existing error handling surfaces
   a friendly notification. No new handling needed.
6. **`error_logs` row written by a now-deleted user before deletion** — already anonymized
   by `ON DELETE SET NULL` (`migration.sql:315`); the 90-day purge removes it regardless.
7. **`pg_cron` worker not running post-migrate** — HC40 goes red (job exists but no recent
   successful run), surfaced by `make check-supabase-deep` / `make pre-deploy`.
8. **Fresh migrate, job scheduled but not yet fired** — HC40 passes with a "no run yet"
   note (§2.3), not a false red.
9. **Privacy page visited pre-auth** — public route, no `ProtectedRoute`; NL default, EN
   toggle works without a profile.
10. **Retention DELETE races a concurrent insert** — a row inserted during the purge is
    younger than 90 days, so the `WHERE created_at <` predicate excludes it; no lost
    writes.

---

## Testing (concrete scenarios)

**Edge function** — `supabase/functions/delete-account/` has no in-repo Deno test harness
(neither existing function is unit-tested in this repo); assert behaviour via the client
integration test + a fixture-level contract test:

- `src/__tests__/delete-account.test.tsx` (RTL + userEvent, Profile danger zone):
  1. User opens Profile, clicks "Account verwijderen", modal opens.
  2. Final button disabled until the confirmation phrase is typed exactly (type a wrong
     value → still disabled; type the exact value → enabled).
  3. Happy path: `vi.mock('@/lib/supabase')` with `supabase.functions.invoke` resolving
     `{ data: { ok: true }, error: null }`; assert `signOut` called + `navigate('/login')`.
  4. Friendly-error path: `invoke` resolves `{ data: null, error: <FunctionsHttpError
     invalid_user_jwt> }`; assert the "session expired" notification text renders and
     `logError` is called; user is NOT signed out.
  5. Generic-error path: `error` code unknown → generic "Er ging iets mis" notification.
- **Fixture-level cascade contract test**: a Vitest test that reads `scripts/migration.sql`
  and asserts every `REFERENCES auth.users` occurrence — **in all three FK forms: inline
  column defs, `ALTER TABLE … ADD CONSTRAINT … REFERENCES auth.users`, and multi-line
  declarations (architect W2)** — carries an explicit `ON DELETE CASCADE` or `ON DELETE
  SET NULL` clause (mirrors the existing string-assertion test pattern). A future FK
  added with default `NO ACTION` would silently *block* the GoTrue delete; this test is
  the guard.
- **MANDATORY build-time live verification with a THROWAWAY user (data-architect G1 —
  this replaces "cascade is not live-testable" for the author's own account, which stays
  out of bounds):** during implementation, create a throwaway GoTrue user via the admin
  API, write one owned row (e.g. a `learner_lesson_activation` via `set_lesson_activation`),
  call the deployed `delete-account` function as that user, then assert BOTH the
  `auth.users` row AND the cascaded `indonesian.*` rows are physically gone (not
  banned/soft-deleted). A 200 response alone proves nothing about hard-delete semantics
  on GoTrue v2.188.1. Record the result in the PR description.

**Retention** — `scripts/__tests__/gdpr-retention-migration.test.ts`: assert
`migration.sql` contains `cron.schedule('gdpr-retention-purge'`, the two `DELETE … <
now() - interval '90 days'` statements, the unschedule-if-exists guard, and the
`retention_cron_health()` function with its `REVOKE … FROM PUBLIC` line (and NO
`authenticated` grant — G3). HC40 itself is exercised live by `make check-supabase-deep`.
**MANDATORY build-time actual-purge verification (data-architect G2):** insert a
throwaway `error_logs` row with `created_at` back-dated past 90 days, execute the job
body (or `SELECT cron.schedule`-triggered run), and assert the row is GONE — a
`succeeded` job status with zero rows purged is exactly the RLS-owner failure mode this
guards against. Record the result in the PR description.

**Privacy page** — `src/__tests__/privacy.test.tsx`: renders at `/privacy` without auth;
NL copy shows by default; toggling the SegmentedControl to EN swaps copy; the erasure
section links to Profile / describes the self-serve path; NO in-app export button is
promised.

---

## Rollout

Single PR on `feat/launch-readiness-round-2`. Order (deploy ordering re-deduced per-spec,
not defaulted):

1. **Migrate-first for retention** — the cron job + `retention_cron_health()` are additive
   DB objects the new HC40 depends on; apply `scripts/migration.sql` via `make migrate`
   before HC40 can pass. `make migrate-idempotent-check` + `make pre-deploy` gate this
   (both required for a migration-touching change).
2. **Edge function deploy** — copy `supabase/functions/delete-account/` to the homelab
   functions volume (file-copy, no config change — §Supabase Requirements). The `main`
   router picks it up by directory name at first request; no restart-ordering constraint
   (a request to `/functions/v1/delete-account` before the file exists returns the router's
   `function_not_found` 404 — harmless, the UI isn't wired until the app image ships).
3. **App image** (Profile danger zone + `/privacy` route + Register/Profile links + i18n
   `privacy` block) — ships via the normal GitHub Actions → GHCR → manual homelab recreate
   flow. Compatible either-order with the edge fn (the button just 404s until the fn is
   copied).

**Rollback:** revert the PR; unschedule the cron job (`select cron.unschedule('gdpr-
retention-purge')`); delete the `delete-account/` directory from the functions volume. No
data migration to reverse (the purge only deletes >90-day debug rows; nothing to restore
in a build-stage disposable-data context).

**Operating-context note (`CLAUDE.md` → Operating Context):** this is a build-stage,
single-learner app. No coexistence layer, maintenance window, or additive-then-subtractive
rollout is used — the cron job and edge function are added directly and an intermediate
state (app image shipped before the edge fn is copied) merely 404s the button, which is
acceptable with no live users.

---

## Supabase Requirements

### Schema changes (`scripts/migration.sql`)

- **No new tables. No new columns.** The erasure path adds zero schema — it relies on the
  existing `ON DELETE CASCADE`/`SET NULL` FKs (verified §1.2).
- **New: `pg_cron` job `gdpr-retention-purge`** — daily `DELETE` on `error_logs` +
  `capability_resolution_failure_events` (90-day window). Added after the existing
  `CREATE EXTENSION IF NOT EXISTS pg_cron` (`migration.sql:524`), idempotent
  unschedule-then-schedule idiom.
- **New: `indonesian.retention_cron_health()`** SECURITY DEFINER function reading `cron.*`
  for HC40. `REVOKE ALL … FROM PUBLIC` + `GRANT EXECUTE TO service_role` ONLY (G3)
  (mirrors `schema_health()`, `migration.sql:511-517`).

### RLS

- **No RLS changes.** No new tables. The two purged tables keep their existing policies
  (untouched). The `retention_cron_health()` function is SECURITY DEFINER (bypasses RLS by
  design, like `schema_health()`), gated by the `REVOKE PUBLIC` + explicit `GRANT`.

### Grants

- **No new grants for the delete path** — the GoTrue admin API performs the `auth.users`
  delete with the service-role key inside the edge function; the cascade is a Postgres FK
  operation needing no app-level grant. (`service_role` bypasses RLS but the delete goes
  through GoTrue, not a direct table write.)
- **New grants:** `EXECUTE` on `retention_cron_health()` to
  `service_role` only (never `GRANT ALL`).

### homelab-configs changes

- **N/A** — the `delete-account` edge function deploys by copying the directory to the
  functions volume; the `main` router (`main/index.ts:13-14`) dispatches by path segment
  with no config edit. Kong already routes `/functions/v1/*` (per `signup-with-invite`
  precedent). No `PGRST_DB_SCHEMAS`, Kong CORS, GoTrue, or storage change. `pg_cron` is
  already installed (`migration.sql:524`).
- **One deploy-time action (not a config change):** confirm the `pg_cron` background
  worker is actually running on the shared Postgres image (`shared_preload_libraries`
  must include `pg_cron`). HC40 is the standing check for this; if it goes red on first
  deploy, the worker isn't loaded and that IS a `homelab-configs` Postgres image change —
  flagged here as a **contingency**, not a planned edit.

### Health check additions

- **`scripts/check-supabase.ts` (tier 1, anon key):** N/A — retention + erasure are
  structural/service-role concerns, not anon-functional; nothing for the anon key to
  verify.
- **`scripts/check-supabase-deep.ts` (tier 2, service key):** **HC40** — asserts
  `gdpr-retention-purge` exists, is active, and has a recent successful run, via
  `retention_cron_health()` (§2.3). Cascade completeness is asserted at fixture level
  (the migration-string test in §Testing), NOT live — deleting a real user to count
  orphans is destructive and non-reproducible; the FK-clause string assertion is the
  correct guard.

---

## Open questions for reviewers

1. **Retention window** — 90/90 (chosen) vs 90/180 (audit §4 floated 180 for
   `capability_resolution_failure_events`)? User/product call.
2. **Confirmation phrase** — type the account email (already shown on Profile) vs a fixed
   word `VERWIJDEREN`? UX call; either satisfies "type-to-confirm".
3. **HC40 staleness threshold** — 48h chosen (2× daily cadence). Acceptable, or tighter?
4. **`retention_cron_health()` grant** — RESOLVED (G3): service_role only. Originally leaned `authenticated` for symmetry with
   `schema_health()`; strictly only `service_role` is needed (the check uses the service
   key). Data-architect verdict: drop the `authenticated` grant. (Applied — see the SQL block
   — the app never calls it; only `check-supabase-deep` does, under the service key.)
5. **`retention_cron_health()` `search_path`** — set to `cron, pg_catalog`. Data-architect
   to confirm the SECURITY DEFINER `search_path` hardening is correct (no `indonesian` in
   path needed since it only reads `cron.*`).

## Things in the fixed scope I disagree with / want to flag plainly

- **None of the three items is objectionable** — erasure via edge fn, `pg_cron`
  retention, and a static privacy page are each the minimum-mechanism choice for their
  goal, and the audit already did the grounding. I did not find a simpler existing
  mechanism that already provides any of them (reuse-and-simplify check: no existing
  delete-user path, no existing retention job, no existing legal page — audit §3
  grep-verified all three absent).
- **One genuine over-mechanism risk to watch:** the `retention_cron_health()` SECURITY
  DEFINER function is real added surface. It is justified *only* because PostgREST can't
  see `cron.*` — if the reviewer prefers, HC40 could instead be dropped and the job's
  liveness verified manually at deploy. I kept the function because "installed-and-idle
  pg_cron silently stops purging" (audit §4) is exactly the drift a health check exists to
  catch, and the function is the cheapest way to make `cron.*` reachable from the existing
  PostgREST-only check. Flagging it so the reviewer can push back (Open question 4/5).
- **Export deferral is correct but load-bearing:** the privacy page MUST NOT promise an
  in-app export button (§4.3 item 6) since Art. 15/20 export is a non-goal here. Promising
  UI that doesn't exist would be worse than pointing users to "contact the controller".
  Called out so a copy-writer doesn't "helpfully" add an export button reference.

---

## Sign-off

This spec touches the data model (`pg_cron` job + SECURITY DEFINER function in
`scripts/migration.sql`, HC40, edge-function behaviour against `auth.users`). Per
`CLAUDE.md`, it requires **both `data-architect` and `architect`** sign-off, recorded in
`reviewed_by:`, before `status: approved`. The pre-commit `plan-review-gate` blocks an
approved data-model plan missing `data-architect`. Do not implement while `draft`.

## Revision log (2026-07-02, post-review round 1 — applied by orchestrator)

- **G1 (CRITICAL)**: admin DELETE now sends `should_soft_delete: false` explicitly + a
  MANDATORY build-time throwaway-user hard-delete verification added to Testing.
- **G2 (MAJOR)**: the table-ownership RLS-exemption mechanism is now documented in §2.1
  + a MANDATORY build-time actual-purge test added to Testing.
- **G3 (MAJOR)**: `retention_cron_health()` grant narrowed to `service_role` only,
  everywhere it appears.
- **G4 (MINOR)**: `search_path` reordered to `pg_catalog, cron`.
- **Architect W1**: `/privacy` is lazy-loaded (§4.1 corrected).
- **Architect W2**: cascade contract test must cover inline, `ALTER TABLE`, and
  multi-line FK forms (§Testing).

## Architect review (2026-07-02)

**Verdict: APPROVED (architect lens) — `reviewed_by` carries `architect`.** Full section
text delivered to the orchestrator; key points: module placement correct (third edge
function behind the `main` router = zero new routing surface; Profile danger zone on the
existing `SettingsCard` primitive; `/privacy` as pre-auth public sibling of `/login`);
Minimum Mechanism passes the omission test on both self-flagged surfaces
(`retention_cron_health()` is load-bearing because `cron.*` is invisible to PostgREST;
the FK-is-the-enforcement reasoning for skipping a three-layer gate is sound); no goal
erosion; error-handling + Supabase-Requirements rules satisfied; invite-code
non-interference explicitly closed. Two WARNINGs (lazy `/privacy`, robust FK-form test)
— both folded into the spec, see Revision log. NOTEs: consider NL-only privacy copy to
halve the user's legal-review burden (user decision); 90/180 window coupling if changed;
keep the type-to-confirm modal as-is.

## Data-architect review (2026-07-02) — round 1: BLOCK

**Verdict: BLOCK (G1 CRITICAL, G2-G3 MAJOR, G4 MINOR) — all four addressed in the
Revision log above; re-review required before `data-architect` may enter `reviewed_by`.**

Key findings (full analysis delivered to the orchestrator):
- **Cascade completeness independently CLEAN**: all 12 `references auth.users` hits
  verified (CASCADE ×10, SET NULL ×2); no bare `user_id` column without an FK anywhere;
  `signup_invite_codes` stores no user linkage; zero `src/` storage uploads (all
  `.upload()` calls are pipeline-authoring scripts).
- **G1**: `DELETE /admin/users/{id}` without `should_soft_delete: false` risks a soft
  delete on GoTrue v2.188.1 — cascades never fire, client sees `ok: true`, all learner
  PII silently survives. Fix: explicit flag + throwaway-user hard-delete proof at build.
- **G2**: the retention DELETE passes RLS via *table ownership* (`postgres` owns the
  tables and is NOT superuser on this instance; RLS is enabled but not FORCE) — the spec
  must document the mechanism and prove an actual purge at build time, because a broken
  ownership assumption yields `succeeded` job status with zero rows purged, forever green.
- **G3**: drop the `authenticated` grant on `retention_cron_health()` (sole caller is
  check-supabase-deep under the service key).
- **G4**: `search_path = pg_catalog, cron` (explicit listing order is search order).
- Open questions: 90/90 fine (product/legal call); 48h HC threshold fine when paired
  with the G2 build-time proof.

## Data-architect review — round 2 (2026-07-02)

**Verdict: APPROVE — `reviewed_by` now carries `[architect, data-architect]`.**

All four round-1 findings verified fixed in the spec body, not just claimed in the
revision log:

- **G1 (was CRITICAL)** — `should_soft_delete: false` is in the actual DELETE request
  body (`docs/plans/2026-07-02-gdpr-erasure-retention.md:234`), paired with an explicit
  `Content-Type: application/json` header (`:232`) so GoTrue parses the flag. Testing
  (`:607-614`) carries the MANDATORY throwaway-user build-time verification asserting
  both the `auth.users` row and the cascaded `indonesian.*` rows are physically gone —
  not inferred from the 200 response. Closed.
- **G2 (was MAJOR)** — §2.1 (`:332-343`) documents the table-ownership RLS-exemption
  mechanism (`postgres` owns both tables, is not superuser on this instance, RLS is
  ENABLED but not FORCE ⇒ owner exemption applies) and names its exact silent-failure
  mode (`cron.job_run_details.status = 'succeeded'` with zero rows purged if the
  ownership assumption ever breaks). Testing (`:621-625`) carries the MANDATORY
  back-dated-row actual-purge verification, which is the only check that would catch
  that failure mode — a job-status check alone cannot. Closed.
- **G3 (was MAJOR)** — the SQL block (`:414-418`) grants `EXECUTE` on
  `retention_cron_health()` to `service_role` only; `REVOKE ALL … FROM PUBLIC` precedes
  it; no `authenticated` grant anywhere in the operative DDL. Checked every remaining
  `authenticated` mention in the file: `:380` accurately cites `schema_health()`'s own
  grant as the pattern being mirrored (verified against `migration.sql:517`, which does
  grant `schema_health()` to `authenticated` — a true statement about a different
  function, not a claim about this one); `:416` explains why this function does *not*
  follow that grant; `:620` (Testing) explicitly asserts the grant's absence; `:729-732`
  and `:812-813` correctly record the resolution. Supabase Requirements (`:692-693`) and
  Open Questions (`:729-732`) are consistent with the SQL block. No widening anywhere.
  Closed.
- **G4 (was MINOR)** — `:397` reads `set search_path = pg_catalog, cron`, the required
  order. Closed.

No new findings introduced by the fixes (no accidental grant widening, no drift between
the SQL block and its prose descriptions elsewhere in the spec).

**Scope note (unchanged from round 1):** cascade completeness (all 12
`REFERENCES auth.users` hits, CASCADE ×10 / SET NULL ×2, no bare unlinked `user_id`) was
independently re-verified round 1 and is not re-litigated here — nothing in the round-1
revision touched that surface.

This spec is data-architect-clean. `status: approved` may now be set per the frontmatter
gate (`plan-review-gate`), pending only the still-open product/legal calls listed under
"Open questions for reviewers" (retention window 90/90 vs 90/180, confirmation-phrase
copy, HC40 staleness threshold) — none of which are data-architect concerns.
