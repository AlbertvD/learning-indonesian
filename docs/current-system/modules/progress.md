---
module: progress
surface: src/components/progress/ + src/pages/Progress.tsx
last_verified_against_code: 2026-07-09
status: stable
---

# progress — the Voortgang UI module

The learner's "reflect" surface: read-only views over `lib/analytics` that show where a learner's vocabulary / grammar / morphology sit on the mastery ladder, what's slipping, and how it's growing. **This module renders; it never writes** — every number comes from an analytics reader (`lib/analytics/mastery`, `lib/analytics/engagement`) or the mnemonics port. The one write in the whole surface is `upsertMnemonic`, and that happens inside `MnemonicWorkshop` (the `mnemonics` module), not here.

> Rewritten to the after-state by the hub redesign
> (`docs/plans/2026-07-09-voortgang-hub-redesign.md`, PR "voortgang-hub-redesign").
> The prior state (5-tab `PillSegmented` strip + `JouwIndonesischHero` +
> `MasteryJourney` chevron funnel) is `PR #408`'s changelog, superseded here.

## 1. Public interface (what `pages/Progress.tsx` composes)

`Progress.tsx` is a single `/progress` route, hub-vs-detail switched by
`?tab=woorden|grammar|morfologie|skills|time` — the same idiom `Lessons.tsx`
uses for Leren (`?v=`) and `Ontdek.tsx` for its two surfaces. No sub-routes, no
redirect: every existing deep-link (`StreakBar`, `Dashboard`, `Login`/`Landing`
`?next=`) already carries `?tab=`, so nothing needed to migrate.

- **Mobile, no (or an unknown) `?tab=`** → the **hub**: `PageHeader` "Jouw
  leervoortgang" + a `SimpleGrid` stack of five `feature` `ListCard`s
  (`Progress.tsx:104-166`, mirrors `Ontdek.tsx`'s mobile landing), each `to`
  its own `?tab=` and a **live-summary subtitle** derived from the same
  readers the detail panels use (`loadHubSummaries`, `Progress.tsx:44-64`) —
  one guarded `Promise.all` fetch, each reader individually `.catch`-guarded
  so one failing reader degrades only its own card to no subtitle (never a
  blocking notification, never losing the other four cards).
- **A known `?tab=`** (mobile or desktop) → that detail, with **`ProgressNav`**
  (`components/nav/ProgressNav.tsx`) — a thin wrapper over the shared
  `SurfaceNav` (desktop = persistent switcher row, mobile = "← Terug naar
  Voortgang" back link), `activeKey` derived from the `?tab=` search param
  (NOT the pathname — all five details share the one `/progress` route,
  unlike Leren's Affix/Uitspraak which are separate routes).
- **Desktop, no `?tab=`** → lands straight on the Woordenschat detail with the
  persistent `ProgressNav` — no separate hub screen, exactly like desktop
  `/leren` lands on Lessen (`Lessons.tsx:434-457`).

| Tab | Body |
|---|---|
| woorden | `VocabMasteryPanel` (wraps `MasteryFunnelPanel kind=vocabulary` + the at-risk `ListCard` + `StubbornWordsCard` footer + `TroublesomeWordsSheet`) + `GrowthCurveCard bucket=vocabulary` |
| grammar | `MasteryFunnelPanel kind=grammar` (+ `GrammarPatternList` footer when a lesson is picked) + `GrowthCurveCard bucket=grammar` |
| morfologie | `MasteryFunnelPanel kind=morphology` + `GrowthCurveCard bucket=morphology` |
| skills | `SkillModeGapsCard` |
| time | `TimeComparisonCard` + `DurabilityCard` |

## 2. The components

- **`MasteryFunnelPanel`** (`MasteryFunnelPanel.tsx`) — the shared vocab/
  grammar/morphology wrapper. Owns the **"Alle lessen" per-lesson `Select`
  filter** + the `getMasteryFunnels(userId)` fetch, passes the scoped
  `MasteryFunnel` to `MasteryLadder`, and renders an optional `footer(scope)`
  render-prop. Also renders the **at-risk `ListCard`** directly (below the
  ladder) when the caller supplies `onAtRiskClick` AND the scoped funnel has
  `at_risk > 0` — wrapped in Mantine's `UnstyledButton` (the same "make a
  ListCard tappable without a `to`" idiom Dashboard's troublesome-words nudge
  already uses, `pages/Dashboard.tsx:287-293`) rather than a new prop on the
  `ListCard` primitive itself.
- **`MasteryLadder`** (`MasteryLadder.tsx`, replaces the retired
  `MasteryJourney`) — the achievement headline ("Je kunt al {strengthening+
  mastered} {unitLabel} begrijpen en gebruiken" + a subline splitting
  {learning+introduced} practising vs. {mastered} fully mastered) above a
  four-stop connected ramp — **Net ontmoet / Aan het oefenen / Kun je
  gebruiken / Zit erin** — grey→tamarind→gold→green, entirely `main.tsx`
  token-driven (`MasteryLadder.module.css`, `bespoke-css-ok` — domain viz
  geometry, no primitive models this shape). Renders **no** at-risk
  affordance; that lives in the sibling `ListCard` above.
- **`VocabMasteryPanel`** (`VocabMasteryPanel.tsx`) — the Woordenschat
  wrapper: owns `getTroublesomeWords` + the `TroublesomeWordsSheet` open-state,
  passes `onAtRiskClick` down to `MasteryFunnelPanel`, renders
  `StubbornWordsCard` as the panel footer.
- **`StubbornWordsCard`** (`StubbornWordsCard.tsx`) — the "Moeilijke woorden"
  grid: `getStubbornWords` → `MnemonicWordChips` grid + an `InsightTips`
  (area `stubborn`). Renders null when empty. Unchanged by this redesign.
- **`GrowthCurveCard`** + **`TrendChart`** — "Groei over tijd": a **single
  climbing area** (`strengthening + mastered` per week, from the existing
  `getFunnelSeries`) — replaced the prior 4-line rung chart + legend-toggle
  (the `introduced`/`learning` lines structurally *decline* as words graduate,
  which read as "clunky"; a single usable-words area only ever climbs, and
  matches what the ladder headline above it already calls "usable").
  `TrendChart` gained an optional per-series `area: true` flag (a fading
  gradient fill under the line, contiguous non-null runs only) — additive, so
  `DurabilityCard`'s single-series (non-area) chart is unaffected.
- **`SkillModeGapsCard`** (Vaardigheden), **`TimeComparisonCard`** +
  **`DurabilityCard`** (Tijd), **`GrammarPatternList`**, **`InsightTips`** (the
  💡 study-tips accordion — now consumed only by `StubbornWordsCard` and
  `SkillModeGapsCard`, since the at-risk `InsightTips` mount was retired with
  `MasteryJourney`).

## 3. Internal flow

For a funnel tab: `MasteryFunnelPanel` fetches `getMasteryFunnels` once →
`deriveMasteryFunnel` groups evidence by `source_ref`, labels each word via
`weakestLabel(caps.map(labelForCapability))` (masteryModel.ts:440), tallies
rungs → `MasteryLadder` renders the headline + ramp; the panel itself renders
the at-risk `ListCard` alongside it. The per-lesson `Select` re-scopes to
`byLesson`. Growth: `getFunnelSeries` gives 12 weekly funnel snapshots →
`GrowthCurveCard` derives one `strengthening + mastered` value per week and
plots the single area.

The hub: `Progress.tsx`'s `loadHubSummaries` calls `getMasteryFunnel`
(all-lessons, unscoped) and `engagement.practiceTime` once each, in parallel,
each independently guarded — mirroring the retired `JouwIndonesischHero`'s
`loadHero` shape (PR #408).

## 4. Invariants

- **Read-only.** No component here writes learner state. Mastery labels are
  the canonical `labelForCapability`/`weakestLabel`/`isCapabilityMastered`
  (masteryModel.ts / mastered.ts) — never re-derived locally.
- **Vocab funnel = 2 live modes.** A word's rung is the weaker of
  `recognise_meaning_from_text_cap` + `produce_form_from_meaning_cap`; retired
  caps are excluded (`capabilityRowsByIds` filters `retired_at IS null`).
- **At-risk self-heals** and is not drillable (2026-06-12 decision); the
  mnemonic sheet is *encoding* help, not retrieval practice.
- **The at-risk card is vocab-only.** `onAtRiskClick` is only ever supplied by
  `VocabMasteryPanel`; grammar/morfologie panels pass none, so
  `MasteryFunnelPanel` never renders the card for them regardless of their
  `at_risk` count.
- **`?tab=` is URL-addressable** so Home cells / login-`next` deep-link
  (`StreakBar`, `Dashboard`, `Landing`/`Login` tests) — reused unchanged by
  this redesign, no migration.
- **Desktop never sees the hub.** `showHub = isMobile && tab === null`
  (`Progress.tsx`) — the hub is a mobile-only landing, matching Leren/Ontdek.

## 5. Seams

- **Upstream**: `lib/analytics/mastery` (funnels, series, stubborn/
  troublesome, weekly movement), `lib/analytics/engagement` (streak, practice
  time), `lib/mnemonics` (via `MnemonicWordChips`/`TroublesomeWordsSheet`),
  `components/nav/SurfaceNav` (the shared switcher `ProgressNav` wraps),
  `components/page/primitives` (`PageContainer`/`PageBody`/`PageHeader`/
  `ListCard` — the hub composes these directly, no bespoke page-local CSS).
- **Downstream / siblings**: `components/mnemonics/` (workshop, chips, sheet —
  the module `progress/` imports *down* into), `components/page/primitives/`
  (chrome).
- **Consumed by**: `pages/Progress.tsx` (only). Home deep-links in via
  `?tab=`.

## What this spec does NOT cover

The mnemonic workshop internals (`docs/current-system/modules/mnemonics.md`),
the analytics derivations themselves (`analytics-mastery.md`,
`analytics-engagement.md`), and the page-framework primitives
(`page-framework-status.md`).
