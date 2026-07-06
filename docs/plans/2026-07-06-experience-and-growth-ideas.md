---
status: draft
---
<!-- HIGH-LEVEL IDEAS CATALOG — sibling of 2026-07-06-bold-bets-high-level-specs.md.
     These are the "round 2" ideas (2026-07-06 session), deliberately NEW relative to the
     five bets and to shipped/planned work. Any idea promoted from here gets its own
     program spec + gauntlet before building. Ranked by conviction within each section. -->

# Experience & growth ideas — round 2 (2026-07-06)

## A. Learning experience

### A1. Onderweg-modus — hands-free audio sessions ⭐
Pimsleur-style screen-free session from the FSRS due-queue: NL prompt (TTS) → pause → learner speaks the Indonesian aloud → answer audio plays → one-tap (or voice-free) self-grade. Unlocks the commute/walk/chores context — the largest pool of untapped adult study minutes; audio retrieval practice is research-backed (see `memory/research_audio_sla.md`). Built almost entirely from existing assets (due-queue + generated TTS clips). Near-zero marginal cost. **The strongest pure-learning idea of this round.**
*Key design questions:* self-grading honesty vs FSRS integrity (likely: audio reviews rate as a capped grade or log as exposure-not-review); background-audio PWA constraints on iOS.

### A2. Dagboek — one sentence a day
Learner writes one Indonesian sentence about their day; LLM (Haiku-class, ~pennies) gently recasts and suggests one better word. Correct usage harvests as retrieval evidence; needed words harvest as new (via the ADR-0004-safe membership path). The missing *writing* output channel beside Percakapan, and a daily-habit hook with emotional stickiness drills can't match. Natural premium feature; shares the AI-proxy seam Percakapan builds.

### A3. De stem van je familie ⭐ (candidate for promotion to the bets list)
A family member records *their* voice for words/phrases; oma's voice replaces TTS for those items. Technically small (audio upload to existing bucket + per-user audio override at playback). Emotionally enormous for the heritage segment — and it is simultaneously a marketing story (see B-section). No competitor can copy it because none has the positioning.
*Key design questions:* per-user audio override seam in the playback path; invite/consent flow for the recording family member (who may not be a user); moderation posture.

### A4. Getallen & prijzen trainer
Numbers, times, dates, prices — the classic real-world weak spot. Fully deterministic generator (random target → type/say it): zero content authoring, zero AI. An "afdingen" (bargaining) variant doubles as Bali-wedge material (EN program). Small build, permanent value, and a natural Onderweg-modus (A1) segment.

### A5. "Wist je dat" cultural micro-cards
Occasional one-liner between exercises: etymology (the loanword data paying again), culture, usage. Turns drill sessions into discovery; cheap authored content; trivially skippable so it never taxes the session.

### A6. Grammar teaching improvements — SEE SEPARATE REVIEW
`docs/research/2026-07-06-grammar-teaching-review.md` (same date): practice mode, first-encounter rule card, Grammatica reference library, produce-grader fix, interpretation variants, LLM-graded free production. Kept there — the review carries the evidence.

## B. Commercialization & visibility

### B1. The public loanword quiz ⭐ — the single best growth asset available
"Hoeveel Indonesisch ken jij al?" — 90 seconds, **no account**: guess Indonesian words from Dutch, end on "Je kent al ~2.800 Indonesische woorden — serieus." Shareable score, signup CTA. It is Bet 1's loanword bridge recompiled as a viral instrument — same data, zero friction, built for WhatsApp-forwarding inside exactly the families we target. Should become **leg 0 of the growth-layer program** (`2026-07-06-growth-layer-program.md`). Works even while signup is invite-gated (collects an email waitlist → merges with B3).

### B2. The Tong Tong Fair / Moesson channel
The Indo-Dutch community has real institutions: **Tong Tong Fair** (The Hague, ~100k visitors, the world's largest Eurasian festival) and **Moesson** magazine. A booth, partnership, or a pitched story — "de app die de taal teruggeeft die oma nooit doorgaf" — reaches the retained-subscriber segment concentrated in one place, with a journalist-ready narrative. No ad budget buys this fit.

### B3. Kata van de week — owned audience before launch
Free weekly email: one word, its Dutch connection, one cultural note (the data again). Near-zero cost, compounds while the app is invite-gated, converts to day-one users at public launch — solving the growth-layer's "SEO before signup opens" timing gap (its open Q4). *Note: requires an email-sending capability the stack deliberately lacks today — an external newsletter service (not GoTrue SMTP) keeps it off-stack.*

### B4. The public reader demo
One free Lezen story on the landing page, no account, tap-to-gloss fully working. The reader is the most demo-able surface in the app — show the magic instead of describing it. (Technically: a public read-only story + the gloss path without auth — needs a deliberate anon-surface decision, same class as B1's.)

### B5. Cadeau-abonnement
"Geef de taal van de familie" — children gifting parents, partners gifting each other; monetizes before the recipient is a user; Sinterklaas/Christmas built in. Rides Phase-2 billing (a Stripe gift flow), zero app-core changes.

### B6. The Leiden connection
Leiden University runs the Netherlands' Indonesian-studies program (and the dissolved source-coursebook institute was Leiden-based). A student discount or informal relationship = low-effort credibility with the most serious NL learners.

## C. If only three get built
**B1 (public quiz)** — cheap, on-brand, on-data, structurally viral; **A1 (Onderweg-modus)** — the biggest learning-minutes unlock; **A3 (stem van je familie)** — the idea that is product and marketing at once.

## D. Interactions with the five bets
- B1 is Bet 4 leg 0; B3 solves Bet 4 open Q4; B2/B5 execute Bet 4 leg 3 (positioning).
- A2 shares Bet 3's AI-proxy seam and harvest path; A3 amplifies Bet 5's segment-2 wedge ("talk to your mertua").
- A1's audio sessions and Bet 2's audio weekverhaal share the "listening while living" thesis — different mechanisms, same user moment.
