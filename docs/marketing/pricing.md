---
status: draft
owner_decision_required: true
last_verified: 2026-08-05
---

# Pricing — competitive scan and recommendation

Current: **€7/month, €56/year**, VAT included, free tier = lessons 1–3 plus the
pronunciation podcast.

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

- Stripe: create **new** Prices (never mutate live ones), update
  `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` secrets, redeploy functions,
  verify version + sha changed.
- `src/lib/i18n.ts` — `/voorwaarden` §2 states €7 and €56 explicitly.
- `src/pages/Landing.copy.ts` — pricing band.
- `src/components/paywall/PaywallPanel.tsx` — the displayed prices.
- `index.html` — no price in the meta description today; keep it that way so
  copy changes do not require a rebuild of the social preview.
- `docs/process/launch-runbook.md` Phase 1 and 5.

A price parity check (copy vs Stripe) does not exist. If prices change, that gap
is worth closing the same way `FREE_TIER_MAX_LESSON` parity is enforced today.
