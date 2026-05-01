# Commercialization Roadmap

**Date:** 2026-05-01
**Status:** Discussion notes / planning input — not a committed plan
**Source:** Synthesized from the architecture-review conversation on 2026-05-01

This doc captures the discussion on what it would take to move this app from a single-user homelab project to a commercial SaaS product. It separates **architectural blockers** (would force structural rework) from **feature gaps** (just engineering work), and proposes a concrete sequence with rough effort estimates.

This is forward-looking input for product/business decisions, not a committed engineering plan. Re-evaluate at each phase boundary.

---

## 1. Honest current-state framing

The app today is a frontend-heavy React + Vite SPA talking directly to a self-hosted Supabase instance on a homelab. By design choices made consciously:

- **No custom application backend.** The frontend calls Supabase APIs (PostgREST, GoTrue, Storage, Realtime, Edge Functions) directly. Industry shorthand for this is "BaaS-direct" — Supabase IS the backend, but you don't run a custom Node/Go/Rails service on top.
- **Self-hosted, single-user.** Step-CA TLS, `.duin.home` cookie domain, no SMTP, GoTrue's `GOTRUE_MAILER_AUTOCONFIRM: true` skips email verification.
- **Schema-as-API.** The frontend speaks raw Postgres column names via PostgREST. Renaming a column breaks the frontend.

This architecture is **fit-for-purpose for what it is.** The page-framework primitives, exercise-framework primitives, capability system, content pipeline, FSRS scheduler, and the rest of the application core are well-designed and matched to industry best practice (composition-based UI primitives, deep modules with small interfaces, FSRS as the spaced-repetition algorithm, design-token-driven theming).

The limitation is not the application architecture — it's the deployment architecture and the missing commercial infrastructure (auth flows, billing, email, compliance, content management, observability) that any commercial product needs and that this project legitimately skipped.

---

## 2. What would NOT need rework

The valuable parts port unchanged:

- React + Vite SPA with the page-framework primitives.
- Exercise framework primitives + the 12 production exercise components.
- Capability system, content pipeline, FSRS scheduler, lesson experience model, source-progress tracking.
- Postgres schema + RLS policies (just SQL — runs anywhere).
- Edge Function code (Deno + TS — portable to Supabase Cloud or AWS Lambda).
- 1013-test vitest suite + the seam-contract scanner + the migration discipline.

If you're paying engineers' time at commercial rates, this is the body of work that would be expensive to rebuild — and you don't have to.

---

## 3. Architectural blockers (would force structural change)

### 3.1 Homelab Supabase is the deployment, not just the dev environment

A residential-network self-hosted Supabase cannot serve commercial users:
- No SLA-grade uptime or bandwidth.
- Step-CA certificates aren't trusted by browsers — public users see scary cert warnings.
- One Postgres instance, no connection pooling, no read replicas, no real point-in-time-recovery cadence.
- A power outage at home = customer-visible outage.

**Commercial path:** move to **Supabase Cloud** (managed) for the first phase. Self-host on AWS only later, when scale or compliance justifies the ops overhead. See §6 below for the full Cloud-vs-self-host trade-off.

### 3.2 No subscription/billing model

The architecture has no concept of paid tiers, trials, payment status, or revoked access. Adding Stripe means:
- Webhook receiver (must be reliable — Edge Function with idempotency, or a small backend service).
- Subscription state in your schema (`subscriptions`, `customer_portal_access`).
- RLS policies that gate access on subscription status.
- Customer portal (cancellation, payment update, invoices).

This is normally where teams add their first dedicated backend service, because Stripe webhooks need atomic processing (signature verification + database update + idempotency) that's brittle in cold-starting Edge Functions.

### 3.3 No transactional email

Per `CLAUDE.md`, email is explicitly out of scope:

> Email is not configured on the self-hosted Supabase instance. GoTrue has `GOTRUE_MAILER_AUTOCONFIRM: true` — users are auto-confirmed on signup, no verification email is sent.

For commercial you absolutely need: account verification, password reset, billing receipts, billing failure notifications, abandoned-trial nudges, security alerts ("new login from..."), weekly digest emails. Requires:
- SMTP provider (Postmark / SendGrid / SES) wired into GoTrue.
- A transactional email service for app-driven emails (templates, sends, opens/clicks).
- Bounce / complaint handling, deliverability monitoring.
- Compliance with CAN-SPAM, EU PECR.

**Mitigation:** OAuth-only auth (§7) eliminates most auth-related email entirely. You still need transactional email for billing and product updates.

### 3.4 No multi-tenant authorization model audit

Today the `indonesian` schema is a single shared space. Lessons are global; user state is per-row keyed by `user_id`; RLS exists but is built for single-app use. For commercial:
- Audit every table for `user_id`-scoped RLS or admin-bypass policies.
- Decide what "admin" means when admins are staff at your company, not your homelab user.
- Add audit logs for content changes.

This is a few days of work, not a rewrite. The schema is already mostly there.

### 3.5 Content authoring is dev-tool-only

Lesson authoring runs through scripts (`catalog-lesson-sections.ts`, the linguist agents, `publish-approved-content.ts`). Content review is in `src/pages/ContentReview.tsx`, admin-gated, minimal. For commercial:

- **Path A (slow content):** keep the script pipeline, author all content yourself, ship lessons monthly. Limits product growth but ships.
- **Path B (fast content):** build a CMS — content authoring UI, draft/review/publish workflow, version history, scheduled publishing, AB testing. This is a major effort, comparable to half the existing app.

For most commercial language-learning apps, **Path A is the realistic 1-year choice.** Duolingo built their content engine over years. Don't replace your content pipeline until your scripts genuinely block growth.

---

## 4. Feature gaps (engineering work, not architectural)

### 4.1 OAuth for auth (Google + Apple)

**Highly recommended as the first auth change**, even before billing. Drops the entire password-storage compliance category.

- Google Cloud Console → OAuth 2.0 client. Free, 5 min.
- Apple Developer Program ($99/year) → Service ID + JWT-signed client secret. Required if you ship iOS apps with any social login.
- In Supabase Studio: Authentication → Providers → enable Google + Apple, paste credentials.
- In `Login.tsx` / `Register.tsx`: replace email/password form with `supabase.auth.signInWithOAuth({ provider: 'google' | 'apple' })` buttons.

**What this gets you:**
- No password storage, no password reset flow, no brute-force protection needed, no email confirmation.
- Apple's "Hide My Email" relay → you don't even store the user's real email.
- ~50 lines of UI code total. Roughly half a day of work.

**What still gets stored locally:**
- User UUID (your internal key, used as foreign key for all per-user state).
- Email (returned by provider — relay address if Apple's hide-my-email).
- Display name + avatar URL (if returned).
- Provider + OAuth `sub` (links your row to the IdP's user).

You can't avoid identity storage if you want a working app — every per-user query needs a user_id. What OAuth eliminates is **secret PII** (passwords). That's the high-value compliance category — passwords are what get stolen and leveraged.

### 4.2 Subscription / billing (Stripe)

- Stripe webhook handler (Edge Function or small backend).
- `subscriptions` table tied to `auth.users.id`.
- Customer portal links from Profile.tsx.
- RLS gates: free-tier users see free content, paid-tier sees premium content.
- Trial logic: 7/14/30-day trial with auto-conversion or expiry.
- Stripe Tax for VAT/GST/sales tax.

Couple weeks of focused work for the basics; ongoing iteration for tiers, promos, dunning, etc.

### 4.3 Compliance and legal

Not architecture, but commercial-blocking:
- Privacy policy, TOS, EULA.
- Cookie consent banner (cookies are scoped to `.duin.home` for SSO today — change for production).
- GDPR right-to-erasure (account deletion that cascades).
- GDPR right-to-portability (data export — JSON or CSV dump of user's progress + lesson history).
- CCPA equivalents for US users.
- Data Processing Agreement with Supabase (they offer one for paid tiers).
- Age verification if marketing to under-13 (COPPA).

A focused week of work for the technical pieces (deletion + export); legal review and policy authoring takes longer or costs $1-3k via a service like Termly.

### 4.4 Observability and analytics

Today: `error_logs` Postgres table. For commercial:
- **Sentry** or Honeybadger for error tracking (~$26/month).
- **PostHog** or Mixpanel for product analytics (PostHog free tier covers small SaaS).
- **Logflare** (Supabase integrated) for log search.
- **Stripe webhook event log** for billing reconciliation.
- **Customer support tooling** (Intercom, Help Scout, Plain) — requires user identification across systems.

A few days for instrumentation; ongoing care to keep dashboards meaningful.

### 4.5 CDN for static assets

Today: Nginx + Traefik on the homelab serves the SPA bundle (~1.4 MB) directly. For commercial:
- Push the SPA bundle to **Cloudflare Pages** or **Vercel** or **Netlify** (CDN-cached, near-zero latency globally, free tier sufficient for low millions of pageviews).
- Audio files (lessons + podcasts) served from a CDN-fronted bucket (Supabase Storage already supports this; or migrate to S3 + CloudFront).

A day of work to wire up; the static-site CDNs all have one-click GitHub integrations.

### 4.6 Native mobile apps (optional)

- **Capacitor** wraps the existing PWA into iOS + Android binaries. Easy path; some app-store-specific UI tweaks.
- **React Native** is a rewrite. Don't go here unless PWA limitations are the issue.
- **iOS native (Swift) + Android native (Kotlin)** is a full rewrite per platform.

Most language-learning apps that started as web go Capacitor first. Apple Sign-in becomes mandatory when you ship to the App Store with any social login.

---

## 5. The frontend-only Supabase pattern, recapped

Worth being precise about terminology because the trade-offs are specific:

**"Backend"** in the broad sense (server-side machinery) IS what Supabase provides. Postgres, PostgREST, GoTrue, Storage, Realtime, Edge Functions — all running server-side, all in the homelab containers today, all part of Supabase.

**"Custom application backend"** in the narrow sense (an Express / Go / Rails service that owns business logic and exposes a hand-crafted API) — this project doesn't have one. The React app calls Supabase's auto-generated APIs directly.

This is the **BaaS-direct** pattern. It's a real industry pattern with real trade-offs:

| You get | You give up |
|---|---|
| One container to deploy. No backend service. | A typed API layer that buffers schema changes from the client. |
| Direct DX — write the query, get the data. | Composing >2 calls becomes a sequence of round-trips. |
| RLS as your authorization model. | Authorization logic lives in SQL, not TypeScript. |
| Self-hosted, vendor-flexible. | Schema-as-API: column renames are breaking changes. |
| Edge Functions when you need server-side code. | Each Edge Function is a mini-deploy + auth + CORS dance. |

**Strain points already encountered in this project:**
- Auto-fill bridge had to chunk `.in()` queries to 50 IDs to avoid Kong's URI buffer.
- Session loader had the same issue once production capability count grew to 2,357.
- PostgREST's 1000-row default cap forced pagination via `.range()`.
- Schema mismatches (`pattern_name` vs `name`) only surfaced at first dry-run, not in mocked tests.

**Escape hatch ladder:**

1. **SQL functions + `supabase.rpc()`** — push tricky multi-table operations to Postgres.
2. **Edge Functions** — for custom TS server-side code (auth wrappers, billing webhooks, complex orchestration).
3. **Database triggers + `pg_cron`** — for things that should always happen (audit logs, scheduled aggregations).
4. **Eventually a real backend** — if you accumulate 5+ Edge Functions doing meaningful work, consolidate into a small service (Hono / Express / Go).

You're at level 2 today (one Edge Function for capability answer commits). Most commercial apps end up at level 4 once they've grown past their Series A.

---

## 6. Deployment migration: Cloud vs self-host on AWS

Two real options for moving off the homelab:

### Option A — self-host Supabase on AWS

Take the existing `homelab-configs/services/supabase/docker-compose.yml` shape and run an equivalent on AWS:
- RDS for Postgres (managed backups, Multi-AZ, read replicas).
- ECS Fargate tasks for PostgREST, GoTrue, Realtime, Storage, Kong, pg-meta.
- Application Load Balancer + ACM for TLS.
- S3 backing for Storage.
- SES for SMTP (wired to GoTrue).
- Lambda or ECS for Edge Functions.

**Pros:** full control, custom Postgres extensions, VPC peering, no per-row Cloud pricing tier, best for compliance scenarios (HIPAA, FedRAMP, data sovereignty).

**Cons:** you become the Supabase ops team. Backup strategy, security patches, replica failover, connection pooling tuning, version upgrades — all you. Realtime in particular is non-trivial (Erlang clustering, sticky LB). Costs ~$80-200/month minimum for always-on tasks; ~$300-800/month at low-thousands-of-users with Multi-AZ + ALB + NAT.

### Option B — Supabase Cloud (recommended starting point)

Pay supabase.com $25/month + usage. They run everything; you connect the frontend.

**Pros:** zero ops. Backups, upgrades, scaling, patching, replication, cert rotation — all handled. Pro tier $25/month + usage. Built-in PgBouncer, branch databases for staging, point-in-time recovery, log explorer. Same Docker images as self-hosted — zero feature drift; you can migrate Cloud → self-hosted later.

**Cons:** per-row / per-MB / per-egress pricing kicks in at scale. At low millions of users this gets expensive (often $2-5k/month). US/EU regions only. Their outages are your outages.

### The hybrid pattern most commercial apps land on

- Frontend hosted on **Vercel / Cloudflare Pages / Netlify** (CDN-first).
- Database / auth / storage on **Supabase Cloud**.
- Edge Functions on Supabase for things colocated with the database.
- Heavier serverless on **AWS Lambda or Cloudflare Workers** (Stripe webhooks, scheduled jobs, batch imports).

You don't pick one cloud vendor; you pick the right tool per concern.

### Honest recommendation

**Start with Supabase Cloud.** Reasons:
1. The cost is irrelevant compared to your time. $25-100/month vs. evenings on Postgres tuning.
2. Migration: dump schema → restore on Cloud → update env vars → deploy. **2-3 days of work**.
3. If you outgrow Cloud (cost or feature), self-host is real later. Same Docker images both ways.
4. Their team has handled more failure modes than you will.

Re-evaluate Cloud vs self-host at the **$1k/month spend** mark. That's roughly the moment self-hosting pays back in cost-vs-time terms.

---

## 7. Proposed sequence

Effort estimates assume one focused developer (you). Multiply by 1.5-2x for context-switching with other work.

### Phase 1 — Move off the homelab (1 week)

**Goal:** the app runs at a public URL on managed infrastructure.

- Spin up a Supabase Cloud project in EU or US region.
- `pg_dump` from homelab → restore to Cloud (schema + data).
- Update `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` for production.
- Buy a domain. Set up DNS.
- Push the SPA bundle to Cloudflare Pages or Vercel (build pipeline via GitHub Actions).
- Deploy Edge Functions to Supabase Cloud.
- Smoke test: the app works at the production domain with one user.

**Done state:** `app.your-domain.com` serves the same UX you have today, on managed infrastructure, with a real cert.

### Phase 2 — OAuth-only auth (half a day)

**Goal:** drop password storage entirely.

- Register OAuth apps with Google (free) and Apple ($99/year for Developer Program).
- Configure providers in Supabase Studio.
- Update `Login.tsx` + `Register.tsx`: replace email/password form with OAuth buttons.
- Update `Profile.tsx` to show OAuth-sourced name/avatar.
- Remove password-related strings from `i18n`.

**Done state:** users sign up via Google or Apple. No passwords stored. Compliance surface dropped by ~40%.

### Phase 3 — SMTP + transactional email (1 week)

**Goal:** send the emails commercial requires.

- Set up AWS SES (or Postmark / Resend / Loops). Verify domain.
- Wire SMTP into Supabase Cloud's Auth settings.
- Build email templates (account creation welcome, billing receipts, security alerts, weekly digest).
- Add an email-sending service module (`src/services/emailService.ts`) that wraps SES.
- Compliance: unsubscribe links, plain-text alternatives, sender authentication (SPF/DKIM/DMARC).

**Done state:** the app can send transactional emails reliably. Required even if OAuth removes auth-related email — billing and product email remain.

### Phase 4 — Stripe billing (2 weeks)

**Goal:** users can pay; access gates on subscription state.

- Stripe account, set up products + pricing.
- `subscriptions` table in your schema (linked to `auth.users.id`).
- Edge Function or small backend to receive Stripe webhooks (signature verification + idempotency).
- Customer portal links from Profile.tsx (Stripe-hosted billing page).
- RLS policies that gate premium content on subscription status.
- Trial logic.
- Stripe Tax for sales tax compliance.

**Done state:** users can subscribe, manage their subscription, and cancel. Premium content is gated behind active subscription.

### Phase 5 — Compliance baseline (1 week + legal review)

**Goal:** you can serve EU and US users without immediate legal exposure.

- Privacy policy + TOS (use a generator like Termly, $20/month, or hire counsel for $1-3k).
- Cookie consent banner (Cookiebot, Termly, or a small custom banner).
- Account deletion flow (UI + cascade in Postgres).
- Data export flow (download progress + lesson history as JSON).
- GDPR-compliant data retention policy in your `error_logs`.
- Data Processing Agreement with Supabase (they offer one on paid tiers).

**Done state:** you can lawfully accept EU customers. US compliance (CCPA) follows the same structure.

### Phase 6 — Observability (a few days)

**Goal:** you'll know when something breaks before users tell you.

- Sentry for error tracking ($26/month + free tier).
- PostHog for product analytics (free tier covers most SaaS).
- Logflare for log search (Supabase-integrated).
- An uptime monitor (Better Stack, Healthchecks.io).

**Done state:** errors land in Sentry within seconds of occurring. Funnel and retention metrics are visible.

### Phase 7 — Soft launch (1 week)

**Goal:** find the bugs you didn't see in dev.

- Open invite-only beta to 10-50 users.
- Monitor Sentry, PostHog, Stripe.
- Fix anything urgent.
- Iterate on UX based on real usage.

**Done state:** you've shipped to real users and they're using it without breaking.

### Phase 8 — Optional: native apps (3-6 weeks via Capacitor)

**Goal:** App Store presence.

- Wrap PWA via Capacitor.
- Apple App Store + Google Play developer accounts ($99 + $25 one-time).
- Required: Apple Sign-in (already added in Phase 2).
- Required: app review compliance (privacy policy URL, data collection disclosures, IAP if you sell digital goods through the app — note that App Store IAP charges 15-30%, so most subscription apps direct users to a web payment flow on first signup).

---

## 8. Total effort and timeline

A solo developer working evenings/weekends, realistic timeline:

| Phase | Realistic calendar time | Hard blocker for launch? |
|---|---|---|
| 1 — Move off homelab | 2 weeks | Yes |
| 2 — OAuth | 1 evening | Yes (or do email/password — but OAuth is faster overall) |
| 3 — SMTP + transactional email | 2 weeks | Yes |
| 4 — Stripe billing | 4 weeks | Yes |
| 5 — Compliance baseline | 2 weeks + legal review | Yes |
| 6 — Observability | 1 week | Soft (can launch without; will need within first month) |
| 7 — Soft launch | 1-2 weeks | Yes |
| 8 — Native apps | Optional, 6-12 weeks | No (PWA can be your v1 launch) |

**Total to commercial-ready PWA: 10-14 weeks of focused part-time work.** Native apps add another 2-3 months on top if you want them in v1.

**If you have a full-time week or two**, you could compress phases 1-5 into ~6 weeks. Beyond that, the legal/compliance review + soft-launch validation takes wall-clock time you can't compress.

---

## 9. What scales fine vs what breaks at scale

For reference, the points along the growth curve where parts of this architecture would need attention:

| Users | What's strained | What you'd do |
|---|---|---|
| 1-100 | Nothing | Ship and iterate. Architecture is fine. |
| 100-1,000 | Email deliverability if cold-sending. Initial Stripe webhook reliability. | Tighten email reputation. Add idempotency to webhook handler. |
| 1,000-10,000 | Supabase Cloud's connection pool starts to matter. Static asset costs creep up. | PgBouncer transaction mode. CDN tuning. Real monitoring. |
| 10,000-100,000 | PostgREST query patterns hit URL/row limits frequently. Edge Function cold starts visible. Storage egress meaningful. | Server-side aggregation via SQL functions. Add a small backend service for billing + analytics. Move to Storage CDN tier. |
| 100,000+ | Cloud per-row pricing painful (~$2-5k/month). Realtime scale matters. | Re-evaluate self-host on AWS. Add read replicas. Consider Postgres-native replication for analytics workload. |
| 1M+ | Single-region Supabase becomes a latency problem for global users. | Multi-region. CDN-cached read paths. Eventually a custom backend with regional caching layers. |

Most commercial language-learning apps live in the 10k-100k users range. The architecture supports this with the work outlined above. Beyond 100k, expect to hire infrastructure help.

---

## 10. Decision points to revisit

1. **At Phase 4 completion (post-billing live):** is product-market fit looking real? If yes, continue to compliance + observability. If no, don't over-invest in commercial infrastructure.

2. **At 5+ Edge Functions doing meaningful work:** consolidate into a small backend service (Hono on Cloudflare Workers, or Express on Render/Fly). The frontend stays the same; you swap some `supabase.from(...)` calls for `fetch('/api/...')` calls when business logic justifies it.

3. **At $1k/month Supabase Cloud spend:** evaluate self-host on AWS. Tipping point depends on engineer hourly rate vs cloud savings.

4. **At ~$10k MRR or 50+ paying users:** consider hiring contract help for compliance, content authoring, support — whichever is your bottleneck.

5. **At sustained organic growth:** evaluate whether the script-based content pipeline is the bottleneck. If yes, build the CMS (Path B in §3.5).

---

## 11. What this doc does NOT prescribe

Things explicitly left for separate planning:

- Pricing strategy (free / freemium / pay-only / per-month / per-year).
- Marketing strategy (SEO, content, paid acquisition, partnerships).
- Content strategy (number of lessons, depth, language pairs beyond Indonesian).
- Team / hiring plan.
- Funding / investment strategy.
- Specific competitor analysis (Duolingo, Babbel, Pimsleur, etc.).

This doc is purely the **technical engineering roadmap** for moving from homelab to commercial. The business questions are equally important and entirely separate.

---

## 12. Honest summary for a TL;DR

- **The application code is in commercial-grade shape.** You wouldn't throw any of it away.
- **The deployment is purpose-built for homelab.** Move to Supabase Cloud + Cloudflare Pages in a week.
- **The biggest pre-launch work is commercial infrastructure** (auth flows, billing, email, compliance, content management) — about 10-14 weeks part-time.
- **OAuth-first auth is the highest-leverage early change.** Half a day's work, drops password storage entirely, faster signup, App Store compliant.
- **Don't pre-optimize for scale.** Supabase Cloud handles up to ~10k users without architectural changes. Build a real backend only when you have ~5+ Edge Functions doing meaningful work.
- **Re-evaluate self-hosting at $1k/month.** Until then, managed beats self-hosted on cost-vs-time.

The hardest part isn't the technical architecture. It's the business infrastructure (legal, billing, content, marketing) that any commercial product needs and that this project legitimately deferred.
