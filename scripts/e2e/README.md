# Playwright e2e smoke test — owner runbook

`e2e/smoke.spec.ts` drives a real Chromium browser through
login → session build → answer → review-commit against a real backend (a
local dev server, or a preview deploy via `E2E_BASE_URL`). It complements the
2291+ mocked vitest tests: the historical bug classes in this app are
integration-shaped (a session built with an unrenderable card, an RPC commit
that silently fails) — a mocked Supabase client cannot catch those.

The suite `test.skip()`s with a clear message whenever `E2E_EMAIL` is unset,
so `bun run e2e` always exits 0 on a machine without credentials and CI never
accidentally runs it against prod.

**This test writes a real `capability_review_events` row for whichever
account you point `E2E_EMAIL` at.** Never point it at a real learner account
— always use a dedicated test user.

## One-time setup (run these yourself — this repo's agents do not have DB
## write access and must not create accounts)

### 1. Create a dedicated test user

Supabase Studio → Authentication → Add User (autoconfirm is on — see
CLAUDE.md § Email, no verification email is sent). Pick a throwaway email,
e.g. `e2e-test@duin.home`, and a password. Note the generated user `id`
(uuid) — you'll need it below.

Alternatively via the GoTrue admin API:

```bash
curl -s -X POST "$VITE_SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"e2e-test@duin.home","password":"<pick-one>","email_confirm":true}'
```

### 2. Grant admin (required — `?force_capability` is admin-gated)

```sql
insert into indonesian.user_roles (user_id, role)
values ('<test-user-uuid>', 'admin');
```

### 3. Set `profiles.display_name` to the test email

The app itself sets `display_name` from OAuth `user_metadata.full_name` (see
`src/stores/authStore.ts`), not the email — so a fresh test account's
`display_name` is `null`. The spec's optional DB-level commit check resolves
the test user's id via `profiles.display_name = <email>` (a read-only,
service-role query — see the constraint below), so set it explicitly:

```sql
update indonesian.profiles set display_name = 'e2e-test@duin.home'
where id = '<test-user-uuid>';
```

(If the profile row doesn't exist yet, sign in as the test user once first —
`onAuthStateChange` upserts it on every sign-in.)

### 4. Pick a capability key

Any **ready + published, MCQ-type** `canonical_key` from
`indonesian.learning_capabilities` works. MCQ (tap-to-answer) exercise types
are required for the test to terminate deterministically — the smoke test
cycles through MCQ option indices to guarantee hitting the correct answer
within a bounded number of attempts; typed/dictation/speaking exercise types
can't be blindly guessed correct and may exhaust the attempt budget.

```sql
select canonical_key, capability_type, exercise_type
from indonesian.learning_capabilities
where readiness_status = 'ready' and publication_status = 'published'
  and exercise_type in ('recognition_mcq', 'contrast_pair', 'cloze_mcq')
limit 5;
```

Or via `make check-supabase-deep` / any read-only SQL client.

### 5. Configure env vars

Add to `.env.local` (gitignored):

```
E2E_EMAIL=e2e-test@duin.home
E2E_PASSWORD=<the password you picked in step 1>
E2E_CAPABILITY_KEY=<a canonical_key from step 4>

# Optional — strengthens the commit-verification step with a real DB read.
# Already required by other Makefile targets (make check-supabase-deep).
SUPABASE_SERVICE_KEY=<service role key from the Supabase dashboard>
VITE_SUPABASE_URL=https://api.supabase.duin.home

# Optional — defaults to http://localhost:5173. Point this at a preview
# deploy origin to run the same spec against a real deployment instead of a
# local dev server.
# E2E_BASE_URL=https://indonesian-preview.duin.home
```

`playwright.config.ts` loads `.env.local` itself (Playwright's process
doesn't go through Vite's env pipeline) — no need to `export` these into your
shell manually, though doing so also works.

### 6. Install the browser binary (one-time, ~150MB download)

```bash
bunx playwright install chromium
```

## Running it

```bash
bun run dev      # in one terminal — skip this if pointing E2E_BASE_URL at a preview deploy
bun run e2e       # in another terminal
```

`playwright.config.ts` auto-starts `bun run dev` for you (`reuseExistingServer:
true`, so it reuses one you already have running) *only* when `E2E_BASE_URL`
is unset. When `E2E_BASE_URL` is set (preview deploy), no local server is
started.

## Cleanup

The test account accumulates `capability_review_events` and
`learner_capability_state` rows for the one capability it exercises each run.
To reset between runs (optional — the redrill/idempotency-key logic makes
re-runs safe either way, they just add more history):

```sql
delete from indonesian.capability_review_events
where user_id = '<test-user-uuid>';

delete from indonesian.learner_capability_state
where user_id = '<test-user-uuid>';
```

## What this does NOT cover

- Multi-card sessions, the real session planner (bypassed via
  `?force_capability`), skip/redrill UI beyond a single card, offline/PWA
  behavior. This is a smoke test for the login→build→answer→commit spine,
  not a full regression suite.
- Typed/dictation/speaking exercise types (see step 4) — pick an MCQ
  capability key.
- Any DB write performed by this repo's agents. Steps 1–4 above are
  documented for the owner to run by hand; no agent has DB write access or
  may create accounts on the live homelab Supabase instance.
