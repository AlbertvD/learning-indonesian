# UI Polish Ticket

**Date:** 2026-05-01
**Status:** Open. Captured from a mobile-session audit (2026-05-01 morning) and a follow-up Voortgang/Dashboard visual review (2026-05-01 evening). Not a spec — a punch list.

## Scope

Visual / interaction polish across Dashboard, Voortgang, and the mobile session view. Specifically the issues that don't get rebuilt by the analytics-tier work (which will redo most of the Voortgang and Dashboard *content* cards as part of Forks 1 and 2 in `2026-05-01-capability-analytics-tier-decisions.md`).

This ticket covers the things that survive a content rebuild — header chrome, layout rhythm, copy bugs, mobile fit.

## Punch list

### Dashboard

1. **Pluralization bugs in "Planning van vandaag"** — "1 herhalingen" should be "1 herhaling", "1 herinneringsvragen" should be "1 herinneringsvraag", "1 nieuw" stays. Three labels render plural even when count is 1.
   - Where: probably in the new capability-aware planning component (search for `herhalingen` / `herinneringsvragen` in `src/`).
   - Fix: pluralize-aware label helper or `count === 1 ? singular : plural` inline.

2. **"DEZE WEEK" 4-up cards: structural inconsistency.** Three of four (Consistentie / Woordenschat / Achterstand) render `header → ring → ratio → status pill`. The Herinnering card replaces the ratio with the parenthetical "(Voorlopig)". Looks like different content shape sitting next to its siblings.
   - Where: `dashboard-redesign.test.tsx` references; component is the recall-quality goal card inside the GoalStatCard family.
   - Fix: keep ratio rendering in all four; surface "(Voorlopig)" as a status-pill prefix or a separate caption, not as a structural replacement.

3. **"DEZE WEEK" 4-up cards: vertical rhythm squashed.** Header is hard against the top edge, ring against bottom-of-header, ratio against bottom-of-ring, status pill against the bottom card edge. Compare to Voortgang Details cards which breathe more.
   - Fix: increase top/bottom card padding, add gap between ring and ratio, gap between ratio and status pill.

4. **Welcome line: email is the fallback name.** "Welkom terug, testuser@duin.home" — testuser has no `profile.fullName`, so the email shows. Once real users register, this happens to anyone who doesn't fill their name in. Should fall back to "Welkom terug" alone or "Welkom terug, leerder".
   - Where: Dashboard hero / `PageHeader` action.
   - Fix: name fallback chain: `profile.fullName ?? <localized "leerder"> `, and only render the comma+name when a non-email name exists.

5. **Top-right streak hard against viewport edge.** "0 dagen achter elkaar" sits with ~8px right margin, while H1 has ~24–32px left margin. Asymmetric.
   - Fix: align right padding to match the page-content left padding.

### Voortgang

6. **Details 4-up: inconsistent metric value font sizes.** Five different scales for the same kind of element across cards sitting next to each other:
   - `2.4` (Gem. Stabiliteit) — huge
   - `0` (Zwakke Woorden Gered) — medium-large
   - `100%` / `0%` (Nauwkeurigheid) — medium, split into two columns inside one card
   - `15.6 s/antwoord` (Reactietijd) — cramped, with "s/antwoord" as a tiny suffix
   - Fix: standardize to one metric-value text scale and one secondary unit/suffix scale.
   - Note: `Gem. Stabiliteit` is being replaced by `Geheugen` (retrievability) in Fork 1 and `Nauwkeurigheid` numbers will likely change shape too. Do this typography pass *while* rebuilding those cards rather than twice.

7. **Leerpijplijn chevron crowding.** The `25` in Inprenten is rammed up against the orange chevron pointing into the next column. Numbers feel pinned to the column right edge.
   - Note: Leerpijplijn is being replaced wholesale by the per-direction mastery panel (Fork 2). Skip this fix; the new component should design around its own padding.

8. **"7-Daagse Voorspelling" empty-state card.** Title tucked top-left tight to the corner; centered "Geen reviews gepland de komende 7 dagen" floats in a sea of empty card. Asymmetric padding.
   - Fix: bring title and empty-state copy into proper vertical rhythm (header padding from top, body either centered with full padding all sides OR top-aligned with consistent gap).

9. **Subtitle legibility.** `Indonesisch → NL/EN`, `dagen — na 2.4d daalt retentie onder 90%`, `gem. reactietijd deze week` are very low-contrast gray on dark background. Probably `--text-tertiary` getting too dim.
   - Fix: bump contrast on subtitle/caption tokens until they pass WCAG AA against the dark card background.

10. **`s/antwoord` glyph ambiguity.** In `15.6 s/antwoord`, the "s/" glued next to the decimal "15.6" can read as `15·6 s` with the period interpreted weirdly. A non-breaking space or a different separator (`15.6 sec / antwoord`) would parse cleaner.

### Mobile session view

(From `session-mobile-empty.png` and `session-mobile-bottom.png` captured 2026-05-01 14:33–14:34.)

11. **Progress bar labels overflow.** `0%` and `0/2` labels at the top progress bar sit very close to the viewport edges — the `0%` looks clipped on the left.
    - Fix: add horizontal padding to the labels OR move them inside the bar.

12. **"Rustig opbouwen" floating chip with orange stripe.** Above the SAMENVATTING card, there's a partial card with an orange/yellow accent stripe on the left and the text "Rustig opbouwen" — visually disconnected from anything around it.
    - Investigate: what is that supposed to be? Looks like a stuck/clipped view of the previous card's bottom, or an exercise option card whose container got cut off when scrolling. Could be a CSS overflow / container-bounding bug.

13. **Card padding and stacking on mobile.** The two main cards (DAGELIJKSE LEERROUTE / HERHALING 1 VAN 1) stack vertically with a small gap. The exercise prompt at the bottom of the second card ("Beantwoord deze herhaling. De reviewverwerker slaat...") is a wall of text in the same card as the answer affordance. Worth considering if prompt+affordance should split into separate cards on small screens.

14. **Bottom nav z-index check.** Bottom nav (Home / Lessen / Podcasts / Voortgang / Profiel) sits over the content area on mobile. Confirm content has bottom-padding equal to nav height so users can scroll to the last card without it being hidden under the nav. Looking at `session-mobile-bottom.png`, the SAMENVATTING card's "Rond af na de kaarten" button sits with comfortable space above the nav, so this looks OK currently — but worth a once-over.

## Sequencing notes

Items that **collide with the analytics-tier rebuild** (Fork 1 / Fork 2) — do these visual fixes during that rebuild, not standalone:
- (6) Details 4-up font scales — most cards rebuild
- (7) Leerpijplijn chevron — whole component replaced

Items that **survive the rebuild** and can ship as a standalone polish pass:
- (1) Pluralization bugs — Planning van vandaag is a new component, fix doesn't conflict
- (2) DEZE WEEK Herinnering card structure — sibling-shape consistency, persists across content changes
- (3) DEZE WEEK vertical rhythm — same
- (4) Email-as-name fallback — cross-cutting concern, persists
- (5) Streak right-padding — chrome
- (8) 7-Daagse Voorspelling empty-state padding — chart card stays
- (9) Subtitle contrast — token-level fix, applies everywhere
- (10) `s/antwoord` glyph spacing — Reactietijd card stays as-is in current scope
- (11) Mobile progress bar overflow
- (12) Mobile floating chip mystery — needs investigation
- (13) Mobile card stacking
- (14) Mobile bottom-nav padding (verify)

## Acceptance criteria for the standalone polish PR

- (1) Three count labels in Planning van vandaag pluralize correctly for `count === 1`.
- (2) All four DEZE WEEK ring cards render the same structure (header / ring / ratio / status pill); "(Voorlopig)" appears as a pill modifier or caption, not in place of the ratio.
- (3) Vertical padding in DEZE WEEK cards matches Voortgang Details cards (visually verified).
- (4) `Welkom terug, ${displayName}` falls back gracefully when `profile.fullName` is absent.
- (5) Top-right streak right-padding equals page-content left-padding.
- (8) 7-Daagse Voorspelling empty-state has symmetric padding around the title and centered copy.
- (9) Subtitle/caption tokens hit WCAG AA contrast on dark background.
- (10) `15.6 s/antwoord` renders unambiguously.
- (11) Mobile progress bar labels never visually clip the viewport.
- (12) "Rustig opbouwen" chip is identified — fixed if buggy, intentional if not (with justification).
- (13) Mobile session card stacking has comfortable vertical rhythm; prompt+affordance split decision documented.
- (14) Mobile content has bottom-padding ≥ nav height (verified across `/`, `/session`, `/lessons`, `/voortgang`, `/profile`).

## Where to ship

Single PR `feat(ui): polish pass on dashboard, voortgang, and mobile session`. Browser smoke required for each item on the acceptance list.

## Out of scope

- Anything that gets rebuilt by the analytics-tier work (Forks 1/2 cards). Address there.
- Major UX redesigns (e.g., splitting prompt+affordance into separate cards on mobile). Item 13 is flagged for design-decision but the fix here is just the immediate "comfortable rhythm" tweak.

## Reference screenshots

- `dashboard-after-pr2-smoke.png` — Dashboard, post-PR-2, no tooltip overlay
- `voortgang-after-pr3.png` + `voortgang-bottom.png` — Voortgang full-page
- `session-mobile-empty.png` — mobile session top
- `session-mobile-bottom.png` — mobile session bottom

(Screenshots are in repo root, untracked. Move to `docs/plans/page-framework-screenshots/ui-polish-2026-05-01/` if shipping the polish PR formally.)
