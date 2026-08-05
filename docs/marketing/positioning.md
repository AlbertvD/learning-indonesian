---
status: draft
owner_confirmed: partial
last_verified_against_product: 2026-08-05
---

# Positioning — Kamoe Bisa

Worked through April Dunford's *Obviously Awesome* framework (the five-plus-one
components, ch. 2) on 2026-08-05, with the owner. This file is the input the
marketing work reads from: landing copy, meta descriptions, ad copy and any
future marketing skill should trace back to a line in here rather than being
invented per surface.

**Status of the claims below:** every product capability is verified against the
live cloud database or the code, with the check written next to it. Everything
about *customers* is hypothesis — see §7.

---

## 1. Competitive alternatives

What a Dutch person with an Indonesian family tie does today, if Kamoe Bisa does
not exist:

| Alternative | Why they leave it |
|---|---|
| **Duolingo** | Indonesian is **not offered to Dutch speakers at all** — they must learn it *through English*. See the evidence box below; this is the single most important competitive fact in this file. |
| **Asking their partner / in-laws** | Intimate relationships make poor classrooms. Correction feels like criticism; both sides give up. |
| **A phrasebook before a holiday** | Survives the airport, collapses at the first real conversation. |
| **Evening class or private tutor** | Too slow, too far, too expensive, fixed schedule. |
| **Nothing at all** | The most common alternative by far — intending to learn, for years. |

The last row is the real competitor. Dunford's point: the yardstick is what the
customer would actually do, not what we think we compete with.

### Evidence — the Duolingo asymmetry (checked 2026-08-05)

Both catalogues were read directly from duolingo.com.

**Courses offered to Dutch speakers (10):** Chess, English, French, Spanish,
German, Italian, Portuguese, Japanese, Korean, Chinese (Simplified).
**No Indonesian.**

**Courses offered to English speakers (40+), including:** Indonesian —
**1.21M learners**. For scale: more than High Valyrian (948K), Ukrainian (936K)
or Welsh (607K); Dutch itself has 2.71M.

Three conclusions, and they are the backbone of the position:

1. **Demand is proven.** 1.21M people are learning Indonesian on one platform
   alone. This is not a market that has to be created.
2. **Supply to Dutch speakers is zero.** Duolingo serves Dutch speakers only the
   mass-market majors. Anything outside that top nine must be learned through
   English. Kamoe Bisa is not competing in a category Duolingo serves badly — it
   is in one Duolingo structurally does not serve.
3. **Routing through English destroys the loanword advantage.** The loanwords
   are *Dutch*: `kantoor→kantor`, `handdoek→handuk`, `koelkast→kulkas`. An
   English-based course cannot use a single one. The biggest head start a Dutch
   learner has is invisible to every competitor serving this pair — not because
   they chose badly, but because of the language they route through.

Point 3 is why this is a category advantage rather than a feature advantage, and
why it cannot be copied by anyone building for another language pair.

⚠️ Re-check before any campaign: Duolingo expanded with ~148 AI-generated courses
in 2025 and could add Indonesian-for-Dutch at any time. If they do, the contrast
shifts from "does not exist" to "hand-authored grammar, spreektaal and a
loanword bridge versus an AI-generated course" — which is a different argument,
still a good one, but it must be made honestly.

## 2. Unique attributes

Capabilities the alternatives lack. Counts verified against the live cloud
project 2026-08-05.

- **The Dutch→Indonesian loanword bridge** — 173 items carry `loan_source_nl`.
  *Structurally uncopyable*: the loanwords are Dutch, so any course routing
  through English cannot use them, and no other language pair has this history.
- **Spreektaal alongside formal register** — 66 items carry `register='informal'`.
  Most courses teach only *bahasa baku*, which nobody speaks at home.
- **Placement test (`/instaptoets`)** — for people arriving with prior knowledge
  from another app. Does not make them start at "hello".
- **Affix / morphology trainer** — the engine of Indonesian, and the wall most
  self-taught learners hit.
- **FSRS scheduling on capabilities**, not flashcards — recall is scheduled per
  skill, not per word.
- **Dutch throughout** — instruction, glosses, grammar explanation.

## 3. Value themes

1. **Begin bij wat je al kent.** The loanword bridge turns "I know nothing" into
   "I already know 170 words" before lesson one.
2. **Praat zoals er thuis gepraat wordt.** Spreektaal is what family
   conversation requires; textbook Indonesian marks you as a foreigner.
3. **Niet weer bij "hallo" beginnen.** The placement test respects what someone
   already has.
4. **Snap waaróm, niet alleen wát.** Affixes and grammar get past the plateau.

## 4. Target market characteristics — who cares a lot

**Primary: the heritage learner** (owner decision, 2026-08-05).
Dutch-speaking adult with a family tie to Indonesia — a grandparent from the
Indies, an Indonesian partner, in-laws. Already knows *ketjap*, *pasar malam*,
*toko* without ever having studied. Motivated by a relationship, not a
certificate. Usually has tried an app and stalled.

Secondary, served but not led with:
- **The traveller / expat** — months in Indonesia, wants to be understood at a
  warung. Spreektaal is their hook. Likeliest to pay soonest.
- **The stalled app-hopper** — finished what Duolingo offers (in English),
  wants grammar. The placement test is their hook.

## 5. Market category

The strategic choice, in ascending order of defensibility:

| Frame | Verdict |
|---|---|
| "Indonesian language course" | Competes with Duolingo on brand and price. Loses. |
| "Indonesisch leren voor Nederlandstaligen" | Defensible — nobody else serves this pair in Dutch. |
| **"De app voor Nederlanders met een Indonesische band"** | Nearly uncontested, and it makes the loanword bridge the centre of the product rather than a nice touch. |

The sentence the whole position hangs on:

> **Elk ander programma leert je Indonesisch via het Engels — en gooit daarmee je
> grootste voorsprong weg.**

## 6. Relevant trend (bonus, handle with care)

Renewed interest in Indisch/Moluccan family history among second and third
generation Dutch families. Real, but Dunford warns that a trend layered on for
its own sake makes positioning worse, not better. Use only where it is true of
the reader — never as the lead.

## 7. What is NOT established, and must not be written as if it were

- **Dunford's step 1 is "understand the customers who love your product."**
  There are none yet: one test account, zero paying subscribers. Everything in
  §4 is inference from the feature set and the owner's own motivation, not from
  customer interviews. Validate against the first ten real customers and correct
  this file.
- **Dunford's step 2 is "form a positioning team"** — precisely because a single
  person's view of their own product is unreliable. This was done by the owner
  and an agent, which is not the same thing.
- Willingness to pay at €7/€56 is untested; the prices were chosen, not
  researched (see *Monetizing Innovation*).

## 8. Copy rules that follow from this

- Lead with recognition, not features. The first thing a heritage learner should
  meet is the loanword wall (implemented: `Landing.tsx`, shared pairs in
  `src/lib/loanwords/revealPairs.ts`).
- Never claim native speakers or human narration — all audio is TTS. Pre-existing
  owner rule, `Landing.copy.ts`.
- Quote only counts that are verified against the database, and say where the
  check lives. Marketing numbers drift silently; product numbers do not.
- Dutch first. English copy exists but the product and the audience are Dutch.
