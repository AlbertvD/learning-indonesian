---
status: draft
reviewed_by: []
supersedes: []
---

# Landing page — rewrite and redesign

Worked through with the owner 2026-08-16. Started as runbook **Phase 6**
("explain the product") and grew: the owner's verdict on the current page was
that it *"looks AI generated and a bit clunky, does not really describe the app,
how it works, why we think it works better than Duolingo, and how it compares to
a dedicated word app like Anki."*

Nothing here is built. This file exists so the next session starts from the
decisions rather than re-deriving them.

Sibling of `docs/plans/2026-08-06-hoe-het-werkt-page-design.md` (the public
`/hoe-het-werkt` page, still unbuilt, still `status: draft`). That page carries
the depth; this one carries the argument.

---

## 1. What is wrong with the page today

Diagnosed against the live page 2026-08-16 (screenshot at 1440×900), not from
source.

- **It matches a known template.** Warm cream ground (`#FBF8F2`) + high-contrast
  serif display + terracotta accent is the single most common AI-generated
  palette going. ⚠️ Nuance found later: this is a *documented brand decision*
  (`2026-07-03-desktop-program-design.md`), not an accident. The real fault is
  narrower — see §5.
- **`01 / 02 / 03` markers imply a sequence that isn't one.** "Read a lesson →
  practise → watch vocabulary grow" is not a numbered process anyone follows
  once. The numbering decorates rather than encodes.
- **Every band has identical rhythm** — kicker, serif h2, hairline rule, columns.
  Four in a row, so nothing is emphasised. This is the "clunky".
- **One concrete artifact on the whole page** — the `pasar` card in the hero,
  which is the best thing there (real phonetics, real gloss, real "next review
  in 3 days"). Everything below it is abstract claims.
- **The hero is a retention claim.** *"Leer Indonesisch dat blijft hangen"* is a
  promise about the scheduler, aimed at a lapsed app-hopper. The primary persona
  is not shopping for a better algorithm.
- **No Duolingo argument** beyond one buried line about loanwords, and **no Anki
  comparison at all** — though Anki is the sharper of the two.

## 2. Settled decisions

| # | Decision | Date |
|---|---|---|
| D1 | Primary persona is **Robin, the partner** — not Marijke. `personas.md` §1 | 2026-08-16 |
| D2 | Narrative is the **owner's own story**, first person, using his name (Albert van Duijn) | 2026-08-16 |
| D3 | **Do not say "indie developer"** — owner's words: *"no need to call myself an indie developer"*. It reads amateur to someone about to pay €79 | 2026-08-16 |
| D4 | Completeness is sold as **assembly**, never as a feature list. `positioning.md` §1 | 2026-08-16 |
| D5 | Children of the couple are **deferred** — no product behind it (no seats, adult content) | 2026-08-16 |
| D6 | The four mastery stages **stay**, with a framing sentence that they describe *scheduling state*, not competence | 2026-08-16 |
| D7 | The page carries **no pricing and no free-tier boundary** — owner: *"its just to market the features and what learning experience you will get, not about pricing"* | 2026-08-16 |

### D2 in full — the narrative

The owner's own account, which is why it can be told plainly:

> I wanted to learn my partner's language properly. I ended up with Anki, a
> textbook, a reader, a podcast app and a grammar site open at once. So I built
> the version where that is already assembled — grounded in the science of
> learning as far as I could take it — so you don't have to walk that path.

This does three jobs at once: it explains breadth before listing it, the visitor
recognises themselves, and it replaces social proof — which cannot be used,
since there are zero customers and the marketing rules forbid inventing any.

## 3. Proposed spine

1. **The story, as the hero.** Not a retention claim. Five tools open at once.
2. **The stack you would otherwise assemble.** Name the five, say what each
   costs in setup and upkeep, then collapse them into one. Grammar, stories,
   affix trainer, mnemonics and the scheduler get named here as *replacements*.
3. **How it actually works.** Runbook Phase 6's content: you choose what enters
   practice, everything lands in one daily session, words return just before you
   would forget them. It now has a reason to exist — it is the part that
   replaces Anki, minus the deck-building.
4. **Grounded in the science.** From the `/hoe-het-werkt` draft §3c, honesty
   rules intact: principles and our own decisions, never efficacy numbers, never
   implied endorsement. Strongest item is not a citation but an audit — ADR 0007
   records that 30.1% of reviews were same-session repeats of the same word,
   worst case three tests on *apa kabar?* in 31 seconds, and it was changed
   because the research said so. Anyone can cite Karpicke; almost nobody can
   show what they changed because of him.
5. **Why Dutch → Indonesian specifically.** The pair, §4.
6. **What is in it, price, sign up.**

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

Checkable — Duolingo teaches formal register only (market research §1) — and it
answers Anki in the same breath: Anki would schedule `lelah` perfectly well, if
you had built that card. You would never think to build the `capek` one.

Verified live 2026-08-16: 173 loanwords (`loan_source_nl`), 66 register pairs
(`register='informal'` with `register_counterpart`). Real examples pulled from
the DB: `capek`/`lelah` (moe), `banget`/`sekali` (heel erg), `duit`/`uang`
(geld), `bentar`/`sebentar` (even), `dikit`/`sedikit` (een beetje).

## 5. Visual direction — OPEN

Not settled. Two candidate readings, and the second is probably right:

- **Rebrand.** Move off cream/terracotta entirely.
- **Use the brand you already have.** ⭐ The palette is a *documented decision*:
  warm paper `#FBF8F2`, green-black ink, tamarind `#C94F2B`, and a deep
  batik-green rail `#1F3D36` described in the plan as *"the one bold move; the
  brand constant"*. The landing page uses that green **once, at the very
  bottom** (`Landing.module.css:498`, the pricing band) — so the signature
  arrives after four bands of cream, once the visitor has already decided what
  the page looks like. Bringing it forward is less work than a rebrand and more
  coherent than inventing a new palette.

**Typography is no longer a blocker** — the display font was a system stack and
is now self-hosted Newsreader (PR #475). Every heading in the product had been
resolving to Iowan Old Style / Palatino Linotype / Noto Serif depending on
platform. If the headings should have a *visibly* distinct voice, that is now a
one-line swap (Fraunces has considerably more character).

Rejected: **a morphology/word-building motif** (`ajar → belajar → pelajaran`).
It is the product's real moat, but the owner's objection was decisive — *"its
not why people will want to learn the language"*. It explains why the product
works, not why anyone wants it. Keep it for `/hoe-het-werkt`, not the hero.

## 6. Open questions

1. **Visual direction** (§5) — bring the batik green forward, or rebrand?
2. **Photo of the owner?** Name is agreed (D2); a photo was not. It makes the
   story land harder and is his face on the internet. The design should leave a
   slot either way.
3. **How many doors?** `personas.md` argues for a hero plus clearly-labelled
   entrances for the other three, rather than one generic funnel. Not decided.
4. **Does the landing page absorb `/hoe-het-werkt`, or link to it?** Current
   assumption: link. The landing carries the argument, the page carries the
   depth and the research grounding.

## 7. Constraints that bind any build

- **Marketing honesty** (`personas.md`, `positioning.md`): never invent reviews,
  ratings, testimonials or learner counts — there are none. Never imply human
  narration; all audio is TTS. Cite principles and our own decisions, never
  efficacy numbers.
- **The register limit** — the coursebook dialogues are formal and touristy
  (lesson 2 is a businessman checking into a hotel). Promise *the register they
  actually use*, never *chat with your in-laws by week two*.
- **Public pages get static exports, never anon DB reads** — anon has no read
  grant on the `indonesian` schema, and that schema holds learner tables. Any
  live figure on this page must be a committed export, as `/leenwoorden` does.
- **The landing page is the sanctioned exception to the page framework**
  (`Landing.module.css` header) — light-only, own layout. Bespoke CSS is
  legitimate *here* and nowhere else.
- **No CDN fonts.** `font-src 'self'`; vendor into `public/fonts/`.
- **Free tier is lesson 1**, and the copy that advertises it is NOT
  machine-pinned (see roadmap § ENGINEERING). D7 keeps this page out of that
  problem by carrying no tier claim at all.

## 8. Supabase Requirements

### Schema changes
N/A — static marketing content. Any figure shown is a committed static export.

### homelab-configs changes
- [ ] PostgREST — N/A
- [ ] Kong CORS — N/A
- [ ] GoTrue — N/A
- [ ] Storage — N/A

### Health check additions
None in `check-supabase*`. If `/hoe-het-werkt` ships alongside, add its 200 to
the behaviour section of `scripts/check-cloud-config.ts`, as that page's own
spec §6 already proposes.
