---
status: draft
owner_confirmed: partial
last_verified_against_product: 2026-08-17
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
| **Anki + a textbook + a reader + a podcast app** | The serious self-learner's answer, and it genuinely works. It is also a second hobby: you author every card yourself, and you cannot build a card for a word you do not yet know exists. Added 2026-08-16 — see below. |
| **Nothing at all** | The most common alternative by far — intending to learn, for years. |

The last row is the real competitor. Dunford's point: the yardstick is what the
customer would actually do, not what we think we compete with.

### The DIY stack, and why "all-round" is the wrong way to say it (2026-08-16)

Owner observation: the product covers what a learner would otherwise assemble
from many tools — grammar, culture through stories, an FSRS scheduler, exercises
across several skills, stories to listen to and to read, an affix trainer, and a
workshop for words that keep failing. All verified live: 191 grammar patterns ·
953 affix capabilities · 13 texts (9 with audio) · `MnemonicWorkshop` shipped ·
2,573 items on FSRS.

Checked against the market 2026-08-16. For Indonesian, nothing comparable exists
— the finding in §1 holds. Across languages generally, apps do *parts*:
Taalhammer is the closest integrated one (SRS + generated stories + audio),
Beelinguapp does parallel-text stories, LingQ does reading and listening with a
word tracker, Anki does scheduling and nothing else. Nothing found pairs a
morphology trainer with a stubborn-word workshop; those only matter past the
beginner plateau, which is where mass-market apps stop.

**But do not sell it as "all-round".** A feature list is a non-position in
Dunford's terms: it invites comparison on every axis against a specialist who
beats you on that one axis, and it says nothing about who it is for. The same
truth positions properly as **assembly**:

> Serious learners already build this stack by hand — Anki for scheduling, a
> textbook for grammar, a reader for input, a podcast for listening. It works,
> and it is a second hobby. This is that stack, already assembled, for a
> language pair no modern course serves.

Completeness then reads as *work you do not have to do*, and it answers Anki in
one line: Anki is one component of that stack, and the component that costs the
most manual labour.

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
2. **Supply to Dutch speakers is zero *on Duolingo*.** Duolingo serves Dutch
   speakers only the mass-market majors. Anything outside that top nine must be
   learned through English. Kamoe Bisa is not competing in a category Duolingo
   serves badly — it is in one Duolingo structurally does not serve.

   ⚠️ **Corrected 2026-08-18. Do NOT generalise this to the whole market.** Five
   Dutch→Indonesian offerings were found and reviewed
   (`competitive-messaging.md` §9): NHA sells a full B1 distance course in Dutch
   for €269 with a diploma, Teman Indonesia teaches it 1:1, Talendomein resells
   Dutch self-study on CD and USB, and 50languages/Loecsen give phrase courses
   away. **The defensible claim is narrower and still strong: no modern,
   app-native course serves this pair.** The competitive set is a distance
   course, a private teacher and phrasebooks on a USB stick — which is a better
   story than "nobody", because a visitor can verify it in one search and
   "nobody" collapses the moment they find NHA.
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
- **A VISIBLE, named mastery pipeline** — Inprenten → Oproepen → Productief →
  Onderhoud, shown on the learner's own Voortgang page with their own words in
  each stage. Distinct from the point above, and more useful in marketing:
  every competitor hides the scheduler behind a streak counter, so "we bring a
  word back just before you forget it" is a claim anyone can make, while a
  learner watching their own words move through named stages is evidence.
  Owner observation 2026-08-06; **now live at `/hoe-het-werkt`** (built
  2026-08-17, spec `docs/plans/2026-08-06-hoe-het-werkt-page-design.md`).
  ⚠️ Honesty limit: the stages describe SCHEDULING STATE, not guaranteed
  competence. "Productief" must never be sold as "you can now produce this word
  on demand" — the first learner who finds otherwise stops believing the rest.
  The page ships that disclaimer in the same band as the stages, and a test
  pins it (`HoeHetWerkt.test.tsx`), because showing the stages without it is
  what turns a true thing into an over-promise.
- **Dutch throughout** — instruction, glosses, grammar explanation.

## 2b. The Kamoe Bisa-methode — named 2026-08-18

**Owner decision, taken while writing the landing hero.** Every serious
competitor names its mechanism — the Babbel Method, the Pimsleur Method™,
Duolingo's gamification, LingQ's comprehensible input — because a market this
sophisticated buys a *how* rather than a *what* (`competitive-messaging.md` §2).
We had a distinctive mechanism and no name for it; now we do.

**What it names — the loop, not an outcome:**

> Je dompelt jezelf onder in de taal — woorden leren, verhalen lezen en
> luisteren, op jouw tempo — en alles wat je tegenkomt of opzoekt komt terug tot
> je het kent, begrijpt en kan toepassen.

The parts, all verified shipped:

1. **Jij kiest wat meedoet.** Lessons and word lists are activated by the
   learner; nothing is scheduled until they switch it on.
2. **Lezen en luisteren op niveau.** 13 texts carrying a CEFR `level`
   (`migration.sql:144`), 9 with audio.
3. **Opzoeken = oefenen.** Tapping an unknown word while reading harvests it
   into the learner's review set — `LezenReader.tsx:33-38` → `harvestWord()`.
   This is the load-bearing step and the one no mass-market competitor has.
4. **Eén sessie per dag**, assembled from everything active, scheduled by
   predicted forgetting (FSRS).
5. **Kennen → begrijpen → toepassen.** The capability ladder the app already
   runs on, which is why that phrasing in the hero is descriptive rather than a
   promise.
6. **Affixen en register** — decode unseen words; learn what is actually said.

### Rules for using the name

The reason `competitive-messaging.md` §6 originally rated this candidate poorly
was that a brand-shaped name ("the X method") is a *label*, and a label says
nothing. That objection is answered **only** by the way it is used:

- **Always pair the name with the mechanism on first use.** The landing hero does
  this in one sentence. A bare "de Kamoe Bisa-methode" with no explanation is the
  failure mode.
- **Never attach an outcome or a timeline to it.** Not "leer sneller", not "in X
  weken", not "bewezen". This is precisely the door efficacy claims come back
  through: Babbel's method name is a container for "92% in 2 months", and we have
  measured nothing.
- **Distinguish the principles from the method. The principles are proven; the
  method is not tested.** This line is finer than "never mention science", and
  getting it right is worth real credibility:

  | ✅ Say | ❌ Do not say |
  |---|---|
  | "opgebouwd uit onderzoek dat al decennia overeind staat" | "onze methode is bewezen" |
  | "eerst herkennen, dan produceren (Nation, Krashen)" | "wetenschappelijk bewezen effectief" |
  | "lezen gaat pas lopen rond 95% (Laufer; Schmitt e.a.)" | any number about *our* learners |
  | "dit hebben we veranderd toen het onderzoek ons ongelijk gaf" (ADR 0007) | "X% leert sneller" |

  The established findings are citable and should be cited **by name** — that is
  what makes the derivation checkable rather than decorative. What may never be
  claimed is that *this product* or *this method* has been measured, because it
  has not. Note the competitive contrast this buys (`competitive-messaging.md`
  §1): Duolingo says "scientifically proven to work" about itself; Babbel quotes
  an efficacy study it commissioned about itself. Citing published work and
  naming what we changed because of it is a *different and more honest* claim
  than either, and it is available to us precisely because we are not claiming
  our own results.
- **Capitalise and hyphenate as `Kamoe Bisa-methode`** (Dutch orthography), and
  `Kamoe Bisa method` in English.

### Where it belongs

| Surface | Use it? |
|---|---|
| Landing hero | ✅ live since 2026-08-18, paired with the mechanism |
| `/hoe-het-werkt` | ✅ should introduce it properly — that page IS the mechanism, and currently never names it |
| Meta description, ad and social copy | ✅ once, with the mechanism |
| Inside the app | ❌ learners do not need brand language; they need the thing to work |
| Anywhere near a number | ❌ see the rules above |

## 3. Value themes

1. **Begin bij wat je al kent.** The loanword bridge turns "I know nothing" into
   "I already know 170 words" before lesson one.
2. **Praat zoals er thuis gepraat wordt.** Spreektaal is what family
   conversation requires; textbook Indonesian marks you as a foreigner.
3. **Niet weer bij "hallo" beginnen.** The placement test respects what someone
   already has.
4. **Snap waaróm, niet alleen wát.** Affixes and grammar get past the plateau.

## 4. Target market characteristics — who cares a lot

**Primary: the person with an Indonesian partner** (owner decision, 2026-08-16 —
this REPLACES "the heritage learner", which held from 2026-08-05).
Dutch-speaking adult, 30s–40s, partner is Indonesian, in-laws alive and present.
At family gatherings everyone switches to Dutch or English out of politeness,
and they can feel the gap that creates. Motivated by belonging, not a
certificate. Full portrait: `personas.md` §1 (Robin).

Why the change: the heritage learner's motive is retrospective — reconnecting
with a family past — while this one recurs every time the family visits, and a
live-in native speaker changes which features matter (spreektaal becomes
central, not a later track). It is also the owner's own path, which is what lets
the landing page tell it in the first person rather than performing empathy.

Secondary, served but not led with:
- **The heritage learner** — grandparent from the Indies, knows *ketjap* and
  *pasar malam* without having studied. The loanword wall is her hook, and it
  still opens the page for both her and the primary. `personas.md` §2.
- **The traveller / expat** — months in Indonesia, wants to be understood at a
  warung. Spreektaal is their hook. Likeliest to pay soonest.
- **The stalled app-hopper** — finished what Duolingo offers (in English),
  wants grammar. The placement test is their hook.

⚠️ Least-tested claim in this file. Inferred from the owner's own experience,
which makes the *motive* credible and says nothing about the *size*. The
heritage segment is sized (~1.5–2M, market research §2); this one is not.

## 5. Market category

The strategic choice, in ascending order of defensibility:

| Frame | Verdict |
|---|---|
| "Indonesian language course" | Competes with Duolingo on brand and price. Loses. |
| "Indonesisch leren voor Nederlandstaligen" | Defensible — but see the ⚠️ in §1: others DO serve this pair in Dutch, just not with a modern course. |
| **"De app voor Nederlanders met een Indonesische band"** | Nearly uncontested, and it makes the loanword bridge the centre of the product rather than a nice touch. |

The sentence the whole position hangs on:

> **Elke grote app leert je Indonesisch via het Engels. Dat werkt prima — maar
> daar begin je bij nul. Hier begin je bij 173 woorden die je al kent.**

Framing note (owner correction, 2026-08-05): say this as a gain, never as a
dismissal. "Wie het via het Engels leert heeft er niets aan" is both rude and
false — plenty of Dutch speakers learn happily in English. The true and stronger
claim is narrower: *the loanword head start is unavailable there*. Attack the
gap, never the learner or the tool they chose.

> **Competitor messaging is tracked separately** in
> `docs/marketing/competitive-messaging.md` (homepages read 2026-08-18): what
> each of them actually claims, the three axes we cannot compete on (social
> proof, efficacy numbers, content volume), and the one industry-standard move
> we are missing — a named method.

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
- Willingness to pay at **€9/€79** is untested; the prices were chosen, not
  researched (see *Monetizing Innovation*). Still zero paying subscribers, so
  this remains the least-evidenced number in the whole marketing set.

### Claims that become TRUE later — the pending register

The honesty gate produces a lot of "cannot say yet", and without a register those
claims either get forgotten when they finally become available, or — worse —
someone writes them early because they *feel* true. Both happened today. Each
entry below names the claim, why it is blocked, and **the specific trigger that
unlocks it.**

| Claim | Blocked because | Unlock when |
|---|---|---|
| *"We optimaliseren de leermethode op basis van hoe onze gebruikers leren."* (owner's own words, 2026-08-18 — he intends to do exactly this) | **Zero users.** The May 2026 audit was on the owner's OWN session data. Present tense claims a practice that cannot yet exist | There is a real cohort and at least one change has actually been made from aggregate learner data — not from one person's |
| Reviews, ratings, testimonials, learner counts | Zero paying customers | First customers exist AND have given permission. Quote them verbatim; never write them |
| Any efficacy figure ("X% leert sneller", "in N weken") | Never measured, by us or anyone | A real study exists. Commissioning one about ourselves is what Babbel does; if we ever do, say who paid for it |
| *"De verhalenbibliotheek is groot"* / dropping the A1–A2 hedge | 13 texts, only 3 above A2 | The library covers B1/B2 with enough breadth that a B1 learner has real choice |
| "Nobody serves this pair" (unqualified) | False — NHA, Teman Indonesia, Talendomein, 50languages all do | Never. Use "no modern, app-native course" instead — see §1 ⚠️ |

⚠️ **The first row is the dangerous one**, because it regenerated twice in a
single day — once written by the agent, once by the owner — in the same band of
the same page. A claim that keeps reappearing is not a slip; it is a claim the
product *wants* to make, which is exactly when it needs a written block rather
than a memory of one.

## 8. Copy rules that follow from this

> **These are now packaged as a skill: `.claude/skills/marketing`.** It carries
> the honesty gate, a pre-flight checklist, and the method from the four books
> already applied across these docs (Dunford here, Sheridan in
> `content-plan.md`, Weinberg & Mares in `channels.md`, Ramanujam in
> `pricing.md`) — so a new surface does not have to reassemble the rules from
> six files, which is how they got skipped. Written 2026-08-17, in answer to
> this file's own line 12: *"any future marketing skill should trace back to a
> line in here"*. Read the skill before writing copy; keep editing THIS file
> when a rule changes.

- Lead with recognition, not features. The first thing a heritage learner should
  meet is the loanword wall (implemented: `Landing.tsx`, shared pairs in
  `src/lib/loanwords/revealPairs.ts`).
- Never claim native speakers or human narration — all audio is TTS. Pre-existing
  owner rule, `Landing.copy.ts`.
- Never invent reviews, ratings, testimonials or learner counts. There are zero
  paying customers, so any such claim is fabricated — and the replacement that
  does the same job honestly is the owner's own story (`personas.md` §1), which
  is what the landing hero now uses.
- Cite principles and our own decisions, never efficacy numbers, and never in a
  way that implies a researcher endorses the product.
- Quote only counts that are verified against the database, and say where the
  check lives. Marketing numbers drift silently; product numbers do not.
- Respect the register limit (`personas.md` §1): promise *the register they
  actually use*, never conversational fluency by a given week.
- Dutch first. English copy exists but the product and the audience are Dutch.

**Six of these are now asserted by tests** (`Landing.test.tsx`,
`HoeHetWerkt.test.tsx`) rather than only written down — a doc cannot fail a
build, and copy is exactly the kind of thing that drifts without anyone
noticing.
