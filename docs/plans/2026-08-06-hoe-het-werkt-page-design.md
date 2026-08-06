---
status: draft
reviewed_by: []
---

# `/hoe-het-werkt` — explaining the model

Brainstormed with the owner 2026-08-06. A public page explaining how Kamoe Bisa
actually works: you choose what enters your sessions, everything you choose flows
into one daily session, and each item advances through four named stages.

Sibling of `2026-08-06-onboarding-goals-design.md`. That one asks the learner
questions; this one answers theirs. No data-model impact, so it does not need the
`data-architect` gate.

---

## 1. The problem

The activation model is genuinely non-obvious, and it is the likeliest source of
"this app is broken".

Every other language app hands the learner a linear path. Kamoe Bisa asks them to
*activate* lessons and collections, and **practises nothing that has not been
activated**. A learner who signs up, browses, and opens a session gets an empty
one — which reads as a fault, not as a design.

Two further behaviours look like bugs without the model:

- A word the learner "already knows" reappears days later. That is FSRS working
  exactly as intended, and it is the core of the product's value.
- The session mixes material from several lessons and collections at once, rather
  than working through one lesson at a time.

None of this is explained anywhere today.

## 2. What the page says, in order

**One — you choose what you learn.** Lessons and word lists are activated by you.
Nothing enters your practice until you activate it. This is the bit nobody
expects, so it goes first and gets the plainest language.

**Two — everything flows into one daily session.** Not a queue per lesson. One
session, assembled from everything active, with the scheduler choosing what is
due today. Ten minutes is the whole commitment.

**Three — each word moves through four stages.** Using the vocabulary the app
already shows on Voortgang, so the page and the product agree:

> **Inprenten → Oproepen → Productief → Onderhoud**

And the sentence that pre-empts the most common confusion: *a word comes back
just before you would have forgotten it — that is the point, not a mistake.*

**Four — where things live.** A short map: Leren, Ontdek, Lezen, Voortgang. Not a
feature tour; a map for someone who already wants one.

## 3. Public, at `/hoe-het-werkt`

Owner decision 2026-08-06. Three reasons:

- It answers a question a prospective buyer has *before* signing up. Gating an
  explanation of how the product works behind the product is backwards.
- `docs/marketing/content-plan.md` wants exactly this page under Sheridan's
  Big 5 — "problems" and "what you get".
- It is linkable and quotable, which is how the primary persona hears about
  anything (`channels.md`).

Joins the existing public set: `/`, `/leenwoorden`, `/privacy`, `/voorwaarden`,
`/restitutie`. Add to `public/sitemap.xml` and the `Allow` list in
`public/robots.txt`.

## 3b. It is marketing, not only support (owner, 2026-08-06)

The mechanic is a differentiator, not an implementation detail. Every competitor
hides the scheduler behind a streak counter and a progress bar; here the pipeline
is named and visible on the learner's own Voortgang page. "We bring a word back
just before you forget it" is a claim anyone can make. **Inprenten → Oproepen →
Productief → Onderhoud, with your own words sitting in each stage, is evidence.**

Consequences for this page:

- **Tone is explanatory AND persuasive.** It should read as "here is how this
  works, and why that is better", not as a manual. It is a reason to buy.
- **Linked prominently from the landing page**, not buried in the footer — a
  "Zo werkt het" link from the existing `howKicker` band, which currently
  describes the same three ideas in one line each and can go deeper here.
- **`positioning.md` §2 gains an attribute**: a visible, named mastery pipeline.
  Distinct from "FSRS on capabilities", which is a mechanism claim; this is about
  the learner being able to SEE it, which is what makes it persuasive.

⚠️ The honesty constraint tightens as this becomes marketing. The stages are real
and displayed, but they describe *scheduling state*, not guaranteed competence.
Open question 1 below matters more now, not less: marketed carelessly, "Productief"
reads as a promise that the learner can produce the word on demand, and the first
person who finds they cannot will trust nothing else on the page.

## 4. Linked from three places, forced from none

- The first-run checklist (`FirstRunChecklist`) — where a confused learner is.
- The main menu — reachable at day three, which is when the question actually
  arrives.
- The landing page footer — for someone still deciding.

Explicitly NOT a modal, not a forced step, not a carousel. `FirstRunChecklist`
already does discovery-by-doing from the dashboard hero; a forced tour would be a
second mechanism for the same need, and tours are clicked through rather than
read.

## 5. Non-goals

- Not a feature tour of every surface.
- Not a replacement for `FirstRunChecklist`.
- No screenshots in v1 — they rot with every UI change, and this page must not
  become a maintenance tax. Describe the model in words; the model is stable, the
  chrome is not.

## 6. Supabase Requirements

### Schema changes
N/A — static content page, no reads or writes.

### homelab-configs changes
- [ ] PostgREST — N/A
- [ ] Kong CORS — N/A
- [ ] GoTrue — N/A
- [ ] Storage — N/A

### Health check additions
None in `check-supabase*`. One addition to `scripts/check-cloud-config.ts`
behaviour section: `/hoe-het-werkt` returns 200, alongside the existing SPA
deep-link check — cheap, and it catches the route being lost in a refactor.

## 7. Open questions for review

1. Does the four-stage explanation risk over-promising precision? The stages are
   real and displayed, but a learner may read them as guarantees of progress.
2. Should it carry the free-tier boundary (lessons 1–3 free) or leave pricing to
   the landing page? Repeating a price in a second place is a drift risk — the
   €7→€9 change touched four surfaces already.
