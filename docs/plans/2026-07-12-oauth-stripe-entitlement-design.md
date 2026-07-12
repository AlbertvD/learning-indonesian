---
status: approved
reviewed_by:
  - "staff-engineer: NEEDS-WORK round 1, 2026-07-12 — 2 webhook blockers (checkout.session.completed never set status; idempotency-before-processing lost retried events), free-tier TTS keyed on generated_for_lesson_id (clips reused across lessons), podcasts-bucket blanket paywall would have killed the free pronunciation onboarding, checkout-success webhook race, comp-after-gate window — ALL FOLDED IN (incl. new verify-checkout function + _shared/stripe/)."
  - "architect: APPROVED round 2, 2026-07-12. Round-1 blocker (getAudioUrl async conversion grep-falsified against 4 sync render-time callers, 2 unnamed) + OAuth/signUp via authStore actions per LOCKED lib/auth + isEntitled as auth-owned state + Kong key-auth verification — ALL FOLDED IN. Round-2 W1 (§8 grants summary stale) + N1 (teardown grep-cite + stale deep-check skip-set entry) + N2 (is_free_tier_lesson parity pin) — FOLDED IN. N3 (authStore→entitlementService edge, no cycle) accepted, resolve at lib/auth fold."
  - "data-architect: SIGN-OFF round 2, 2026-07-12. Round-1 C1 (drop-policy-if-exists idiom) + C2 (bucket flip must live in migration.sql or fresh-DB replay silently disables the paywall) + C3 (behavioral RLS probes must not run under BYPASSRLS service key) + M1 (source/status discriminator CHECK) + M2 (is_free_tier_lesson canonical definition) + N1-N4/I1-I2 — ALL FOLDED IN. Round-2 R2-1..R2-5 (fenced bucket-flip DDL, can_read_media grant in fence, §8 summary reconciliation, explicit source='stripe' on first-checkout upsert, is_free_tier_lesson grant comment) — ALL FOLDED IN."
---

# OAuth login + Stripe payments + private-bucket entitlements

One spec for three features because they share one spine: the
`indonesian.entitlements` table. The Stripe webhook writes it (service-role),
owner-only RLS reads it, and storage RLS enforces it on audio. Designing them
together prevents three separate half-gates.

**Owner decisions (interviewed 2026-07-12):**

1. **OAuth providers:** Google + existing email/password only. Apple is
   explicitly out of scope until an App Store wrapper exists (its "Sign in
   with Apple required" rule doesn't apply to PWAs).
2. **Invite gate:** dropped entirely — payment is the gate. The invite-code
   system (table, 2 RPCs, edge function) is deleted; this removes the parked
   invite-brute-force HIGH by removing the attack surface. Comp access =
   admin-inserted entitlement rows (source `comp`); discounts = Stripe
   promotion codes.
3. **Pricing:** subscription. One Stripe Product, two Prices: **€7/month,
   €56/year** (tax-inclusive, Stripe Tax on). Free tier = lessons 1–3 (the
   already-auto-activated starter lessons) including their audio. No trials at
   launch — trivially addable later via Stripe Checkout config.
4. **Cloud timing:** build + verify on the homelab in **Stripe test mode**;
   migrate to cloud Supabase before flipping to live mode. Everything below is
   cloud-portable: plain Postgres DDL, standard Deno edge functions, all
   endpoints/keys via env vars, no `.duin.home` literals.

## Operating-context re-derivation

- `entitlements` is a **learner-data table from birth** (it is the record of
  who paid). It gets the precious-data treatment: additive gated migrations
  only, covered by the restore drill, never truncated.
- The Stripe account (not our DB) is the financial system of record. The
  entitlement row is a **cache of Stripe state** plus non-Stripe grants —
  losing it is recoverable by replaying Stripe subscription state; corrupting
  it silently is not acceptable. Hence: webhook idempotency + fetch-fresh
  pattern (§4.3).
- Runtime safety machinery earns its keep here: this is exactly the
  "protects users or their data" category. Signature verification, RLS,
  health checks are in scope; parity rollouts for the audio URL change are
  not (content-adjacent, and §7's sequencing makes the cutover safe without
  them).

## Target-architecture grounding

- `docs/target-architecture.md` §`lib/auth/` (LOCKED) owns identity. The
  Google OAuth call lands in the auth surface (`authStore.ts` today, folding
  into `lib/auth/adapter.ts` when that fold runs). No new auth module.
- The entitlement read is CRUD-shaped ("select my row") — per Rule #1 it
  stays in `src/services/entitlementService.ts`, **not** a `lib/` module.
  There is no hidden logic: `isEntitled` is a status-set membership check.
- Audio URL resolution is owned by `lib/audio` (single file), `lessonService`
  (folds into `lib/lessons/`), and `podcastService`/`textService` (stays a
  thin service). The signed-URL change modifies those existing seams; it does
  not create a new module. `resolveSessionAudioUrl`'s URL construction
  (`audioService.ts:94`) moves from string-concat to signed URLs resolved at
  map-fetch time, keeping the resolver synchronous.
- Edge functions follow the existing self-hosted pattern:
  `supabase/functions/<name>/index.ts` behind the `main` router
  (`supabase/functions/main/index.ts`), deployed by SCP + container restart
  (switches to `supabase functions deploy` at cloud migration).
- No constraints found in target architecture for payments — it predates
  commercialization. This spec is the first payments surface; it deliberately
  keeps the runtime footprint to one service + one store field so a future
  `lib/billing/` promotion (if logic ever accretes) is a mechanical fold.

## 1. Data model

```sql
-- The spine. One row per user who has ever had access beyond free tier.
create table if not exists indonesian.entitlements (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  status                 text not null check (status in
                           ('active', 'past_due', 'canceled', 'comped')),
  source                 text not null check (source in ('stripe', 'comp')),
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- source and status are correlated discriminators; enforce the pairing so a
  -- writer bug can't mint a mismatched row (e.g. source='comp' status='active').
  -- A comp row MAY carry a stripe_customer_id (set when a comped user starts a
  -- checkout, §3.1 step 2) but never a subscription while still comped.
  constraint entitlements_source_status_check check (
    (source = 'stripe' and status in ('active', 'past_due', 'canceled')
      and stripe_customer_id is not null)
    or
    (source = 'comp' and status = 'comped' and stripe_subscription_id is null)
  )
);

alter table indonesian.entitlements enable row level security;

-- Owner reads own row; ALL writes are service-role (webhook / admin) only.
-- Per-policy drop+create idiom (migration.sql header rule — PG has no
-- CREATE POLICY IF NOT EXISTS; make migrate-idempotent-check enforces this).
drop policy if exists "entitlements_owner_read" on indonesian.entitlements;
create policy "entitlements_owner_read" on indonesian.entitlements
  for select to authenticated using (auth.uid() = user_id);
grant select on indonesian.entitlements to authenticated;
grant all on indonesian.entitlements to service_role;

-- Webhook idempotency ledger. Service-role only, no policies.
create table if not exists indonesian.stripe_webhook_events (
  event_id    text primary key,
  event_type  text not null,
  received_at timestamptz not null default now()
);
alter table indonesian.stripe_webhook_events enable row level security;
grant all on indonesian.stripe_webhook_events to service_role;
```

**Access predicate** (single definition, consumed by storage RLS via
`can_read_media` and by the activation RPC — both SECURITY DEFINER, so it
executes with owner rights and needs no broad grants; the *client* never
calls it, it reads its own owner-visible `entitlements` row instead):

```sql
create or replace function indonesian.has_active_entitlement(p_user_id uuid)
returns boolean language sql stable
set search_path = indonesian, public
as $$
  select exists (
    select 1 from indonesian.entitlements
    where user_id = p_user_id and status in ('active', 'past_due', 'comped')
  ) or exists (
    select 1 from indonesian.user_roles
    where user_id = p_user_id and role = 'admin'
  );
$$;
revoke all on function indonesian.has_active_entitlement(uuid) from public;
grant execute on function indonesian.has_active_entitlement(uuid) to service_role;
-- Deliberately NOT granted to authenticated: as SECURITY INVOKER it would
-- silently return false for any p_user_id other than the caller (RLS hides
-- other rows) — a trap for a future caller assuming a general oracle. Its
-- two consumers are SECURITY DEFINER functions, which don't need the grant.
```

**Free-tier boundary — one canonical definition.** "Free = lessons 1–3" is a
pricing lever that must not be able to drift between its consumers (the
activation gate, two `can_read_media` clauses, the client paywall mirror,
and the existing starter auto-activation at `authStore.ts:177`):

```sql
-- No explicit grant needed: pure computation on its own parameter (no table
-- access), and its two callers are SECURITY DEFINER functions whose nested
-- calls bypass EXECUTE checks via ownership; PUBLIC's default EXECUTE on
-- functions is harmless here.
create or replace function indonesian.is_free_tier_lesson(p_order_index int)
returns boolean language sql immutable
as $$ select p_order_index <= 3 $$;
```

plus one TS constant `FREE_TIER_MAX_LESSON = 3` (in the entitlement service)
consumed by `activateStarterLessons` and the paywall mirror. Changing the
free-tier size is then a two-site edit (SQL fn + TS constant), both named
here, instead of five scattered literals.

Design notes (omission test per column):

- **One row per user, PK `user_id`** — there is one product. A
  `(user_id, product)` key would be mechanism for a product line that doesn't
  exist.
- **`past_due` grants access** — Stripe dunning retries failed payments for
  ~2 weeks; cutting access at first failure churns users over expired cards.
  Access ends when Stripe gives up (`customer.subscription.deleted` →
  `canceled`).
- **`canceled` rows are kept, not deleted** — preserves
  `stripe_customer_id` so resubscribing reuses the Stripe customer (and the
  Customer Portal keeps working), and keeps an auditable record.
- **No `price_id`/`plan` column** — the app's behavior doesn't differ by
  monthly vs annual; Stripe knows the plan. Omitting it breaks nothing.
- **`stripe_webhook_events` has no payload column** — Stripe's dashboard
  retains full event bodies; storing them here duplicates a source of truth
  we can already query.

**Lapse semantics (generous-lapse, explicit product decision):** when an
entitlement leaves the active set, the user keeps reviewing capabilities from
lessons they already activated (their FSRS history is theirs) but loses audio
(storage RLS) and cannot activate new lessons (§5). This avoids punitive UX
and needs zero extra mechanism — we simply don't build revocation of
activations.

## 2. Google OAuth

**GoTrue config (infra lane — homelab-configs compose + `up -d auth`):**

```
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<from Google Cloud console>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<from Google Cloud console>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://api.supabase.duin.home/auth/v1/callback
GOTRUE_URI_ALLOW_LIST=https://indonesian.duin.home/**,http://localhost:5173/**
GOTRUE_DISABLE_SIGNUP=false        # invite gate drops; payment is the gate
```

At cloud migration these become cloud dashboard settings and the Google OAuth
client gets the cloud callback URL added — config-only, no code change.

**Google Cloud console (owner, one-time):** OAuth consent screen (external,
production) + OAuth client ID (web application) with the GoTrue callback as
authorized redirect URI.

**App changes** (all Supabase-auth SDK calls live in the auth surface —
`authStore.ts` today, folding into `lib/auth/adapter.ts` per the LOCKED
module spec (`docs/target-architecture.md:229,285`: logic in the module,
JSX in pages); pages call store actions only):

- New `authStore.signInWithGoogle(next?)` action wrapping
  `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo:
  `${location.origin}/login?next=…` } })`. `Login.tsx` + `Register.tsx` render
  a "Continue with Google" button calling it. The `@supabase/ssr` browser
  client uses PKCE and handles the code exchange on return
  (`detectSessionInUrl`); the existing `SIGNED_IN` handler then fires
  normally.
- New `authStore.signUp(email, password, fullName)` action wrapping plain
  `supabase.auth.signUp`; `Register.tsx` calls it (invite field and
  edge-function call deleted). GoTrue's `user_metadata.full_name` continues to
  seed the profile via the existing upsert.
- **No profile-creation work needed:** the `SIGNED_IN` upsert at
  `authStore.ts:75-85` is provider-agnostic (`user_metadata.full_name` is set
  by Google too), and starter-lesson auto-activation
  (`authStore.ts:100-102`) already keys off `SIGNED_IN`.
- **Account linking:** GoTrue's default links by verified email — a Google
  sign-in with an email that already has a password account signs into the
  same user. Google emails are Google-verified; our password emails are
  auto-confirmed (`MAILER_AUTOCONFIRM`), which GoTrue treats as verified.
  Accepted: an attacker would need to have already registered the victim's
  email *and* the victim to then use Google OAuth — with payment as the only
  prize, this is an acceptable residual documented here.
- **Error mapping:** OAuth failures land back on `/login` with an error query
  param — map to a friendly message per the CLAUDE.md error rules.

**Known accepted risk:** open signup + autoconfirm (no email verification, no
captcha) permits bot account creation. Bots get free-tier only; GoTrue
supports hCaptcha (`GOTRUE_SECURITY_CAPTCHA_*`) if this becomes real at cloud
exposure. Not built now (omission test: nothing breaks; paid content is
gated).

## 3. Stripe integration — four edge functions

All follow the existing self-hosted conventions (router dispatch, env via
`Deno.env`, service-role fetches, `jsonResponse` idiom). New env vars on the
functions container (infra lane): `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`,
`APP_BASE_URL`. Stripe SDK via `npm:stripe`, constructed with
`Stripe.createFetchHttpClient()` (Deno).

### 3.1 `create-checkout-session` (user JWT required)

1. Verify the caller's JWT via `GET /auth/v1/user` (existing pattern,
   `commit-capability-answer-report/index.ts:209-227`).
2. Read the user's entitlement row (service-role). If `stripe_customer_id`
   exists, reuse it; else create a Stripe Customer (`email`, metadata
   `supabase_user_id`) and persist it on the row — upsert leaving an
   existing row's `status`/`source` unchanged; a brand-new row is
   `source='stripe', status='canceled'` (both required explicitly: `source`
   is NOT NULL and the table CHECK ties `canceled` to the stripe branch).
3. Create a Checkout Session: `mode: 'subscription'`, the requested price id
   (monthly|annual — validated against the two env price ids),
   `customer`, `client_reference_id = user.id`,
   `automatic_tax: { enabled: true }`, `allow_promotion_codes: true`,
   `cancel_url` under `APP_BASE_URL`, and
   `success_url = APP_BASE_URL/checkout/success?session_id={CHECKOUT_SESSION_ID}`
   (the template literal is Stripe's — it substitutes the session id, which
   §3.4 consumes).
4. Return `{ url }`; the client redirects.

### 3.2 `stripe-webhook` (no JWT — Stripe signature instead)

1. Verify `stripe-signature` with `constructEventAsync` (the async variant —
   Deno's SubtleCrypto; sync `constructEvent` throws in edge runtimes).
   Reject 400 on failure.
2. Idempotency precheck: if `event_id` already exists in
   `stripe_webhook_events`, return 200 immediately (already processed).
3. Handle exactly three event types (all others: skip to step 4):
   - `checkout.session.completed` — resolve user id from
     `client_reference_id`, then **fetch-fresh** the session's subscription
     from the Stripe API and upsert the full entitlement:
     `stripe_customer_id`, `stripe_subscription_id`, `source='stripe'`,
     **and the derived `status` + `current_period_end`** (status is NOT NULL
     — a new subscriber must come out of this handler `active`, not depend
     on a separate `subscription.updated` arriving).
   - `customer.subscription.updated` / `customer.subscription.deleted` —
     same **fetch-fresh pattern:** retrieve the subscription from the Stripe
     API and derive `status` from its current state
     (`active|trialing → active`, `past_due → past_due`, terminal states →
     `canceled`), update `current_period_end`. Fetching fresh state makes
     out-of-order webhook delivery harmless — every event application
     converges on Stripe's truth. Rows are matched by
     `stripe_subscription_id` (fallback `stripe_customer_id`).
4. **Record the event id only after processing succeeds**
   (`insert … on conflict do nothing`), then return 200. On transient
   failure return 500 *without* recording, so Stripe's retry re-processes
   instead of being deduped into a lost event. The precheck-then-record
   order admits a concurrent-duplicate race, which is harmless: both
   deliveries run the same convergent fetch-fresh upsert.

The status-derivation and entitlement-upsert logic lives in
`supabase/functions/_shared/stripe/` (the established `_shared/` pattern,
cf. `_shared/srs/`) because §3.4 reuses it verbatim.

**Comp rows and the webhook:** subscription events match rows by
`stripe_subscription_id` (fallback `stripe_customer_id`), so an untouched
comp row (null Stripe ids) is never matched. A comped user who *starts* a
checkout gains a `stripe_customer_id` (§3.1 step 2) while staying
`source='comp'`/`status='comped'` — permitted by the table CHECK — and on
completing it, `checkout.session.completed` (keyed on
`client_reference_id`) upserts the same PK row to `source='stripe'`,
`status='active'`. Comp is a grant, not a parallel system.

### 3.3 `customer-portal` (user JWT required)

Verify JWT → look up `stripe_customer_id` (404 if none) → create a Billing
Portal session with `return_url = APP_BASE_URL/profile` → return `{ url }`.
Cancel, payment-method update, and invoice history all live in the portal —
we build no billing UI beyond the two redirects.

### 3.4 `verify-checkout` (user JWT required)

Called once by the checkout-success page (§5) with the `session_id` from the
success URL. Verify JWT → retrieve the Checkout Session from Stripe →
require `client_reference_id === caller's uid` (403 otherwise) → if the
session is paid, run the same `_shared/stripe/` fetch-fresh entitlement
upsert as the webhook → return the resulting status. This makes activation
after payment **deterministic on the success page** instead of a poll racing
the webhook: the user's own return click is the primary writer; the webhook
covers ongoing lifecycle (renewals, failures, cancellations) and the
user-never-returned case. Both writers are the same convergent upsert, so
either order is safe.

**Stripe dashboard setup (owner, one-time, test mode first):** Product +
2 Prices (tax-inclusive), Stripe Tax registration, Customer Portal config
(cancel at period end), webhook endpoint pointed at
`${API_BASE}/functions/v1/stripe-webhook` with the 3 event types, promotion
codes as desired. **ToS + refund/cancellation policy pages** (static routes
`/terms`, `/refunds` in the app; owner provides text — EU consumer law
requires the 14-day withdrawal disclosure at checkout; Stripe Checkout's
consent-collection option points at our ToS URL).

## 4. Private buckets + signed URLs

All three buckets (`indonesian-lessons`, `indonesian-podcasts`,
`indonesian-tts`) flip `public=false`. Access is enforced by **storage RLS**,
consumed via `createSignedUrl(s)` — the storage API authorizes signing by
evaluating the caller's SELECT permission on `storage.objects`, and signed
URLs work in `<audio src>` (no Authorization header possible there). No new
edge function (omission test: storage RLS already gives the guarantee the
signed-URL function in the kickoff note was for).

```sql
create or replace function indonesian.can_read_media(p_bucket text, p_name text)
returns boolean language sql stable security definer
set search_path = indonesian, public
as $$
  select indonesian.has_active_entitlement(auth.uid())
  or (
    -- Free tier: TTS whose text belongs to a free lesson. Clips are REUSED
    -- across lessons (get_audio_clip_per_text earliest-lesson preference) and
    -- generated_for_lesson_id is nullable/SET NULL — so key on the TEXT, not
    -- the clip: a clip is free if any clip of the same normalized_text was
    -- generated for a free lesson.
    p_bucket = 'indonesian-tts' and exists (
      select 1
      from indonesian.audio_clips ac
      join indonesian.audio_clips ac2 on ac2.normalized_text = ac.normalized_text
      join indonesian.lessons l on l.id = ac2.generated_for_lesson_id
      where ac.storage_path = p_name
        and indonesian.is_free_tier_lesson(l.order_index))
  ) or (
    p_bucket = 'indonesian-lessons' and exists (
      select 1 from indonesian.lessons l
      where indonesian.is_free_tier_lesson(l.order_index)
        and (l.audio_path = p_name or l.audio_path_en = p_name))
  ) or (
    -- Free tier: the single pronunciation podcast (ADR 0025; the one texts
    -- row with twin NL/EN audio). It is part of the day-one onboarding
    -- program — pay-walling it would gut the free experience. Story/reading
    -- podcasts (audio_path set, audio_path_en null) stay paid.
    p_bucket = 'indonesian-podcasts' and exists (
      select 1 from indonesian.texts t
      where t.audio_path_en is not null
        and (t.audio_path = p_name or t.audio_path_en = p_name))
  );
$$;

drop policy if exists "indonesian_media_read" on storage.objects;
create policy "indonesian_media_read" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('indonesian-lessons', 'indonesian-podcasts', 'indonesian-tts')
    and indonesian.can_read_media(bucket_id, name)
  );

-- Storage-api evaluates the policy as the querying role, so the invoking
-- role needs EXECUTE on the policy's function:
grant execute on function indonesian.can_read_media(text, text) to authenticated;

create index if not exists idx_audio_clips_storage_path
  on indonesian.audio_clips (storage_path);
-- No index needed for the normalized_text self-join: the existing
-- UNIQUE(normalized_text, voice_id) (migration.sql:1014) already serves
-- leftmost-column equality lookups.
```

**Bucket privatization lives IN migration.sql** (not a manual step). The two
existing bucket INSERTs (migration.sql:760-764, :1063-1065) flip their
`public` value, and an idempotent UPDATE converges DBs where the rows
already exist (the INSERTs' `ON CONFLICT DO NOTHING` cannot), sequenced
after the `indonesian_media_read` policy above:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('indonesian-lessons', 'indonesian-lessons', false),
  ('indonesian-podcasts', 'indonesian-podcasts', false)
ON CONFLICT (id) DO NOTHING;
-- (and the indonesian-tts INSERT at :1063 likewise gets public=false)

update storage.buckets set public = false
where id in ('indonesian-lessons', 'indonesian-podcasts', 'indonesian-tts');
```

This is a fresh-DB-replay requirement (the
PR #450 property): `public=true` bypasses storage RLS entirely on the
`/object/public/` path, so a rebuild that recreated the buckets public would
silently disable the whole paywall while every check stayed green.
Rollout-order consequence honestly stated in §7: the flip lands with the
migrate, so there is one coordinated deploy window, not a
keep-buckets-public transition phase.

`security definer` because the policy runs as the storage API's role, which
has no grants on `indonesian.*`; the function needs owner rights to read
`entitlements`/`audio_clips`/`lessons`/`texts`. Execute granted to
`authenticated`.

**Client changes — every consumer enumerated (grep-verified 2026-07-12;
the enumerate-consumers rule):**

- `audioService.ts` — `fetchSessionAudioMap` gains one batch
  `storage.from('indonesian-tts').createSignedUrls(paths, 21600)` call after
  the RPC lookups; the map stores **signed URLs, not paths**, so
  `resolveSessionAudioUrl` (line 94) becomes a pure map lookup and stays
  synchronous — all its session/pronunciation/morphology consumers inherit
  the fix with zero changes. 6 h expiry comfortably outlives any session.
  Signing failures for free-tier users on paid clips return errors per-path
  in the batch result — those texts simply resolve `undefined`, which every
  consumer already handles (the existing audio-failure → boundary-skip path
  from PR #448).
- `lessonService.getAudioUrl` / `textService.getAudioUrl` — become async
  `getSignedAudioUrl(path): Promise<string | null>` via
  `createSignedUrl(path, 21600)`. **Their four callers are all synchronous
  render-time sites consuming a `string`** — a naive async conversion would
  hand a Promise to `<audio src>` and silently break playback on four
  surfaces:
  - `src/pages/GrammarPodcasts.tsx:88` (inline `src=` in JSX)
  - `src/pages/Podcast.tsx:150`
  - `src/pages/Pronunciation.tsx:90`
  - `src/components/morphology/RuleCard.tsx:29-30` (NL + EN)

  Each site moves the signing into its component's async load path (effect
  or existing loader) and holds the resolved URL in state — the same
  sign-early-resolve-sync pattern `fetchSessionAudioMap` establishes. A
  signing rejection (non-entitled) renders the paywall CTA / the existing
  audio-error state instead of the player.
- The committed lesson `content.json` files contain absolute
  `…/object/public/…` audio URLs (audit item #2's `.duin.home` decoupling).
  Reader-page audio must resolve through the signing path at render time
  rather than trusting stored URLs. Implementation: the reader's audio
  component strips a stored public URL to its bucket+path and signs it —
  one shared helper, so re-publishing all lesson content is NOT required
  (tokens-are-complexity: no pipeline re-run for a URL-shape change).

## 5. Gating new lesson activation

`set_lesson_activation` (migration.sql:1858) is the single server-side gate
for what becomes schedulable. Add, inside the existing function, **after the
existing lesson-exists check** (migration.sql:1877-1879 — placing it earlier
would mis-report a nonexistent lesson id as `entitlement_required`):

```sql
if p_activated
   and coalesce(auth.role(), '') <> 'service_role'
   and not indonesian.has_active_entitlement(p_user_id)
   and not exists (select 1 from indonesian.lessons
                   where id = p_lesson_id
                     and indonesian.is_free_tier_lesson(order_index)) then
  raise exception 'entitlement_required';
end if;
```

Existing callers verified: `activateStarterLessons` (`authStore.ts:171-189`)
activates only lessons 1–3 → passes the free-tier branch for every new user;
lesson-page toggles go through `setLessonActivated` and get the gate as
intended; no service-role caller is affected (bypass clause).

Deactivation and free lessons stay open. The client mirrors the check to show
a paywall CTA instead of the toggle (mirrored predicate is acceptable — the
server raise is the enforcement; the client mirror is UX, and a drift shows
as an error message, not an access hole).

**App surfaces (page-framework primitives, no bespoke CSS):**

- **Paywall panel** — shown on lesson pages beyond the free tier for
  non-entitled users and as the error state for gated audio: pricing
  (€7/mo · €56/yr), the two checkout buttons → `create-checkout-session`,
  links to `/terms` + `/refunds`.
- **Profile page** — subscription block: current status (from the owner-read
  entitlement row), "Manage subscription" → `customer-portal` (hidden when
  no `stripe_customer_id`).
- **Entitlement state in the client** — fetched alongside the profile load in
  `authStore.initialize`/`SIGNED_IN` (one extra parallel query on the
  owner-readable row, **routed through `entitlementService`** so exactly one
  reader owns the row shape), exposed as `isEntitled` on the authStore's
  `UserProfile` (`src/types/auth.ts`) alongside the existing `isAdmin` —
  this is **auth-owned authorization state** (the LOCKED `lib/auth` owns
  "identity, session, and authorization",
  `docs/target-architecture.md:229`; `useIsAdmin` is the precedent), not a
  `lib/profile` personalization field. The
  `/checkout/success` page calls `verify-checkout` (§3.4) with its
  `session_id` — one deterministic call, no webhook race, no polling — then
  refetches the entitlement and celebrates. If `verify-checkout` fails
  transiently it offers a retry button; the webhook is the backstop either
  way.

## 6. Invite-system teardown + GDPR seam

- Delete `supabase/functions/signup-with-invite/` (and its bind-mount copy)
  and Register's invite field; drop the DB surface via migration.sql's
  teardown section, explicit DDL:

  ```sql
  drop function if exists indonesian.redeem_invite_code(text);
  drop function if exists indonesian.restore_invite_code(text);
  drop table if exists indonesian.signup_invite_codes;
  ```

  (No `cascade` needed — grep-verified 2026-07-12: the only references to
  `signup_invite_codes`/`redeem_invite_code`/`restore_invite_code` are the
  edge function being deleted, migration.sql itself, and a
  `check-supabase-deep.ts:150` skip-set membership entry — remove that
  stale entry in the same PR that adds the §8 "is-gone" assertion.)
  CLAUDE.md § Signup gating updated. **This closes the parked
  invite-brute-force HIGH.**
- **Existing preview users are comped** before the gate goes live:
  `insert into indonesian.entitlements (user_id, status, source)
  select id, 'comped', 'comp' from auth.users on conflict do nothing;`
- `delete-account` edge function: before deleting the user, if the
  entitlement row has a `stripe_subscription_id` in the active set, cancel it
  (`subscriptions.cancel`) and delete the Stripe customer (erases Stripe-side
  PII per GDPR). The entitlement row itself dies via `on delete cascade`.
  Data *export* remains deferred to the cloud-migration item, acknowledged as
  an obligation at paid launch.

## 7. Rollout sequencing (one coordinated deploy window)

The bucket flip ships inside the migrate (§4 — a fresh-DB-replay
requirement), so this is **not** a phased zero-downtime rollout: between the
migrate and the app-container recreate, tabs running the old app construct
public URLs that now 400. The degradation is audio-only, affects only the
preview cohort's open tabs, and heals on refresh (the PWA update prompt
fires). Minimize the window by preparing everything deployable first:

0. **Prep (no user-visible effect):** app image built + pushed; edge
   functions ready to SCP; homelab-configs PR (GoTrue Google env,
   `DISABLE_SIGNUP=false`, Stripe env vars on the functions container)
   reviewed and ready to apply; Google + Stripe dashboards configured
   (test mode). **Preflight:** confirm `storage.objects` has RLS enabled on
   the live DB (`select relrowsecurity from pg_class where relname='objects'
   and relnamespace='storage'::regnamespace;` — expected `true` on every
   standard Supabase deploy; the policy is inert if not).
1. **Migrate + comp in one sitting** (gate chain:
   `make migrate-idempotent-check` → `make migrate` → `make pre-deploy`):
   entitlement tables + predicates + storage policies + **bucket flip** +
   activation-gate change + invite teardown DDL, then **immediately** the
   comp insert (§6, via psql — a one-time backfill, deliberately NOT in
   replayable migration.sql, or it would silently comp every future user on
   each migrate). Comping in the same sitting keeps the
   `entitlement_required` + private-audio window for existing preview users
   to minutes.
2. **Apply infra lane + SCP edge functions + recreate the app container**
   back-to-back (compose route for infra; the deploy.md procedure for the
   container). New app signs URLs; window closes.
3. **Verify** (§9 manual E2E + `make check-supabase && make
   check-supabase-deep` with the new checks).
4. Stripe stays in **test mode** end-to-end on the homelab (test-mode
   webhook via `stripe listen --forward-to https://api.supabase.duin.home/…`
   during verification). Live-mode flip happens after cloud migration.

## 8. Supabase Requirements

### Schema changes
- New: `indonesian.entitlements`, `indonesian.stripe_webhook_events`,
  `has_active_entitlement()`, `can_read_media()`, `is_free_tier_lesson()`,
  `idx_audio_clips_storage_path` — all in `scripts/migration.sql`.
- Changed: `set_lesson_activation` (entitlement check),
  `storage.buckets.public=false` ×3, new `storage.objects` policy.
- Dropped: `signup_invite_codes`, `redeem_invite_code`,
  `restore_invite_code` (teardown section).
- RLS: `entitlements` owner-SELECT / service-role-write;
  `stripe_webhook_events` service-role only; storage policy above.
- Grants: `entitlements` SELECT → authenticated; `can_read_media` EXECUTE →
  authenticated (evaluated by the storage policy as the invoking role);
  `has_active_entitlement` EXECUTE → service_role ONLY (definer-called, §1);
  `is_free_tier_lesson` — no explicit grant (pure parameter computation;
  default PUBLIC EXECUTE harmless, see §1 comment); everything else
  service-role.

### homelab-configs changes
- [x] GoTrue: `GOTRUE_EXTERNAL_GOOGLE_*`, `GOTRUE_URI_ALLOW_LIST`,
      `GOTRUE_DISABLE_SIGNUP=false` (compose route).
- [x] Functions container env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `APP_BASE_URL`.
- [ ] Kong: N/A — verified 2026-07-12 against `kong.yml`: the `functions-v1`
      route (lines 24-31) carries no key-auth plugin and the only global
      plugin is CORS, so Stripe's apikey-less webhook POST reaches the
      router (the existing app path never exercised this — `functions.invoke`
      auto-attaches the anon key — hence the explicit check). CORS already
      includes the app origin; the webhook itself is server-to-server.
- [ ] PostgREST: N/A — no new schema exposure.
- [ ] Storage: no new buckets; the public→private flip is part of
      migration.sql (§4).

### Health check additions

Split by key so the behavioral checks cannot green vacuously — the deep
check's service-key client carries BYPASSRLS and would sign ANY path
regardless of the policy (the exact `b38e467f` failure class):

- `check-supabase.ts` (anon key, functional): all 3 buckets return 400/404
  on unauthenticated `/object/public/` fetch (the "buckets actually private"
  probe); `stripe-webhook` returns 400 on unsigned POST (deployed +
  verifying signatures).
- **Behavioral RLS probes (anon key + real test-user sign-in**, the pattern
  of the existing signed-in RLS checks — NOT the service-key client**):**
  the comped test user can `createSignedUrl` a paid clip; a signed-in
  non-entitled probe cannot sign that clip but CAN sign a free-tier one;
  `set_lesson_activation` on a lesson >3 raises `entitlement_required` for
  the non-entitled probe.
- `check-supabase-deep.ts` (service key, structural only): `entitlements` +
  `stripe_webhook_events` exist, RLS enabled, expected policies/grants
  (including that `has_active_entitlement` has NO authenticated grant);
  `can_read_media`/`is_free_tier_lesson` exist; parity pin
  `is_free_tier_lesson(3)=true and is_free_tier_lesson(4)=false` (must match
  `FREE_TIER_MAX_LESSON` — catches a boundary edit that missed one side);
  `storage.buckets.public = false` ×3; `indonesian_media_read` policy
  present on `storage.objects`; `signup_invite_codes` and its RPCs are GONE.

## 9. Testing

- **Unit (Vitest):** webhook status derivation (Stripe subscription state →
  entitlement status) as a pure function; public-URL → bucket+path stripping
  helper; paywall gating logic in the lesson page (entitled / free-tier /
  lapsed renders).
- **User-level (RTL):** login page shows Google button and invite field is
  gone; non-entitled user on lesson 4 sees paywall with both prices; profile
  shows subscription block only with a Stripe customer; checkout-success page
  polls entitlement.
- **Manual E2E (test mode, §7 step 3):** full checkout with Stripe
  test card → `verify-checkout` on the success page → entitlement active →
  lesson 4 activates → audio signs; webhook replay of the same events is a
  no-op (idempotency); cancel via portal → status flips at period end;
  comped test user (reference_test_user) unaffected throughout, including
  the free pronunciation podcast for a fresh non-entitled account.

## 10. Non-goals / accepted residuals

- **Content-table reads stay open to all authenticated users** — a
  determined free user could read lesson text via PostgREST. The load-bearing
  gates are activation (what's schedulable) and audio (the premium medium).
  Full content RLS would touch ~20 tables for marginal protection of text
  that's progressively being re-authored anyway. Revisit only with evidence
  of abuse.
- **The free-tier TTS grant is text-level, not clip-level** (§4): a user who
  hand-crafts the storage path of a *paid* lesson's clip whose
  `normalized_text` also has a free-lesson clip (e.g. a different voice of
  the same sentence) can sign it. Deliberate — clip reuse plus nullable
  `generated_for_lesson_id` make exact clip-level gating unreliable, the
  activation gate is the load-bearing one, and the exposure is single
  shared sentences, not lesson content.
- No trials, no multi-product, no seat/team billing, no in-app invoice UI
  (portal owns it), no captcha, no Apple.
- Data export, `.duin.home` decoupling, and the Traefik forward-auth removal
  stay in the cloud-migration item (#2 of the launch list).

**Documentation at implementation time:** the payments surface gets the same
fidelity as the rest of the roster — a module-spec-grade entry for
`supabase/functions/_shared/stripe/` + the four functions (mirroring the
`commit-capability-answer-report` server-side spec) and a CONTEXT.md
glossary line for *entitlement*; CLAUDE.md § Signup gating and the data-model
table gain the new rows.
