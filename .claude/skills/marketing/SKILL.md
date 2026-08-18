---
name: marketing
description: Decide WHAT to say about Kamoe Bisa and whether a claim is allowed — positioning, personas, which channel to spend effort on, pricing framing, what content to publish, and the honesty gate that binds every customer-facing surface. Use this before writing any marketing copy (landing page, /hoe-het-werkt, meta descriptions, ad copy, launch posts, store listings, emails, comparison pages), and whenever asked "how should we position this", "is this claim OK", "which channel", "how do we compare ourselves to Duolingo/Anki", "who is this for". Also use it to REVIEW existing copy for honesty or drift. Leads with what makes the copy STRONG — say what no competitor structurally can, be specific enough to be checkable, concede then narrow, end in the reader's life. It also carries a short list of things that are simply false here (zero customers, all audio is TTS, no efficacy figures), but that is a floor to clear once, not a voice to write in: not claiming something is the default, and announcing that you are not claiming it is throat-clearing. This is the STRATEGY skill; its sibling `marketing-copy` is the CRAFT skill that writes the actual sentences. Load this one first, then that one.
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
instead of re-deriving a position per page.

**Its job is to make the copy strong, not safe.** An earlier version led with the
prohibitions and produced exactly what you would expect: correct, hedged, and
dull. The owner's verdict on it was that it read like someone "who insists on
telling the truth about everything". The truth requirement never moved; the
emphasis did.

## Write the strongest true thing

Not the safest true thing. The gate further down is a **floor, not a voice** — it
tells you what cannot be said, and says nothing about how to say the rest. Copy
that spends its energy demonstrating its own honesty is worse than copy that is
simply honest and confident. Four separate hedges once accumulated on the landing
page; the owner deleted three, and the page improved every time.

**The rule of thumb: not claiming something is the default. Announcing that you
are not claiming it is throat-clearing.** No efficacy figure appears on the page
— that requirement is met by silence, not by a paragraph explaining the silence.

What actually wins here, in order:

**1. Say the thing nobody else can say.** Every competitor sells travel, culture
or fluency (`competitive-messaging.md` §7). Not one leads with the family table.
Not one can use the Dutch loanwords. Not one teaches spreektaal in this pair. Lead
with what is structurally unavailable to them, not with what is merely true of us.

**2. Be specific enough to be checkable.** `kantoor → kantor`. *"Duolingo leert je
lelah. Je schoonmoeder zegt capek."* Eighteen culture pieces, named: Borobudur,
batik, Garuda. Specificity IS the credibility — it does the work a testimonial
would do, and we have no testimonials.

**3. Be directive about the method.** "In die volgorde, nooit andersom" reads as
expertise. "Oefeningen die door de fases heen loodsen" reads as documentation.
Same fact. State what the method *does* as a rule it follows.

**4. Concede, then narrow.** Sheridan's disarmament — the strongest paragraphs on
the page all start by granting the competitor something real. *"Duolingo is een
goede app, en wie via het Engels leert komt er ver mee. Alleen:"* Conceding is a
power move, not a weakness; it buys the sentence that follows.

**5. End in the reader's life.** *"Voor het moment dat je schoonmoeder je iets
vraagt en jij gewoon antwoordt."* Every band should be able to answer "so what,
for me?"

**6. Cite the science with confidence.** "Gegrond in bewezen wetenschap" is fully
earned — the principles ARE established and named (`positioning.md` §2b). Quote
them. What is forbidden is a number about *our* learners, which is a narrow rule,
not a reason to be timid about the derivation.

## The gate — a floor, not a voice

Six things that are simply false if written. Check the draft against them, fix
what fails, and then stop thinking about them: none of these requires a
disclaimer, only an absence.

| Never | Because |
|---|---|
| Reviews, ratings, testimonials, learner counts, "duizenden" | Zero paying customers. The founder's own story does the same job and is true |
| Native speakers, narration, "ingesproken" | All audio is TTS |
| Any efficacy figure — "X× sneller", "in N weken", "bewezen effectief" | Never measured, by us or anyone. The METHOD is untested; the SCIENCE it derives from is not — `positioning.md` §2b |
| Implied endorsement by a named researcher | They have not heard of this product. Frame names as sources of a finding |
| A count not in `facts.md` | Numbers drift silently. `facts.md` holds the query and the list of surfaces quoting each one |
| Conversational fluency by any date | The coursebook is formal and touristy. Promise the register they actually use — `personas.md` §1 |

⚠️ **Before writing about users, results or scale, read `positioning.md` §7** —
the pending-claims register, with the trigger that unlocks each. One of those
claims has regenerated three times in this project.

⚠️ **A NEGATIVE claim needs a stronger check than a positive one.** "We have X"
fails loudly; "we do NOT have X" fails silently and deletes a real feature. It has
happened twice — most recently "there are no culture lessons" when eighteen exist,
because the check queried `section_kind` and they live in `text` sections titled
"Cultuur — …". Search the CONTENT, and name the check you ran.

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
