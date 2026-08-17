---
status: decided
decided: 2026-08-05
last_verified: 2026-08-05
---

> **DECIDED 2026-08-05 — €9/month, €79/year, applied.** Owner: *"yes use the new
> price point, lets see how it goes"* and *"we can always go lower"* — which is
> the strongest argument for the direction. A price cut reads as a promotion; a
> price rise reads as a betrayal to whoever already subscribed. Starting at €9/€79
> keeps a launch discount available and keeps grandfathering logic out of the
> entitlement code.
>
> Applied in sandbox: new Stripe Prices created (never mutated — the old ones are
> archived, and the existing test subscription continues on its original €7 price,
> which is exactly why you create rather than edit), function secrets repointed,
> and verified end to end — a session created through the DEPLOYED function now
> returns 9.00 and 79.00 EUR. Copy, terms §2, the paywall, the savings badge
> (33% → 27%, recomputed against €9×12) and the JSON-LD offer all moved together.
>
> ~~⚠️ **Live mode still has the OLD prices.**~~ **CLOSED 2026-08-05/06.** Live
> €9/€79 Prices created and the live secrets repointed (ids in
> `docs/process/launch-runbook.md` Phase 5); sessions created through the
> deployed function came back at 900 and 7900. The risk this warned about — live
> checkout selling €7/€56 while every page says €9/€79 — is now **asserted, not
> just fixed**: `make check-cloud-config` compares the live price secrets against
> the declared ids by sha256 digest and checks every page that quotes a price.
> See §4 below.

# Pricing — competitive scan and recommendation

> The scan below was written against the €7/€56 price and is preserved as the
> reasoning that produced the change — the banner above is what is true now.

Current at time of analysis: **€7/month, €56/year**, VAT included, free tier =
lessons 1–3 plus the pronunciation podcast. **Now €9/€79, and the free tier is
lesson 1** — narrowed in PR #470, after this scan was written. Both figures in
that first sentence are historical. The live values are `PRICING` in
`scripts/check-cloud-config.ts` and `FREE_TIER_MAX_LESSON` in
`src/services/entitlementService.ts:41`; cite those, never this line.

Framework: Ramanujam & Tacke, *Monetizing Innovation*. The relevant failure mode
they name is the **minivation** — *"products that tap neither a product
concept's full market potential nor its full price potential... failure can
masquerade as success."* That is the diagnosis below.

---

## 1. What the alternatives actually cost (verified 2026-08-05)

### The real substitute: Dutch-language Indonesian instruction

| Provider | Price | Note |
|---|---|---|
| **Volksuniversiteit Amsterdam** — Indonesisch Beginners 1/2/3 | **€254.50 per level** | 20% online discount already included |
| Volksuniversiteit — Halfgevorderden 2 | €315.00 | |
| Volksuniversiteit — Vergevorderden 1 | €355.00 | |
| Volksuniversiteit — intake / niveaubepaling | €25.00 | We give the equivalent away free (`/instaptoets`) |
| **Superprof private tutor** | **from €17/hour** | 30 lessons ≈ €510 |
| NHA thuisstudie Indonesisch (to B1) | not published | distance courses in NL typically €300+ |

Kamoe Bisa covers roughly A1–B1 across 30 lessons. The equivalent journey at
Volksuniversiteit is three or more course levels: **€760+**.

### The app anchors (none of which serve this language pair in Dutch)

| App | Price | Serves NL→ID? |
|---|---|---|
| Duolingo Super | €10.25/mo annual (**€122.99/yr**) | **No** — Indonesian is not in the Dutch catalogue |
| Duolingo Max | €14.99/mo | No |
| Babbel | ~€9/mo on annual (~€100/yr) | No Indonesian |
| Busuu Premium Plus | ~€13/mo | No |
| **Kamoe Bisa** | **€7/mo · €56/yr** | Yes — the only one |

## 2. The diagnosis

**€56/year is 22% of ONE Volksuniversiteit level, and about 7% of the equivalent
full journey.** It is also below every mainstream app, none of which can even
serve this customer.

Being cheaper than a product that does not exist for your buyer is not a
competitive advantage. It is forgone revenue. This is textbook minivation: the
price was set by looking at app subscriptions, when the customer's actual
reference point — per `positioning.md` §1 — is a €254.50 evening course or a
€17/hour tutor.

Two supporting observations:

- **The annual discount is 33%** (€56 against €84 of monthly). That is in line
  with the market, so the *structure* is fine. The problem is the absolute level.
- **Marijke's willingness to pay is anchored to courses, not apps.** She would
  spend €254.50 on the Volksuniversiteit if she believed it would work. Her
  hesitation is confidence, not budget.

## 3. Recommendation

**Raise to €9/month, €79/year** (27% annual discount) — and do it *now*, before
the first paying customer exists.

Why now: price changes are free today and expensive forever after. The moment
there are subscribers, raising prices means either grandfathering (permanent
complexity in the entitlement logic) or angering the people who backed you
earliest. There is no cheaper moment than this one.

Why €9/€79 and not more:
- It sits at parity with Duolingo Super and Babbel, so the app-anchored persona
  (Sanne) does not balk;
- it remains 3× cheaper than one Volksuniversiteit level, so the course-anchored
  persona (Marijke) still sees an obvious bargain;
- it is a change of €2, which nobody has yet paid the old price for.

Why not €15+, which the value gap would arguably support: no brand, no
testimonials, no track record, and a primary persona whose blocker is *confidence
that it will work*, not cost. Ramanujam's point is to charge what the value
justifies — but the value has to be *believed*, and belief is what is missing.

### Worth testing later, not now

- **A one-off lifetime price (~€179).** The heritage persona skews older and
  many in that group dislike subscriptions outright. This is a different
  monetization model (ch. 7) rather than a different price point, and it may
  capture willingness-to-pay that a subscription never will.
- **A 3-month pass for the traveller.** Thijs has a deadline, not an ongoing
  need. Selling him a subscription he must remember to cancel is worse for both
  sides than selling him exactly what he wants.

### What must happen before any of this is more than a guess

Ramanujam's actual instruction is the **willingness-to-pay conversation, held
early** — not a smarter guess. With the first ten heritage learners, ask:

1. What would you have done instead, and what would that have cost?
2. At what price would this be so expensive you would not consider it?
3. At what price would you doubt it was any good?
4. What would have to be true for €150/year to feel obviously worth it?

Question 3 matters more than it looks: for a course-anchored buyer, **€56 can
read as "probably not serious."** Underpricing can suppress conversion in
exactly the segment we care most about.

## 4. If the price changes, this is what it touches

**Start at `scripts/check-cloud-config.ts` → the `PRICING` constant.** That is
now the single declaration of what a plan costs and which Stripe Price sells it;
every surface below is asserted against it by `make check-cloud-config` (which
runs inside `make pre-deploy`), so a half-finished reprice fails the gate
instead of reaching customers.

- Stripe: create **new** Prices (never mutate live ones), update
  `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` secrets. No function redeploy
  is needed — secrets propagate to running functions — so there is no sha to
  compare; the digest assertion is what proves the new ids took.
- `scripts/check-cloud-config.ts` — `PRICING`: the new ids **and** amounts.
- `src/lib/i18n.ts` — `paywall.monthlyPrice`/`annualPrice`,
  `paywall.annualBadge` + `annualHint` (the savings % is recomputed and
  asserted), and `/voorwaarden` §2, in **both** `nl` and `en`.
- `src/pages/Landing.copy.ts` — `pricingBody`, both languages.
- `index.html` — the JSON-LD `Offer.price`. (Still no price in the meta
  description; keep it that way so copy changes do not force a rebuild of the
  social preview.)
- `docs/process/launch-runbook.md` Phase 1 and 5.

~~A price parity check (copy vs Stripe) does not exist.~~ **It does now**
(2026-08-06), built the same way `FREE_TIER_MAX_LESSON` parity is: one
declaration, everything else compared against it. Price ids are identifiers
rather than secrets, so the live secrets can be compared exactly by sha256
digest without this repo ever holding a key.
