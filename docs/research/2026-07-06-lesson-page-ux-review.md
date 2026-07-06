# Lesson page look & feel review — from document to guided experience

> Review date 2026-07-06. Method: code inspection + live visual walkthrough of lesson 5 in the
> browser (dev server `/preview/lesson/5`, desktop 1280×900 + mobile 390×844). Companion to the
> Voortgang review of the same date.

## 1. What the page is today (measured, lesson 5 as representative)

- **One scroll document: 11.2 screens on desktop, 20.6 screens on mobile.** Six H2 sections (intro → pronoun grammar → possessive schema → vocabulary → culture → practice CTA), 11 H3 sub-points.
- **Zero navigation affordances.** Code-confirmed across the bespoke pages (~12.4k lines, 19 lessons): no TOC, no anchors, no tabs/accordion/stepper, no scroll-spy, no progress indicator, no position memory. The only way through is scrolling past everything.
- **The one action is at the bottom.** `Klaar om te oefenen?` + the activation gate + practice CTA — the page's entire conversion moment — sits below 20 mobile screens of content.
- **Architecture note:** pages are bespoke per lesson (`src/pages/lessons/lesson-N/Page.tsx`, registry + router; lesson-renderer spec = retired, bespoke-is-the-renderer). Any navigation fix must therefore be **shared chrome**, not 19 hand edits.

## 2. Honest visual grades (from the walkthrough)

| Region | Grade | Notes |
|---|---|---|
| **Hero** | A | Genuinely good: image treatment, level/lesson chips, editorial intro, thesis pull-quote. Keep. |
| **Grammar point cards** (P.01–P.07) | B | Clean two-column pattern (explanation left, audio examples right) — but 7+ screens of *visually identical* dark cards; monotone, no rhythm, nothing signals progress through them. |
| **Vocabulary grid** | D | The weakest region: 40+ cards in a 4-col grid with ragged heights, mostly-empty cards, no grouping, no order logic visible, tiny audio buttons. Reads as an undifferentiated wall. |
| **Culture blocks** | B+ | Nice editorial moments (the Sunda Kelapa → Jakarta chain is lovely). |
| **Practice CTA** | F for placement | Well-designed block, catastrophically positioned. |

**Root diagnosis: the page is a beautiful *document*, but learners need a *guided experience*.** Everything wrong follows from the document assumption: no orientation (where am I?), no segmentation (what's left?), no persistent action (what do I do?), no memory (where was I?).

## 3. Redesign direction — two phases

### Phase 1 — shared chrome, ZERO per-page edits (the big win cheap)

All three items are one shared component each, mounted by the router/wrapper around every bespoke page, driven by the rendered DOM — no changes to the 19 page files:

1. **Sticky section nav with scroll-spy.** A slim pill-bar (top, under the app header) generated from the page's H2s at mount (`Verhaal · Grammatica · Schema · Woorden · Cultuur · Oefenen`), current section highlighted, tap = smooth-scroll. Instantly answers "where am I / what's left / take me to X." (Mobile: horizontally scrollable pills — the Voortgang tab strip precedent.)
2. **Sticky practice bar.** A persistent slim bottom bar: lesson activation state + `Oefenen →` (the existing `PracticeActions`/`ActivationGate` logic lifted into it, single-owner hook already exists — `useLessonActivation`). The conversion moment becomes reachable from every scroll position. The bottom block stays as the full-detail version.
3. **Position memory.** Persist last scroll-section per lesson (localStorage); returning shows a small "Ga verder bij *Woorden*" chip. Cheap, disproportionate delight.

### Phase 2 — the chapter experience (target state, pilot first)

Convert the section sequence into **navigable chapters**: one section on screen at a time, a segmented progress header (● ● ○ ○ ○ ○), next/prev + swipe, per-chapter completion ticks feeding the position memory. This matches how the material is actually consumed (one section per sitting), makes 20 screens feel like 6 small pages, and gives every section an *ending* — a moment of progress. Vertical scroll remains within a chapter (chapters vary in length); "Oefenen" is the natural final chapter, ending the lesson on the action.

- Requires pages to expose section boundaries → a per-page (mechanical) refactor. **Pilot on ONE lesson** via the `lesson-page-designer` agent, validate the feel, then roll out lesson-by-lesson (the bespoke architecture actually helps here — no big-bang).
- Fold the **vocabulary redesign** into the same pass: replace the ragged grid with a compact grouped list (word · gloss · ▶) or themed sub-groups with a per-group "oefen deze woorden" link; equal-height rows; no empty-space cards.
- Grammar-card rhythm: alternate layout accents (numbered progress within the grammar chapter, occasional full-width example) so seven cards don't read as one wall. Ties to the grammar review's first-encounter rule card — the P.0x cards ARE the rule content.

### Explicitly rejected

- Accordion/collapse-all (hides content behind extra taps without giving progress semantics; worse for reading flow than chapters).
- A separate "lesson mode" toggle (two renderings of the same page = drift).
- Paginating mid-section (chapters follow content boundaries, not pixel heights).

## 4. Sequencing & cost

Phase 1 is small (three shared components + wrapper mounting, page-framework primitives, `feedback_ui_default_to_existing_framework`) and transforms navigation for all 19 lessons at once — do it first, ship it alone. Phase 2 is the real redesign: spec → ui-designer/page-lab iteration → one-lesson pilot → rollout. The vocab-grid fix rides Phase 2 (it needs the section refactor anyway).

Screenshots from the walkthrough: `lesson5-top.png` (hero), `lesson5-mid.png` (grammar cards), `lesson5-vocab.png` (vocab grid), `lesson5-mobile-bottom.png` (buried CTA) — session artifacts, not committed.
