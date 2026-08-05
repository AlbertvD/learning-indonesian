---
status: draft
owner_confirmed: primary persona only
last_verified_against_product: 2026-08-05
---

# Personas — Kamoe Bisa

Three people the product is genuinely built for, each mapping to a capability
that already exists. Written 2026-08-05 alongside `positioning.md`; read that
first, since the market category decision drives everything here.

**Health warning, stated once and meant:** these are *hypotheses*. Dunford's
first positioning step is to understand the customers who already love your
product, and there are none yet — one test account, zero paying subscribers.
Everything below is inferred from the feature set, the owner's own motivation
and the market. The first ten real customers should either confirm or destroy
these, and this file gets rewritten from what they say. Do not let confident
prose here harden into assumed fact.

---

## 1. Marijke — the heritage learner  ⭐ PRIMARY

**Owner decision 2026-08-05: the landing page speaks to her first.**

58, Dutch. Her grandmother was born in Bandung and came over in the fifties.
Growing up there was *ketjap* on the table, *pasar malam* every summer, an oma
who slipped into a language nobody translated. She has an Indonesian
daughter-in-law and two grandchildren who giggle in a language she cannot
follow.

**The job she is hiring the product for:** not fluency, and definitely not a
certificate. She wants to say something real to her in-laws and understand the
reply. She wants the family part of herself to stop being a set of food words.

**What she has already tried:** Duolingo — where Indonesian is not offered in
Dutch at all, so she either did it through English or bounced. Asking her
daughter-in-law, which lasted two evenings and made them both uncomfortable. A
phrasebook before a trip in 2019.

**Why she stopped:** everything on offer treats her as a beginner tourist, when
in fact she already recognises a hundred words and carries an emotional stake no
tourist has.

**What lands:** the loanword wall. *Kantoor → kantor.* Recognition, not
instruction. Then spreektaal, because family talk is not *bahasa baku*.

**Objections to answer:** "I'm too old to learn a language." "I tried before and
failed." "Is this another app I'll abandon?" — answer all three with *you are
not starting from zero, and 10 minutes a day is the whole commitment.*

**Where she is:** Indische and Moluccan community organisations, *tempo doeloe*
Facebook groups, pasar malam events, family WhatsApp. **Reached by word of mouth
and community, not by search.**

**Willingness to pay:** high in principle, low in confidence. She would happily
spend €254.50 on a Volksuniversiteit course if she believed it would work —
that is the real alternative, and it is 4.5× the current annual price.

---

## 2. Thijs — the traveller / soon-to-be expat

41, going to Indonesia for three months, or already living in Bali or Jakarta
on a remote contract. Wants to be understood at a *warung*, negotiate a
*kost*, talk to colleagues without switching to English.

**Job:** functional competence, fast, in the register people actually use.

**Already tried:** a phrasebook; Duolingo in English; asking Indonesian
colleagues who politely switch back to English.

**What lands: spreektaal.** He has already been embarrassed by textbook forms —
using *Anda* where everyone says *kamu*. The register toggle is exactly his
problem, and no competitor in this pair offers it.

**Objections:** "Will I actually be understood?" "Is this too slow/academic?"

**Where he is:** expat forums and Facebook groups, r/indonesia, digital-nomad
communities, Bali/Jakarta relocation content. **Reachable by search** — he types
things like "leer Indonesisch snel".

**Willingness to pay: highest of the three, and soonest.** He has a deadline and
a budget. Would not blink at €12/month for three months.

---

## 3. Sanne — the stalled app-hopper

29, finished everything Duolingo has (in English), has a few hundred words and
no grammar. Cannot form a sentence she has not memorised. Feels stuck and
slightly cheated.

**Job:** break the plateau. Understand *why* Indonesian works the way it does.

**What lands:** the placement test (`/instaptoets`) — do not make her start at
"hello" — and then the affix trainer, because affixes are exactly the wall she
hit. Duolingo gave her vocabulary and no morphology.

**Objections:** "Will this just repeat what I know?" (the placement test *is* the
answer) and "how is this different from the app I already quit?"

**Where she is:** actively searching. r/languagelearning, "Duolingo alternative",
"Indonesian grammar explained". **The most SEO-reachable of the three.**

**Willingness to pay:** moderate, and comparison-shops against Duolingo Super
(€122.99/yr). Price-anchored to apps, not to courses.

---

## How the three change what we build

| | Marijke | Thijs | Sanne |
|---|---|---|---|
| First screen | loanword wall | spreektaal | placement test |
| Hook | recognition | being understood | respect for prior knowledge |
| Channel | community, word of mouth | search + expat forums | search |
| Urgency | low, emotional | high, deadline | medium, frustration |
| Price anchor | €254.50 course | €12/mo, 3 months | €122.99/yr Duolingo |

Three different first screens is a real argument for the landing page carrying
more than one entry point — a hero for Marijke, and clearly-labelled doors for
the other two rather than a single generic funnel.

## What would falsify these

- If the first paying customers are overwhelmingly Thijs rather than Marijke,
  the landing page leads with spreektaal and the loanword bridge moves down.
- If nobody uses `/instaptoets`, Sanne is not real and the affix trainer is a
  retention feature rather than an acquisition one.
- If community channels outperform search 5:1, the whole content plan is wrong
  and budget goes to events and partnerships instead.

Instrument before assuming: signup source, first surface used, and whether the
placement test is taken, are the three measurements that decide this.
