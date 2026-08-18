---
name: marketing
description: Decide WHAT to say about a product and whether a claim is allowed — positioning, audience, channel choice, pricing framing, what content to publish, and the honesty rules that bind any customer-facing surface. Use this before writing marketing copy of any kind (landing page, feature page, meta descriptions, ad copy, launch posts, store listings, emails, comparison pages), and whenever asked "how should we position this", "is this claim OK", "which channel", "how do we compare ourselves to <competitor>", "who is this for". Also use it to REVIEW existing copy for honesty or drift. It carries the method from four books — Dunford on positioning, Sheridan on what to publish, Weinberg & Mares on channels, Ramanujam on value and price — plus the claim discipline that keeps persuasion honest. This is the STRATEGY skill; its sibling `marketing-copy` is the CRAFT skill that writes the actual sentences. Load this one first, then that one.
---

# Marketing strategy

> **This skill decides what is true and worth saying. It does not write
> sentences.** For headlines, hero copy, rewriting something flat, or "make this
> catchier", load **`marketing-copy`** — the craft sibling.
>
> **You almost always want both, in this order.** Craft without claim discipline
> produces persuasive lies. Strategy without craft produces the correct argument,
> flatly stated.

## This skill holds method, not answers

It does not know what the product is, who it is for, or which claims are
available. **Those live in the project, and the project outranks this file
every time.** Before writing anything, find them:

| Question | Look for |
|---|---|
| What are we, and to whom? | the project's positioning doc |
| Who is this person, what do they want? | the project's persona doc |
| What may we claim, and what is blocked? | the project's claims / honesty rules |
| What is the number? | the project's verified-figures doc, or the database — never memory |
| What does it cost and why? | the project's pricing doc |
| Where do we reach people? | the project's channels doc |
| Is this capability actually shipped? | the code or the live system |

In this repo that is `docs/marketing/*` plus `docs/adr/`. If a project has no
such docs, the first job is to establish the position — not to invent one per
surface, which is how two pages end up contradicting each other.

⚠️ **Do not write a product's specific copy decisions back into this skill.**
A worked example illustrating a technique is fine. "Use this paragraph" is not:
it turns a method into a content decision made on the owner's behalf, and every
future copy pass will reinstate it. If a line is worth keeping, it belongs in the
project's own docs, where the owner can delete it and have it stay deleted.

## Write the strongest true thing

Not the safest true thing. The claim rules below are a **floor, not a voice** —
they say what cannot be written, and nothing about how to write the rest. Copy
that spends its energy demonstrating its own honesty is worse than copy that is
simply honest and confident.

**The rule of thumb: not claiming something is the default. Announcing that you
are not claiming it is throat-clearing.** If a product has no efficacy figure,
that requirement is met by silence, not by a paragraph explaining the silence.

What wins, in order:

**1. Say the thing no competitor can say.** Lead with what is structurally
unavailable to them — a language pair they do not serve, a constraint their
business model forbids — not with what is merely true of you.

**2. Be specific enough to be checkable.** Specificity IS credibility, and it
does the job a testimonial would do. A product with no reviews has this and
little else.

**3. Be directive about the method.** "In that order, never the other way round"
reads as expertise; "a process that guides users through the stages" reads as
documentation. Same fact.

**4. Concede, then narrow.** Sheridan's disarmament: grant the competitor
something real, then narrow to the one difference that matters. Conceding is a
power move; it buys the sentence after it.

**5. End in the reader's life.** Every section should answer "so what, for me?"

**6. Cite the science, if there is any, with confidence.** Naming an established
finding is earned. What is not earned is a number about *your* users. That is a
narrow rule, not a reason to be timid about the reasoning.

## The claim rules

Six failure modes. They are near-universal — check any draft against them, fix
what fails, then stop thinking about them. None needs a disclaimer, only an
absence. The project's own docs will add product-specific blocks on top.

| Never | Unless |
|---|---|
| Reviews, ratings, testimonials, user counts, "thousands of" | Real customers exist and have given permission. Quote them verbatim; never write them |
| Human narration, "recorded by native speakers", a named voice | It is actually a human. Synthesised audio may never imply otherwise |
| Any efficacy figure — "X× faster", "in N weeks", "proven effective" | It has been measured. If you commissioned the study, say who paid for it |
| Implied endorsement by a named expert | They have endorsed it. Otherwise frame the name as the source of a finding |
| A count that was remembered rather than checked | It came from the database or a committed constant, and you can say which |
| An outcome promise the product cannot deliver | The product delivers it. Promise the thing it actually does |

⚠️ **A NEGATIVE claim needs a stronger check than a positive one.** "We have X"
fails loudly; "we do NOT have X" fails silently and can delete a real feature or
invent a competitor's gap. Search the CONTENT, not the schema, and name the check
you ran.

⚠️ **A claim that keeps reappearing is not a slip.** It is a claim the product
*wants* to make, which is exactly when it needs a written block with the trigger
that would unlock it — in the project's docs, not in someone's memory.

## The four jobs, and where the method lives

Load the reference for the job you are actually doing. Each digests one book, so
the method is available without re-reading it.

| If you are... | Read | Book behind it |
|---|---|---|
| deciding what the product *is* — category, competitors, what makes it different | `references/positioning.md` | Dunford, *Obviously Awesome* |
| deciding what to *publish*, or writing a comparison page | `references/content.md` | Sheridan, *They Ask, You Answer* |
| deciding *where* to spend effort to reach people | `references/channels.md` | Weinberg & Mares, *Traction* |
| phrasing *value*, or writing anything that quotes a price | `references/value-and-price.md` | Ramanujam & Tacke, *Monetizing Innovation* |

## What good looks like, structurally

> These are **strategy** constraints on the copy — what it must argue. For HOW to
> write it well, load **`marketing-copy`**.

**Lead with recognition, not features.** The first thing a visitor meets should be
something they already know is true about themselves.

**Sell completeness as assembly, never as a feature list.** A feature list is a
non-position: it invites comparison on every axis against a specialist who wins
on that axis, and says nothing about who it is for. The same truth positions
properly as *the thing you would otherwise assemble yourself, already assembled*.

**Benefits, not features.** A feature belongs to the product; a benefit belongs to
the customer. For each feature ask what the user *achieves* because of it.

**Show, don't claim, when the content can do the work.** A concrete pair the
reader can verify beats an assertion of superiority.

**Prefer "here is what we changed and why" to "the research says".** But only if
the reader feels the benefit of the change — an internal QA story asks a
prospective buyer to care about your process, which they do not.

**Write in the audience's language first.** Translations follow a decision; they
are not a parallel voice.

## Before any copy ships

1. **Every claim traces** to a line in the project's docs, a decision record, or
   a verified count — and you can say which.
2. **Every number was checked**, not remembered.
3. **No invented social proof.** Search for review, rating, testimonial,
   "thousands", "loved by", star.
4. **No efficacy claim.** Search for faster, %, guaranteed, "in N weeks".
5. **No false implication about how it was made** — who recorded it, who wrote
   it, who endorsed it.
6. **Promises stay inside what the product actually delivers.**
7. **Competitor mentions are gains, not dismissals** — disarm first
   (`references/content.md`).
8. **A capability you named is actually shipped.** Verify against the code or the
   live system.
9. **Price appears only where something asserts it is current.** An unpinned
   second surface quoting a price is how prices go stale.

## What this skill does not decide

**The owner decides content.** This skill gets a draft to the point where the
only remaining questions are taste and truth-about-themselves. Bring those to
them rather than settling them — and when they settle one, record it in the
project's docs, never here.

It also does not decide product scope. If honest copy cannot be written for a
feature, that is a signal about the feature or its framing, not an invitation to
write looser copy.
