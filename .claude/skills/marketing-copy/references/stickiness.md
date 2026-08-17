# Stickiness — will anyone remember or repeat it?

Chip & Dan Heath, *Made to Stick*. Book in `~/Downloads`.

Use this as a **checklist on a finished draft**, not a template for a blank page.
The Heaths are explicit that it is not a formula — an idea does not need all six
traits, and having all six guarantees nothing.

Matters more than usual for this product, because `channels.md` puts community
and word of mouth in the inner ring: copy that cannot be repeated by one person to
another is copy that cannot travel.

---

## SUCCESs

**Simple** — the core, ruthlessly prioritised. Their lawyer's line: *"If you argue
ten points, even if each is a good point, when they get back to the jury room they
won't remember any."* Note their warning: simple ≠ short. The ideal is a **proverb**
— compact *and* profound — not a sound bite.

**Unexpected** — violate an expectation to get attention, then **open a curiosity
gap** to hold it. Surprise is a spike; curiosity is a sustain. Sugarman's
"slippery slide" is the same mechanism worked out at sentence level (`flow.md`).

**Concrete** — explain in human action and sensory detail. This is the easiest
principle and the most often lost, and the Heaths are blunt about why: *the barrier
is simply forgetfulness.* We slip into abstractspeak without noticing. Mission
statements, "world-class service", "onderdompeling".

**Credible** — sticky ideas carry their own credentials. Prefer a claim the reader
can test over a number they must trust. Reagan's *"ask yourself if you are better
off today than you were four years ago"* beat every available statistic.

**Emotional** — make them feel something, and note their finding: *we are wired to
feel things for people, not for abstractions.* One person beats a population. One
family table beats "Dutch learners of Indonesian".

**Story** — stories work as a mental flight simulator; people who have heard the
story act better when they meet the situation. Also the Heaths' recommended way
to dodge the Curse of Knowledge, because **a story forces concrete language**.

---

## The villain: the Curse of Knowledge

You cannot unknow what you know, and it makes you write for yourself. It is the
reason a builder writes:

> "FSRS scheduling on capabilities, not flashcards — recall is scheduled per
> skill, not per word."

Every word true; nothing lands. The translated version:

> "Woorden komen terug vlak voordat je ze vergeet."

**Vocabulary in this project that is cursed** — always translate, never ship raw:

| Cursed | Translated |
|---|---|
| FSRS / spaced repetition scheduler | *een planner die bijhoudt wanneer je iets bijna vergeet* |
| capability / capability type | *een oefening* — or say nothing; the learner never needs this word |
| activation / activate a lesson | *jij zet aan wat je wilt oefenen* |
| projection, seeding, publish pipeline | never appears in customer copy at all |
| mastery stage / Inprenten→Onderhoud | fine to show, but **only** with the scheduling-state disclaimer (design D6) |
| interleaving | *door elkaar oefenen werkt beter dan blokken afwerken* |
| CEFR level | *op jouw niveau* — A1/B1 is fine as a label, never as the explanation |

The Heaths' own cure is the Trader Joe's move: when you catch yourself writing
adjectives about a category of people, **write one person instead.**

---

## How this product scores, honestly

A calibration exercise, not a scoreboard — done 2026-08-17 against the landing
page as written.

| | How it does |
|---|---|
| **Simple** | Weakest. The argument is good but arrives in eight bands. There is no proverb — no single line a reader could repeat in a pub |
| **Unexpected** | Strong where it is present: *"Ik heb ze opgezet. Ik heb ze nooit gevuld."* and *"Duolingo leert je lelah. Je schoonmoeder zegt capek."* |
| **Concrete** | Good after rewriting — the empty reader, the five named services, two words at a kitchen table. Was abstract before |
| **Credible** | Unusually strong, and by an honest route: the ADR 0007 audit is a *testable* credential in Reagan's sense — a specific admitted mistake, checkable, not a statistic asking for trust |
| **Emotional** | Present but underplayed. The strongest emotional beat — the table — is in paragraph three of the hero |
| **Story** | Present, but see `storybrand.md`: it is the *founder's* story and it does not turn to the reader |

**The single biggest stickiness gap: there is no proverb.** No compact line that
carries the whole idea and survives being repeated by someone else. The candidates
already written are the two "unexpected" lines above; neither is yet in a position
to do that job.

Worth attempting one. Shape to aim for — short, concrete, and impossible to say
about any other product:

> *Vijf apps opgezet. Alle vijf leeg.*
> *Duolingo leert je lelah. Je schoonmoeder zegt capek.*
> *Je begint niet bij nul — je kent er al 173.*

Any of those can be said out loud by a person recommending this to a friend, which
is the actual test.
