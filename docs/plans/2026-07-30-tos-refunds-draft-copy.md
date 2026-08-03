---
status: shipped
merged_at: 2026-08-03
implementation_paths:
  - src/lib/i18n.ts
  - src/pages/Terms.tsx
  - src/pages/Refunds.tsx
---

# ToS + refund policy — draft copy for owner sign-off

**Drafted 2026-07-30 by agent, per `launch-runbook.md` Phase 1
("An agent can draft; owner signs off").**

> **Wired 2026-08-03.** Owner accepted this draft; the copy below is now live in
> `src/lib/i18n.ts` (both NL and EN), the contact address resolved to
> `support@kamoebisa.nl`, `lastUpdated` set to 3 August 2026, and the yellow
> PLACEHOLDER alert removed from both pages. This file is now the changelog for
> that copy, not forward work — edit `i18n.ts` for revisions.
>
> ⚠️ **One dependency is still open**: the §3 withdrawal-right waiver holds only
> if Stripe Checkout actually collects the consent per purchase.
> `consent_collection` was verified **null** on live sessions 2026-08-03, so as
> shipped that clause is disclosure, not an enforceable waiver. Enabling it
> needs a ToS URL in the Stripe Dashboard's public business information FIRST —
> without it the API rejects the call and no one can pay.

⚠️ **This is a draft for review, not legal advice.** I am not qualified to
give it, and one clause in particular (§3 of the refund policy, the withdrawal
-right waiver) has formal statutory requirements where getting the wording
wrong has real consequences — see "Where I'd get a professional check" below.

**Deliberately NOT wired into `src/lib/i18n.ts`.** The keys below map 1:1 onto
the existing `terms` / `refunds` blocks (NL at ~:408/:429, EN at ~:1234/:1255),
so applying an approved version is a mechanical find-and-replace. Leaving it
out means nothing legal can ship unreviewed, and the yellow PLACEHOLDER alert
stays visible until you decide.

## Facts encoded (correct these if wrong — everything below depends on them)

| | |
|---|---|
| Legal entity | van Duijn Data & Analytics |
| Trade name | Kamoe Bisa |
| KVK | 88627950 |
| Country | Netherlands |
| Product | Online subscription for learning Indonesian |
| Price | €7/month or €56/year, **VAT included** |
| Free tier | Lessons 1–3 + the pronunciation podcast, no payment |
| Payment processor | Stripe (we never see or store card details) |
| Cancellation | Any time, self-service; access runs to end of paid period |
| Contact email | **← YOU MUST FILL THIS IN** (currently `<<USER TO FILL>>`) |

---

## Terms of Service

### NL

**section1Body** (1. De dienst)
> Kamoe Bisa is een online leeromgeving waarmee je Indonesisch leert. De dienst
> wordt aangeboden door van Duijn Data & Analytics (handelsnaam Kamoe Bisa),
> ingeschreven bij de Kamer van Koophandel onder nummer 88627950. Je hebt een
> account nodig om de dienst te gebruiken. Een deel van de lesstof is gratis
> beschikbaar; voor de volledige inhoud is een betaald abonnement nodig.

**section2Body** (2. Abonnement en betaling)
> Het abonnement kost €7 per maand of €56 per jaar. Alle genoemde prijzen zijn
> inclusief btw. Het abonnement wordt automatisch verlengd aan het einde van
> elke periode, totdat je opzegt. Betalingen worden verwerkt door Stripe; wij
> ontvangen of bewaren je betaalgegevens niet. Lukt een betaling niet, dan kan
> de toegang tot betaalde onderdelen tijdelijk worden opgeschort totdat de
> betaling alsnog is voldaan.

**section3Body** (3. Opzeggen)
> Je kunt op elk moment opzeggen via Profiel → Abonnement beheren. Er geldt
> geen opzegtermijn en er zijn geen kosten aan verbonden. Na opzegging houd je
> toegang tot de betaalde onderdelen tot het einde van de periode die je al
> hebt betaald; daarna vervalt de toegang tot die onderdelen. Je account en je
> leervoortgang blijven bestaan, en de gratis onderdelen blijven beschikbaar.

**section4Body** (4. Toegestaan gebruik)
> Je account is persoonlijk en niet bedoeld om te delen. Je mag de lesstof
> gebruiken om zelf Indonesisch te leren. Het is niet toegestaan om de inhoud
> te kopiëren, te verspreiden, openbaar te maken of commercieel te gebruiken,
> of om geautomatiseerd grote hoeveelheden inhoud op te halen. Bij misbruik
> kunnen wij een account beperken of beëindigen.

**section5Body** (5. Aansprakelijkheid)
> Wij doen ons best de dienst goed en ononderbroken te laten werken, maar
> kunnen niet garanderen dat de dienst altijd foutloos of beschikbaar is, of
> dat de lesstof volledig vrij is van onjuistheden. Onze aansprakelijkheid is
> beperkt tot het bedrag dat je in de twaalf maanden voorafgaand aan de schade
> voor het abonnement hebt betaald. Deze beperking geldt niet bij opzet of
> bewuste roekeloosheid, en laat je dwingende rechten als consument onverlet.

**section6Body** (6. Toepasselijk recht)
> Op deze voorwaarden is Nederlands recht van toepassing. Als consument behoud
> je altijd de bescherming van het dwingende consumentenrecht van het land
> waar je woont. Geschillen kunnen worden voorgelegd aan de bevoegde
> Nederlandse rechter. Als consument in de EU kun je ook gebruikmaken van het
> Europese ODR-platform: https://ec.europa.eu/consumers/odr

**section7Body** (7. Contact)
> Vragen over deze voorwaarden? Neem contact op via **[EMAIL]**.
> van Duijn Data & Analytics, KVK 88627950.

### EN

**section1Body** (1. The service)
> Kamoe Bisa is an online learning environment for studying Indonesian. The
> service is provided by van Duijn Data & Analytics (trading as Kamoe Bisa),
> registered with the Dutch Chamber of Commerce under number 88627950. You need
> an account to use the service. Part of the material is available free of
> charge; full access requires a paid subscription.

**section2Body** (2. Subscription and payment)
> The subscription costs €7 per month or €56 per year. All prices include VAT.
> The subscription renews automatically at the end of each period until you
> cancel. Payments are processed by Stripe; we never receive or store your card
> details. If a payment fails, access to paid content may be suspended
> temporarily until payment succeeds.

**section3Body** (3. Cancellation)
> You can cancel at any time via Profile → Manage subscription. There is no
> notice period and no cancellation fee. After cancelling you keep access to
> paid content until the end of the period you have already paid for, after
> which access to that content ends. Your account and learning progress remain,
> and the free content stays available.

**section4Body** (4. Permitted use)
> Your account is personal and not intended to be shared. You may use the
> material to learn Indonesian yourself. You may not copy, distribute, publish
> or commercially exploit the content, or retrieve large amounts of it by
> automated means. We may restrict or terminate an account in case of misuse.

**section5Body** (5. Liability)
> We work to keep the service running well and without interruption, but cannot
> guarantee that it is always error-free or available, or that the learning
> material is entirely free of inaccuracies. Our liability is limited to the
> amount you paid for the subscription in the twelve months preceding the
> damage. This limitation does not apply in cases of intent or deliberate
> recklessness, and does not affect your mandatory rights as a consumer.

**section6Body** (6. Governing law)
> These terms are governed by Dutch law. As a consumer you always retain the
> protection of the mandatory consumer law of your country of residence.
> Disputes may be brought before the competent Dutch court. As an EU consumer
> you may also use the European ODR platform:
> https://ec.europa.eu/consumers/odr

**section7Body** (7. Contact)
> Questions about these terms? Contact us at **[EMAIL]**.
> van Duijn Data & Analytics, Dutch Chamber of Commerce no. 88627950.

---

## Refund Policy

### NL

**section1Body** (1. Opzeggen van je abonnement)
> Je kunt je abonnement op elk moment opzeggen via Profiel → Abonnement
> beheren. Opzeggen stopt de eerstvolgende automatische verlenging. Je houdt
> toegang tot de betaalde onderdelen tot het einde van de periode die je al
> hebt betaald.

**section2Body** (2. Restitutie)
> Omdat je bij opzegging de reeds betaalde periode gewoon kunt blijven
> gebruiken, betalen wij die periode in beginsel niet terug. Werkt er iets niet
> zoals het hoort, of is er per ongeluk dubbel of onterecht afgeschreven, neem
> dan contact met ons op — dat lossen wij op. Bij een technisch probleem dat
> ons is aan te rekenen en waardoor je de dienst wezenlijk niet hebt kunnen
> gebruiken, kijken wij naar een passende terugbetaling.

**section3Body** (3. Herroepingsrecht (EU, 14 dagen))
> Als consument in de EU heb je normaal gesproken 14 dagen bedenktijd om een
> online aankoop te herroepen. Kamoe Bisa is digitale inhoud die direct na
> betaling beschikbaar is. Bij het afrekenen vraag je ons uitdrukkelijk om
> direct te beginnen met de levering en bevestig je dat je daarmee je
> herroepingsrecht verliest zodra de levering is gestart. Wil je je bedenktijd
> behouden, begin dan niet met de betaalde onderdelen en neem binnen 14 dagen
> contact met ons op; wij betalen dan het volledige bedrag terug.

**section4Body** (4. Contact)
> Vragen over restitutie? Neem contact op via **[EMAIL]**. Wij reageren
> binnen 14 dagen.

### EN

**section1Body** (1. Cancelling your subscription)
> You can cancel at any time via Profile → Manage subscription. Cancelling
> stops the next automatic renewal. You keep access to paid content until the
> end of the period you have already paid for.

**section2Body** (2. Refunds)
> Because you keep using the period you have already paid for after cancelling,
> we do not generally refund that period. If something is not working as it
> should, or you were charged twice or in error, contact us — we will put it
> right. Where a technical problem attributable to us has meaningfully
> prevented you from using the service, we will consider an appropriate refund.

**section3Body** (3. Right of withdrawal (EU, 14 days))
> As an EU consumer you normally have 14 days to withdraw from an online
> purchase. Kamoe Bisa is digital content made available immediately after
> payment. At checkout you expressly ask us to begin supply immediately and
> acknowledge that you lose your right of withdrawal once supply has begun. If
> you wish to keep your withdrawal period, do not start using the paid content
> and contact us within 14 days; we will refund you in full.

**section4Body** (4. Contact)
> Questions about refunds? Contact us at **[EMAIL]**. We respond within 14
> days.

---

## Where I'd get a professional check

1. **Refund §3 — the withdrawal-right waiver.** This is the one that matters.
   Under the EU Consumer Rights Directive a consumer only loses the 14-day
   withdrawal right for immediately-supplied digital content if they give
   **prior express consent** *and* **acknowledge losing the right**, and the
   trader must be able to evidence both. My wording is the standard shape, but
   whether your checkout actually *collects and records* that consent is a
   configuration question, not a copy question — **enable Stripe Checkout's
   terms-of-service consent collection** so it is captured per purchase.
   Without that, the clause may not hold and refunds could be owed on request.
2. **Liability cap (Terms §5).** Standard, but consumer law limits how far a
   cap can go; worth a sanity check.
3. **The contact email.** Not a legal nicety — an EU trader must give a
   contact address before purchase, and it is currently `<<USER TO FILL>>`.

## Also still to do

- Replace `lastUpdated` ("12 juli 2026") with the real publication date.
- Remove `placeholderNotice` and the yellow `Alert` in `Terms.tsx` /
  `Refunds.tsx` once the copy is approved.
- Consider adding entity + KVK to the page footer, since EU distance-selling
  rules require trader identification to be readily available.
