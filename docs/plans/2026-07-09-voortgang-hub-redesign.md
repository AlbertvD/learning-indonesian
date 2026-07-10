---
status: implementing
implementation: branch feat/voortgang-hub-redesign
reviewed_by: []
grounded_against:
  - docs/research/2026-07-06-voortgang-analytics-review.md   # "structurally excellent, emotionally flat" — this is the fix
  - docs/target-architecture.md            # lib/analytics LOCKED read-only; no fold constraint on components/progress
  - src/pages/Ontdek.tsx / src/pages/Lessons.tsx             # the mobile hub pattern being adopted (PageHeader + ListCard feature/tone)
  - src/components/page/primitives/ListCard.tsx              # the primitive the hub + at-risk card reuse
  - docs/current-system/modules/analytics-mastery.md         # getMasteryFunnels / getFunnelSeries reused unchanged
supersedes:
  - docs/plans/2026-07-09-voortgang-jouw-indonesisch-hero.md  # the flat hero (PR #408) — removed by this redesign
---

# Voortgang redesign — adopt the Ontdek/Leren hub language

## Goal

Make Voortgang look like the rest of the app. Today it stacks five different visual idioms (chevron funnel, orange at-risk box, 💡 tips accordion, chip grid, 4-line chart) behind a 5-tab strip that overflows the phone. The owner's bar: **consistent + professional**, matching the Ontdek/Leren surfaces — not a bespoke analytics design. Approved via a rendered mockup (`scratchpad/voortgang-redesign-mock.html`).

## The restructure — hub + detail on the SAME route, the Leren shape

Adopt **Leren's routing idiom** (`Lessons.tsx:377,385` — a `?v=`/`?tab=` param on one route + a Nav switcher), NOT new sub-routes. Voortgang already uses `?tab=` (`Progress.tsx:37-39`) and every deep-link targets it, so there is **nothing to migrate and no redirect** (both reviewers: `/progress/:topic` + a legacy redirect is self-created mechanism / omission-test fail).

- **`/progress` with no (or unknown) `tab`** → the **hub** (mirrors `Ontdek.tsx` mobile): `PageHeader` "Jouw leervoortgang" + a `SimpleGrid` stack of **five `feature` `ListCard`s**, each icon + `tone` + title + a **live-summary subtitle**, tapping sets `?tab=` → the detail:

  | Card | tone | live subtitle (derived) | sets |
  |---|---|---|---|
  | Woordenschat | accent | "je kunt 306 woorden gebruiken" (vocab strengthening+mastered) | `?tab=woorden` |
  | Grammatica | teal | "18 patronen onder de knie" | `?tab=grammar` |
  | Morfologie | sage | "9 affixen kun je toepassen" | `?tab=morfologie` |
  | Vaardigheden | rail | "herkennen · gebruiken · luisteren" | `?tab=skills` |
  | Tijd | gold | "8 dagen op rij · 42 min deze week" | `?tab=time` |

- **`/progress?tab=<x>`** → that detail, with a **`ProgressNav`** — a thin wrapper over the SHARED **`SurfaceNav`** (`src/components/nav/SurfaceNav.tsx`), exactly like `OntdekNav` (`components/nav/OntdekNav.tsx`) and `LerenNav`. `SurfaceNav` already provides **desktop = switcher row, mobile = a "← terug naar Voortgang" back link** — so the back-navigation matches every other section menu with zero bespoke code. `ProgressNav` supplies `backTo="/progress"`, `backLabel` (new `T.nav.backToProgress`), `activeKey` from `?tab=`, and the 5 topic `items` (each `to="/progress?tab=<x>"`).
- The existing `?tab=` values are **reused unchanged** (`woorden|grammar|morfologie|skills|time`), so `StreakBar`/`Dashboard`/login-`next` deep-links resolve straight to the right detail. An unknown value (the stale `?tab=woordenschat` in `Landing.test`/`Login.test`) falls back to the hub — no redirect layer.
- The 5-tab `PillSegmented` strip is **deleted** (overflow bug dies structurally). The flat `JouwIndonesischHero` + its test are **removed** (superseded; numbers duplicated the funnel — owner's call).
- **Desktop** mirrors Leren: `/progress` (no tab) lands on the Woordenschat detail with the persistent `ProgressNav` switcher (no separate hub screen), exactly as desktop `/leren` lands on Lessen.

## The Woordenschat detail (the template)

**`MasteryFunnelPanel` is KEPT** (it owns the "Alle lessen" per-lesson filter + the `getMasteryFunnels` fetch — no silent feature drop) and **`VocabMasteryPanel` is KEPT and repurposed** as the Woordenschat detail body (it already owns the `getTroublesomeWords` fetch + sheet open-state — nothing to re-home). Inside `MasteryFunnelPanel`, the only swap is `MasteryJourney` → `MasteryLadder`. The detail renders, in the shared card/`SectionHeading` language:

1. **Headline** (approved copy, rendered by `MasteryLadder`): **"Je kunt al {strengthening+mastered} woorden begrijpen en gebruiken"**, subline "{learning+introduced} nog aan het oefenen · {mastered} beheers je al volledig". ("begrijpen" = `recognise_meaning_from_text_cap`, "gebruiken" = `produce_form_from_meaning_cap` — the two live vocab modes; a word is at a rung when the *weaker* mode is, `weakestLabel`.)
2. **The mastery ladder** — NEW `src/components/progress/MasteryLadder.tsx` (sibling to `FunnelBars`/`GrowthCurveCard`, **NOT** a `page/primitives/` primitive — it's a domain analytics viz): the four rungs relabeled to real-life ability — **Net ontmoet** (introduced) / **Aan het oefenen** (learning) / **Kun je gebruiken** (strengthening) / **Zit erin** (mastered) — on one connected ramp `grey→tamarind→gold→green`. Replaces `MasteryJourney`'s chevrons + headline. The at-risk box is **removed from the ladder** (it moves to §3).
3. **At-risk** — an existing `ListCard` (tone `gold`, tappable → the `TroublesomeWordsSheet` that `VocabMasteryPanel` already owns — slice-2 behaviour preserved): "47 woorden om even op te frissen" with the at-risk study-tip folded into its subline. This **retires the `InsightTips` accordion at THIS site only** (`InsightTips` stays in `StubbornWordsCard` + `SkillModeGapsCard`).
4. **Moeilijke woorden** — the existing **`StubbornWordsCard`** (its "Moeilijke woorden" title; internally wraps `MnemonicWordChips` + `getStubbornWords` + its own `InsightTips`), the `VocabMasteryPanel` footer, unchanged.
5. **Growth** — `GrowthCurveCard`/`TrendChart` simplified to a **single-series area**: "Woorden die je kunt gebruiken" = per-week `strengthening + mastered` from the existing `getFunnelSeries` (`GrowthCurveCard.tsx:73`) — no new reader; deletes the `hidden`-set + 4-line legend machinery (`GrowthCurveCard.tsx:45,89-95,119-132`). Structurally climbs (words flow into "usable"), so no more "Aan het leren going down."

## The other four details

- **Grammatica / Morfologie** — same `MasteryFunnelPanel` (kind=grammar/morphology; its lesson filter kept) with `MasteryLadder` swapped in + its existing `GrammarPatternList` footer + growth curve. Same real-life language. (No at-risk `ListCard` — `onAtRiskClick` is vocab-only; the panel simply passes none.)
- **Vaardigheden** — the existing `SkillModeGapsCard` under the `PageHeader`+`ProgressNav` shell (content unchanged for v1).
- **Tijd** — the existing `TimeComparisonCard` + `DurabilityCard` under the shell (content unchanged for v1).

## Deep-module / primitive reuse (stay INSIDE the framework — no bespoke CSS)

- Hub, at-risk card, section shells = **existing** `PageContainer`/`PageBody`/`PageHeader`/`SectionHeading` + `ListCard feature`/`tone`. No new page-framework primitive.
- New **`ProgressNav`** switcher = a `components/progress/` component mirroring `OntdekNav`/`LerenNav` (segmented switch over the 5 topics, drives `?tab=`).
- New **`MasteryLadder`** = `components/progress/` (domain viz, next to `MasteryJourney`'s slot). Its ramp geometry lives in `MasteryLadder.module.css` driven ENTIRELY by tokens; the ramp-stop colors (grey/tamarind/gold/green) are `main.tsx` tokens (matching `--rail-gold`/`--teal` at `main.tsx:94,237`), not hardcoded in the module. (Note the repo's bespoke-card-CSS hook — keep the module token-driven with the escape-hatch comment.)
- `GrowthCurveCard`/`TrendChart` = simplified in place (single-series area).
- `MasteryJourney` is **retired** (only render site is `MasteryFunnelPanel.tsx:82`; its `onAtRiskClick` seam relocates to the §3 at-risk `ListCard`, owned by `VocabMasteryPanel`).
- Analytics readers unchanged (LOCKED read-only): `getMasteryFunnels`, `getFunnelSeries`, `getTroublesomeWords`, `getSkillModeGaps`, `engagement.practiceTime`.

## Copy (i18n, nl+en)
Headline + subline; the four ladder labels; the five hub-card titles + summary templates; the at-risk card subline (fold the current at-risk study tip). Real-life, active, second-person voice ("je kunt…", "aan het oefenen").

## Out of scope
- I2–I7 analytics ideas; per-topic content redesign beyond the shell for Vaardigheden/Tijd (v1 wraps them).
- Monotonic "ever-reached" growth series (needs a rung-crossing log) — v1 plots the per-week usable snapshot.

## Rollout
One branch `feat/voortgang-hub-redesign` → PR → merge → CI+image → Portainer recreate. Frontend-only, **no migration**. Render + screenshot the built pages BEFORE deploy (owner sign-off gate). Rollback = redeploy prior image.

## Supabase Requirements
### Schema changes — **None.** Pure UI restructure + composition of existing read-only readers. RLS/grants N/A.
### homelab-configs — N/A (no new surface).
### Health checks — N/A. Coverage: hub render test (5 cards + derived summaries); hub-vs-detail switch by `?tab=` (unknown value → hub); `MasteryLadder` render + headline copy; at-risk `ListCard` opens the sheet (slice-2 preserved); growth single-series derivation (usable = strengthening+mastered per week).

## Test impact (enumerate — checklist #13)
- **Deleted** with their components: `JouwIndonesischHero.test.tsx`, `MasteryJourney.test.tsx`.
- **Updated**: `MasteryFunnelPanel.test.tsx` (renders `MasteryLadder` not `MasteryJourney`), `VocabMasteryPanel.test.tsx` (at-risk `ListCard` is the sheet trigger), `Progress`/routing tests (hub-vs-detail by `?tab=`).
- **Unchanged** (deep-links keep `?tab=`, so no migration): `dashboard-redesign.test.tsx:219` (`?tab=woorden`), `Login.test.tsx`, `Landing.test.tsx` (`?tab=woordenschat` → hub fallback, still lands on `/progress`).
- **New**: `MasteryLadder.test.tsx`, `ProgressNav.test.tsx`, hub render test.

## Docs (same PR — module-spec drift is a code regression)
- **Before-spec**: write `docs/current-system/modules/progress.md` FIRST (the diff target for this refactor — `components/progress/` is a named UI deep module with no spec yet).
- `docs/current-system/modules/analytics-mastery.md` — the `MasteryFunnelPanel`/`MasteryJourney` shared-panel description → `MasteryLadder`.
- `docs/current-system/modules/mnemonics.md` — `VocabMasteryPanel` repurposed; the `onAtRiskClick` seam now on the at-risk `ListCard`.
- `docs/current-system/modules/analytics.md` — Dashboard `?tab=` deep-links (unchanged, note the hub landing).
- `docs/current-system/page-framework-status.md` — Progress row (hub adopts `ListCard`); `MasteryLadder`/`ProgressNav` are `components/progress/`, not new page-framework primitives.
- Reconcile `docs/plans/2026-07-09-voortgang-jouw-indonesisch-hero.md` frontmatter → `shipped` (PR #408) so the `supersedes` chain is clean.

## Review note
Read-model only, no schema/reader-contract change → **data-architect not required**. Round-1 folded: routing → single `/progress` + `?tab=` (no sub-routes/redirect); `MasteryFunnelPanel`+`VocabMasteryPanel` kept (lesson filter + sheet preserved); `MasteryLadder`/`ProgressNav` in `components/progress/` not `page/primitives/`; `StubbornWordsCard`/`InsightTips` consumers clarified; Docs + before-spec + test-impact added.
