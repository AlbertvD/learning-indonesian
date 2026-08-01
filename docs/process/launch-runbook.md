# Launch runbook — cloud preview → paid launch

**Created 2026-07-28. Rewritten 2026-07-30 at the cloud pivot** — the previous
version tracked a homelab rollout window that no longer exists (its text is in
git history). The single ordered track from here to paying customers.
Sibling of `deploy.md` and `restore-runbook.md`.

The authoritative design is
`docs/plans/2026-07-12-oauth-stripe-entitlement-design.md`
(status: implementing, PR #461). This runbook is the operational glue —
**where they disagree, the spec wins on design; this file wins on sequence**,
because the spec's §7 rollout sequence was written for the homelab and is now
superseded (see "What the cloud pivot deleted" below).

Legend: **[owner]** = only Albert can do it · **[agent]** = any Claude session
can drive it · **[joint]** = one sitting together.

---

## What the cloud pivot deleted (read this before trusting any older doc)

On 2026-07-30 the target moved from "run the entitlement rollout on the
homelab, migrate to cloud later" to **"deploy fresh on Supabase Cloud, no
learner history migrated"** (owner: *"i do not care about preserving history"*;
the homelab stays as the personal instance). That deleted whole phases:

- **The coordinated rollout window is gone.** It existed to flip the homelab's
  buckets private without breaking audio for the live preview cohort. On a
  fresh cloud project there is no cohort and no window — `migration.sql` simply
  builds the target state from empty.
- **The learner-data migration is gone.** No `auth.users` UUID preservation, no
  `auth.identities` backfill, no precious-data drill. This was the single
  hardest item in the old Phase 5.
- **homelab-configs PR #65 is obsolete for launch.** It adds GoTrue Google env
  + Stripe env to the *self-hosted* containers. Cloud needs none of it. Close
  it, or keep it only if the homelab should also get Google login.
- **`stripe listen` is no longer needed even in test mode.** It existed because
  Stripe's servers could never reach `api.supabase.duin.home`. The cloud
  function endpoint is publicly reachable, so test mode uses a real dashboard
  webhook endpoint — a much better rehearsal for live.

## Phase 0 — current state (verified 2026-07-30)

**Cloud project `wodpkxsmildtgndnbraa`** (eu-west-1, PostgreSQL 17.6) — live.
Connection + key details in `.env.local` (`CLOUD_*`) and
[[project-supabase-cloud-migration]] in session memory.

- [x] Schema: `migration.sql` from `feat/oauth-stripe-entitlement` — fresh
      replay `exit 0`, second apply `exit 0` (idempotent). 45 tables / 45 RLS,
      56 policies, 26 functions, 128 indexes.
- [x] Entitlement objects verified: `entitlements` + `stripe_webhook_events`,
      `has_active_entitlement` / `can_read_media` / `is_free_tier_lesson`,
      `indonesian_media_read` policy on `storage.objects`, all 3 buckets
      `public=false`, invite system gone.
- [x] Content loaded (`pg_dump --data-only`, 31 tables, learner tables
      excluded): 31 lessons, 2,573 items, 15,944 capabilities, 5,132
      audio_clips, 21,447 distractors. 0 orphaned FKs.
- [x] Storage: 5,242 objects / 447 MB. `indonesian-tts` + `indonesian-podcasts`
      complete; `indonesian-lessons` **10 of 15** (5 files exceed the free
      tier's 50 MB per-file cap — see Phase 1).
- [x] Edge functions deployed (6; `main` deliberately excluded — self-hosted
      router). `stripe-webhook` has `verify_jwt = false` per
      `supabase/config.toml`.
- [x] Deep health check **196 passed / 2 failed** — both failures understood
      and NOT schema faults (HC53 needs `TEST_USER_PASSWORD` locally; HC58 is a
      false positive, see Phase 2).
- [x] **End-to-end verified** (`e2e/cloud-smoke.spec.ts`): login, content under
      real authenticated RLS, signed URLs against private buckets (never
      exercised anywhere before — homelab buckets are still public), batch
      signer coalescing. Both paywall gates hold: storage RLS lesson 3 → 200 /
      lesson 4 → 400; `set_lesson_activation` lesson 4 → `entitlement_required`.
- [x] Business: KVK 88627950 active, SBI 62100, handelsnaam "Kamoe Bisa"
      (live 03-08-2026). bunq business account + sub-accounts created.

**Not done:** Stripe account, Pro upgrade, Google OAuth client, real
ToS/refund copy. (Frontend hosting and email were still open when this was
written — both are done, see Phase 4.)

## Phase 1 — owner prerequisites

- [ ] **[owner] Stripe, TEST MODE** (needs no KYC — start before activation):
      Product "Kamoe Bisa"; two recurring Prices **€7/month + €56/year**, tax
      behaviour *inclusive*; enable Stripe Tax; Customer Portal with
      **cancel-at-period-end**; webhook endpoint
      `https://wodpkxsmildtgndnbraa.supabase.co/functions/v1/stripe-webhook`
      subscribed to exactly `checkout.session.completed`,
      `customer.subscription.updated`, `customer.subscription.deleted`.
      Statement descriptor `KAMOE BISA`; payout schedule **monthly** (keeps the
      bunq transaction allowance comfortable).
      Yields `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_PRICE_MONTHLY`,
      `STRIPE_PRICE_ANNUAL`, `STRIPE_WEBHOOK_SECRET` (`whsec_…`).
      ⚠ Check whether the account is on "Flexible Billing Mode" — the code
      reads `subscription.items.data[0].current_period_end` with a top-level
      fallback and pins apiVersion `2026-06-24.dahlia`. Phase 3 asserts the
      renewal date renders; this is the bug that would otherwise show a blank
      date to **every** subscriber.
- [ ] **[owner] Supabase Pro upgrade** — required for: the 5 grammar files over
      the 50 MB per-file cap, and total storage (~4 GB for all 30 lessons vs
      the 1 GB free limit). Not needed to test payments.
- [ ] **[owner] Google OAuth client** — Google Cloud console → OAuth consent
      screen (External, production) → Credentials → Web application, authorized
      redirect URI **`https://wodpkxsmildtgndnbraa.supabase.co/auth/v1/callback`**
      (public TLD — the old `.duin.home` URI was *impossible*: Google requires
      redirect hosts on the public suffix list). Then enable Google in the
      cloud project's Auth providers. Until this is done the "Continue with
      Google" button errors — hide it or accept it.
      Now unblocked in one respect: the consent screen needs homepage / privacy
      / terms links on a domain whose ownership you can verify, which
      `kamoebisa.nl` now provides. Keep the consent screen in **Testing** mode
      (add yourself as a test user) until the branding is worth publishing —
      Google's slow verification review only applies to sensitive scopes, and
      Supabase asks only for `email` + `profile`.
- [ ] **[owner] ToS + refund text** — `/terms` and `/refunds` are placeholders.
      EU 14-day withdrawal disclosure required. Draft prepared by agent; owner
      signs off.

## Phase 2 — agent-drivable now (no owner input)

- [x] **[agent]** **HC58 false positive fixed** — a missing FUNCTION returns
      `PGRST202 "Could not find the function"`, which does not contain the
      substring `does not exist` the old test looked for, so HC58 reported
      `redeem_invite_code gone=false` on every fresh DB. Now matches the same
      shape the table probe used.
- [x] **[agent]** **`check-supabase.ts` is cloud-aware** — managed Supabase
      401s on `/rest/v1/` and `/auth/v1/health` without an apikey, where
      self-hosted Kong served them openly. Both probes now send the key, and
      "API reachable" treats any sub-500 response as proof the gateway is
      routing. Verified 2026-08-01: **all 9 tier-1 checks pass against the
      cloud project.**
- [ ] **[agent]** Pagination audit follow-up (see `docs/audits/`) — the
      1000-row cap is currently mitigated by
      `alter role authenticator set pgrst.db_max_rows`, but shipping 15k–21k
      rows to the client contradicts CLAUDE.md's own
      *server-side RPC aggregation > ship rows to crunch client-side* rule.
- [ ] **[owner] review PR #461** (and close homelab-configs PR #65 unless the
      homelab should also get Google login).

## Phase 3 — Stripe test-mode E2E [joint]

Once Phase 1's four Stripe values exist:

- [ ] **[agent]** `supabase secrets set` the four values + `APP_BASE_URL`;
      redeploy the functions.
      ⚠ **Verify the redeploy actually took**: `supabase functions list` and
      confirm `version` incremented AND `ezbr_sha256` changed. Supabase had an
      active advisory (2026-07-30) that updates to existing functions could
      silently no-op.
- [ ] Full checkout with a Stripe test card → `/checkout/success` verifies →
      entitlement `active` → lesson 4 activates → audio signs →
      **renewal date renders on Profile** (the `current_period_end` check).
- [ ] Cancel via portal → status flips at period end; webhook replay is a
      no-op; a fresh non-entitled account gets free lessons 1–3 + the
      pronunciation page, and a paywall on lesson 4.
- [ ] Google OAuth round trip (after Phase 1).

## Phase 4 — frontend hosting ✅ DONE 2026-08-01

**Live at `https://kamoebisa.nl` (+ `www`).** The homelab is never exposed:
public traffic terminates on Cloudflare + Supabase Cloud.

- [x] Host: **Cloudflare Workers static assets** — NOT Pages. The dashboard
      steers new projects to Workers, and Workers is the better target anyway:
      a Git repo can be connected to an *existing* Worker at any time, whereas
      Pages cannot have Git integration retrofitted (you must recreate the
      project). Config: `wrangler.jsonc`. Worker name is `learning-indonesian`
      (the wizard auto-names after the repo and a Worker cannot be renamed) —
      it MUST match `wrangler.jsonc`'s `name` or every build fails.
      ⚠ `_headers` works on Workers; `_redirects` does NOT — `/* /index.html
      200` is rejected as an infinite loop. SPA fallback is
      `assets.not_found_handling: "single-page-application"`.
      ⚠ `.env.local`'s `VITE_SUPABASE_URL` still points at the HOMELAB. Build
      with the `CLOUD_*` overrides or the CSP silently blocks every API call.
- [x] Domain: `kamoebisa.nl` registered at TransIP (Cloudflare Registrar cannot
      do `.nl`), nameservers at Cloudflare, custom domains bound to the Worker.
      `workers_dev` and `preview_urls` are OFF, so this is the only public
      hostname.
- [x] Deploy is manual: `bunx wrangler deploy` after a cloud-var build. Git
      auto-deploy is NOT wired — needs the GitHub App install
      (Worker → Settings → Builds → Connect), which is dashboard-only.
- [x] Verified end-to-end on the real domain via `e2e/cloud-smoke.spec.ts`:
      login, authenticated RLS reads, signed URLs against private buckets all
      200, no console errors. ⚠ The FIRST run against a fresh domain times out
      — the service worker precaches 181 entries so `networkidle` never settles
      on a cold edge. Re-run once warm; ~12s.

### Workers Builds — gotchas found 2026-08-01

Git auto-deploy IS wired (repo connected, build token, both `VITE_*` set as
BUILD variables — they must be build-scoped, since Vite bakes them in at
compile time and runtime vars arrive too late).

- ⚠ **The production branch must not be `main`** until PR #461 merges. `main`
  has none of the signed-URL code and the cloud buckets are private, so a
  SUCCESSFUL deploy from `main` breaks every audio clip on kamoebisa.nl.
- ⚠ **"Retry build" replays the ORIGINAL commit**, not the current branch
  setting. After changing the branch, trigger a fresh *push* — a retry will
  keep rebuilding the old commit and fail identically, which reads as though
  the setting did not save.
- ⚠ **`bun install --frozen-lockfile` is how the build installs.** A Renovate
  PR that bumps `package.json` without regenerating `bun.lock` therefore breaks
  every build (`error: lockfile had changes, but lockfile is frozen`). This
  happened on `main` via #463. Renovate maintains both `bun.lock` and the now
  deleted `package-lock.json`, so watch for drift after dep PRs.
- The build image pins **Bun 1.2.15** (override with a `BUN_VERSION` build
  variable). Verified 2026-08-01 that 1.2.15 accepts a lockfile written by
  1.3.10 — a `configVersion` field difference is NOT the cause of frozen
  lockfile failures, so do not chase it.
- `npx wrangler deploy` reports **"No targets deployed"**. Expected: the custom
  domains are bound at account level, not declared as routes in
  `wrangler.jsonc`. It is not a failed deployment.
- The `builds/triggers` REST endpoints return EMPTY under the Cloudflare MCP
  OAuth token, so build config is dashboard-only — the API being blind is not
  evidence that builds are unconfigured.

### Email — added 2026-08-01 (was not in the original plan)

- [x] **Inbound**: Cloudflare Email Routing — `support@` and `info@` forward to
      the owner's mailbox. Free; MX/SPF/DKIM on the zone root.
- [x] **Outbound**: **Resend** (`eu-west-1`, EU data residency), sending as
      `noreply@kamoebisa.nl`. Its MX/SPF live on `send.kamoebisa.nl` so they
      never collide with Email Routing's root records — a duplicate SPF at one
      name is an RFC 7208 `permerror` and kills deliverability.
- [x] **Supabase SMTP** wired to Resend. ⚠ Two API quirks: `smtp_port` must be
      the STRING `"465"`, and a `smtp_pass`-only PATCH silently no-ops — send
      the whole SMTP field set together.
- [x] **Signup confirmation flow built and verified** (`4677aa45`). Cloud
      defaults `mailer_autoconfirm` to **false** while the homelab runs it
      true, and GoTrue signals this by OMISSION (a user with `session: null`,
      no error), so the old code showed "Account created!" and then silently
      ejected the visitor. Confirmed live: signup withholds the session and the
      confirmation mail is `delivered`.
- [ ] Residual decoupling (**done in code 2026-07-31**, commits `bfd4ce2c` +
      follow-up):
  - [x] `src/lib/supabase.ts` — `.duin.home` cookie domain dropped; the session
        cookie is host-only, so it works on localhost, `*.pages.dev`, a custom
        domain and the homelab alike. ⚠ Remove only `domain` — deleting the
        whole `cookieOptions` object also strips `secure`, since
        `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS` has no `secure` key. That
        regression shipped in `bfd4ce2c` and is now pinned by
        `src/__tests__/supabaseClient.test.ts`.
  - [x] CSP `connect-src`/`media-src` → moved to the host's headers config:
        `public/_headers` (Cloudflare Pages format), ported from
        `nginx.conf:50-64`. `nginx.conf` still serves the homelab and keeps the
        `api.supabase.duin.home` origins — **the two must be kept in step**.
        `public/_redirects` replaces nginx's `try_files` SPA fallback.
  - [x] The 2,822 absolute `api.supabase.duin.home` URLs baked into all 30
        `content.json` files need **no rewrite** — `signedAudioUrl.ts:57`
        parses out bucket+path and discards the host.

## Phase 5 — live-mode flip [owner]

- [ ] Stripe activation (KYC): legal entity, ID, IBAN — the bunq Kamoe Bisa
      sub-account.
- [ ] Live mode: recreate Product/Prices, live keys + dashboard webhook
      endpoint (live `whsec_…`), Stripe Tax registration live.
- [ ] `supabase secrets set` the live values; redeploy + verify sha changed.
- [ ] Final E2E with a real card + a refund.
- [ ] VAT: OSS registration (accountant).
- [ ] Spec frontmatter → `status: shipped` with `implementation_paths`.

## Deferred (not blocking launch)

- GDPR data-export path (obligation at paid launch — schedule it).
- Gateway rate limit on `/auth/v1/signup` (accepted residual, spec §2/§10).
- Re-encoding the oversized grammar audio — bitrate **never reliably measured**
  (a hand-rolled MP3 header parse returned a figure implying a 9.4-hour file;
  VBR unhandled). Needs `ffprobe` before deciding. Pro upgrade makes it
  optional rather than blocking.

---

## Standing references

- Spec (design authority): `docs/plans/2026-07-12-oauth-stripe-entitlement-design.md`
- Cloud specifics (keys, pooler, the 1000-row cap): session memory
  `project_supabase_cloud_migration`
- Deploy mechanics: `docs/process/deploy.md` · Backups: `restore-runbook.md`
- **This file is the source of truth for the track** — update it and the memory
  mirror together when the track moves.
