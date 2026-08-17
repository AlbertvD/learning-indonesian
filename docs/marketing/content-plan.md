---
status: draft
last_updated: 2026-08-17
---

# Content plan

> **⭐ Reconciled 2026-08-17.** This file was written 2026-08-05, before the
> primary persona changed to **Robin, the partner** (`personas.md` §1) — so its
> priority ordering below was set for the old persona set and has been
> re-ordered. Two other corrections: the price is **€9/€79** (not €7–9), and
> `/hoe-het-werkt` **shipped**, which is where the "problems" content the Big 5
> asks for now lives.
>
> **Before writing any of these pages, invoke the `marketing` skill**
> (`.claude/skills/marketing`) — `references/content.md` carries the Big 5 method
> and Sheridan's *disarmament* technique, which is what makes the comparison
> pages in §3 credible rather than self-serving.

Framework: Marcus Sheridan, *They Ask, You Answer*. The core discipline is
simple and uncomfortable — write the answers to what buyers actually ask,
including the questions businesses habitually dodge. Sheridan's **Big 5** are the
subjects that consistently drive search and trust: **pricing and costs**,
**problems**, **comparisons ("versus")**, **reviews / best in class**, and
**best-of lists**.

Applied here, with a bias towards what already exists in the product, because
the marginal cost of publishing something already written is close to zero.

---

## The Big 5, applied

### 1. Pricing and costs
*"Wat kost het om Indonesisch te leren?"* — an honest comparison of the real
options: a Volksuniversiteit course at €254.50 per level, a private tutor at
€17/hour, free apps that do not teach this pair in Dutch, and this. Sheridan's
whole point is that refusing to discuss price sends buyers to someone who will.
This is also the page that reframes **€9/month** against a €254.50 anchor, which
`pricing.md` argues is the comparison we should want people to make — and which
matters more now that the primary persona is Robin, who price-anchors to a
course rather than to apps (only Sanne anchors to Duolingo Super).

### 2. Problems
Address the objections head-on, including the ones that cost us a sale:
- *"Ik ben te oud om nog een taal te leren."*
- *"Ik ben op Duolingo vastgelopen — wat is hier anders?"*
- *"Is Indonesisch moeilijk voor Nederlandstaligen?"* (Honest answer: much of it
  is easier than people fear — no tenses, no cases, no grammatical gender — and
  the affixes are the genuinely hard part. Saying so builds more trust than
  claiming it is easy.)
- *"Waarom kan ik Indonesisch niet leren op Duolingo in het Nederlands?"* —
  the question that leads directly to the whole positioning.

### 3. Versus / comparisons
*Kamoe Bisa vs Duolingo*, *vs Volksuniversiteit*, *vs een privéleraar*. Sheridan
insists on covering competitors honestly, including where they are the better
choice — a tutor genuinely beats an app for conversation practice, and saying so
is what makes the rest credible.

### 4. Reviews / best in class
**Not yet possible, and must not be faked.** There are no customers. Once there
are, "beste manieren om Indonesisch te leren" becomes the highest-intent page on
the site. Until then, publishing anything review-shaped would be a lie and, in
schema markup, a penalty.

### 5. Best-of lists
The frequency collections are exactly this and already exist: *de 100 meest
gebruikte Indonesische woorden*, thematic packs (eten, reizen, familie).

## Already shipped

- **`/leenwoorden`** — all 173 Dutch loanwords, searchable. Big-5 "best of",
  highest shareability, zero competition.
- **`/hoe-het-werkt`** (2026-08-17) — the activation model, the single daily
  session, the four mastery stages, and the research grounding. Big-5
  "problems" in practice: it answers *"why did my session come up empty"* and
  *"why is a word I already knew coming back"* before signup rather than after.
  Spec: `docs/plans/2026-08-06-hoe-het-werkt-page-design.md`.

## Next, in order of value per hour

**Re-ordered 2026-08-17 for the persona change.** Spreektaal moves from 4th to
1st: it was ranked for Thijs, but it is *central* for Robin — what he hears at
home is `capek`, not `lelah` — and `personas.md` §1 makes it the feature that
most distinguishes his needs from Marijke's. The affix explainers keep their
long-tail SEO value but serve a secondary persona, so they move down.

1. **Spreektaal vs boekentaal** — the 66 register pairs are already in the
   database and the landing page now leads with the argument (`lelah → capek`),
   so this is the page that catches the search it provokes. Serves Robin
   (primary) and Thijs, and almost nothing in Dutch covers it.
2. **"Waarom Duolingo geen Indonesisch aanbiedt in het Nederlands"** — the
   positioning argument as a genuine, useful article. Answers a real question
   and lands the category point without a sales pitch. ⚠️ Use disarmament (see
   the marketing skill) — Duolingo is a good app, and saying so is what makes
   the rest credible.
3. **Affix explainers** — one page per prefix/suffix (`me-`, `ber-`, `-kan`,
   `-i`, `ke--an`, `pe-`). The morphology module already contains the content;
   this is publishing, not authoring. Long-tail and high intent, targeting
   Sanne — the most search-reachable persona, but now a secondary one.
4. **"Wat kost het om Indonesisch te leren?"** — the pricing comparison,
   anchored to the €254.50 course.
5. **Frequency lists** as public pages — from the existing collections.

## The rendering constraint, which is not optional

The app is a client-rendered SPA. Google executes JavaScript, slowly and
unreliably; social unfurlers and most LLM crawlers do not. `/leenwoorden` is
fine as a one-off, but **before publishing a set of content pages, they need
prerendering to static HTML at build time.** Publishing ten client-rendered
pages and waiting for rankings would be a slow way to learn this.

## Rules for anything published here

- The copy-honesty rule applies: all audio is TTS. Never imply human narration.
- Quote only counts verified against the database, and say where the check is.
- No invented reviews, ratings, testimonials or learner numbers. Ever.
- Dutch first.
- Every page must be useful to someone who never signs up. That is what makes it
  worth linking to, and links are the whole point.
