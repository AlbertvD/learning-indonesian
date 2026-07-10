---
status: shipped
reviewed_by: [staff-engineer, architect]
implementation: PR #430
merged_at: 2026-07-10
implementation_paths:
  - src/components/morphology/
  - src/components/page/primitives/SettingsCard.tsx
supersedes: []
---

# Harmonize the Affix Trainer onto the page framework

## Problem

The Affix Trainer (`/morphology`, under `LerenNav`) drifted off the app's design
language, most visibly on the **individual affix detail page**:

1. **Duplicate text.** The affix's gloss renders twice — in the bespoke detail
   header (`AffixDetailView.tsx:34`) and again inside the rule card
   (`RuleCard.tsx:23`).
2. **Off-framework cards.** `RuleCard` and `WordFamilyExplorer` use raw Mantine
   `<Card withBorder radius="md">` instead of the app's card chrome, so they sit
   visually "outside" every other card in the app.
3. **Off-brand colour.** The word-family status dots use the raw Mantine palette
   (`blue`/`yellow`/`teal`/`green`/`red`/`gray`, `WordFamilyExplorer.tsx:15-22`),
   plus `var(--mantine-color-orange-6)` / `c="orange"` — none of it sourced from
   the app's design tokens. (The catalog grid was already migrated off the
   "former off-brand indigo/purple/sky set"; the detail page never was.)
4. **Bespoke back-nav.** A hand-rolled `<Anchor>+IconArrowLeft`
   (`AffixDetailView.tsx:21-26`) instead of the shared `BackLink` component
   (`src/components/nav/BackLink.tsx` — a shared component, not a `page/primitive`).

The catalog grid is largely fine (it reuses `LessonCard`), but nothing ties a
catalog tile's affix-type colour to the detail page it opens, so the two views
don't read as one surface.

## Grounding

- **Target architecture:** no constraint found for this presentation surface
  (`docs/target-architecture.md` mentions morphology only at the data layer,
  :1150). This is a UI-only change.
- **Module spec:** `docs/current-system/modules/morphology.md` is the contract for
  `src/lib/morphology/` (pure data + view-models) and **explicitly excludes** the
  `components/morphology/` UI ("What this spec does NOT cover"). This plan touches
  **only** the UI + one page-framework primitive; `lib/morphology`'s
  writer/reader contract and view-model types are **unchanged**.
- **Data model:** untouched → no `data-architect` gate; no Supabase changes.

## Design principle (the hard constraint)

Everything renders through the **page-framework primitives + design tokens**.
Concretely: **zero** raw Mantine `<Card>`, **zero** raw Mantine palette names
(`blue`/`yellow`/`green`/`red`/`orange`/`gray`), **zero** freelance chrome. The
only new mechanism permitted is an *additive, non-breaking* slot on an existing
primitive — the same shape existing primitives already use for a trailing slot
(`PageHeader.action`, `ListCard.trailing`). (Note: `ListCard.meta` is an *unmerged*
ontdek-PR addition — not in this worktree's `main`; the live precedent is
`trailing` + `action`.)

("Zero raw colour" is precisely: zero Mantine palette *names*. The four
affix-type hues in `AFFIX_TYPE_HUE` remain curated brand-ramp literals — tamarind
and teal are the `--accent-primary`/`--teal` tokens, gold and batik-green are the
same curated values the catalog already ships. That is deliberate, not drift.)

Affix-specific richness does **not** become a new `page/primitives` type — the
framework stays generic. Domain-rich cards live in their domain folder and
*consume* the framework, exactly like `LessonCard` (`components/lessons/`, whose
own comment says it is a bespoke domain card, **not** a generic primitive, drawing
every value from framework tokens). `WordFamilyExplorer` follows that precedent.

## Change 1 — `SettingsCard` gains an additive `aside` slot

`SettingsCard` is already a generic titled panel (`<section>` + `<h3>` title +
optional `description` + freeform body, on `--card-bg`/`--card-border`/`--r-md`/
`--shadow-sm`). Its only gap for `RuleCard` is a trailing element beside the
heading. Add one optional prop, mirroring `PageHeader.action`:

`src/components/page/primitives/SettingsCard.tsx`:
- Add to `SettingsCardProps`:
  ```ts
  /**
   * Optional trailing slot rendered at the top-right of the title row —
   * a level/type badge, a small control, etc. Aligns to the heading and
   * does not shrink when the title grows. Omitted → title spans full width
   * (unchanged for every existing caller).
   */
  aside?: ReactNode
  ```
- Wrap the title in a header row: when `aside` is present, render
  `<div class={titleRow}><h3 class={title}>…</h3><div class={aside}>…</div></div>`;
  when absent, render the bare `<h3>` exactly as today (no DOM change for
  existing callers — Profile's 8 `SettingsCard`s stay byte-identical).

`src/components/page/primitives/SettingsCard.module.css`:
- Add `.titleRow { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }`
  and `.aside { flex-shrink: 0; }`. `.title`'s existing `margin: 0 0 4px` stays;
  when wrapped in `.titleRow` the margin still separates it from `.description`
  (the row has no bottom margin of its own — `.title`/`.description` keep theirs).

Verified: no existing `SettingsCard` caller passes `aside`; the prop is purely
additive. (Omission test: without `aside`, `RuleCard`'s type+CEFR badges would
have to live inside the body or force a bespoke card — the slot is the minimum
that keeps `RuleCard` on the primitive.)

## Change 2 — a shared affix-visuals module

New `src/components/morphology/affixVisuals.ts` — the single source of truth for
the two colour mappings, consumed by both the catalog grid and the detail page so
they speak one language. **UI layer, not `lib/morphology`** (that module is pure
data; its spec forbids styling concerns).

- `AFFIX_TYPE_HUE: Record<AffixType, { gradient: string; solid: string }>` — lifts
  the four brand-ramp gradients currently inlined in `AffixCatalogGrid.tsx:23-28`
  (tamarind / teal / gold / batik-green) into one place, plus the matching solid
  hue for the detail-page accent. These are a **curated brand-ramp map**, not the
  semantic tokens — intentional and pre-existing (tamarind == `--accent-primary`
  and teal == `--teal` are tokens; gold/batik are curated literals the catalog
  already ships).
- `masteryDotColor(label: MasteryLabel): string` — the label → token map:
  | label | token |
  |---|---|
  | `not_assessed` | `var(--text-tertiary)` |
  | `introduced` | `var(--accent-primary)` |
  | `learning` | `var(--warning)` |
  | `strengthening` | `var(--teal)` |
  | `mastered` | `var(--success)` |
  | `at_risk` | `var(--danger)` |

  Replaces the raw-Mantine `LABEL_COLOR` in `WordFamilyExplorer.tsx:15-22`. Six
  distinct on-brand hues, all real tokens, dropping the off-brand `blue`.

## Change 3 — the detail page (`AffixDetailView`)

- **Back-nav:** replace the hand-rolled `<Anchor>+IconArrowLeft` (`:21-26`) with
  `<BackLink to="/morphology" label={T.morphology.back} />`.
- **Header:** replace the bespoke `Group`/`Title`/`Badge`/`Text`/`Button` block
  (`:28-51`) with the `PageHeader` primitive:
  `title={detail.affix}`, `subtitle={detail.gloss}`,
  `action={<Practise button / disabled+Tooltip, unchanged logic>}`.
  This **removes the duplicate gloss** (gloss now lives only here) and drops the
  bespoke header entirely.
- **Affix-type identity:** the `affixType` badge (previously in the header) moves
  into `RuleCard`'s new `aside` (Change 4). A subtle type accent
  (`AFFIX_TYPE_HUE[type].solid`) threads the catalog tile's colour into the detail
  page so a "teal suffix" tile opens a teal-accented detail. **Mechanism:** a
  caller-side, token-styled wrapper `<div>` around `PageHeader` (a co-located
  `AffixDetailView.module.css` `.headerAccent` with a thin left-edge border in the
  type hue) — `PageHeader` itself is **not** touched a second time. Decorative,
  `aria-hidden`. This is the one purely-aesthetic element (it fixes no stated bug);
  if it reads as noise in review it can be cut without affecting Changes 1–2, 4–6.
- The `SectionHeading` "Woordfamilies" + subtitle block (`:55-58`) is unchanged.

## Change 4 — `RuleCard` → `SettingsCard`

- Root becomes `<SettingsCard title={T.morphology.ruleTitle} aside={…badges…}>`
  where `aside` holds the affix-type badge + CEFR badge together (both as
  token-driven pills — `StatusPill tone="neutral"` for CEFR, a type pill using
  `AFFIX_TYPE_HUE`). Body = the existing content (allomorph classes, ruleNote,
  examples, intro-lesson link), minus the deleted gloss line (`:23`).
- Allomorph-class badges (`color="tamarind"`, `:34`) → keep the tamarind hue but
  via token (`--accent-primary`) not the Mantine colour name.
- `PlayButton` and example structure unchanged (already token-clean).

## Change 5 — `WordFamilyExplorer` (domain component, re-based on tokens)

Stays a `components/morphology/` domain component (its own comment: "Genuinely
new — no existing equivalent to reuse"). It is NOT forced onto `SettingsCard`
(32px padding is wrong for a dense, repeating root list). Instead it adopts the
`LessonCard` pattern — a co-located `WordFamilyExplorer.module.css` whose **every
value is a framework token**:

- Family card container: `.card { background: var(--card-bg); border: 1px solid
  var(--card-border); border-radius: var(--r-md); padding: 14px 16px; }`
  (replaces raw `<Card withBorder radius="md" padding="md">`).
- Status dots: `masteryDotColor(label)` (Change 2) via inline `background` on a
  tokened `.dot` span, replacing Mantine `<Badge circle color=…>`.
- `root-unknown` warning (`:56-58`): `--warning` token, not `orange`.
- `known/total` badge (`:61`): `StatusPill tone="neutral"` (or a tokened
  `.count` pill), not Mantine `color="gray"`.
- Current-affix emphasis (`:75-76`): already `var(--accent-primary)`; the
  `form.affix` badge → tokened pill (tamarind for current, `--text-tertiary`
  border for others), not Mantine `color="tamarind"/"gray"`.
- `EmptyState` branch unchanged (already a primitive).

## Change 6 — catalog grid (light, "one surface")

`AffixCatalogGrid.tsx` keeps reusing `LessonCard` (already harmonized). Only
change: its inline `TYPE_GRADIENT` (`:23-28`) is deleted and sourced from
`AFFIX_TYPE_HUE` (Change 2) so the catalog banner and the detail-page accent
are provably the same hue. No structural/visual change to the tiles otherwise.

## Tests

- `src/__tests__/page-primitives/SettingsCard.test.tsx` (or the page-lab test):
  add a case — with `aside`, both the title and the aside node render; without
  `aside`, markup is unchanged (existing callers unaffected).
- Morphology UI tests, if present, updated for: gloss appears exactly once on the
  detail page; `BackLink` present; no raw Mantine colour props remain
  (`RuleCard` / `WordFamilyExplorer`).
- `bun run lint` + `bun run test` green.

## Supabase Requirements

N/A — pure front-end presentation change. No schema, RLS, grants, homelab-config,
or health-check changes. `lib/morphology` reads are untouched.

## Files

1. `src/components/page/primitives/SettingsCard.tsx` (+`.module.css`) — additive `aside` slot.
2. `src/components/morphology/affixVisuals.ts` (new) — `AFFIX_TYPE_HUE` + `masteryDotColor`.
3. `src/pages/AffixTrainer.tsx` — (verify) no change needed; header now owned by `AffixDetailView`.
4. `src/components/morphology/AffixDetailView.tsx` — `BackLink` + `PageHeader` + type accent; dedup gloss.
5. `src/components/morphology/RuleCard.tsx` — `SettingsCard` + `aside` badges; drop gloss line; token allomorph badges.
6. `src/components/morphology/WordFamilyExplorer.tsx` (+ new `.module.css`) — token chrome + `masteryDotColor` + tokened pills.
7. `src/components/morphology/AffixCatalogGrid.tsx` — source hue from `affixVisuals`.
8. Tests as above.
9. `docs/current-system/page-framework-status.md` — record the `SettingsCard.aside`
   prop addition (Deviations note) + the Affix Trainer detail surface joining the
   framework. Same catalog-of-record where the `MediaShowcaseCard` addition is logged.

## Docs / follow-up (out of scope to write here)

`docs/current-system/modules/morphology.md:136` names "the `components/morphology/`
UI" as its own future spec — a **dangling pointer to a spec that does not exist**.
This plan does **not** write that spec: the component *interfaces* are unchanged
(`AffixDetailView({detail, audioMap})`, `RuleCard({detail, audioMap})`, …) — this
is a visual re-skin, not an interface/flow refactor, so the "spec-before-refactor"
rule does not bite. The `components/morphology/` surface (four components +
`affixVisuals`) does legitimately qualify for its own spec eventually; **deferred as
a named follow-up**, not silently left dangling.
