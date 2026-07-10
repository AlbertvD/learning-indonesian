---
status: shipped
implementation: PR #408
merged_at: 2026-07-09
implementation_paths:
  - src/components/progress/JouwIndonesischHero.tsx
  - src/components/progress/MasteryFunnelPanel.tsx
  - src/components/progress/MasteryJourney.tsx
  - src/components/progress/VocabMasteryPanel.tsx
  - src/pages/Progress.tsx
reviewed_by: [staff-engineer, architect]
review_notes: |
  staff-engineer SOUND-WITH-CHANGES + architect APPROVE-WITH-CHANGES (2026-07-09) → folded:
  - Tempo tile CUT for v1 (unsound: vocab-only numerator ÷ all-kinds reachedMastered
    denominator, single noisy week). Ship 3 honest tiles; pace = follow-up w/ a proper
    vocab-only multi-week rate.
  - Reuse StatCard (label/value/trailing); ring flourish skipped for v1 (coverage shows
    "N / 1000" as value) — only grid layout is bespoke CSS.
  - Fixed reader signatures: getMasteryFunnel(userId).vocabulary, engagement.practiceTime
    (userId, tz), getCollectionsOverview(userId). Timezone threaded (Progress.tsx:35).
  - Double-read of the funnel (hero + Woordenschat tab) ACCEPTED for v1, noted; follow-up
    may hoist the funnel fetch to Progress.tsx.
  - Slice 2 seam: behavior-only onAtRiskClick prop on MasteryJourney via MasteryFunnelPanel;
    the sheet + getTroublesomeWords + fetchMnemonicsForRefs + opened-state live in a vocab-tab
    wrapper, NOT threaded through MasteryJourney. Home-mnemonic slice 1 is SHIPPED (PR #406/#407),
    so no blocker. mnemonics.md §5 adds Voortgang as a 2nd TroublesomeWordsSheet host.
  data-architect NOT required: read-model only, no schema / reader-contract change.
grounded_against:
  - docs/research/2026-07-06-voortgang-analytics-review.md   # implements I1 (hero) + §2 coverage stat
  - docs/target-architecture.md            # lib/analytics LOCKED + read-only (:55,:179,:642)
  - docs/current-system/modules/analytics-mastery.md         # getMasteryFunnel / getTroublesomeWords (reused)
  - docs/current-system/modules/analytics-engagement.md      # engagement.practiceTime().streakDays (reused)
  - docs/current-system/modules/mnemonics.md                 # TroublesomeWordsSheet host list (§5, to update)
  - src/components/page/primitives/StatCard.tsx              # the tile primitive reused
---

# Voortgang — the "Jouw Indonesisch" hero strip (I1) + at-risk → sheet (slice 2)

## Goal

Give the Voortgang page the *felt-progress* moment the analytics review found missing (*"structurally excellent, emotionally flat"*): one always-visible identity band **above the tab strip** answering "how far have I come?" at a glance — three honest numbers, all from existing read-model calls, no new schema/RPC. Plus (bundled) turn the dead-end at-risk count into an action.

## Part A — the hero strip (three tiles)

| Tile | value (big) | label (caption) | Source (existing reader) |
|---|---|---|---|
| **Woorden gekend** | `612` | "woorden die je kent" | `getMasteryFunnel(userId)` → `.vocabulary.mastered + .vocabulary.strengthening`. Climbs across all 2,523 items — the number that never saturates. |
| **Alledaags Indonesisch** | `612 / 1000` | "meest voorkomende woorden" | `getCollectionsOverview(userId)` → the `kind==='frequency'` collection with the largest `rankCutoff` (1000) → `knownWords / totalWords`. |
| **Streak** | `8` | "dagen op rij" | `engagement.practiceTime(userId, timezone).streakDays`. Same value the Home StreakBar shows. Shows `0` honestly (not hidden). |

- **Tempo (pace) is CUT for v1** — its only honest form needs a vocab-only weekly mastered-rate averaged over several weeks; `getWeeklyMovement().reachedMastered` mixes vocab+grammar+morphology and is a single noisy week. Deferred to a follow-up with a proper rate model.
- **Coverage decision (verified 2026-07-09):** the plain top-1000 ratio, NOT a frequency-mass-weighted %. Only the top-1000 words carry `frequency_rank` in the live DB (1,523 items are `NULL`), so the ratio is the honest free number `get_collections_overview` already computes.

### Design
- **New component** `src/components/progress/JouwIndonesischHero.tsx` (+ a grid-only `.module.css`), rendered in `Progress.tsx` **above** the `PillSegmented` strip, inside the `user &&` block. A short "Jouw Indonesisch" heading + a responsive grid of **three `StatCard`s** (`src/components/page/primitives/StatCard.tsx`: `value` = big number, `label` = the caption). The ring flourish is skipped for v1 (coverage shows `612 / 1000` as its value) — reuse the primitive, don't build a ring.
- **One `Promise.all`** of the three existing readers on mount (timezone from `Intl…resolvedOptions().timeZone`, already at `Progress.tsx:35`); non-blocking — a compact skeleton until resolved, tabs never wait (mirror Dashboard's read pattern). Each tile degrades independently (coverage `—/1000` if the frequency collection read is empty).
- **Known double-read (accepted, v1):** the hero's `getMasteryFunnel` and the Woordenschat tab's `getMasteryFunnels` (`MasteryFunnelPanel.tsx:47`) both hit `allLearnerEvidence` on landing. Accepted as a minor cost; a follow-up may hoist the funnel fetch into `Progress.tsx` and pass it to both.

## Part B — slice 2: un-dead-end the at-risk box

(Approved in `docs/plans/2026-07-09-home-mnemonic-weak-words-surface.md` § Slices; home-mnemonic slice 1 is SHIPPED — PR #406/#407 — so this is unblocked.)

- **Trigger (behavior-only):** add an optional `onAtRiskClick?: () => void` to `MasteryJourney` (`MasteryJourney.tsx:59-70`) that makes its existing "aandacht nodig" box a `<button>` when supplied; `MasteryFunnelPanel` passes it straight through. Grammar/Morfologie tabs pass **no** callback → the box stays an inert count (troublesome words are vocab-only after PR #407).
- **Sheet ownership (NOT threaded through MasteryJourney):** a small **vocab-tab wrapper** owns the action — it fetches `getTroublesomeWords(userId)` + `fetchMnemonicsForRefs` (exactly as Dashboard does), holds the opened-state, renders `TroublesomeWordsSheet` with the **full** troublesome set (at-risk ∪ stubborn, with has-hook dots — edit included, per slice-2's "full set with dots"), and passes `onAtRiskClick={() => setOpened(true)}` down to `MasteryFunnelPanel`. `MasteryJourney` only triggers; it never sees `entries`.

## Out of scope
- I2–I7 (heatmap, forecast, milestones, CEFR, sparklines, best-moment) — later.
- Tempo/pace tile and the frequency-mass coverage % (B) — deferred (see above).
- Any change to the underlying readers (this only composes them).

## Rollout
- One branch `feat/voortgang-hero-and-atrisk` → one PR → squash-merge → CI+image build → Portainer container recreate (per `docs/process/deploy.md`). Frontend-only, no migration. Rollback = redeploy prior image (`sha-<prev>`).

## Supabase Requirements
### Schema changes
- **None.** Pure composition of existing read-only readers (`getMasteryFunnel`, `getCollectionsOverview`, `engagement.practiceTime`, and — slice 2 — `getTroublesomeWords` + `fetchMnemonicsForRefs`). No new tables/columns/RPCs; RLS/grants **N/A** (existing).
### homelab-configs changes
- [ ] PostgREST / Kong / GoTrue / Storage: **N/A** — no new surface.
### Health check additions
- **N/A**. Coverage = a `JouwIndonesischHero` derivation/render test (each tile from mocked reader values; streak `0`; coverage empty-state) + a slice-2 test (at-risk box is a button and opens the sheet only when `onAtRiskClick` is supplied).

## Docs (same PR)
- `docs/current-system/modules/mnemonics.md` §5 — add **Voortgang (at-risk box)** as a second host of `TroublesomeWordsSheet` (currently lists Home only).
