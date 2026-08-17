# Value and price — how to phrase it

From Ramanujam & Tacke, *Monetizing Innovation* (2016).
`docs/marketing/pricing.md` already applies this to the €9/€79 decision — read it
before touching anything about price.

---

## The rule that matters most for copy

> A feature belongs to the product; a benefit belongs to the customer.

For every feature, ask: *what does the customer achieve because of this?* Then
write that instead. Their SmugMug example: 100+ features across four plans
confused buyers into not buying at all; condensing to fewer than ten benefit
statements produced a double-digit increase in revenue and conversion. The
feature comparison stayed, moved to an optional section for people who wanted it.

Applied here:

| Feature | Benefit |
|---|---|
| 66 items carry `register='informal'` | You'll understand what they actually say at home, not just what the textbook teaches |
| 173 items carry `loan_source_nl` | You're not starting from zero — you already recognise ~170 words |
| FSRS scheduling on capabilities | Words come back just before you'd forget them, so ten minutes a day is enough |
| Affix/morphology trainer | You can work out words you've never seen, instead of memorising each one |
| 191 grammar patterns, 13 texts, story podcasts, mnemonic workshop | Everything a serious learner would otherwise assemble by hand, already assembled |

That last row is the one to get right: it is the **assembly** argument, and it
must never decay back into a feature list. `positioning.md` §1 explains why — a
feature list invites comparison on every axis against a specialist who wins on
that axis, and says nothing about who it's for.

## Why value messaging goes wrong

Their diagnosis: the people who write the messaging weren't there when the value
was designed, so they reconstruct it late, and the loudest voice in the room wins
the framing. That risk is low here — one person builds and writes — but the
inverse risk is high: **the builder knows the mechanism too well and describes
the mechanism instead of the benefit.** "FSRS scheduling on capabilities, not
flashcards" is a true and interesting sentence that means nothing to Robin.

The test: read the sentence as someone who has never used a spaced-repetition
app. If it survives, it's a benefit.

## MOCA — deciding what to emphasise

The matrix of competitive advantages. Two axes: how important a benefit is to the
customer, and how you perform on it *as the customer sees it*.

- **Important + you win** → lead with this. Here: the loanword bridge and
  spreektaal, both structurally uncopyable by an English-routed course.
- **Less important + you win** → mention only if you can prove the importance.
  Here: the affix trainer and the mnemonic workshop — real moats, but they
  explain why the product *works*, not why anyone *wants* it. This is exactly why
  the morphology motif was rejected for the landing hero and kept for
  `/hoe-het-werkt`.
- **Important + you lose** → prepare an answer. Here: no live conversation
  practice, no human audio, no mobile-app-store presence, one person building it.
  Don't hide these; see the "problems" section in `references/content.md`.

## Rules for any surface that quotes a price

The €7→€9 change touched four surfaces and left stale copy behind. Two guards
exist now, and adding an unpinned fifth surface widens the gap rather than
joining a protected set.

1. **The price is pinned in exactly one place per surface**, and
   `scripts/check-cloud-config.ts` (§DECLARED, ~line 224-238) asserts the landing
   band quotes `PRICING.monthly.display` / `PRICING.annual.display`. It runs
   inside `make pre-deploy`.
2. **The free tier is lesson 1** — enforced by `indonesian.is_free_tier_lesson`
   and `FREE_TIER_MAX_LESSON` (`src/services/entitlementService.ts`), which HC55
   asserts agree. ⚠️ **The copy that advertises the tier is not machine-pinned.**
   Before writing "lesson 1 free" anywhere new, check the constant, and prefer
   not to add another unpinned surface.
3. **State the cancellation terms wherever you state the price** — EU distance
   selling expects terms and the withdrawal/refund policy to be reachable before
   purchase, not only behind the paywall.
4. **Prices were chosen, not researched.** `pricing.md` §7 and `positioning.md`
   §7 both say so. Never write copy implying the price reflects measured value or
   market research.

## The "minivation" trap

Their term for underpricing a genuine innovation — it isn't a competitive
advantage, it's forgone revenue. `pricing.md:78` already flags Kamoe Bisa as
textbook minivation: the real alternative for the primary persona is a
Volksuniversiteit course at €254.50, which is 4.5× the annual price.

This has a copy consequence, not just a pricing one. If the price is well below
the alternative the buyer is actually weighing, **anchor against that alternative
rather than against apps.** Sanne price-anchors to Duolingo Super (€122.99/yr);
Robin and Marijke anchor to a €254.50 course. Same price, two very different
framings, and the primary persona gets the course anchor.
