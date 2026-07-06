---
status: draft
---
<!-- HIGH-LEVEL PROGRAM SPEC (Bet 4 of docs/plans/2026-07-06-bold-bets-high-level-specs.md).
     Deliberately not implementation-ready. Mostly NOT app code — a static generator,
     content curation, and positioning. Lightest gauntlet of the five bets. -->

# The growth layer — SEO from data, free funnel, heritage positioning

## Goal

Turn data the app already owns into acquisition surface: statically generated SEO pages in the near-empty Dutch "Indonesisch leren" search space, a free funnel with a sharp edge, and positioning aimed at the heritage segment rather than generic gamified learning.

## Why us / why bold

Content-marketing moats usually cost an editorial team. Ours generates from data: per-word pages from `learning_items` + glosses + audio, per-affix pages from the **deterministic morphology engine** (uniquely defensible — no competitor can generate correct Indonesian affix explanations at scale), loanword listicles from `loan_source_nl` (Bet 1's column paying twice). Dutch-language Indonesian-learning SEO has effectively no incumbent.

## The three legs (concept level)

### Leg 1 — SEO pages generated from data

- **Page types:** per-word ("Wat betekent *selamat*?" — gloss, audio, example sentence, etymology if loanword), per-affix ("Hoe werkt *meN-*?" — rule, allomorphs, word families from the morphology engine), listicles ("50 Nederlandse woorden die je al Indonesisch maken"), per-theme ("Indonesisch voor je vakantie naar Bali").
- **Architecture decision (the one that matters): a separate static site, not app routes.** Generated at build time from the staging/content data (pipeline-side, where the data already lives) — zero runtime DB exposure, zero new security posture on the app, trivially cacheable, independent deploy cadence. The app's existing public `Landing` page (`src/App.tsx:38,99`) stays the only public app surface; every SEO page CTAs into it → `/welkom`.
- **Scale discipline:** start with ~50 highest-value pages (loanwords + top affixes), measure, then widen. A 3,000-page sitemap on day one is thin-content risk, not boldness.

### Leg 2 — Free funnel with a sharp edge

- Free forever: the `nl-leenwoorden` collection (Bet 1) + one theme pack (*"Op vakantie naar Bali"* — exists in the 7 live themepacks or is authored as one).
- Everything else behind Phase-2 entitlements — enforcement at the activation RPCs exactly as the Phase-2 design already specifies (`docs/roadmap.md` §Phase 2); this program adds **no** paywall mechanism, only decides what's on which side.
- Funnel shape: vacation searcher (SEO) → loanword wow (`/welkom`) → habit (FSRS sessions) → wall (more lessons/collections) → subscribe. The heritage learner enters the same funnel but converts on depth (Percakapan, weekverhaal), not access.

### Leg 3 — Positioning

- Lead with heritage and connection: **"de taal van je oma"** — the Indo community (~1.5–2M Dutch people with Indonesian roots), mixed NL-ID families. Emotional wedge no generic app can copy; aligns with the Kamoe Bisa identity.
- Vacation learners are top-of-funnel volume; heritage learners are the retained subscribers. Copy, landing page, and SEO page tone all serve both without confusing them (practical pages for vacation intent; story-led pages for heritage intent).

## Grounding (what exists to reuse)

- Public `Landing` page + copy file already exist (`src/pages/Landing.tsx`, `Landing.copy.ts`) — the funnel's destination needs polish, not creation.
- Morphology engine (deterministic derivation/decomposition, ADRs 0018–0021), audio clips in the public-read bucket, collections/themepacks live, invite-gated signup (the funnel's current bottleneck — see open Q4).

## Supabase Requirements (high level)

- **None on the app side.** The static generator reads staging + content tables at build time (pipeline context, service credentials already available there); it publishes to static hosting.
- N/A: schema, RLS, edge functions, homelab-configs — no new runtime surface. (If the generator reads the live DB rather than staging, it's a read-only pipeline consumer — still no new grants.)

## Cost & monetization

Near-zero marginal (static hosting). This program is the *demand* side of Phase-2 monetization; it ships value only when there's a funnel endpoint worth reaching (Bet 1 live) and converts only when Phase-2 entitlements exist.

## Slices

1. **Positioning + Landing refresh** (copy-level; can ship any time).
2. **SEO generator v1**: loanword listicle + ~30 per-word pages + 5 per-affix pages, separate static site, measure.
3. **Funnel wiring**: free-tier boundary decision + CTA paths (lands alongside Phase-2 entitlements).

## Out of scope

- Paid acquisition, social content, app-store presence (PWA→TWA) — separate later programs.
- Any paywall *mechanism* (Phase-2 design owns it).
- EN-language SEO (Bet 5's twin — same generator, second run).

## Open questions

1. Hosting + domain for the static site (subdomain of the future public domain? decides cookie/analytics posture).
2. Generator input: staging files vs live-DB snapshot (lean staging — versioned, no credentials outside the pipeline).
3. Sitemap growth policy + canonical-content quality bar (when is a generated page good enough to index?).
4. **The funnel is currently invite-gated** — signup opens at Phase-2 cloud launch. Sequence leg-2/leg-3 shipping relative to that, or SEO pages land before anyone can sign up (fine for domain aging, decide consciously).
