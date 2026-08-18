---
status: implementing
implementation: PR #477
reviewed_by: []
supersedes: []
implementation_paths:
  - src/pages/Landing.tsx
  - src/pages/Landing.copy.ts
  - src/pages/Landing.module.css
  - src/__tests__/Landing.test.tsx
---

> **Built 2026-08-17 on branch `landing-page-rewrite`.** Flip to `shipped` with a
> `merged_at` when it lands on main. Every decision below was implemented as
> written except where §12 says otherwise — read that section before treating
> any part of this file as forward work.
>
> Reviewer sign-off was **deliberately skipped** (owner call, 2026-08-17). The
> `staff-engineer` → `architect` chain is the gate for architecture and schema
> work; this is marketing copy and CSS in the one file that is explicitly exempt
> from the page framework, so the architect lens had almost nothing to review.
> `reviewed_by` stays empty on purpose rather than by omission. The honesty
> constraints that DO bind this surface are enforced instead by tests
> (`Landing.test.tsx`) and by the `marketing` skill.

# Landing page — rewrite and redesign

Worked through with the owner 2026-08-16, decisions closed 2026-08-17. Started as
runbook **Phase 6** ("explain the product") and grew: the owner's verdict on the
current page was that it *"looks AI generated and a bit clunky, does not really
describe the app, how it works, why we think it works better than Duolingo, and
how it compares to a dedicated word app like Anki."*

**Scope, settled 2026-08-17: two pages, built together.** This page carries the
argument and links out to `/hoe-het-werkt`
(`docs/plans/2026-08-06-hoe-het-werkt-page-design.md`), which carries the depth.
That sibling spec is no longer a deferred draft — it ships in this effort, and
its two open questions were answered here (D6, D7).

---

## 1. What is wrong with the page today

Diagnosed against the live page 2026-08-16 (screenshot at 1440×900), then
re-checked against source 2026-08-17.

- **It matches a known template.** Warm cream ground (`#FBF8F2`) + high-contrast
  serif display + terracotta accent is the single most common AI-generated
  palette going. ⚠️ Nuance: this is a *documented brand decision*
  (`2026-07-03-desktop-program-design.md`), not an accident. The fault is
  narrower — see D8.
- **`01 / 02 / 03` markers imply a sequence that isn't one.**
  `Landing.tsx:172-186` numbers "Read a lesson → practise → watch vocabulary
  grow". Nobody follows that as a numbered process once. The numbering decorates
  rather than encodes.
- **Every band has identical rhythm** — kicker, serif h2, hairline rule, columns
  (`.lead` + `.leadKicker` + `.leadTitle`, applied at `Landing.tsx:144`, `:168`,
  `:190`). Four in a row, so nothing is emphasised. This is the "clunky".
- **One concrete artifact on the whole page** — the `pasar` card
  (`Landing.tsx:95-129`), which is the best thing there: real phonetics, real
  gloss, real "next review in 3 days". Everything below it is abstract claims.
- **The hero is a retention claim.** *"Leer Indonesisch dat blijft hangen"*
  (`Landing.copy.ts:22-23`) is a promise about the scheduler, aimed at a lapsed
  app-hopper. The primary persona is not shopping for a better algorithm.
- **No Duolingo argument** beyond one buried line about loanwords
  (`bridgeEdge`, `Landing.copy.ts:39`), and **no Anki comparison at all** —
  though Anki is the sharper of the two.

## 2. Settled decisions

| # | Decision | Date |
|---|---|---|
| D1 | Primary persona is **Robin, the partner** — not Marijke. `personas.md` §1 | 2026-08-16 |
| D2 | Narrative is the **owner's own story**, first person, using his name (Albert van Duijn) | 2026-08-16 |
| D3 | **Do not say "indie developer"** — owner's words: *"no need to call myself an indie developer"*. It reads amateur to someone about to pay €79 | 2026-08-16 |
| D4 | Completeness is sold as **assembly**, never as a feature list. `positioning.md` §1 | 2026-08-16 |
| D5 | Children of the couple are **deferred** — no product behind it (no seats, adult content) | 2026-08-16 |
| D6 | The four mastery stages **stay**, with a framing sentence that they describe *scheduling state*, not competence | 2026-08-16 |
| D7 | The page's **argument** carries no pricing and no free-tier boundary — owner: *"its just to market the features and what learning experience you will get, not about pricing"*. Scope clarified in D9 | 2026-08-16 |
| **D8** | **Visual direction: invert the ground.** The story hero sits ON the batik green `#1F3D36`, full-bleed; cream returns below. No rebrand, no new colour vocabulary | 2026-08-17 |
| **D9** | **The pricing band stays**, at the bottom, unchanged in substance. D7 governs the *argument*, not the page's factual footer. Rationale below | 2026-08-17 |
| **D10** | **`/hoe-het-werkt` ships in this effort** and the landing links to it prominently. No dangling link, no absorbed depth | 2026-08-17 |
| **D11** | **Hero plus a doors band** — Robin owns the hero; three labelled entrances serve Marijke, Thijs and Sanne. `personas.md` §"How the four change what we build" | 2026-08-17 |

### D2 in full — the narrative

The owner's own account, which is why it can be told plainly:

> I wanted to learn my partner's language properly. I ended up with Anki, a
> textbook, a reader, a podcast app and a grammar site open at once. So I built
> the version where that is already assembled — grounded in the science of
> learning as far as I could take it — so you don't have to walk that path.

This does three jobs at once: it explains breadth before listing it, the visitor
recognises themselves, and it replaces social proof — which cannot be used,
since there are zero customers and the marketing rules forbid inventing any.

### D9 in full — why the pricing band survives D7

Found during grounding 2026-08-17. A literal reading of D7 ("the page carries no
pricing") contradicts three things:

1. **The spec's own spine.** §3 item 6 reads "What is in it, price, sign up."
2. **A pre-deploy gate.** `scripts/check-cloud-config.ts:237-238` asserts
   `landingCopy.nl.pricingBody` and `landingCopy.en.pricingBody` each quote
   `PRICING.monthly.display` and `PRICING.annual.display`. It runs inside
   `make pre-deploy`, so deleting the band turns the merge gate red.
3. **A deliberate EU distance-selling assertion.** `Landing.test.tsx:84-92`
   asserts the body matches `/gratis/i`, `/€9/` and `/€79/`, with the comment
   *"The two facts a buyer needs before signing up, and which the terms and the
   server-side gate both independently commit to."*

The honest reconciliation is that D7 is about **voice**, not about deleting a
price a buyer is entitled to see before signing up. So: the argument never
argues on price, the hero never mentions a tier, and the closing band still
states €9 / €79 and the free lesson exactly as it does today.

⚠️ If the owner did mean *delete the price entirely*, that is a legitimate call
but it is not free: `check-cloud-config.ts` §DECLARED and two `Landing.test.tsx`
assertions must change in the same PR, and the pre-purchase price disclosure
moves to `/register`. Raise it before building, not after.

## 3. The spine

Top to bottom, with the ground each band sits on (D8):

| # | Band | Ground | Job |
|---|---|---|---|
| 1 | **The story, as the hero** | 🟩 green | Not a retention claim. Five tools open at once. `pasar` card stays, on green |
| 2 | **The stack you would otherwise assemble** | cream | Name the five, say what each costs in setup and upkeep, collapse them into one. Grammar, stories, affix trainer, mnemonics and the scheduler get named here as *replacements* |
| 3 | **The pair** — `lelah → capek` | cream | The signature (§4). Carries both the Duolingo and the Anki argument in two words |
| 4 | **The loanword bridge** | cream | Unchanged in substance from today (`Landing.tsx:143-165`). Recognition. Links `/leenwoorden` |
| 5 | **How it actually works** | cream | You choose what enters practice; everything lands in one daily session; words return just before you would forget them. Replaces the `01/02/03` band. Links `/hoe-het-werkt` |
| 6 | **Grounded in the science** | 🟩 green | §3c of the sibling spec, honesty rules intact. The ADR 0007 audit is the lead item |
| 7 | **The doors** | cream | D11 — three labelled entrances for the secondary personas |
| 8 | **Price and sign up** | 🟩 green | Today's pricing band, substance unchanged (D9) |

Green appears three times — hero, science, close — so it reads as the brand's
structural voice rather than a single closing flourish. Cream is the reading
ground in between. This is the whole answer to "every band has identical
rhythm": the page now alternates ground, and the two heaviest arguments (the
story, the science) are the ones that sit on the dark.

## 4. The signature — "the pair"

Both uncopyable assets have the same shape, and both are live in the DB:

| | | |
|---|---|---|
| loanwords | `kantoor` → `kantor` | you are not starting from zero |
| register pairs | `lelah` → `capek` | this is what they actually say |

Two words and a relationship between them, repeated at different scales down the
page. It comes out of the content rather than being applied on top of it.

It also lets the Duolingo argument be **shown** rather than claimed:

> Duolingo leert je **lelah**. Je schoonmoeder zegt **capek**.

Checkable — Duolingo teaches formal register only (`positioning.md` §1) — and it
answers Anki in the same breath: Anki would schedule `lelah` perfectly well, if
you had built that card. You would never think to build the `capek` one.

Verified live 2026-08-16: 173 loanwords (`loan_source_nl`), 66 register pairs
(`register='informal'` with `register_counterpart`). Real examples pulled from
the DB: `capek`/`lelah` (moe), `banget`/`sekali` (heel erg), `duit`/`uang`
(geld), `bentar`/`sebentar` (even), `dikit`/`sedikit` (een beetje).

⚠️ **Framing rule carries over from `positioning.md` §5**: say the Duolingo
contrast as a gain, never as a dismissal. Attack the gap, never the learner or
the tool they chose.

## 5. Visual direction — D8, invert the ground

**Resolved 2026-08-17: use the brand you already have, and lead with it.**

The palette is a documented decision — warm paper `#FBF8F2`, green-black ink,
tamarind `#C94F2B`, and a deep batik-green rail `#1F3D36` described in
`2026-07-03-desktop-program-design.md` as *"the one bold move; the brand
constant"*. Today the landing page uses that green **once, at the very bottom**
(`Landing.module.css:495-507`, the pricing band) — so the signature arrives
after four bands of cream, once the visitor has already decided what the page
looks like.

Inverting fixes the diagnosis at its cause. The "AI-generated" verdict forms in
the first screenful; that is exactly the screenful the green now owns.

**The tokens already exist** and are global, not landing-local — `src/main.tsx:122-126`:

```
--rail-surface:        #1F3D36
--rail-surface-raised: #274A41
--rail-ink:            #EDE7D7
--rail-ink-muted:      #91A89A
--rail-hairline:       rgba(237,231,215,0.13)
```

So a green band costs no new colour vocabulary. What it *does* cost is a set of
on-green variants for elements that today assume a cream ground — see §7.

**Typography is not a blocker** — the display font was a system stack and is now
self-hosted Newsreader (PR #475, `public/fonts/newsreader-latin-400-700.woff2`,
wired at `src/main.tsx:121`). A swap to a higher-character face (Fraunces) is a
one-line change plus a vendored woff2, deliberately **out of scope here**: change
one variable at a time, and the ground inversion is the variable being tested.

Rejected: **a morphology/word-building motif** (`ajar → belajar → pelajaran`).
It is the product's real moat, but the owner's objection was decisive — *"its
not why people will want to learn the language"*. It explains why the product
works, not why anyone wants it. It belongs on `/hoe-het-werkt`.

Rejected: **a rebrand.** It discards a documented decision, desyncs the landing
page from the app's `--rail-*` tokens and the `SunMark`, and is the most work of
the three candidates.

## 6. Resolved questions

| Was open | Resolution |
|---|---|
| **Visual direction** (§5) | D8 — invert the ground. Green hero, green science band, green close |
| **Photo of the owner?** | **Design the slot, leave it empty in v1.** The spec's own answer, and the layout must not depend on it: the hero works with a name and a signature line alone, and gains a portrait later without a reflow. Owner decides at copy review — it is his face, not a design variable |
| **How many doors?** | D11 — hero plus a doors band. Constrained by real routes, see below |
| **Absorb or link `/hoe-het-werkt`?** | D10 — link, and build it in this effort |

### D11's hard constraint — only one door can actually be a link

Checked against the router 2026-08-17:

- `/leenwoorden` is **public** (`src/App.tsx:130`). Marijke's door links out. ✅
- `/instaptoets` is a **`ProtectedRoute`** (`src/App.tsx:156-164`). A logged-out
  visitor clicking it is bounced by `ProtectedRoute.tsx:57` to `/?next=…` —
  straight back to the landing page they came from. ❌
- **Spreektaal has no public surface at all.** ❌
- And `Register.tsx:57` hard-navigates to `/welkom`, **ignoring `?next=`
  entirely** — so `/register?next=/instaptoets` would silently drop the intent.

Therefore: **the doors band is recognition copy, not a link menu.** One line of
"this is you" per persona; Marijke's links to `/leenwoorden` because that page
exists and is public; the other two resolve into the page's single existing CTA.

This is deliberate Minimum Mechanism. Making all three doors clickable means
teaching `Register.tsx` to honour `?next=` and building a public spreektaal
surface — two real features to make a marketing band's affordance literal. If
door click-through later proves to matter, that is the moment to build them, and
`personas.md` §"What would falsify these" already names the measurement.

## 7. What the build actually touches

Three files today; five after.

| File | Change |
|---|---|
| `src/pages/Landing.tsx` | Restructured to the §3 spine. The `pasar` deck and the loanword wall survive; the `01/02/03` flow and the 4-icon feature grid do not |
| `src/pages/Landing.copy.ts` | Substantially rewritten, NL-primary + EN. `pricingBody` keys keep their names — `check-cloud-config.ts` imports them by name |
| `src/pages/Landing.module.css` | On-green variants for `.btn`, `.linkQuiet`, `.leadKicker`, `.leadTitle`, `.spec`; a `.bandDark` ground; the existing `.pricing` rules generalise into it |
| `src/pages/HoeHetWerkt.tsx` + `.module.css` + `.copy.ts` | **New.** Per the sibling spec. Shares the landing's band chrome |
| `src/App.tsx` | One public route, placed with `/leenwoorden` (`:130`) |
| `public/sitemap.xml`, `public/robots.txt` | Add `/hoe-het-werkt` to both. Both files carry comments demanding they stay in step with the public routes — honour them |
| `src/__tests__/Landing.test.tsx` | Hero assertions change (`/Leer Indonesisch dat/` is gone). The invite-system, €9/€79, loanword-pairs, terms/refunds, `?next=` and lang-switch assertions must all survive unchanged |
| `scripts/check-cloud-config.ts` | Add `/hoe-het-werkt` → 200 to the behaviour section, as the sibling spec §6 already proposes |

### The marketing-figures drift risk — proposed, needs reviewer judgement

The page hardcodes `173` in three copy strings (`Landing.copy.ts:35,39,40`) and
will gain more counts under D4 (the assembly argument names grammar patterns,
texts, affix capabilities). Nothing pins any of them to the database. This is the
same class as the free-tier copy drift the roadmap flags at
`docs/roadmap.md` §ENGINEERING, and `check-cloud-config.ts` already pins pricing
copy for exactly this reason.

**Proposal:** one committed module, `src/lib/marketing/facts.ts` — the verified
counts, each with the query that produced it and the date it was checked —
imported by both public pages. Then one test asserting the copy quotes the
constants rather than literals.

**Omission test:** if omitted, a marketing count silently diverges from the
product and the page misleads a buyer, with no gate catching it. That is the
failure `positioning.md` §8 already legislates against ("Quote only counts that
are verified against the database, and say where the check lives").

**But it is new mechanism**, so it is flagged rather than assumed. A reviewer
should rule on whether the drift risk earns a module, or whether a comment plus
the existing manual re-verification discipline is enough. Note that constraint
§8 forbids reading these live — anon has no grant on `indonesian` — so a static
committed export is the only shape available either way.

## 8. Constraints that bind any build

- **Marketing honesty** (`personas.md`, `positioning.md`): never invent reviews,
  ratings, testimonials or learner counts — there are none. Never imply human
  narration; all audio is TTS (`Landing.copy.ts:12-14` states this as a standing
  rule). Cite principles and our own decisions, never efficacy numbers.
- **The register limit** — the coursebook dialogues are formal and touristy
  (lesson 2 is a businessman checking into a hotel). Promise *the register they
  actually use*, never *chat with your in-laws by week two*. `personas.md` §1
  marks this ⚠️ and it binds §4 of this spec directly.
- **The ADR 0007 audit must be quoted precisely.** Verified at source
  2026-08-17, `docs/adr/0007-receptive-before-productive-staging.md:11`: *"A
  36-hour audit on 2026-05-18 found 30.1% of reviews were part of a
  within-session repeat-group on the same `source_ref`, with the worst case
  being three different tests on apa kabar? in 31 seconds."* Copy may simplify
  `source_ref` to "the same word" but must not inflate the number or drop the
  36-hour window.
- **Public pages get static exports, never anon DB reads** — anon has no read
  grant on the `indonesian` schema, and that schema holds learner tables. Any
  live figure must be a committed export, as `/leenwoorden` does.
- **The landing page is the sanctioned exception to the page framework**
  (`Landing.module.css:1-10`) — light-only, own layout. Bespoke CSS is
  legitimate *here* and nowhere else. `/hoe-het-werkt` joins it under the same
  exception, sharing its chrome rather than inventing a third idiom.
- **No CDN fonts.** `font-src 'self'`; vendor into `public/fonts/`.
- **Bundle rule.** Landing copy is deliberately not in `src/lib/i18n.ts` — that
  module is entry-chunk-resident and the entry chunk must not grow
  (`Landing.copy.ts:1-10`). `/hoe-het-werkt` follows the same pattern: its own
  chunk-local copy module, lazy-loaded route.
- **Free tier is lesson 1** — and the copy that advertises it is NOT
  machine-pinned (see roadmap §ENGINEERING, and the sibling spec §7 Q2). D7/D9
  keep the *argument* out of that problem; the closing band states it once, in
  one place, as it does today.

## 9. Supabase Requirements

### Schema changes
N/A — static marketing content. Any figure shown is a committed static export;
no anon read is possible or attempted (constraint §8).

### homelab-configs changes
- [ ] PostgREST — N/A
- [ ] Kong CORS — N/A
- [ ] GoTrue — N/A
- [ ] Storage — N/A

### Health check additions
None in `check-supabase*`. One addition to `scripts/check-cloud-config.ts`
behaviour section: `/hoe-het-werkt` returns 200, alongside the existing SPA
deep-link check — cheap, and it catches the route being lost in a refactor. The
existing `DECLARED — pricing copy` assertions (`:237-238`) must keep passing
unchanged (D9).

## 10. Proposed slicing

Vertical, each independently shippable and reviewable:

1. **The ground.** `.bandDark` + on-green variants in `Landing.module.css`;
   `.pricing` re-expressed in terms of it. No copy change. Proves the inversion
   renders before any words are rewritten.
2. **Hero + story + stack + pair.** The argument, bands 1–3. Biggest copy write.
3. **How it works + science + doors.** Bands 5–7, plus the `/hoe-het-werkt`
   route, page and its sitemap/robots/health-check entries.
4. **Retire the old bands.** Delete the `01/02/03` flow and the 4-icon grid, and
   the CSS that served only them (`.flow*`, `.grid4`, `.g4*`). Last, so the page
   is never mid-cutover in main.

Slice 4 is the subtractive half of the "build the target and delete the old in
one move" default — it is separated only because slices 2 and 3 replace the two
bands independently, not because a parity rollout is intended.

## 11. Open for the owner at copy review

Not blocking the build; each has a designed slot and a default. **All three
shipped at their default** — change them by editing `Landing.copy.ts`, no
structural work needed.

1. **The portrait** (§6). Shipped with no photo: name and an italic signature
   line under the story. `.heroSignature` is sized so a portrait can be added
   beside it without a reflow.
2. **The exact hero sentence.** Shipped as *"Aan tafel schakelt iedereen over op
   Nederlands. Uit beleefdheid. En jij zit erbij en volgt het net niet."*
3. **Whether the doors band names the personas out loud.** Shipped naming them
   ("Je oma kwam uit Indië" / "Je gaat er wonen of werken" / "Je hebt al een app
   uitgespeeld") — recognition is the mechanism.

## 12. What was built differently, and what the build learned

Three deltas between this spec and the code. Nothing was dropped.

**The marketing-figures module (§7) was NOT built.** The spec proposed
`src/lib/marketing/facts.ts` and left the call to a reviewer. Resolved without
one: a test in `Landing.test.tsx` asserts the page quotes 173 and 66, which
closes the same drift at a fraction of the mechanism. A constants module would
have added an indirection whose only consumer is two copy strings. If a third
surface starts quoting counts, revisit — that is the point where the module
earns its keep.

**The honesty rules became tests rather than prose.** `Landing.test.tsx` and
`HoeHetWerkt.test.tsx` now assert what the copy may not say: no invented
reviews/ratings/learner counts, no human-narration claim, no efficacy figure, no
timebound fluency promise, and — on the explainer — no price and no missing
scheduling-state disclaimer. This was not in the spec. It is here because copy
drifts silently and a doc cannot fail a build.

**The step-number rail on `/hoe-het-werkt`** was added after looking at the
rendered page: a ~68ch measure left the right half of a 1440px screen empty. Not
a spec miss — the sort of thing only visible in a browser, which is the argument
for rendering early rather than reviewing prose.

### The process note worth keeping

This spec was written under the full architecture gate chain, and most of that
chain did not fit the work. The page is marketing copy and CSS in the one file
explicitly exempt from the page framework; there is no schema, no module seam,
no data flow. What DID pay off was reading the code first — it found the
`check-cloud-config.ts` pricing gate that a literal D7 would have turned red,
and the `ProtectedRoute` / `Register.tsx` routing facts that reduced the doors
band from a link menu to recognition copy. **Ground marketing work in the code;
route it through the marketing skill, not the architect.**
