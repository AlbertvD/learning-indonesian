# Launch runbook — invite preview → paid launch

**Created 2026-07-28.** The single ordered track from the current state (OAuth +
Stripe + entitlement system built and reviewed, unmerged) to paying customers.
Sibling of `deploy.md` (container recreate) and `restore-runbook.md` (backups).
The authoritative design is `docs/plans/2026-07-12-oauth-stripe-entitlement-design.md`
(status: approved, implemented); this runbook is the operational glue around it —
**where they disagree, the spec wins; fix the drift here.**

Legend: **[owner]** = only Albert can do it · **[agent]** = any Claude session can
drive it · **[joint]** = do it together in one sitting.

---

## Phase 0 — current state (verified 2026-07-28)

- App repo: integration branch **`feat/oauth-stripe-entitlement`** (local, NOT
  pushed) — 6 build slices + high-effort review, 13 findings fixed. Gates green:
  tsc / lint 0 errors / 3265 tests / build.
- homelab-configs: branch **`feat/indonesian-oauth-stripe-env`** (local, NOT
  pushed) — GoTrue Google env + `GOTRUE_URI_ALLOW_LIST` rename +
  `GOTRUE_DISABLE_SIGNUP=false` + Stripe env on the functions container +
  supabase README (env table, account-reset runbook). Compose-validated.
- Spec committed to main (`cf24c8ff`), CLAUDE.md § Signup gating rewritten.
- NOT yet done: everything below.

## Phase 1 — owner prerequisites (no code dependencies; do anytime)

- [ ] **[owner] Google OAuth client** — Google Cloud console → OAuth consent
      screen (External, production) → Credentials → OAuth client ID (Web
      application) with authorized redirect URI
      `https://api.supabase.duin.home/auth/v1/callback`.
      Yields `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`.
      (At cloud migration: add the cloud callback URL to the same client.)
- [ ] **[owner] Stripe dashboard, TEST MODE** — Product "Kamoe Bisa"; two
      recurring Prices: €7/month + €56/year, tax behavior *inclusive*; enable
      Stripe Tax; Customer Portal enabled with cancel-at-period-end; note the
      test `sk_test_…` secret key + both `price_…` ids.
      Yields `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`.
      (`STRIPE_WEBHOOK_SECRET` comes from `stripe listen` during Phase 4, and
      from the dashboard webhook endpoint at live-mode time.)
      ⚠ While in there: check whether the account is on "Flexible Billing Mode"
      — the code reads `subscription.items.data[0].current_period_end` with a
      top-level fallback and pins apiVersion `2026-06-24.dahlia`; Phase 4's E2E
      asserts the renewal date renders.
- [ ] **[owner] ToS + refund text** — real copy for `/terms` and `/refunds`
      (currently marked placeholders, NL+EN). EU 14-day withdrawal disclosure
      required on `/refunds`. An agent can draft; owner signs off.
- [ ] **[owner] Add the six secret values to the homelab host env file** (same
      file as `POSTGRES_PASSWORD`; names in the supabase README § Required host
      environment variables). Do NOT apply compose yet — that's Phase 3.

## Phase 2 — push + PR (agent-drivable, reversible)

- [ ] **[agent]** Push `feat/oauth-stripe-entitlement`; open PR with the spec
      linked; flip the spec frontmatter `status: approved → implementing` in
      the same PR.
- [ ] **[agent]** Push `feat/indonesian-oauth-stripe-env` in homelab-configs;
      open PR there. ⚠ Do NOT merge homelab-configs main before the Phase-3
      window if Portainer auto-applies anything — the compose apply must be
      manual, inside the window.
- [ ] **[owner] review both PRs.**
- ⚠ **Do NOT run `make migrate-idempotent-check` / `make migrate` as a casual
  pre-merge gate for this PR.** Unlike normal migration PRs, this migration
  flips the storage buckets private — running it outside the window breaks all
  audio for the live preview cohort until the new app deploys. The gate chain
  runs INSIDE the window (spec §7 step 1).

## Phase 3 — the coordinated rollout window (spec §7 is authoritative) [joint]

Everything prepared, then one sitting, in order:

- [ ] **Preflight** (spec §7 step 0): app image built+pushed by CI from the
      merged PR; edge functions ready to SCP; homelab-configs PR approved;
      host env values in place (Phase 1); verify `storage.objects` has
      `relrowsecurity=true`.
- [ ] **Migrate + comp in one sitting** (spec §7 step 1): gate chain
      (`make migrate-idempotent-check` → `make migrate` → `make pre-deploy`),
      then immediately the comp backfill via psql (one-time, NOT in
      migration.sql):
      `insert into indonesian.entitlements (user_id, status, source)
       select id, 'comped', 'comp' from auth.users on conflict do nothing;`
- [ ] **Apply infra + deploy functions + recreate app** (spec §7 step 2):
      homelab-configs `git pull` on host + `sudo docker compose -f
      services/supabase/docker-compose.yml up -d auth functions`; then
      `scp -r` the four Stripe functions + `_shared/` + updated `main`/
      `delete-account` to the bind-mount and `sudo docker restart
      supabase-edge-functions`; then the app-container recreate per
      `deploy.md`.
- [ ] **Window extras** (accumulated after the spec was approved):
  - [ ] Create the **never-comped probe account** for the behavioral RLS
        checks; set `CHECK_TEST_NONENTITLED_EMAIL` / `_PASSWORD` in
        `.env.local`. Create it AFTER the migrate (so it isn't swept into the
        comp backfill) via open signup or the GoTrue admin API — not raw SQL
        (see supabase README account-reset runbook for why).
  - [ ] Verify the `GOTRUE_URI_ALLOW_LIST` rename took (it replaced a dead
        `GOTRUE_REDIRECT_URLS` key and also affects family-hub's auth flows).
- [ ] **Verify** (spec §7 step 3): `make check-supabase` +
      `make check-supabase-deep` with the new HC54–HC58 + behavioral probes.

## Phase 4 — test-mode E2E (spec §9) [joint]

- [ ] `stripe listen --forward-to https://api.supabase.duin.home/functions/v1/stripe-webhook`
      (yields the test `STRIPE_WEBHOOK_SECRET` → host env → `up -d functions`).
- [ ] Full checkout with a Stripe test card → `/checkout/success` verifies →
      entitlement `active` → lesson 4 activates → audio signs → **renewal date
      renders on Profile** (the `current_period_end` regression check).
- [ ] Cancel via portal → status flips at period end; webhook replay is a
      no-op; comped user unaffected; fresh non-entitled account: free lessons
      1–3 + pronunciation page audio work, lesson 4 shows paywall.
- [ ] Google OAuth round-trip on a real device (family CA caveat: homelab
      devices need the Duin Home Root CA installed + trusted).

## Phase 5 — cloud migration (prerequisite for LIVE payments)

Decision recorded in the spec: **no live-mode Stripe on the homelab.** Scope
(from the 2026-07-11 audit + spec §10 residuals — needs its own spec/runbook
when picked up):

- [ ] `.duin.home` decoupling: `supabase.ts:12` cookie domain,
      `ProtectedRoute.tsx` SSO bounce + Traefik forward-auth removal, absolute
      storage URLs in DB rows and committed lesson `content.json`, nginx CSP
      origins.
- [ ] Learner-data migration runbook (precious tables — gated, drilled,
      restore-path verified).
- [ ] GDPR data-export path (obligation at paid launch).
- [ ] Edge deploy switches to `supabase functions deploy`; expose `indonesian`
      schema in cloud API settings; Google client + Stripe webhook get cloud
      URLs.
- [ ] Gateway rate limit on `/auth/v1/signup` (the accepted enumeration/bot
      residual from spec §2/§10 — the successor to the deleted invite-era rate
      limiter).

## Phase 6 — live-mode flip [owner]

- [ ] Stripe live mode: recreate Product/Prices, live keys + dashboard webhook
      endpoint (live `whsec_…`), Stripe Tax registration live.
- [ ] Swap live values into the (cloud) function env.
- [ ] Final E2E with a real card + refund.
- [ ] Spec frontmatter → `status: shipped` with `implementation_paths`;
      archive per house convention.

---

## Standing references

- Spec (authoritative design + §7 sequence): `docs/plans/2026-07-12-oauth-stripe-entitlement-design.md`
- Deploy mechanics: `docs/process/deploy.md` · Backups: `docs/process/restore-runbook.md`
- Account reset runbook: homelab-configs `services/supabase/README.md` § Troubleshooting
- Session memory mirror: `project_prod_ready_review_2026_07_11` (private; this
  file is the source of truth for the track — update BOTH when the track moves)
