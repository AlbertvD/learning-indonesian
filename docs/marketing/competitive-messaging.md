---
status: draft
last_updated: 2026-08-18
sources_checked: 2026-08-18
---

# How the category sells itself — and where we stand

Homepages read directly on 2026-08-18. Sibling of `positioning.md`, which decides
what we are; this file records what everyone *else* claims, so our copy is written
against the real competitive field rather than an imagined one.

⚠️ Re-check before any campaign. Homepage copy changes often, and Babbel in
particular rebrands on a cycle. Every quote below is dated; treat anything older
than ~6 months as unverified.

---

## 1. What they actually lead with

| | Headline | Social proof | Efficacy claim |
|---|---|---|---|
| **Duolingo** | *"The free, fun, and effective way to learn a language"* · *"scientifically proven to work"* | 1.21M Indonesian learners (EN only) | "scientifically proven", unquantified |
| **Babbel** | *"The effective way to learn a language online"* | 25M+ subscriptions sold; "millions of 5-star reviews" | **"92% of users improved their proficiency level in just 2 months"** — cited to Vesselinov & Grego, *The Babbel Efficacy Study*, New York 2016 |
| **Busuu** | *"Learn languages for real life"* | **120M+ registered users**; App Store App of the Year; Google Play Editor's Choice | community/"real people" rather than a number |
| **LingQ** | *"Learn Languages from Books, Podcasts, Movies, TV Shows"* · *"Don't just study a language, live it."* | 5M+ learners; 4.7★ | "move up a proficiency level in **90 days**" (1 hr/day) |
| **Pimsleur** | *"Get Conversational Quickly with Pimsleur"* | Forbes, Psychology Today, Travel + Leisure | "conversational **in a matter of weeks**"; the Pimsleur Method™ |

⚠️ Duolingo's homepage is client-rendered and could not be fetched; its lines come
from secondary sources and should be re-verified in a browser before being quoted
anywhere public.

## 2. The pattern, in Schwartz's terms

**Every one of them has moved past benefit claims to naming a mechanism** — the
Babbel Method, the Pimsleur Method™, gamification, comprehensible input. That is
the signature of a **stage 3–4 sophistication market**: direct claims are
exhausted, so the differentiator becomes *how it works*.

This is the evidence for something the `marketing-copy` skill asserts from
theory (`references/awareness.md`): a plain benefit headline is dead on arrival
here. It is why *"Leer Indonesisch dat blijft hangen"* read as generic — a
stage-1 headline in a stage-4 market.

**But the NL→ID pair is still stage 1**, because nothing serves it. That
asymmetry is the whole opportunity: inside the crowded category we must lead with
mechanism or story; on the language pair we can still make a plain claim, because
nobody has made it.

## 3. Three things we cannot compete on — and must not try

- **Social proof.** They open with 120M / 25M / 5M. We have zero customers and
  may not invent any (`positioning.md` §7, and the honesty gate).
- **Efficacy numbers.** Babbel commissioned a study and quotes 92%. LingQ claims
  a level in 90 days. Pimsleur, weeks. We have measured nothing and say so.
- **Content volume.** LingQ imports anything the learner finds. We have 13 texts
  (verified live 2026-08-17: A1×4, A2×5, B1×2, B2×1, one unlevelled).

Matching any of these means either lying or losing. The copy should concede the
ground and win elsewhere.

## 4. LingQ is the twin, and its weakness is our argument

LingQ is the closest **methodological** competitor by a distance: read real
content, highlight what you do not know, it enters review. That is very nearly
the harvest loop (`LezenReader.tsx` → `harvestWord()`).

Its structural weakness is the one thing our founder story is about: **with LingQ
you supply the content.** "Learn from books, podcasts, movies" means *find books,
podcasts and movies at your level* — which is exactly the empty-reader problem,
sold as flexibility.

So *"het komt gevuld"* is not a generic convenience claim. It is a direct,
honest counter to the strongest method competitor in the category, and it should
be treated as a load-bearing line rather than a nicety.

⚠️ Fairness: LingQ's model is genuinely better for a learner who already has
content they want to read, and for languages with abundant graded material.
Disarm before comparing (see the `marketing` skill, `references/content.md`).

## 5. Two things nobody else does

**We name the failure and show the arithmetic.** Every competitor sells the
destination. Not one explains why the learner stalled. *"Je kent inmiddels
honderden woorden en je struikelt nog steeds over elke zin"* + the 95%-vs-80%
coverage gap is identification and mechanism at once — Schwartz's stage-5 move,
in a market still playing stage 3.

**Refusing efficacy numbers is itself a position.** In a category where the
second-largest player quotes a study about itself, *"Wat je hier niet vindt:
percentages over hoeveel sneller je leert"* is a differentiator no competitor can
copy without repudiating their own homepage. It reads as confidence, and it is
also simply true.

## 6. The gap: we have no named method

The one industry-standard move we are missing **and could make honestly.**

Every serious competitor names its mechanism, because a sophisticated market buys
a *how*. We have a genuinely distinctive one and currently present it as loose
parts across three bands:

1. You choose what enters practice (activation)
2. You read something pitched just above you (levelled texts)
3. Every word you trip over is tapped and **harvested** into review
4. It comes back just before you would forget it (FSRS)
5. Affixes let you decode words you have never seen
6. Register pairs teach what is actually said, not only *bahasa baku*

Steps 2–4 are a **ratchet**: each pass raises your coverage, so the next text is
readable. That is the product's actual thesis and it has no name.

### Candidate names — owner's call

| Name | Reads as | Risk |
|---|---|---|
| **Lezen & oogsten** | Describes exactly what happens; matches the code's own word (`harvestWord`); warm, concrete, unmistakably Dutch | Slightly agricultural — though the pasar/Indonesia register makes that a feature |
| **De leesoogst** | Tighter, one word, ownable | Less self-explanatory on first read |
| **De 95%-route** | Grounded in the actual research; nobody else names a coverage target | ⚠️ **Probably unusable** — implies we get you to 95%. We do not: ~1,926 single words against the 4,000–5,000 families that 95% needs. Naming a destination we do not reach breaks the honesty gate |
| **De Kamoe Bisa-methode** | Industry-standard shape (Babbel/Pimsleur) | Says nothing; a label rather than a mechanism |

**Recommendation: "Lezen & oogsten."** It names the loop rather than a
destination, so it promises nothing we cannot deliver; it is concrete in Heath's
sense; and it is the one thing in the method that no mass-market competitor has
(Duolingo, Babbel, Busuu and Pimsleur have no reading-to-review pipeline at all,
and LingQ has the loop but not the content).

⚠️ Whatever it is called, the name must describe the **mechanism**, never an
outcome. "Method" naming is where efficacy claims sneak back in through the door
marked branding.

## 7. What this changes in the copy

- **Keep** the failure-arithmetic opening. It is the most differentiated thing on
  the page and the category-wide evidence supports it.
- **Keep** the refusal of efficacy numbers, and consider making it louder — it is
  a position, not just a constraint.
- **Add** a named method, once chosen, so the "how" has a handle a reader can
  repeat. This is also the missing **proverb** (`marketing-copy`,
  `references/stickiness.md`).
- **Do not** add social proof, testimonials, learner counts or a proficiency
  timeline, however standard they look in this table.

## 8. Sources

Read 2026-08-18: [LingQ](https://www.lingq.com) · [Babbel](https://www.babbel.com/) ·
[Busuu](https://www.busuu.com/en) · [Pimsleur](https://www.pimsleur.com/) ·
Duolingo via secondary source ([tagline archive](https://logotaglines.com/duolingo-slogan-tagline-and-logo-global-icon-little-green-owl)),
homepage not directly fetchable.
Duolingo course-catalogue evidence for the NL→ID gap is in `positioning.md` §1
(checked 2026-08-05).
