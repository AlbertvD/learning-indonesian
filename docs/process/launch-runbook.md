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

**Not done:** Stripe account, Pro upgrade, Google OAuth client, frontend
hosting, real ToS/refund copy.

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
- [ ] **[owner] ToS + refund text** — `/terms` and `/refunds` are placeholders.
      EU 14-day withdrawal disclosure required. Draft prepared by agent; owner
      signs off.

## Phase 2 — agent-drivable now (no owner input)

- [ ] **[agent]** Fix **HC58 false positive** in `check-supabase-deep.ts` —
      reports `redeem_invite_code gone=false` when `pg_proc` shows the
      functions genuinely absent on cloud.
- [ ] **[agent]** Give `check-supabase.ts` a **cloud mode** — its "API
      reachable" and "Auth endpoint" probes call endpoints without an apikey
      and 401 on managed Supabase; they assume self-hosted Kong permissiveness.
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

## Phase 4 — frontend hosting [joint]

- [ ] Choose a host (Vercel / Netlify / Cloudflare Pages) — all issue TLS
      automatically; no Let's Encrypt work, no homelab exposure.
- [ ] Point the domain at it. **The homelab is never exposed**: public traffic
      terminates on the host + Supabase Cloud.
- [ ] Residual decoupling (most of it already solved):
  - [ ] `src/lib/supabase.ts:12` — `.duin.home` cookie domain. Drop it or make
        it env-driven; a single cloud domain needs no cross-subdomain cookie.
  - [ ] `nginx.conf:50` CSP `connect-src`/`media-src` origins → cloud URL, or
        move to the host's headers config if not using the nginx container.
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
