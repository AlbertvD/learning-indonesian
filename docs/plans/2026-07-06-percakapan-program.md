---
status: draft
---
<!-- HIGH-LEVEL PROGRAM SPEC (Bet 3 of docs/plans/2026-07-06-bold-bets-high-level-specs.md).
     Deliberately not implementation-ready: each slice needs its own execution spec +
     full review gauntlet before building. This bet is designed now, SHIPPED IN PHASE 2
     as the premium launch feature. -->

# "Percakapan" — the AI conversation partner (Phase-2 premium SKU)

## Goal

Text-first chat with an Indonesian persona whose vocabulary is **constrained to the learner's known-word set** — a conversation that is comprehensible **by construction *and measured*** (staff-engineer honesty note: LLMs don't reliably honor allow-lists; the prompt constraint is the mechanism, the deterministic post-hoc checker on partner replies is what *earns* the claim — see open Q1). The output channel the input-heavy product thesis lacks, and the feature that justifies the Phase-2 subscription (real per-use cost → real willingness to pay).

## Why us / why bold

**A named competitor exists** (market research 2026-07-06): **Kaiwa**, an AI speaking-practice app for Indonesian — so "AI chat for Indonesian" alone is not a moat. The differentiation is, and must stay, the two things Kaiwa cannot have: **the learner-model constraint** (vocabulary bounded to this learner's known words) and **the FSRS loop** (chat words harvest into scheduled review). Every competitor's AI chat overwhelms beginners because the model doesn't know what the learner knows. Ours does, per word and per pattern. "Practice talking to your Indonesian family without embarrassment" is the deepest want of both the NL heritage segment and the EN partner segment — and constrained-comprehensible chat is the version only this app can deliver.

## Learner experience

- Pick a scenario: **"Bestel eten bij de warung"**, **"Vraag de weg"**, **"Klets met oma"**. Each has a persona, a goal, and a level bracket.
- Chat in Indonesian. The partner stays inside your vocabulary, keeps the scenario moving, and **recasts** your errors inside its natural replies (implicit correction — per SLA research, `feedback_pedagogy_follow_research`); it never red-pens you mid-flow.
- Tap any partner word → gloss (reuse the reader's gloss machinery).
- End of chat: a summary screen — goal reached, errors with their recasts made explicit, new words you met, one-tap "voeg toe aan mijn woorden."
- Free tier: one trial conversation (the conversion moment). Premium: unlimited within fair-use limits.

## How it works (concept level)

1. **The first backend AI seam.** A thin edge-function proxy to the Claude API (Haiku-class model — sufficient for A1–B1 conversation, pennies/session). Keys server-side only; per-user rate limits and the entitlement check live in the proxy (never client-side, per the Phase-2 monetization design). Precedent: privileged operations already run as edge functions (`signup-with-invite`, `commit-capability-answer-report`).
2. **Learner-model compression — the core design work.** A 2,000-word list doesn't go in a system prompt. Compress to: "all of frequency bands ≤N" + an explicit ~40-word prefer-list (recent/weak/due words — the chat doubles as retrieval practice) + a short avoid-list of untaught patterns. Deterministic assembly from capability state; recomputed per session, not per message. **Hard constraint (staff-engineer):** the constraint target is the **DB lexicon**, not a band level — gloss lookups and the harvest loop both require partner words to exist in `learning_items` (harvest is an FK to it); an in-band word absent from the DB breaks both. Compression must express "words we have", intersected with "words this learner knows."
3. **Scenarios are authored content** (normal content regime: staging → DB): persona, goal, opening line, success criteria, level bracket, seed vocabulary. Authoring uses the existing content-pipeline agent pattern.
4. **Conversation state** lives client-side during the chat; what persists is a small end-of-session record (scenario, turns count, words-met, errors-recast) — learner-owned data, GDPR-relevant, retention-bounded. Full transcripts: **not stored** in v1 (privacy default + nothing reads them — omission test).
5. **The harvest loop:** "voeg toe" on a met word reuses the reading-harvest mechanism (membership row → FSRS state minted on first real review — the ADR-0004-compliant path; chat NEVER writes learner capability state directly).

## Grounding (what exists to reuse)

- Edge-function deployment pattern (bind-mount + container restart, CLAUDE.md §Signup gating).
- Frequency-band collections (the compression backbone); reading-harvest membership mechanism (the ADR-0004-safe add-word path, `migration.sql` reading-harvest carve-out).
- Gloss machinery from `lib/reading`; entitlement seam from the Phase-2 monetization design (`docs/roadmap.md` §Phase 2 — activation RPCs read entitlements).

## Supabase Requirements (high level — execution spec refines)

- **Schema:** scenario content tables (content regime); a small learner session-summary table (owner-only RLS, retention policy); NO learner-capability-state writes.
- **Edge functions:** the chat proxy (new); rate limiting + entitlement check inside it.
- **homelab-configs:** none anticipated (same origin, existing schema exposure).
- **Health checks:** proxy exists + no anon execute; scenario tables readable by authenticated.

## Cost & monetization

The one deliberate exception to zero-marginal-cost: ~cents/session with Haiku-class models. Premium-gated from day one (trial chat free). This feature IS the Phase-2 subscription pitch.

## Slices

1. **Proxy + one hardcoded scenario + compression v1** (admin-only flag; proves the constrained-comprehensibility claim end-to-end).
2. **Scenarios as authored content** + scenario picker UI.
3. **End-of-chat summary + harvest loop.**
4. **Entitlement gating + trial** (lands with Phase-2 billing, not before).

## Out of scope

- Voice input (ASR) — stays out per ADR 0025's reasoning. Voice *output* (TTS on partner replies) is a cheap later slice, listed not promised.
- Storing full transcripts; open-ended non-scenario chat (scope + safety surface, revisit later); grammar *instruction* mid-chat (the summary links to existing grammar content instead).

## Open questions (for the execution spec)

1. Compression scheme details + its evaluation (how do we *measure* "stayed within vocabulary"? A deterministic post-hoc checker on partner replies, logged, is the likely QA loop).
2. Model choice + prompt-injection posture (learner input is untrusted; scenario system prompts must be robust).
3. Session-summary retention period + erasure path (GDPR).
4. Rate-limit shape (per-day? per-month token budget?) and fair-use copy.
5. Whether the trial chat exists pre-Phase-2 as a free beta to collect quality data (lean yes, admin-invited).
