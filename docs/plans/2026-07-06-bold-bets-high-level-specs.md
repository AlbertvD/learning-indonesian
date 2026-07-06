---
status: draft
---
<!-- VISION-LEVEL document: each bet here needs its own full spec + review gauntlet
     (staff-engineer → architect + data-architect) before any implementation.
     Nothing below is implementation-ready by design. -->

# Bold bets — high-level specs (2026-07-06)

> **Program specs (one per bet, all staff-engineer-sanity-checked 2026-07-06):**
> Bet 1 → `2026-07-06-loanword-bridge-placement-onboarding.md` (APPROVED, full gauntlet) ·
> Bet 2 → `2026-07-06-weekverhaal-program.md` ·
> Bet 3 → `2026-07-06-percakapan-program.md` ·
> Bet 4 → `2026-07-06-growth-layer-program.md` ·
> Bet 5 → `2026-07-06-en-audience-program.md`.
> The sections below are the one-page summaries; the program specs are the working documents.

The strategic frame these all build on — two assets no competitor has:

1. **A per-learner capability model at word/pattern granularity** (FSRS state per word, affix, grammar pattern). Duolingo/Babbel/Memrise track nothing this precise.
2. **The NL→ID pair itself.** Every big app teaches Indonesian from English; the Dutch-Indonesian linguistic and cultural relationship is unexploited space.

Ordering principle: each bet is ranked by (learner value × acquisition value) ÷ (build cost + marginal cost). All four preserve the zero/near-zero-marginal-cost model except #3, which is deliberately the paid one.

---

## Bet 1 — Loanword bridge + placement onboarding ✅ SPEC DONE

Full approved spec: `docs/plans/2026-07-06-loanword-bridge-placement-onboarding.md` (all three sign-offs, 2026-07-06). Slice 1 (loanword collection + `/welkom`) is clear to build; slice 2 (placement probe) additionally gated on user ratification of the ADR-0004 carve-out. Not repeated here.

**One-line pitch:** "Je kent al 3.000 Indonesische woorden" — instant wins on day one, and heritage learners skip re-grinding what they already know.

---

## Bet 2 — "Jouw Weekverhaal": i+1 personalized generated stories

**Pitch.** A weekly reading story generated *for this learner*: ~95% words they demonstrably know (FSRS stability above threshold), the remaining ~5% their due/weak words and patterns, woven into a real narrative. Krashen's i+1 made literal — possible only because we know the learner's exact word set. Optionally rendered as a personal podcast episode through the existing TTS pipeline.

**Learner experience.** A new tile in Lezen: "Jouw verhaal van deze week." Reads like any Lezen text (tap-to-gloss, morphological glossing — all existing). Weak words appear in fresh contexts; finishing feels effortless *because it was built to be*. Optional "listen" button.

**How it works (concept level).**
- **Generation:** batch, not per-session — weekly (or on-demand with a cooldown). Input = the learner's known-word set + due/weak words + weak grammar patterns, all read from existing capability state. LLM authors the story (this is genuinely creative work — LLM is the right tool per the Minimum Mechanism table).
- **Reuses:** the LLM-story authoring path (ADRs 0023/0024, `--read-only` pipeline), the Lezen reader + glossing, optionally the story-podcast TTS pipeline (ADR 0022).
- **The new hard part (THE design question for its spec):** per-learner content. Everything in the content model today is shared; a personal story is learner-scoped data — it sits *between* the two data regimes (generated like content, owned like learner data). Its spec must settle storage, RLS, retention/GDPR, and lifecycle (keep N most recent?).
- **Quality without human review:** a deterministic post-generation validator (% of tokens outside the known set, length, level) — retry on failure. No human in the loop, so the constraint contract must be machine-checkable.

**Cost profile.** ~1 LLM story/learner/week ≈ cents; TTS optional and costlier (could be the premium variant: text free, audio premium).

**Why bold.** This is the feature reviewers write about; no competitor can copy it without a capability model.

**Open questions for its spec:** per-learner content storage regime; generation trigger (cron vs visit-triggered); does story vocab harvest back into FSRS (probably no — it's deliberately review, not new material); NL translation pane included?

---

## Bet 3 — "Percakapan": the AI conversation partner (the premium SKU)

**Pitch.** A text-first chat with an Indonesian persona (the warung owner, the taxi driver, oma) whose vocabulary is **constrained to the learner's known-word set**, so the conversation is comprehensible *by construction*. Every other app's AI chat overwhelms beginners; ours can't, because the system prompt is built from capability state. This is the output channel the input-heavy thesis lacks, and the obvious Phase-2 premium feature (real per-use cost → justifies subscription).

**Learner experience.** Pick a scenario ("Bestel eten", "Vraag de weg", "Klets met oma"). Chat in Indonesian; the partner stays inside your vocabulary, gently recasts your errors in its replies, and nudges the scenario forward. End of chat: a summary — errors recast, new words you met, one-tap "voeg toe aan mijn woorden."

**How it works (concept level).**
- **The first backend seam.** API keys can't ship client-side, so this needs a thin edge-function proxy to the Claude API (precedent exists: edge functions are already the pattern for privileged operations). Haiku-class model — quality is sufficient for A1–B1 conversation and the cost is pennies/session.
- **The moat mechanic:** compressing the learner model into a system prompt — not a 2,000-word list, but "all of frequency bands ≤500 + these ~40 recent/weak words to prefer + avoid these patterns." The compression scheme is the core design work.
- **Scenarios are authored content** (staging → DB, normal content regime): persona, goal, opening line, success criteria, level bracket.
- **Pedagogy:** recasting (implicit correction in the reply) over explicit correction mid-flow — per SLA research (`feedback_pedagogy_follow_research`); explicit feedback belongs in the end-of-chat summary.
- **Guardrails:** per-user rate limits at the proxy; entitlement check server-side (never client-side, per the Phase-2 monetization design).

**Cost profile.** The one deliberate exception to zero-marginal-cost: ~cents/session, gated behind the Phase-2 subscription. Free tier could get 1 trial chat — the conversion moment.

**Why bold.** "Practice speaking to your Indonesian family without embarrassment" is the heritage segment's deepest want; constrained-comprehensible AI chat is the version only this app can deliver.

**Open questions for its spec:** learner-model compression scheme; voice later (TTS on replies is cheap; ASR input stays out per ADR 0025's reasoning); does chat vocabulary harvest into FSRS; conversation history retention (learner data regime + GDPR); abuse handling.

---

## Bet 4 — The growth layer: SEO from data + free funnel + heritage positioning

**Pitch.** Dutch-language Indonesian-learning search space is near-empty. We can flood it with *generated-from-data* pages — no editorial team needed — and aim two distinct funnels at two distinct audiences.

**Three legs (concept level).**
1. **SEO pages generated from existing data**, built statically (no DB exposure, no runtime cost):
   - Per-word pages ("Wat betekent *selamat*?") from `learning_items` + glosses + audio.
   - Per-affix pages ("Hoe werkt *meN-*?") from the deterministic morphology engine — uniquely defensible content.
   - Loanword listicles ("50 Nederlandse woorden die je al Indonesisch maken") from `loan_source_nl` (Bet 1's column pays twice).
   - Each page ends in the same CTA: the `/welkom` loanword reveal.
2. **Free funnel:** loanword collection + one theme pack ("Op vakantie naar Bali") free forever; lessons/collections behind Phase-2 entitlements (the activation-RPC seam already designed for this). Vacation learners = top of funnel; heritage learners = retained subscribers.
3. **Positioning:** lead with heritage and connection — "de taal van je oma," the Indo community (~1.5–2M Dutch people with Indonesian roots), mixed NL-ID families — not generic gamified learning. Fits the Kamoe Bisa identity.

**Cost profile.** Static generation ≈ zero marginal; the work is a build-time page generator + hosting decision.

**Open questions for its spec:** where public pages live (separate static site vs public routes in the app — a public surface changes the security posture, so probably separate); sitemap scale strategy; brand/domain for the public site.

---

## Bet 5 — The English-speaking audience: "the serious Indonesian app"

**The strategic difference.** The NL moat (Bet 1) doesn't transfer — the EN market is crowded and English has no colonial-loanword bridge of the same depth. But the EN market has a different, equally real gap: **the big apps treat Indonesian as an afterthought** (Duolingo's Indonesian course is notoriously shallow and unmaintained). For EN, the moat isn't the language pair — it's *depth*: the affix trainer, real FSRS, graded input, and the capability model. Positioning: **the serious Indonesian app**, for people who actually need the language.

**The wedge segments (in order of intent-to-pay):**
1. **Bali/Jakarta expats & digital nomads** — high concentration, high willingness to pay, embarrassed to still be at *terima kasih* after a year. The sharpest marketing hook in the entire EN space: "Stop being the bule who only knows terima kasih."
2. **Partners/family of Indonesians** — the EN mirror of the heritage segment; same "talk to oma" emotional wedge, same Percakapan (Bet 3) payoff.
3. **Australians** — Indonesian is a school curriculum language in Australia (geography makes it strategic); a long-tail acquisition channel and a possible later schools angle.

**What transfers for free (the leverage).** Bets 2 and 3 are **L1-agnostic by construction** — the capability model, i+1 story generation, and constrained AI chat don't care what the UI language is, and EN translations already exist across the content model (`translation_en`, EN glosses, NL/EN switching). Placement (Bet 1 slice 2) likewise transfers unchanged. Building the bold bets for NL builds them for EN.

**What needs EN-specific work (concept level):**
- **The onboarding hook.** No Dutch-loanword wall — but a weaker cousin exists: Indonesian's huge international/Latinate layer (*informasi, universitas, televisi, polisi, apotek, komputer*) plus direct English loans in colloquial usage. Same `/welkom` mechanic, different curated list. **Cognate-field timing DECIDED 2026-07-06:** Bet 1 builds `loan_source_nl` as approved; per-L1 generalization is a later additive content-table migration when the EN list is authored (see EN program spec).
- **L1-specific pronunciation.** The shipped pronunciation primer + contrast podcasts are NL-specific (ADR 0025); EN learners need their own contrast set (different interference: vowel reduction, aspiration, no rolled /r/).
- **EN SEO** (Bet 4's twin). "Learn Indonesian" is competitive, but the long tail is wide open and our morphology engine generates exactly the content that wins it: "meN- prefix explained", "Indonesian affixes cheat sheet", "ber- vs meN-". Plus Bali-practical listicles ("50 words for the warung"). Same static generator, second language.
- **Theme packs as the wedge product:** "Warung Indonesian", "Nusantara paperwork", "Talking to your kos ibu" — small authored packs (collections exist) aimed squarely at segment 1.

**Cost profile.** Mostly content + curation on existing machinery; the only new build is the EN pronunciation contrast set and the generalized onboarding hook.

**Open questions for its spec:** per-L1 cognate field now or later; whether EN onboarding shares `/welkom` with a different word list or gets its own flow; brand voice in EN (Kamoe Bisa reads charmingly retro in NL — does it land in EN?).

---

## Recommended sequence

1. **Bet 1 slice 1** (loanword bridge) — spec approved, cheapest, pure acquisition. *(Integrity work — grader fix ✅ shipped 2026-07-06, review-saturation investigation — continues in parallel; a bold feature on a broken grading experience is wasted.)*
2. **Bet 2** (weekverhaal) — deepens retention for the users Bet 1 brings in; next spec to write.
3. **Bet 4** (growth layer) — when there's a free funnel worth pointing traffic at; the SEO generator wants Bet 1's `loan_source_nl` to exist.
4. **Bet 3** (percakapan) — designed now, shipped as the Phase-2 premium launch feature (it *is* the reason to subscribe).
5. **Bet 5** (EN audience) — mostly rides along: Bets 2/3 transfer free; the EN-specific work (cognate onboarding list, EN pronunciation entries on the already-L1-parameterized catalog, EN SEO twin) slots in after Bet 1 proves the onboarding mechanic. The cognate-field timing question is RESOLVED (Bet 1 unchanged; later additive migration).
