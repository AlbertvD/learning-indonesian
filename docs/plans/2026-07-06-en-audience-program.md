---
status: draft
---
<!-- HIGH-LEVEL PROGRAM SPEC (Bet 5 of docs/plans/2026-07-06-bold-bets-high-level-specs.md).
     Deliberately not implementation-ready. Mostly a CONTENT + POSITIONING program riding
     on machinery the other bets build; only two items are new build. -->

# The EN audience — "the serious Indonesian app"

## Goal

Serve English-speaking Indonesian learners with the same capability-model depth, positioned against the big apps' neglected Indonesian courses. Not a second product: one app, one content model (EN translations already exist throughout), two front doors.

## Why us / why bold

The NL moat doesn't transfer — but the EN gap is different and real, and now precisely stated (market research 2026-07-06): **every mass-market app caps Indonesian at A2** — Duolingo's course is ¼ flagship-length (~1,200–1,800 words, formal register only, no Stories/Podcast), Babbel offers Indonesian but tops out at A2, Busuu has none. For EN the moat is depth past that ceiling: the affix trainer, real FSRS, graded input, i+1 stories, constrained AI chat. Positioning: *the serious Indonesian app, for people who actually need the language* — operationalized as the public "route to B1" map and the "na Duolingo" placement exit-ramp (growth-layer spec).

## Wedge segments (by intent-to-pay)

1. **Bali/Jakarta expats & digital nomads** — concentrated, high willingness to pay, socially embarrassed to still be at *terima kasih*. Hook: **"Stop being the bule who only knows terima kasih."**
2. **Partners/family of Indonesians** — the EN mirror of the heritage segment; converts on Percakapan ("talk to your mertua").
3. **Australians** — REFRAMED (market research 2026-07-06): Indonesian schooling there has **collapsed** (>80% enrolment decline since the early 2000s; <200 Year-12 students nationwide in 2019; programs still closing 2024–25). Not a schools sales channel — a **supply vacuum** for motivated adults plus a live national "Indonesia capability" policy anxiety = press-narrative and grant/institutional angles. Deprioritize school B2C.

## What transfers for free (the leverage — most of the program)

- **Bets 2 & 3 are L1-agnostic by construction**: the capability model, i+1 generation, learner-model compression, and placement (Bet 1 slice 2) don't care about UI language. Building them for NL builds them for EN.
- **The UI is already bilingual**: full nl/en dictionary (`src/lib/i18n.ts`), language switching persisted in profile; content carries `translation_en`/EN glosses throughout.
- **The SEO generator** (Bet 4 leg 1) runs a second time with EN templates — same data, same engine.

## What needs EN-specific work (the actual build)

1. **The onboarding hook.** No Dutch-loanword wall, but a weaker cousin: Indonesian's international/Latinate layer (*informasi, universitas, televisi, polisi, apotek, komputer*) + colloquial English loans. Same `/welkom` mechanic, different curated list (~80–120 words — smaller and less magical than the NL list; set expectations accordingly).
   - **✅ DECIDED 2026-07-06 (resolves the staff-engineer drift finding):** Bet 1 builds `loan_source_nl` exactly as approved — do NOT reopen the approved spec. When the EN list is authored, generalization is a **later additive migration on a content table** (rebuild-friendly regime; additive columns are the blessed path). Cost then ≈ cost now, and it avoids designing a per-L1 shape against a hypothetical.
2. **EN pronunciation contrast set — smaller than it looks (staff-engineer, favorable):** `pitfallCatalog.ts:13-31` is **already L1-parameterized** (`L1 = 'nl' | 'en'`, entries carry `l1: L1[]`) — the mechanism anticipated EN. Build = author/complete the EN entries + EN primer copy; **re-verify which `'en'` rows already exist before scoping this at all.** No new mechanism.
3. **EN SEO twin** (Bet 4's generator, EN templates): "meN- prefix explained", "ber- vs meN-", "Indonesian for Bali: 50 warung words". The affix long-tail is wide open in EN too.
4. **Wedge theme packs:** "Warung Indonesian", "Kos life", "Ojek & Grab", "Immigration counter" — small authored collections aimed at segment 1. Existing collections machinery; pure content.
5. **Bilingual brand — DIRECTION SET 2026-07-06 (user): one app, two names.** "Kamoe Bisa" for NL; a distinct EN name (to be chosen). Feasibility verified: the brand literal lives in only ~6 files (`SunMark`, `Sidebar`, `MobileLayout`, `Landing`+copy) → becomes a `brand.*` token in the existing nl/en `i18n.ts` dictionaries, following the UI language. Public entry = domain-driven (NL domain / EN domain, same container; hostname sets default language + brand; Traefik routing config). Two known hard edges, neither blocking: the PWA manifest is one static file per served host (currently generic "Learning Indonesian" anyway — needs a decision regardless; per-hostname manifest is a known pattern), and future app-store/TWA listings carry one name each (two listings, Phase-2+ concern). **Open: choosing the EN name itself.**

## Grounding (what exists to reuse)

- `src/lib/i18n.ts` (full nl/en dictionary), profile language persistence, `translation_en` across the content model, collections/themepacks, pronunciation module structure (catalog-driven — EN catalog slots in), Bet 4's static generator.

## Supabase Requirements (high level)

- **Schema:** none beyond the Bet-1 cognate-field decision (which belongs to Bet 1's execution spec). Theme packs and pitfall catalogs are content, not schema.
- N/A: RLS, edge functions, homelab-configs, health checks — no new runtime surface.

## Cost & monetization

Almost entirely content + curation on existing machinery. EN roughly doubles the addressable market of every paid feature (Percakapan scenarios ship bilingually — scenario content authored once with NL+EN framing).

## Slices

1. **EN wedge theme packs** (content; any time).
2. **EN onboarding list + `/welkom` EN variant** (after Bet 1 slice 1 proves the mechanic; includes the additive cognate-field migration decided above).
3. **EN pronunciation catalog completion** (content on the existing L1-parameterized module; audit existing `'en'` entries first).
4. **EN SEO twin** (after Bet 4's generator exists).

## Out of scope

- A separate EN app/brand build-out (one app, two front doors — revisit only if the brand check fails hard).
- Other L1s (German, French…) — the per-L1 cognate decision keeps the door open; nothing else is built for them.
- Schools/B2B (Australia angle is a note, not a program).

## Open questions

1. ~~The `loan_source_nl` generalization~~ **DECIDED** — later additive migration; Bet 1 unchanged (see above).
2. EN brand voice + whether marketing splits by domain (bet4 open Q1 interacts).
3. How the app picks the front door: browser language, explicit choice at signup, or per-marketing-page entry (lean: marketing entry sets it, profile persists it — mechanism exists).
4. Percakapan scenario authoring: NL+EN framing in one artifact, or per-language variants? (Lean: one artifact, two framing fields — content-regime question for Bet 3's spec.)
