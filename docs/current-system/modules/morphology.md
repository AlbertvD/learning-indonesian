---
module: morphology
surface: src/lib/morphology/
last_verified_against_code: 2026-07-08
status: stable
---

# morphology — the Affix Trainer runtime module

The capstone of the morphology program: an **affix-first lens** over the
morphology capabilities. Today everything is lesson-first, which scatters an
affix (meN- across L9/L13/L14/…); this module reorganises it — gathering each
affix's rule + word-family + progress into one place, sequenced by the research
teaching order — and launches a **scoped session** to practise an affix.

It is a **lens, not a scheduler**: filtered reads + a route. It renders, resolves,
gates, and commits **no** cards — "Practise <affix>" navigates to the existing
Session player filtered to the affix. Design: `docs/plans/2026-06-15-affix-trainer-capstone-design.md`.

## 1. Purpose & boundaries

- **Consumes** `lib/capabilities` (`AFFIX_CATALOG` + the affix metadata) and the
  typed `affixed_form_pairs` payload, per-cap FSRS state, lesson activation, and
  the root-vocab join (`learning_items`).
- **Reuses** `lib/analytics/mastery/masteryModel` pure derivers (`labelForCapability`,
  `weakestLabel`, `CapabilityMasteryEvidence`) — the per-affix roll-up invents no
  morphology-specific mastery word/threshold.
- **MUST NOT import `lib/session-builder`** (target-architecture Rule 7 — no
  back-edge). The session engine consumes the affix scope **by route**
  (`mode=affix_practice`), not the reverse. The per-affix tile is a per-affix cap
  roll-up that **never calls `funnelBucket`**, so it does not depend on the item-C
  analytics re-partition.

## 2. Public interface (`index.ts`)

| Symbol | File | Role |
|---|---|---|
| `getAffixCatalog(userId, client?)` | `catalog.ts` | Impure: load snapshot → sequenced catalog grid (`AffixCatalogTile[]`). |
| `buildAffixCatalog(snapshot, now?)` | `catalog.ts` | Pure: the grid, sorted by teaching `rank`. |
| `getAffixDetail(userId, affix, language, client?)` | `family.ts` | Impure: load snapshot → `AffixDetail \| null` (null = unknown affix). |
| `buildAffixDetail(snapshot, affix, language, now?)` | `family.ts` | Pure: rule card + word-family explorer + progress + practice scope. |
| `buildWordFamiliesForAffix(snapshot, affix, language, now?)` | `family.ts` | Pure: roots with a pair under the affix, each with its full cross-affix family. |
| `loadSelectedAffixScope(affix, client?)` | `adapter.ts` | Runtime resolver the **Session page** calls (mirrors `loadSelectedLessonScope`) — affix label → `{ selectedSourceRefs }` (ready+published) or `null`. |
| `affixPracticePath(affix)` / `AFFIX_SESSION_MODE` | `practice.ts` | The scoped-session route (`/session?mode=affix_practice&affix=…`). |
| `affixScopeFromSnapshot(snapshot, affix)` | `practice.ts` | Pure mirror of the resolver over a loaded snapshot. |
| `loadMorphologySnapshot(userId, client?)` | `adapter.ts` | The raw multi-table fan-out the pure folders fold. |

View-model types (`model.ts`): `AffixCatalogTile`, `AffixDetail`, `AffixProgress`,
`AffixProgressClassTally`, `AffixRuleSource`, `AffixExample`, `WordFamily`,
`DerivedForm`, `AffixScope`.

- **`AffixExample.derivedMeaning` / `DerivedForm.derivedMeaning`** (Fix 3) — the
  derived form's meaning in the learner's language, language-resolved in `family.ts`
  from `affixed_form_pairs.derived_gloss_nl/_en` with **no cross-language fallback**
  (Dutch UI shows Dutch or nothing). Null = un-glossed (valid during rollout).
  `gloss` itself is language-resolved too (catalog/family resolve `glossNl`/`glossEn`,
  not the terse English catalog passthrough).
- **`AffixProgress.recognition` / `.production`** (review P1, task A1) — the
  mastery-display split: two `AffixProgressClassTally` (`{masteredCount, totalCount}`)
  sitting alongside the existing weakest-wins-per-derivation fields (`label`,
  `funnel`, `masteredCount`, `practisedCount`, `totalCount` — unchanged, still
  drive the status pill and detail page). Classes are exhaustive for
  `word_form_pair_src`: **recognition** = `recognise_meaning_from_text_cap` +
  `recognise_word_form_link_cap`; **production** = `produce_derived_form_cap` +
  `produce_form_from_context_cap`. Tallied **per cap**, not per derivation — a
  confix derivation's meaning + formation caps land in different classes, so
  they are never weakest-wins-collapsed here the way the headline `label` is.
  Denominators are **content-fixed** (every cap of that class for the affix,
  regardless of learner unlock state); `production.totalCount === 0` means the
  production tier doesn't exist yet for that affix — the tile renders that as
  an em dash "—" (`LessonCard.tsx` `Bar`'s null path), never a false "0%".
  `catalog.ts:classTally` / `catalog.ts:rollUpProgress`.

## 3. Internal flow

```
adapter.loadMorphologySnapshot      affixed_form_pairs + their caps + states +
  (the only impure read)            lesson order + activation + grammar rule +
        │                           root learning_items + root caps
        ▼
catalog.buildEvidence (cap + state → CapabilityMasteryEvidence — mirrors masteryModel.toEvidence)
catalog.rollUpProgress (group by source_ref/derivation, weakest-wins, tally rungs;
                         ALSO tallies the two capability-type classes per cap —
                         recognition/production, review P1 — a separate,
                         content-fixed-denominator pass over the same cap list)
        │
        ├─► catalog.buildAffixCatalog   per catalog affix (sorted by rank): caps → progress + availability
        └─► family.buildAffixDetail     rule card (catalog allomorphClasses + allomorph_rule prose + intro
                                        lesson/pattern) + families (cross-affix per root, productive flag,
                                        rootKnown via the root-vocab join) + progress + practiceSourceRefs
```

- **`available`** = any of the affix's caps' introducing lessons is activated
  (reflects ADR 0006; no new unlock engine). `catalog.ts:affixAvailable`.
- **`rootKnown`** = the root is a `learning_items` row (joined via `itemSlug`,
  not a bare lowercase) AND has a recognition cap the learner made solid
  (mastered/strengthening). The hard produce-drill block (ADR 0018) is enforced
  by the session engine; the trainer only reflects it. `family.ts:isRootKnown`.
- **`productive`** drives the "vocab, not rule-formed" marking on frozen forms
  (research open-Q3). Sourced from `affixed_form_pairs.productive` (NOT NULL).
- **`derivedMeaning`** (Fix 3) — `adapter.ts` selects `derived_gloss_nl, derived_gloss_en`
  onto `MorphologyPairRow`; `family.ts` language-resolves them onto the rule-card
  examples (`buildAffixDetail`) and the family forms (`formsForRoot`). These columns
  are a **regenerable projection** (re-derived from the authoring source on every
  publish, ADR 0011) — corrected by editing the source + re-running
  `generate-morphology-patterns.ts` + republishing, never by a live DB edit.
- **Null-affix guard:** `affix` is nullable on the projection table; every
  group-by-affix excludes nulls defensively (`catalog.ts:capsForAffix`,
  `family.ts:formsForRoot`, `practice.ts:affixScopeFromSnapshot`).

## 4. Practice launch (capstone item F′)

The trainer hosts no drills. `affixPracticePath(affix)` → the Session route; the
Session page (`src/pages/Session.tsx`) resolves the affix via
`loadSelectedAffixScope` into `selectedSourceRefs` and runs `buildSession` under
the `affix_practice` `SessionMode`. Scoping/budget/spacing/commit all stay in the
session engine (`isScopedMode` in `lib/session-builder/model.ts` admits the
source-ref-only scope; budget falls through to `standard`).

## 5. Seams

- **Upstream:** `lib/capabilities` (`AFFIX_CATALOG`, `itemSlug`), `lib/lessons`
  (`listActivatedLessons`), `lib/analytics/mastery/masteryModel` (pure derivers).
- **Downstream (by route, not import):** the Session player + `lib/session-builder`
  (`affix_practice` mode).
- **Sibling:** the whole-learner "Morfologie" Voortgang axis is a `masteryModel`
  funnel split (capstone item C), NOT this module — they share the roll-up idea,
  not the content-type split.

## What this spec does NOT cover

- The session engine's scoping/budget/commit — see `docs/current-system/modules/`
  (session-builder) and the F′ change in `lib/session-builder/model.ts`.
- The morphology data pipeline (how `affixed_form_pairs` is written) — that is the
  capability stage; see `docs/process/content-pipeline.md` + ADR 0018/0019.
- The `components/morphology/` UI — the React surface that renders these views.
