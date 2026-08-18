---
name: marketing
description: Decide WHAT to say about Kamoe Bisa and whether a claim is allowed — positioning, personas, which channel to spend effort on, pricing framing, what content to publish, and the honesty gate that binds every customer-facing surface. Use this before writing any marketing copy (landing page, /hoe-het-werkt, meta descriptions, ad copy, launch posts, store listings, emails, comparison pages), and whenever asked "how should we position this", "is this claim OK", "which channel", "how do we compare ourselves to Duolingo/Anki", "who is this for". Also use it to REVIEW existing copy for honesty or drift. The honesty rules are not style preferences — there are zero customers, all audio is TTS, and inventing social proof or efficacy numbers is misleading advertising. This is the STRATEGY skill; its sibling `marketing-copy` is the CRAFT skill that writes the actual sentences. Load this one first, then that one.
---

# Marketing strategy — Kamoe Bisa

> **This skill decides what is true and worth saying. It does not write sentences.**
> For headlines, hero copy, rewriting something flat, or "make this catchier",
> load **`marketing-copy`** — the craft sibling, built from Miller, Heath,
> Sugarman, Schwartz and Ogilvy.
>
> **You almost always want both, in this order.** Craft without this skill's
> honesty gate produces persuasive lies. This skill without craft produces the
> correct argument, flatly stated — which is exactly what happened on 2026-08-17,
> when the landing copy passed every rule here and the owner's verdict was *"not
> really catchy."* That gap is why the split exists: the four books behind THIS
> skill are all about strategy, and not one of them is about writing a sentence.

Four books are already applied to this product, by the owner, in four repo docs.
This skill exists so that every marketing surface traces back to those decisions
instead of re-deriving a position per page — and so that the honesty constraints,
which are scattered across six files, get applied every time rather than
whenever someone remembers them.

## Read this first: the honesty gate

These are not tone preferences. Breaking them is misleading advertising, and the
product's primary persona is someone whose blocker is *confidence that this will
work this time*. One discovered exaggeration and they disbelieve everything else
on the page.

**Check the pending-claims register before writing anything about users,
results or scale** — `positioning.md` §7. It lists the claims that are blocked
today, why, and the exact trigger that unlocks each. Two of them have already
been written by accident, so treat it as a checklist rather than background
reading. And a claim that *keeps* reappearing across drafts is not carelessness —
it is one the product wants to make, which is when it most needs a written block.

**There are zero paying customers.** Never invent, imply or imitate reviews,
ratings, testimonials, learner counts, "join thousands of learners", "loved by",
star ratings, or a founding-customer story that did not happen. If a surface
feels like it needs social proof, the replacement is the owner's own story
(`personas.md` §1) — it does the same job and is true.

**All audio is TTS.** Never claim native speakers, human narration, voice actors,
or "recorded by". Audio may be described neutrally as a feature that exists.
This rule predates the marketing docs and is restated at `src/pages/Landing.copy.ts:12-14`.

**Never cite efficacy numbers.** No "learn 3× faster", no "95% retention", no
"most learners reach A2 in N weeks". Nobody has measured it for this product.
Principles and *our own decisions* are citable; outcomes are not.

**Never imply endorsement.** Karpicke, Nation and Krashen have not heard of
Kamoe Bisa. Citing a principle is fine; implying the researcher approves is not.

**⚠️ A NEGATIVE claim needs a stronger check than a positive one.** "We have X"
fails loudly when wrong — someone looks for X and does not find it. "We do NOT
have X" fails silently, and it quietly deletes a real feature from the page.

This has gone wrong twice, both times with a query that looked authoritative:

| Claimed | Actually | The bad check |
|---|---|---|
| "there are no culture lessons" | 18 culture sections across 17 lessons | queried `section_kind`; the lessons are `text` sections titled "Cultuur — …" |
| "the reading library is just 13 rows" | true, but stated after reading only the table DDL | read the schema, not the rows |

**Before writing that the product lacks something, search the CONTENT, not just
the schema** — titles, text bodies, component names — and say which check you
ran. If you cannot name a check that would have found it had it existed, you have
not verified an absence; you have failed to find it.

**Every count must be DB-verified, and say where the check lives.** Product
numbers drift silently. `positioning.md` §8 already requires this. Public pages
cannot read the database — anon has no grant on the `indonesian` schema — so any
figure on a public page is a committed static export, as `/leenwoorden` does.

**The register limit binds every promise about family conversation.** The
coursebook dialogues are formal and touristy — lesson 2 is a businessman checking
into a hotel. Spreektaal rides alongside; it is not a family-conversation course.
You may promise *you will understand the register they actually use* (true, 66
pairs shipped). You may not promise *chat with your in-laws by week two*.
`personas.md` §1 marks this ⚠️ and it is the easiest rule here to break by
accident, because the true version and the false version sound similar.

**Attack the gap, never the learner or the tool they chose.** Plenty of Dutch
speakers learn happily through English. The true and stronger claim is narrower:
*the loanword head start is unavailable there*. `positioning.md` §5.

## Where the truth lives — trace, do not invent

Every claim should be traceable to a line in one of these. If you find yourself
inventing a new position, benefit or audience for one surface, stop: either it
belongs in the source doc first, or it is drift.

| Question | Source of truth |
|---|---|
| What are we, and to whom? | `docs/marketing/positioning.md` |
| Who is this person and what do they want? | `docs/marketing/personas.md` |
| What do we publish, and about what? | `docs/marketing/content-plan.md` |
| What does it cost and why? | `docs/marketing/pricing.md` |
| Where do we reach people? | `docs/marketing/channels.md` |
| What do competitors claim, and where do we stand? | `docs/marketing/competitive-messaging.md` |
| What is the number, and who else quotes it? | `docs/marketing/facts.md` — every figure with its query and a reverse index of the surfaces using it |
| Is this capability actually shipped? | the live DB, or the code — never memory |

**The method has a name: "de Kamoe Bisa-methode"** (decided 2026-08-18,
`positioning.md` §2b). Use it — but **always paired with the mechanism in the
same breath**, and **never attached to an outcome, a timeline or a number.** A
bare method name is an empty label, and a method name with a figure beside it is
how efficacy claims re-enter through the door marked branding. Babbel's method
name is the container their "92% in 2 months" travels in; ours must stay empty.

**Primary persona is Robin, the partner** — changed 2026-08-16 from Marijke, the
heritage learner. `personas.md` §1. Marijke, Thijs and Sanne are still served;
they are doors, not the hero. If a piece of copy seems to want a different
primary persona, that is a `personas.md` change with the owner, not a local
decision.

**These docs are `status: draft` and partly hypothesis.** `positioning.md` §7 is
explicit that everything about *customers* is inference, because Dunford's step 1
— talk to the customers who love your product — could not be done. Treat the
product facts as solid and the customer claims as load-bearing guesses. Do not
let confident copy harden a guess into an assumed fact.

## The four jobs, and where the method lives

Load the reference for the job you are actually doing. Each digests one book the
owner has already applied, so the method is available without re-reading it.

| If you are... | Read | Book behind it |
|---|---|---|
| deciding what we *are* — category, competitors, what makes us different | `references/positioning.md` | Dunford, *Obviously Awesome* |
| deciding what to *publish*, or writing a comparison page | `references/content.md` | Sheridan, *They Ask, You Answer* |
| deciding *where* to spend effort to reach people | `references/channels.md` | Weinberg & Mares, *Traction* |
| phrasing *value* or writing anything that quotes a price | `references/value-and-price.md` | Ramanujam & Tacke, *Monetizing Innovation* |

Books live at `~/Downloads/*.epub` if you need the full text; the references
carry the working method, not a summary of the book.

## Writing copy: what good looks like here

> These are **strategy** constraints on the copy — what it must argue. For HOW to
> write it well (the reader must be in it, concreteness, the slippery slide,
> matching the reader's awareness state), load **`marketing-copy`**.

**Lead with recognition, not features.** The first thing a visitor meets should
be something they already know is true about themselves — the loanword wall, the
gap at the family table. `positioning.md` §8.

**Sell completeness as assembly, never as a feature list.** A feature list is a
non-position: it invites comparison on every axis against a specialist who beats
us on that axis, and says nothing about who it is for. The same truth positions
properly as *the stack a serious learner would otherwise build by hand, already
assembled*. `positioning.md` §1. This also answers Anki in one line — Anki is one
component of that stack, and the one that costs the most manual labour.

**Benefits, not features.** A feature belongs to the product; a benefit belongs
to the customer. For each feature ask: what does the learner *achieve* because of
this? "66 register pairs" is a feature. "You will understand what they actually
say at home, not what the textbook says" is the benefit. See
`references/value-and-price.md`.

**Show, don't claim, when the content can do the work.** The strongest asset here
is that both uncopyable advantages have the same shape — two words and a
relationship: `kantoor → kantor`, `lelah → capek`. *"Duolingo leert je lelah. Je
schoonmoeder zegt capek."* is checkable, concrete, and makes the argument without
asserting superiority.

**Prefer "here is what we changed and why" over "science says".** The most
persuasive item in the whole product is not a citation but an audit: ADR 0007
records that a 36-hour audit on 2026-05-18 found 30.1% of reviews were part of a
within-session repeat-group on the same `source_ref`, worst case three tests on
*apa kabar?* in 31 seconds — and it was changed because the research said it was
wrong. Anyone can cite Karpicke; almost nobody can show what they changed because
of him. Quote it precisely: simplifying `source_ref` to "the same word" is fine,
inflating the number or dropping the 36-hour window is not.

**Dutch first.** The product and the audience are Dutch. English copy exists and
follows; it is a translation of a Dutch decision, not a parallel voice.

## Before any copy ships

Walk this once. It is short because each item has burned someone.

1. **Every claim traces** to a line in a `docs/marketing/` doc, an ADR, or a
   verified DB count — and you can say which.
2. **Every number was checked**, not remembered, and is a committed constant or
   static export if the page is public.
3. **No invented social proof.** Search the draft for review, rating,
   testimonial, "thousands", "loved by", star.
4. **No efficacy claim.** Search for faster, %, guaranteed, "in N weeks".
5. **No human-narration implication.** Search for native speaker, narrated,
   recorded, voice.
6. **Family-conversation promises stay inside the register limit.**
7. **Competitor mentions are gains, not dismissals** — and if the copy compares,
   it disarms first (`references/content.md`).
8. **A capability you named is actually shipped.** Verify against code or the
   live DB. `feedback_verify_before_claiming` exists because this fails.
9. **Price appears only where it is pinned.** `scripts/check-cloud-config.ts`
   asserts the landing band quotes the declared price; a second unpinned surface
   quoting a price is how the €7→€9 change went stale in four places.

## What this skill does not decide

The owner reviews copy. This skill gets a draft to the point where the only
remaining questions are taste and truth-about-himself — the story, the portrait,
the exact hero sentence. Bring those to him rather than settling them.

It also does not decide product scope. If honest copy cannot be written for a
feature, that is a signal about the feature or its framing, not an invitation to
write looser copy.
